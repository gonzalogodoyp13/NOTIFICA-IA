import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ audit: vi.fn(), update: vi.fn(), assignee: true }))
vi.mock('@/lib/operations/auth', () => ({ requirePlatformOwner: async () => ({ id: 'owner' }), OperationsAccessError: class extends Error { constructor(public status: number, code: string) { super(code) } } }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: async (callback: any) => callback({
  platformGrant: { findUnique: async () => ({ role: 'OWNER' }), findFirst: async () => state.assignee ? { userId: 'owner' } : null },
  diagnosticIncident: { findUnique: async () => ({ id: 'incident', status: 'OPEN', revision: 2, assignedToUserId: null }), updateMany: state.update },
  platformAudit: { create: state.audit },
}) } }))
import { updateIncident } from '@/lib/operations/incidents'
const edit = { revision: 2, status: 'RESOLVED', severity: 'error', assignedToUserId: 'owner', note: 'Verificación completada', impact: '', suspectedCause: 'Hipótesis sin confirmar', confirmedCause: '', nextSteps: 'Observar recurrencias' }
beforeEach(() => { state.assignee = true; state.audit.mockReset().mockResolvedValue({}); state.update.mockReset().mockResolvedValue({ count: 1 }) })
it('records a resolution, assignment and separate hypothesis in audit history', async () => {
  expect(await updateIncident('incident', edit)).toEqual({ revision: 3 })
  expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'incident', revision: 2 }, data: expect.objectContaining({ resolvedAt: expect.any(Date), suspectedCause: edit.suspectedCause, confirmedCause: '' }) }))
  expect(state.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'owner', action: 'incident.updated', details: expect.objectContaining({ previousStatus: 'OPEN', note: edit.note }) }) })
})
it('rejects stale edits so concurrent recurrence cannot be silently overwritten', async () => {
  state.update.mockResolvedValue({ count: 0 }); await expect(updateIncident('incident', edit)).rejects.toThrow('INCIDENT_CHANGED'); expect(state.audit).not.toHaveBeenCalled()
})
it('rejects assignment to an ordinary user and secret-like notes', async () => {
  state.assignee = false; await expect(updateIncident('incident', edit)).rejects.toThrow('INVALID_ASSIGNEE')
  await expect(updateIncident('incident', { ...edit, note: 'PIN=1234' })).rejects.toThrow()
  expect(state.update).not.toHaveBeenCalled()
})
