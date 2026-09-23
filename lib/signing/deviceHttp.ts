import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createDeviceService } from './devices'
import { DeviceError, DeviceId, DeviceLease, Secret } from './deviceProtocol'
import { SigningError } from './core'
import { MAX_SIGNING_PDF } from './pdfValidator'

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
export async function readDeviceBytes(req: NextRequest, maximum: number) {
  if (Number(req.headers.get('content-length') ?? 0) > maximum) throw new DeviceError('REQUEST_TOO_LARGE', 413)
  const reader = req.body?.getReader()
  if (!reader) throw new DeviceError('INVALID_REQUEST', 400)
  let size = 0
  let expired = false
  const deadline = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}) }, 30_000)
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (expired) throw new DeviceError('REQUEST_TIMEOUT', 408)
      if (done) break
      size += value.length
      if (size > maximum) { await reader.cancel(); throw new DeviceError('REQUEST_TOO_LARGE', 413) }
      chunks.push(value)
    }
  } finally { clearTimeout(deadline); reader.releaseLock() }
  return Buffer.concat(chunks)
}
export async function readDeviceBody(req: NextRequest) {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new DeviceError('JSON_REQUIRED', 415)
  return JSON.parse((await readDeviceBytes(req, 8192)).toString('utf8')) as unknown
}
export function createDeviceHandler(service = createDeviceService()) {
  return async function handleDeviceRequest(req: NextRequest, action: string) {
    try {
      requireDeviceHttps(req)
      if (!['enroll', 'challenge', 'session', 'session-renew', 'heartbeat', 'claim', 'renew', 'release', 'fail', 'start', 'input', 'download', 'result', 'ack', 'recovery', 'deliveries', 'delivery-begin', 'delivery-download', 'delivery-fail'].includes(action)) throw new DeviceError('NOT_FOUND', 404)
      await service.throttle(`global:${action}`, 'all', 1200)
      if (action === 'result' && req.headers.get('content-type')?.toLowerCase() === 'application/pdf') {
        const token = req.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]
        if (!token) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
        await service.limitAuthenticated(token, action)
        const lease = DeviceLease.parse({ itemId: req.headers.get('x-signing-item'), leaseToken: req.headers.get('x-signing-lease') })
        await service.authorizeUpload(token, lease)
        const bytes = await readDeviceBytes(req, MAX_SIGNING_PDF)
        return deviceResponse(await service.submitArtifact(token, lease, bytes))
      }
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
      if (action === 'download' || action === 'delivery-download') {
        const bytes = action === 'download' ? await service.download(token, raw) : await service.downloadDelivery(token, raw)
        return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf',
          'Content-Length': String(bytes.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
      }
      const data = action === 'heartbeat' ? await service.heartbeat(token, raw)
        : action === 'deliveries' ? await service.pendingDeliveries(token, raw)
        : action === 'delivery-begin' ? await service.beginDelivery(token, raw)
        : action === 'delivery-fail' ? await service.failDelivery(token, raw)
        : action === 'input' ? await service.input(token, raw)
        : action === 'recovery' ? await service.recovery(token, raw)
        : action === 'result' ? await service.result(token, raw)
        : action === 'ack' ? await service.acknowledge(token, raw)
        : await service.queue(token, action as 'claim' | 'renew' | 'release' | 'fail' | 'start', raw)
      return deviceResponse(data)
    } catch (error) { return deviceFailure(error) }
  }
}
