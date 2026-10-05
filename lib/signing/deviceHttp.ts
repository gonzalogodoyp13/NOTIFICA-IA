import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createDeviceService } from './devices'
import { DeviceError, DeviceId, DeviceLease, Secret } from './deviceProtocol'
import { SigningError } from './core'
import { MAX_SIGNING_PDF } from './pdfValidator'
import { randomUUID } from 'node:crypto'
import { signingLog, signingTrace } from './telemetry'

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
export function requireDeviceBrowserOrigin(req: NextRequest) {
  requireDeviceHttps(req)
  requireSigningBrowserOrigin(req)
}
export function requireSigningBrowserOrigin(req: NextRequest, directOrigin = req.nextUrl.origin) {
  let expected = directOrigin
  const configured = process.env.SIGNING_BROWSER_ORIGIN?.trim()
  if (configured) {
    // A TLS proxy may preserve the browser host while Next reconstructs its URL
    // using the internal listening address. Pin the public origin explicitly;
    // never derive this permission from Origin or forwarded host headers.
    if (process.env.SIGNING_TRUST_PROXY !== 'true') throw new DeviceError('ORIGIN_REQUIRED')
    requireDeviceHttps(req)
    try {
      const origin = new URL(configured)
      if (origin.protocol !== 'https:' || origin.username || origin.password ||
          origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid origin')
      expected = origin.origin
    } catch { throw new DeviceError('ORIGIN_REQUIRED') }
  }
  if (req.headers.get('origin') !== expected) throw new DeviceError('ORIGIN_REQUIRED')
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
    const correlationId = randomUUID()
    const respond = (data: unknown, status = 200) => {
      const response = deviceResponse(data, status)
      response.headers.set('X-Signing-Correlation-Id', correlationId)
      signingLog('device_request', correlationId, status)
      return response
    }
    return signingTrace.run(correlationId, async () => { try {
      requireDeviceHttps(req)
      if (!['enroll', 'retire', 'challenge', 'session', 'session-renew', 'heartbeat', 'claim', 'renew', 'release', 'fail', 'start', 'input', 'download', 'result', 'ack', 'recovery', 'deliveries', 'delivery-begin', 'delivery-download', 'delivery-fail', 'office-folder', 'office-folder-download'].includes(action)) throw new DeviceError('NOT_FOUND', 404)
      await service.throttle(`global:${action}`, 'all', 1200)
      if (action === 'result' && req.headers.get('content-type')?.toLowerCase() === 'application/pdf') {
        const token = req.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]
        if (!token) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
        await service.limitAuthenticated(token, action)
        const lease = DeviceLease.parse({ itemId: req.headers.get('x-signing-item'), leaseToken: req.headers.get('x-signing-lease') })
        await service.authorizeUpload(token, lease)
        const bytes = await readDeviceBytes(req, MAX_SIGNING_PDF)
        return respond(await service.submitArtifact(token, lease, bytes))
      }
      const raw = await readDeviceBody(req)
      if (action === 'retire') {
        const id = DeviceId.parse((raw as { deviceId?: unknown })?.deviceId)
        await service.throttle('retire', id, 6)
        return respond(await service.retire(raw))
      }
      if (action === 'enroll') {
        const code = Secret.parse((raw as { code?: unknown })?.code)
        await service.throttle('enroll', code, 6)
        return respond(await service.enroll(raw), 201)
      }
      if (['challenge', 'session', 'session-renew'].includes(action)) {
        const id = DeviceId.parse((raw as { deviceId?: unknown })?.deviceId)
        await service.throttle(`auth:${action}`, id, 12)
        return respond(action === 'challenge' ? await service.challenge(raw) : await service.session(raw))
      }
      const token = req.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]
      if (!token) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
      await service.limitAuthenticated(token, action)
      if (action === 'download' || action === 'delivery-download' || action === 'office-folder-download') {
        const bytes = action === 'download' ? await service.download(token, raw) : action === 'office-folder-download'
          ? await service.officeFolderDownload(token, raw) : await service.downloadDelivery(token, raw)
        signingLog('device_request', correlationId, 200)
        return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf',
          'Content-Length': String(bytes.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
          'X-Signing-Correlation-Id': correlationId } })
      }
      const data = action === 'heartbeat' ? await service.heartbeat(token, raw)
        : action === 'office-folder' ? await service.officeFolder(token, raw)
        : action === 'deliveries' ? await service.pendingDeliveries(token, raw)
        : action === 'delivery-begin' ? await service.beginDelivery(token, raw)
        : action === 'delivery-fail' ? await service.failDelivery(token, raw)
        : action === 'input' ? await service.input(token, raw)
        : action === 'recovery' ? await service.recovery(token, raw)
        : action === 'result' ? await service.result(token, raw)
        : action === 'ack' ? await service.acknowledge(token, raw)
        : await service.queue(token, action as 'claim' | 'renew' | 'release' | 'fail' | 'start', raw)
      return respond(data)
    } catch (error) {
      const response = deviceFailure(error)
      response.headers.set('X-Signing-Correlation-Id', correlationId)
      signingLog('device_request', correlationId, response.status, error instanceof SigningError ? error.code : 'UNKNOWN')
      return response
    } })
  }
}
