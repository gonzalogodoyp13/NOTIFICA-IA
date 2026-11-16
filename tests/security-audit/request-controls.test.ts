import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
import { boundRequestBody, requireSameOrigin } from '@/lib/security/request'
import { graphFetch } from '@/lib/security/graph'
import { requestQuota } from '@/lib/security/rateLimit'
import { isPngBytes } from '@/lib/pdf/officeConfig'
afterEach(() => vi.unstubAllEnvs())
const req = (origin?: string, extra: Record<string, string> = {}) => new NextRequest('https://app.example/api/test', {
  method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), ...extra },
})
describe('browser request boundaries', () => {
  it.each([undefined, 'null', 'https://evil.example', 'https://sibling.example'])('rejects origin %s', origin => {
    vi.stubEnv('APP_ORIGIN', 'https://app.example')
    expect(() => requireSameOrigin(req(origin, { 'x-forwarded-host': 'evil.example' }))).toThrow('FORBIDDEN')
  })
  it('accepts only the configured origin and rejects cross-site metadata', () => {
    vi.stubEnv('APP_ORIGIN', 'https://app.example')
    expect(() => requireSameOrigin(req('https://app.example'))).not.toThrow()
    expect(() => requireSameOrigin(req('https://app.example', { 'sec-fetch-site': 'cross-site' }))).toThrow()
  })
  it('bounds actual streamed bytes when content-length is absent or false', async () => {
    const request = new NextRequest('https://app.example/api/test', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '1' }, body: 'x'.repeat(1024 * 1024 + 1) })
    await expect(boundRequestBody(request)).rejects.toMatchObject({ status: 413 })
  })
  it('preserves JSON after bounded reading and rejects simple form content', async () => {
    const request = new NextRequest('https://app.example/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"ok":true}' })
    await boundRequestBody(request)
    expect(await request.json()).toEqual({ ok: true })
    await expect(boundRequestBody(new NextRequest(request.url, { method: 'POST', body: 'abc' }))).rejects.toMatchObject({ status: 415 })
  })
})
describe('provider and resource boundaries', () => {
  it.each(['http://graph.microsoft.com/v1.0/me', 'https://graph.microsoft.com.evil.test/v1.0/me',
    'https://127.0.0.1/v1.0/me', 'https://user:pass@graph.microsoft.com/v1.0/me', 'https://graph.microsoft.com:444/v1.0/me'])('does not send credentials to %s', async url => {
    const transport = vi.fn()
    await expect(graphFetch(url, {}, transport)).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
  it('rejects provider redirects and imposes a timeout', async () => {
    const transport = vi.fn().mockResolvedValue(new Response('{}'))
    await graphFetch('https://graph.microsoft.com/v1.0/me', {}, transport)
    expect(transport).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/me', expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }))
  })
  it('uses approved quotas while keeping send previews outside the sending quota', () => {
    expect(requestQuota('/api/recibos/send/test', 'POST')).toMatchObject({ user: 5, seconds: 600 })
    expect(requestQuota('/api/recibos/send', 'POST')).toMatchObject({ user: 10, seconds: 600 })
    expect(requestQuota('/api/recibos/send/preview', 'POST')).toMatchObject({ user: 30, seconds: 60 })
    expect(requestQuota('/api/signing/device/update-download', 'GET')).toMatchObject({ user: 30, seconds: 60 })
  })
  it('rejects truncated PNGs and decompression-size bombs', () => {
    const png = new Uint8Array(33)
    png.set([137,80,78,71,13,10,26,10]); const view = new DataView(png.buffer)
    view.setUint32(8,13); png.set([73,72,68,82],12); view.setUint32(16,100);view.setUint32(20,100)
    expect(isPngBytes(png)).toBe(true)
    view.setUint32(16,0x7fffffff)
    expect(isPngBytes(png)).toBe(false)
    expect(isPngBytes(png.slice(0,8))).toBe(false)
  })
})
