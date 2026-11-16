import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const mock = vi.hoisted(() => ({ getUser: vi.fn(), claims: vi.fn(), user: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mock.user } } }))
vi.mock('@/lib/supabaseServer', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: mock.getUser, getClaims: mock.claims } }) }))
import { resolveAuthenticatedUser } from '@/lib/auth-server'
const active = { id: 'local', authUserId: 'auth', officeId: 1, email: 'audit@example.test', officeName: 'Audit', isOfficeAdmin: true, isActive: true, office: { cacheRevision: 1 } }
beforeEach(() => {
  vi.resetAllMocks(); mock.getUser.mockResolvedValue({ data: { user: { id: 'auth' } }, error: null })
  mock.user.mockResolvedValue(active)
})
describe('administrator MFA enforcement', () => {
  it('denies an administrator with password-only assurance', async () => {
    mock.claims.mockResolvedValue({ data: { claims: { sub: 'auth', aal: 'aal1' } }, error: null })
    await expect(resolveAuthenticatedUser()).rejects.toMatchObject({ code: 'MFA_REQUIRED', status: 403 })
  })
  it('accepts verified MFA for the same canonical identity', async () => {
    mock.claims.mockResolvedValue({ data: { claims: { sub: 'auth', aal: 'aal2' } }, error: null })
    await expect(resolveAuthenticatedUser()).resolves.toMatchObject({ id: 'local' })
  })
  it.each([{ data: null, error: new Error('offline') }, { data: { claims: { sub: 'other', aal: 'aal2' } }, error: null }])('fails closed for unavailable or mismatched claims', async claims => {
    mock.claims.mockResolvedValue(claims)
    await expect(resolveAuthenticatedUser()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
  it('does not require MFA for ordinary users or trust client role claims', async () => {
    mock.user.mockResolvedValue({ ...active, isOfficeAdmin: false })
    await expect(resolveAuthenticatedUser()).resolves.toMatchObject({ isOfficeAdmin: false })
    expect(mock.claims).not.toHaveBeenCalled()
  })
})
