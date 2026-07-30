import { describe, expect, it, vi } from 'vitest'

import { AuthResolutionError, resolveCanonicalUser } from '../../lib/auth-core'

const activeUser = {
  id: 'local-1',
  authUserId: 'auth-1',
  email: 'qa@example.com',
  officeId: 1,
  officeName: 'QA',
  isOfficeAdmin: false,
  isActive: true,
}

describe('canonical request authentication', () => {
  it('calls Supabase and the local identity lookup exactly once', async () => {
    const getAuthUser = vi.fn(async () => ({ user: { id: 'auth-1' } }))
    const findUserByAuthUserId = vi.fn(async () => activeUser)
    const user = await resolveCanonicalUser({ getAuthUser, findUserByAuthUserId })
    expect(user.id).toBe('local-1')
    expect(getAuthUser).toHaveBeenCalledTimes(1)
    expect(findUserByAuthUserId).toHaveBeenCalledTimes(1)
    expect(findUserByAuthUserId).toHaveBeenCalledWith('auth-1')
  })

  it.each([
    ['invalid session', async () => ({ user: null }), async () => activeUser, 'UNAUTHORIZED', 401],
    ['not provisioned', async () => ({ user: { id: 'auth-1' } }), async () => null, 'USER_NOT_PROVISIONED', 403],
    ['disabled account', async () => ({ user: { id: 'auth-1' } }), async () => ({ ...activeUser, isActive: false }), 'ACCOUNT_DISABLED', 403],
    ['Supabase unavailable', async () => { throw new Error('offline') }, async () => activeUser, 'SERVICE_UNAVAILABLE', 503],
    ['database unavailable', async () => ({ user: { id: 'auth-1' } }), async () => { throw new Error('offline') }, 'SERVICE_UNAVAILABLE', 503],
  ])('maps %s correctly', async (_label, getAuthUser, findUserByAuthUserId, code, status) => {
    const error = await resolveCanonicalUser({ getAuthUser, findUserByAuthUserId }).catch(value => value)
    expect(error).toBeInstanceOf(AuthResolutionError)
    expect(error).toMatchObject({ code, status })
  })
})
