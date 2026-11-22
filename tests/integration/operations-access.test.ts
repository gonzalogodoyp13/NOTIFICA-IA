import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ anonymous: false, role: null as string | null, revoked: false, aal: 'aal2', sub: 'auth-1', verified: true, read: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/auth-server', () => {
  class AuthResolutionError extends Error { status = 401; code = 'UNAUTHORIZED' }
  const resolveUser=async () => {
    if (state.anonymous) throw new AuthResolutionError()
    // An office admin with metadata-like fields still needs a platform grant.
    return { id: 'user-1', authUserId: 'auth-1', officeId: 12, isOfficeAdmin: true, user_metadata: { role: 'OWNER' } }
  }
  return { AuthResolutionError, resolveAuthenticatedUser:resolveUser,resolveProvisionedUser:resolveUser }
})
vi.mock('@/lib/supabaseServer', () => ({ createServerSupabaseClient: async () => ({ auth: {
  getClaims: async () => ({ data: { claims: { sub: state.sub, aal: state.aal } }, error: null }),
  mfa: { listFactors: async () => ({ data: { all: state.verified ? [{ status: 'verified' }] : [] }, error: null }) },
} }) }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  platformGrant: { findUnique: async () => state.role ? { role: state.role, revokedAt: state.revoked ? new Date() : null } : null },
  office: { findMany: state.read }, platformAudit: { create: state.audit },
} }))
vi.mock('@/lib/security/rateLimit', () => ({ enforceRequestQuota: async () => {} }))
vi.mock('@/lib/diagnostics/server', () => ({ reportUnexpected: async () => 'reference' }))
import { requirePlatformOwner, requireRecoveryOwner } from '@/lib/operations/auth'
import { loadOperations } from '@/lib/operations/queries'
import { GET, PATCH } from '@/app/api/operaciones/[[...path]]/route'
import { NextRequest } from 'next/server'
beforeEach(() => { state.anonymous = false; state.role = null; state.revoked = false; state.aal = 'aal2'; state.sub = 'auth-1'; state.verified = true; state.read.mockReset().mockResolvedValue([]); state.audit.mockReset().mockResolvedValue({}) })
describe('platform authorization boundaries', () => {
  it('requires recent strong authentication for recovery mutations even with an owner AAL2 session', async () => {
    state.role = 'OWNER'
    await expect(requireRecoveryOwner('report.cancel')).rejects.toThrow('RECENT_MFA_REQUIRED')
    await expect(requireRecoveryOwner('reconcile')).resolves.toMatchObject({ id:'user-1' })
  })
  it('rejects direct recovery API manipulation by an office administrator', async () => {
    const r=await PATCH(new NextRequest('http://localhost/api/operaciones/recuperacion',{method:'PATCH',headers:{origin:'http://localhost'},body:JSON.stringify({mode:'execute',data:{action:'device.revoke',officeId:999}})}),{params:Promise.resolve({path:['recuperacion']})})
    expect(r.status).toBe(403)
    expect(state.audit).not.toHaveBeenCalled()
  })
  it.each(['ordinary', 'office-admin', 'SUPPORT', 'OPERATOR'])('denies %s and never loads cross-office rows', async role => {
    state.role = role === 'ordinary' || role === 'office-admin' ? null : role
    await expect(loadOperations(['oficinas'], { office: '999' })).rejects.toThrow()
    expect(state.read).not.toHaveBeenCalled()
  })
  it('denies unauthenticated API requests including manipulated URLs', async () => {
    state.anonymous = true
    const r = await GET(new NextRequest('http://localhost/api/operaciones/usuarios?office=999'), { params: Promise.resolve({ path: ['usuarios'] }) })
    expect(r.status).toBe(401); expect(state.read).not.toHaveBeenCalled()
  })
  it.each([{ aal: 'aal1' }, { verified: false }, { revoked: true }, { sub: 'attacker' }])('requires current owner, validated identity and MFA: %j', async patch => {
    state.role = 'OWNER'; Object.assign(state, patch)
    await expect(requirePlatformOwner()).rejects.toThrow()
  })
  it('authorizes a verified owner and audits the scoped read', async () => {
    state.role = 'OWNER'
    const result = await loadOperations(['oficinas'], { office: '12', page: '2' })
    expect(result.title).toBe('Oficinas')
    expect(state.read).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 12 }, skip: 25, take: 26 }))
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUserId: 'user-1', action: 'operations.view' }) }))
  })
  it('rejects writes from office admins before body parsing', async () => {
    const r = await PATCH(new NextRequest('http://localhost/api/operaciones/incidentes/other', { method: 'PATCH', body: 'untrusted' }), { params: Promise.resolve({ path: ['incidentes', 'other'] }) })
    expect(r.status).toBe(403)
  })
  it('rejects owner writes without same-origin evidence', async () => {
    state.role = 'OWNER'
    const r = await PATCH(new NextRequest('http://localhost/api/operaciones/incidentes/other', { method: 'PATCH', headers: { origin: 'https://attacker.test' } }), { params: Promise.resolve({ path: ['incidentes', 'other'] }) })
    expect(r.status).toBe(403)
  })
})
