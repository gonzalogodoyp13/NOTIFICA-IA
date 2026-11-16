// Security acceptance tests. No network, real users, or email delivery.
// Regression coverage for reproduced audit findings; run with the audit config.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const m = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), create: vi.fn(), transaction: vi.fn(), audit: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/security/rateLimit', () => ({ enforceRequestQuota: vi.fn() }))
vi.mock('@/lib/auth-server', async () => ({ ...await import('../../lib/auth-core'), resolveAuthenticatedUser: m.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: { comuna: { findMany: m.list, create: m.create }, $transaction: m.transaction } }))
vi.mock('@/lib/audit/activityEvent', () => ({ recordActivityEvent: m.audit, recordBestEffortEvent: m.audit }))
vi.mock('@/lib/audit/businessEvents', () => ({ recordSettingsEvent: m.audit }))
vi.mock('@/lib/supabaseServer', () => ({ createServerSupabaseClient: () => ({ auth: { signOut: vi.fn() } }) }))
import { GET, POST } from '@/app/api/comunas/route'
import { AuthResolutionError } from '../../lib/auth-core'
beforeEach(() => {
  vi.resetAllMocks()
  m.auth.mockResolvedValue({ id: 'audit-user-a', authUserId: 'auth-a', officeId: 1001, officeName: 'Audit', isOfficeAdmin: false })
  m.list.mockResolvedValue([])
  m.create.mockImplementation(async ({ data }) => ({ id: 'new', ...data }))
  m.transaction.mockImplementation(async callback => callback({ comuna: { create: m.create } }))
})
describe('security audit acceptance gates', () => {
  it('denies an unauthenticated request before querying data', async () => {
    m.auth.mockRejectedValue(new AuthResolutionError('UNAUTHORIZED', 'Unauthorized', 401))
    expect((await GET(new NextRequest('https://app.example/api/comunas'))).status).toBe(401)
    expect(m.list).not.toHaveBeenCalled()
  })
  it('scopes list queries to the canonical office', async () => {
    await GET(new NextRequest('https://app.example/api/comunas?officeId=1002'))
    expect(m.list).toHaveBeenCalledWith(expect.objectContaining({ where: { officeId: 1001 } }))
  })
  it('ignores a client-supplied office on creation', async () => {
    const response = await POST(new NextRequest('https://app.example/api/comunas', { method: 'POST',
      headers: { Origin: 'https://app.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'Audit fixture', officeId: 1002 }) }))
    expect(response.status).toBe(200)
    expect(m.create).toHaveBeenCalledWith({ data: { nombre: 'Audit fixture', officeId: 1001 } })
  })
  it('rejects a cross-origin simple POST before mutating data', async () => {
    const response = await POST(new NextRequest('https://app.example/api/comunas', { method: 'POST',
      headers: { Origin: 'https://untrusted.example', 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'text/plain' },
      body: JSON.stringify({ nombre: 'Audit fixture' }) }))
    expect(response.status).toBe(403)
    expect(m.create).not.toHaveBeenCalled()
  })
  it('does not return internal database error details', async () => {
    m.list.mockRejectedValue(new Error('AUDIT_INTERNAL_SENTINEL database host and query detail'))
    const response = await GET(new NextRequest('https://app.example/api/comunas'))
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('AUDIT_INTERNAL_SENTINEL')
  })
})
