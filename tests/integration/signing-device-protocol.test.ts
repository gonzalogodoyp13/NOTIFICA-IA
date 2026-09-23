import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { enrollmentMessage, Heartbeat, observedHealth, publicIdentity, sessionMessage, verifyProof } from '../../lib/signing/deviceProtocol'
vi.mock('server-only', () => ({}))
import { createDeviceHandler, readDeviceBody, readDeviceBytes, requireDeviceHttps } from '../../lib/signing/deviceHttp'

describe('device protocol boundaries', () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 3072 })
  const key = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
  const now = new Date('2026-09-17T12:00:00Z')
  const report = { agentVersion: '0.5.0', role: 'SIGNER' as const, diskFreeBytes: 1000, lastSuccessfulContactAt: null,
    token: 'READY' as const, certificate: { fingerprint: 'a'.repeat(64), subject: 'Test', issuer: 'Test CA', notBefore: '2026-01-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z', digitalSignature: true as const } }
  it('requires canonical RSA-3072 public identity and context-bound proof', () => {
    expect(publicIdentity(key)).toBe(key)
    const message = enrollmentMessage('x'.repeat(43), key, 'Test')
    const signature = sign('sha256', Buffer.from(message), keys.privateKey).toString('base64')
    expect(verifyProof(key, message, signature)).toBe(true)
    expect(verifyProof(key, enrollmentMessage('y'.repeat(43), key, 'Test'), signature)).toBe(false)
    expect(verifyProof(key, sessionMessage('id', 'challenge', 'nonce'), signature)).toBe(false)
    expect(() => publicIdentity(`${key}\n`)).toThrow()
    const weak = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
    expect(() => publicIdentity(weak)).toThrow()
  })
  it('derives expiration on server time and rejects injected PIN/raw health errors', () => {
    expect(observedHealth(Heartbeat.parse(report), now)).toBe('TOKEN_READY')
    expect(observedHealth({ ...report, certificate: { ...report.certificate, expiresAt: now.toISOString() } }, now)).toBe('CERT_EXPIRED')
    expect(observedHealth({ ...report, certificate: { ...report.certificate, expiresAt: '2026-09-20T00:00:00Z' } }, now)).toBe('CERT_EXPIRING')
    expect(observedHealth({ ...report, token: 'MISSING', certificate: null }, now)).toBe('AGENT_ONLINE_TOKEN_MISSING')
    expect(observedHealth({ ...report, token: 'DRIVER_MISSING', certificate: null }, now)).toBe('DRIVER_ERROR')
    expect(() => Heartbeat.parse({ ...report, pin: '1234' })).toThrow()
    expect(() => Heartbeat.parse({ ...report, token: 'exception with secrets' })).toThrow()
    expect(() => Heartbeat.parse({ ...report, certificate: null })).toThrow()
  })
  it('requires HTTPS without trusting an arbitrary forwarded header', () => {
    const old = process.env.SIGNING_TRUST_PROXY
    process.env.SIGNING_TRUST_PROXY = 'false'
    try {
      expect(() => requireDeviceHttps(new NextRequest('http://example.test', { headers: { 'x-forwarded-proto': 'https' } }))).toThrow('HTTPS_REQUIRED')
      // Reproduce Next's reconstruction of the URL from the supplied header.
      expect(() => requireDeviceHttps(new NextRequest('https://example.test', { headers: { 'x-forwarded-proto': 'https' } }))).toThrow('HTTPS_REQUIRED')
      expect(() => requireDeviceHttps(new NextRequest('https://example.test', { headers: { 'x-forwarded-proto': 'http' } }))).toThrow('HTTPS_REQUIRED')
      expect(() => requireDeviceHttps(new NextRequest('http://example.test'))).toThrow('HTTPS_REQUIRED')
      expect(() => requireDeviceHttps(new NextRequest('https://example.test'))).not.toThrow()
    } finally { if (old === undefined) delete process.env.SIGNING_TRUST_PROXY; else process.env.SIGNING_TRUST_PROXY = old }
  })
  it('accepts only a single HTTPS scheme from an explicitly trusted proxy', () => {
    const old = process.env.SIGNING_TRUST_PROXY
    process.env.SIGNING_TRUST_PROXY = 'true'
    try {
      expect(() => requireDeviceHttps(new NextRequest('http://example.test', { headers: { 'x-forwarded-proto': 'https' } }))).not.toThrow()
      expect(() => requireDeviceHttps(new NextRequest('https://example.test', { headers: { 'x-forwarded-proto': 'https' } }))).not.toThrow()
      for (const scheme of ['http', 'https,http', 'http,https', 'invalidhttps']) {
        expect(() => requireDeviceHttps(new NextRequest('https://example.test', { headers: { 'x-forwarded-proto': scheme } }))).toThrow('HTTPS_REQUIRED')
      }
    } finally { if (old === undefined) delete process.env.SIGNING_TRUST_PROXY; else process.env.SIGNING_TRUST_PROXY = old }
  })
  it('rejects an untrusted reconstructed HTTPS request before any database action', async () => {
    const old = process.env.SIGNING_TRUST_PROXY
    delete process.env.SIGNING_TRUST_PROXY
    try {
      const service = { throttle: vi.fn(), challenge: vi.fn() }
      const handler = createDeviceHandler(service as never)
      const request = new NextRequest('https://example.test/api/signing/device/challenge', {
        method: 'POST', headers: { 'x-forwarded-proto': 'https', 'content-type': 'application/json' }, body: '{}',
      })
      const response = await handler(request, 'challenge')
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: { code: 'HTTPS_REQUIRED' } })
      expect(service.throttle).not.toHaveBeenCalled()
      expect(service.challenge).not.toHaveBeenCalled()
    } finally { if (old === undefined) delete process.env.SIGNING_TRUST_PROXY; else process.env.SIGNING_TRUST_PROXY = old }
  })
  it('bounds streamed JSON bodies even without Content-Length', async () => {
    const request = new NextRequest('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payload: 'x'.repeat(9000) }) })
    await expect(readDeviceBody(request)).rejects.toThrow('REQUEST_TOO_LARGE')
  })
  it('does not accept a cookie or an invalid bearer as device authentication', async () => {
    const service = { throttle: vi.fn().mockResolvedValue(undefined), heartbeat: vi.fn() }
    const handler = createDeviceHandler(service as never)
    const request = new NextRequest('https://example.test/api/signing/device/heartbeat', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'session=browser' }, body: JSON.stringify(report) })
    expect((await handler(request, 'heartbeat')).status).toBe(401)
    expect(service.heartbeat).not.toHaveBeenCalled()
  })
  it('bounds PDF streams and checks bearer/lease before reading their bytes', async () => {
    const request = new NextRequest('https://example.test', { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: 'x'.repeat(100) })
    await expect(readDeviceBytes(request, 99)).rejects.toThrow('REQUEST_TOO_LARGE')
    const service = { throttle: vi.fn(), limitAuthenticated: vi.fn(), authorizeUpload: vi.fn().mockRejectedValue(new Error('DENIED')), submitArtifact: vi.fn() }
    const handler = createDeviceHandler(service as never)
    const raw = new NextRequest('https://example.test/api/signing/device/result', { method: 'POST', headers: {
      'content-type': 'application/pdf', authorization: `Bearer ${'a'.repeat(43)}`,
      'x-signing-item': 'item', 'x-signing-lease': '00000000-0000-4000-8000-000000000001' }, body: '%PDF-test' })
    await handler(raw, 'result')
    expect(service.authorizeUpload).toHaveBeenCalledOnce()
    expect(raw.bodyUsed).toBe(false)
    expect(service.submitArtifact).not.toHaveBeenCalled()
  })
})
