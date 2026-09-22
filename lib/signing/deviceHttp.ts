import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createDeviceService } from './devices'
import { DeviceError, DeviceId, Secret } from './deviceProtocol'
import { SigningError } from './core'

export function deviceResponse(data: unknown, status = 200) {
  return NextResponse.json({ ok: status < 400, ...(status < 400 ? { data } : { error: { code: data } }) },
    { status, headers: { 'Cache-Control': 'private, no-store', ...(status === 429 ? { 'Retry-After': '60' } : {}) } })
}
export function deviceFailure(error: unknown) {
  if (error instanceof DeviceError) return deviceResponse(error.code, error.status)
  if (error instanceof z.ZodError || error instanceof SyntaxError) return deviceResponse('INVALID_REQUEST', 400)
  if (error instanceof SigningError) return deviceResponse(error.message, ['FORBIDDEN', 'NOT_FOUND'].includes(error.message) ? 403 : 409)
  // Deliberately never log request bodies, authorization, keys, or raw errors.
  return deviceResponse('DEVICE_SERVICE_UNAVAILABLE', 503)
}
export function requireDeviceHttps(req: NextRequest) {
  // Next.js can derive nextUrl.protocol from x-forwarded-proto before this
  // handler runs. An HTTPS URL therefore cannot override an untrusted header.
  // Next's Node server supplies this header even for direct requests; deployment
  // must opt in only behind a boundary that overwrites it and prevents bypass.
  const forwarded = req.headers.get('x-forwarded-proto')
  const secure = forwarded !== null
    ? process.env.SIGNING_TRUST_PROXY === 'true' && forwarded === 'https'
    : req.nextUrl.protocol === 'https:'
  if (!secure) throw new DeviceError('HTTPS_REQUIRED', 400)
}
export async function readDeviceBody(req: NextRequest) {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new DeviceError('JSON_REQUIRED', 415)
  if (Number(req.headers.get('content-length') ?? 0) > 8192) throw new DeviceError('REQUEST_TOO_LARGE', 413)
  const reader = req.body?.getReader()
  if (!reader) throw new DeviceError('INVALID_REQUEST', 400)
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 8192) { await reader.cancel(); throw new DeviceError('REQUEST_TOO_LARGE', 413) }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}
export function createDeviceHandler(service = createDeviceService()) {
  return async function handleDeviceRequest(req: NextRequest, action: string) {
    try {
      requireDeviceHttps(req)
      if (!['enroll', 'challenge', 'session', 'session-renew', 'heartbeat', 'claim', 'renew', 'release', 'fail', 'input', 'result', 'ack'].includes(action)) throw new DeviceError('NOT_FOUND', 404)
      await service.throttle(`global:${action}`, 'all', 1200)
      const raw = await readDeviceBody(req)
      if (action === 'enroll') {
        const code = Secret.parse((raw as { code?: unknown })?.code)
        await service.throttle('enroll', code, 6)
        return deviceResponse(await service.enroll(raw), 201)
      }
      if (['challenge', 'session', 'session-renew'].includes(action)) {
        const id = DeviceId.parse((raw as { deviceId?: unknown })?.deviceId)
        await service.throttle(`auth:${action}`, id, 12)
        return deviceResponse(action === 'challenge' ? await service.challenge(raw) : await service.session(raw))
      }
      const token = req.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]
      if (!token) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
      await service.limitAuthenticated(token, action)
      const data = action === 'heartbeat' ? await service.heartbeat(token, raw)
        : action === 'input' ? await service.input(token, raw)
        : action === 'result' ? await service.result(token, raw)
        : action === 'ack' ? await service.acknowledge(token, raw)
        : await service.queue(token, action as 'claim' | 'renew' | 'release' | 'fail', raw)
      return deviceResponse(data)
    } catch (error) { return deviceFailure(error) }
  }
}
