import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../../lib/api/server', () => ({
  withApiUser: (_request: unknown, _operation: unknown, handler: (user: unknown) => unknown) =>
    handler({ id: 'test-user', officeId: 1 }),
}))
vi.mock('../../lib/signing/center', () => ({ createSigningCenter: () => ({ mutate: mocks.mutate }) }))
import { POST } from '../../app/api/signing/center/route'

const publicOrigin = 'https://visitors-via-missed-remain.trycloudflare.com'
const body = { action: 'queue', sources: [{ versionId: 'test-version', checksum: 'a'.repeat(64) }],
  signerFingerprint: 'b'.repeat(64), requestedLevel: 'PADES_LT' }
const request = (origin = publicOrigin, headers: Record<string, string> = {}) =>
  new NextRequest('http://127.0.0.1:3000/api/signing/center', {
    method: 'POST', headers: { origin, host: '127.0.0.1:3000',
      'x-forwarded-proto': 'https', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

describe('signing center origin through the testing proxy', () => {
  beforeEach(() => {
    mocks.mutate.mockReset().mockResolvedValue({ accepted: true })
    vi.stubEnv('SIGNING_TRUST_PROXY', 'true')
    vi.stubEnv('SIGNING_BROWSER_ORIGIN', publicOrigin)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('queues a same-origin browser request when Next sees the internal HTTP address', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
    expect(mocks.mutate).toHaveBeenCalledWith({ officeId: 1, userId: 'test-user' }, body)
  })

  it('rejects foreign and missing origins before reading or queuing the request', async () => {
    for (const origin of ['https://attacker.test', 'null', '', 'http://127.0.0.1:3000']) {
      const incoming = request(origin, { host: 'attacker.test', 'x-forwarded-host': 'attacker.test' })
      const response = await POST(incoming)
      expect(response.status).toBe(403)
      expect(incoming.bodyUsed).toBe(false)
    }
    const incoming = request()
    incoming.headers.delete('origin')
    expect((await POST(incoming)).status).toBe(403)
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it('requires trusted HTTPS for the configured public origin', async () => {
    expect((await POST(request(publicOrigin, { 'x-forwarded-proto': 'http' }))).status).toBe(400)
    vi.stubEnv('SIGNING_TRUST_PROXY', 'false')
    expect((await POST(request())).status).toBe(403)
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it('preserves direct local development and its foreign-origin rejection', async () => {
    vi.stubEnv('SIGNING_BROWSER_ORIGIN', '')
    vi.stubEnv('SIGNING_TRUST_PROXY', 'false')
    expect((await POST(request('http://127.0.0.1:3000', { 'x-forwarded-proto': 'http' }))).status).toBe(200)
    mocks.mutate.mockClear()
    expect((await POST(request('https://attacker.test', { 'x-forwarded-proto': 'http' }))).status).toBe(403)
    expect(mocks.mutate).not.toHaveBeenCalled()
  })
})
