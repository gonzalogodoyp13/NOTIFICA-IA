import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  after: vi.fn(), send: vi.fn(), allow: vi.fn(), sender: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/server', async importOriginal => ({ ...await importOriginal<typeof import('next/server')>(), after: mocks.after }))
vi.mock('@/lib/auth/passwordRecovery', () => ({ allowPasswordRecovery: mocks.allow, passwordRecoverySender: mocks.sender }))
import { POST } from '../../app/api/auth/forgot-password/route'
import { RequestSecurityError } from '../../lib/security/request'

function request(body: unknown, origin = 'https://www.notificaia.cl') {
  return new NextRequest('https://www.notificaia.cl/api/auth/forgot-password', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('password recovery public endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('APP_ORIGIN', 'https://www.notificaia.cl')
    mocks.allow.mockResolvedValue(true)
    mocks.sender.mockReturnValue(mocks.send)
    mocks.send.mockResolvedValue(undefined)
  })
  it('rejects cross-origin requests before scheduling email', async () => {
    expect((await POST(request({ email: 'user@example.com' }, 'https://evil.example'))).status).toBe(403)
    expect(mocks.allow).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })
  it.each([{ email: 'invalid' }, { email: 'user@example.com', redirectTo: 'https://evil.example' }])('rejects invalid input and custom redirects', async body => {
    expect((await POST(request(body))).status).toBe(400)
    expect(mocks.after).not.toHaveBeenCalled()
  })
  it('normalizes email and responds before account lookup or delivery', async () => {
    const response = await POST(request({ email: ' User@Example.com ' }))
    expect(response.status).toBe(202)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(mocks.send).not.toHaveBeenCalled()
    expect(JSON.stringify(await response.json())).not.toContain('token_hash')
    await mocks.after.mock.calls[0][0]()
    expect(mocks.send).toHaveBeenCalledWith('user@example.com')
  })
  it('suppresses repeated email without exposing whether the account exists', async () => {
    const normal = await POST(request({ email: 'user@example.com' }))
    mocks.after.mockClear()
    mocks.allow.mockResolvedValue(false)
    const suppressed = await POST(request({ email: 'user@example.com' }))
    expect(suppressed.status).toBe(normal.status)
    expect(await suppressed.json()).toEqual(await normal.json())
    expect(mocks.after).not.toHaveBeenCalled()
  })
  it('reports connection limits with a retry interval', async () => {
    mocks.allow.mockRejectedValue(new RequestSecurityError('RATE_LIMITED', 429, 900))
    const response = await POST(request({ email: 'user@example.com' }))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('900')
    expect(mocks.after).not.toHaveBeenCalled()
  })
  it('does not leak provider errors or recovery tokens', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.send.mockRejectedValue(new Error('private-token-and-email'))
    const response = await POST(request({ email: 'user@example.com' }))
    await mocks.after.mock.calls[0][0]()
    expect(response.status).toBe(202)
    expect(log).toHaveBeenCalledWith('PASSWORD_RECOVERY_DELIVERY_FAILED')
    log.mockRestore()
  })
})
