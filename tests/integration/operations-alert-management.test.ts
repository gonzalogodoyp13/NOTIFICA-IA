import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ guard: vi.fn(), grant: vi.fn(), count: vi.fn(), get: vi.fn(), put: vi.fn(), audit: vi.fn(), maintenance: vi.fn(), alert: vi.fn() }))
vi.mock('@/lib/operations/auth', () => ({ requirePlatformOwner: state.guard, OperationsAccessError: class extends Error { constructor(public status: number, code: string) { super(code) } } }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: async (work: any) => work({ platformGrant: { findFirst: state.grant, count: state.count }, operationsPolicy: { findUnique: state.get, upsert: state.put }, platformAudit: { create: state.audit }, operationsMaintenance: { create: state.maintenance }, operationsAlert: { updateMany: state.alert, findUnique: async () => ({officeId:null}) }, $executeRaw: async () => 1, $queryRaw: async () => [] }) } }))
import { manageAlerts } from '@/lib/operations/alert-management'
import { defaultAlertPolicy } from '@/lib/operations/alert-policy'
beforeEach(() => { vi.clearAllMocks(); state.guard.mockResolvedValue({id:'owner'}); state.grant.mockResolvedValue({role:'OWNER'}); state.count.mockResolvedValue(1); state.get.mockResolvedValue(null); state.put.mockResolvedValue({revision:1}); state.alert.mockResolvedValue({count:1}); state.maintenance.mockResolvedValue({id:'window'}) })
it('requires dedicated owner permission and revalidates the grant transactionally', async () => {
  state.grant.mockResolvedValue(null)
  await expect(manageAlerts({ action:'policy',officeId:null,revision:0,settings:defaultAlertPolicy() })).rejects.toThrow('PLATFORM_ACCESS_DENIED')
  expect(state.guard).toHaveBeenCalledWith('alerts.manage'); expect(state.put).not.toHaveBeenCalled()
})
it('rejects ordinary recipients and enabled policies without an explicitly configured recipient', async () => {
  state.count.mockResolvedValue(0)
  await expect(manageAlerts({action:'policy',officeId:null,revision:0,settings:{...defaultAlertPolicy(),enabled:true,recipients:['ordinary-user']}})).rejects.toThrow('INVALID_RECIPIENTS')
  await expect(manageAlerts({action:'policy',officeId:null,revision:0,settings:{...defaultAlertPolicy(),enabled:true}})).rejects.toThrow('INVALID_RECIPIENTS')
  expect(state.put).not.toHaveBeenCalled()
})
it('audits policy changes and refuses stale revisions', async () => {
  const input = {action:'policy',officeId:null,revision:0,settings:{...defaultAlertPolicy(),recipients:['owner']}}
  await manageAlerts(input); expect(state.audit.mock.calls[0][0].data.action).toBe('alerts.policy')
  state.get.mockResolvedValue({revision:2}); await expect(manageAlerts(input)).rejects.toThrow('POLICY_CHANGED')
})
it('requires an expiring maintenance window and validates recovery revision/state', async () => {
  await expect(manageAlerts({action:'maintenance',officeId:null,startsAt:'2099-01-01T00:00:00Z',endsAt:'2099-02-01T00:00:00Z',reason:'Maintenance planned'})).rejects.toThrow('INVALID_MAINTENANCE_WINDOW')
  await manageAlerts({action:'verify-recovery',id:'device:one',revision:2,reason:'Heartbeat verified'})
  expect(state.alert.mock.calls[0][0].where).toMatchObject({status:'RECOVERY_PENDING',revision:2})
})
