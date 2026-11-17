import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ find: vi.fn(), generate: vi.fn(), send: vi.fn(), query: vi.fn(), mailer: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findFirst: mocks.find }, $queryRaw: mocks.query } }))
vi.mock('@/lib/supabaseServer', () => ({ createServerSupabaseStorageClient: () => ({ auth: { admin: { generateLink: mocks.generate } } }) }))
vi.mock('@/lib/email/system-mailer', () => ({ createSystemMailAdapter: mocks.mailer }))
import { allowPasswordRecovery, passwordRecoverySender } from '../../lib/auth/passwordRecovery'

describe('password recovery delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('APP_ORIGIN', 'https://www.notificaia.cl')
    mocks.mailer.mockReturnValue({ provider: 'resend', send: mocks.send })
    mocks.find.mockResolvedValue({ email: 'user@example.com', authUserId: 'auth-user' })
    mocks.generate.mockResolvedValue({ data: { user: { id: 'auth-user' }, properties: { hashed_token: 'private-token' } }, error: null })
    mocks.query.mockResolvedValue([{ count: 1 }])
  })
  it('emails a recovery link to the provisioned account using the fixed site origin', async () => {
    await passwordRecoverySender()('user@example.com')
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: 'user@example.com', mode: 'insensitive' }, isActive: true } }))
    expect(mocks.generate).toHaveBeenCalledWith({ type: 'recovery', email: 'user@example.com' })
    const message = mocks.send.mock.calls[0][0]
    expect(message.to).toEqual(['user@example.com'])
    expect(message.text).toContain('https://www.notificaia.cl/auth/set-password#type=recovery&token_hash=private-token')
  })
  it('does not generate or send for an unknown or inactive account', async () => {
    mocks.find.mockResolvedValue(null)
    await passwordRecoverySender()('unknown@example.com')
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('blocks mismatched auth identities and provider failures', async () => {
    mocks.generate.mockResolvedValue({ data: { user: { id: 'other-user' }, properties: { hashed_token: 'secret' } } })
    await expect(passwordRecoverySender()('user@example.com')).rejects.toThrow('RECOVERY_LINK_FAILED')
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('rejects dry-run mail and invalid origins', () => {
    mocks.mailer.mockReturnValue({ provider: 'dry-run' })
    expect(() => passwordRecoverySender()).toThrow('RECOVERY_MAIL_NOT_CONFIGURED')
    vi.stubEnv('APP_ORIGIN', 'https://site.example/path')
    expect(() => passwordRecoverySender()).toThrow('RECOVERY_ORIGIN_NOT_CONFIGURED')
  })
  it('limits connections before allocating recipient counters', async () => {
    mocks.query.mockResolvedValue([{ count: 101 }])
    await expect(allowPasswordRecovery('user@example.com', '127.0.0.1')).rejects.toMatchObject({ status: 429 })
    expect(mocks.query).toHaveBeenCalledTimes(2)
  })
  it('suppresses a second request in the email cooldown', async () => {
    mocks.query.mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 2 }]).mockResolvedValueOnce([{ count: 2 }])
    expect(await allowPasswordRecovery('user@example.com', '127.0.0.1')).toBe(false)
  })
})
