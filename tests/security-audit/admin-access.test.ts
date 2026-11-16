import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const mock = vi.hoisted(() => ({ getUser: vi.fn(), user: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mock.user } } }))
vi.mock('@/lib/supabaseServer', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: mock.getUser } }) }))
import { resolveAuthenticatedUser } from '@/lib/auth-server'
const active = { id: 'local', authUserId: 'auth', officeId: 1, email: 'audit@example.test', officeName: 'Audit', isOfficeAdmin: true, isActive: true, office: { cacheRevision: 1 } }
beforeEach(() => {
  vi.resetAllMocks()
  mock.getUser.mockResolvedValue({ data: { user: { id: 'auth' } }, error: null })
  mock.user.mockResolvedValue(active)
})
describe('administrator normal sign-in', () => {
  it('allows a verified active administrator without an MFA challenge', async () => {
    await expect(resolveAuthenticatedUser()).resolves.toMatchObject({ id: 'local', isOfficeAdmin: true })
  })
  it('still rejects unauthenticated access before reading local permissions', async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(resolveAuthenticatedUser()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(mock.user).not.toHaveBeenCalled()
  })
  it('still rejects disabled administrators', async () => {
    mock.user.mockResolvedValue({ ...active, isActive: false })
    await expect(resolveAuthenticatedUser()).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' })
  })
  it('fails closed when the permissions lookup is unavailable', async () => {
    mock.user.mockRejectedValue(new Error('unavailable'))
    await expect(resolveAuthenticatedUser()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  })
  it('uses the database role for ordinary users', async () => {
    mock.user.mockResolvedValue({ ...active, isOfficeAdmin: false })
    await expect(resolveAuthenticatedUser()).resolves.toMatchObject({ isOfficeAdmin: false })
  })
})
