import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ send: vi.fn(), rows: vi.fn(), update: vi.fn(), claim: vi.fn(), owner: vi.fn(), settings: vi.fn(), alert: vi.fn(), maintenance: vi.fn() }))
vi.mock('@/lib/email/system-mailer', () => ({ createSystemMailAdapter: () => ({ send: state.send }) }))
vi.mock('@/lib/prisma', () => ({ prisma: { operationsPolicy: { findMany: state.settings }, operationsNotification: { findMany: state.rows, update: state.update, updateMany: state.claim }, platformGrant: { findFirst: state.owner }, operationsAlert: { findUnique: state.alert }, operationsMaintenance: { findFirst: state.maintenance } } }))
import { dispatchNotifications, digestText, renderNotice } from '@/lib/operations/notifications'
import { defaultAlertPolicy } from '@/lib/operations/alert-policy'
const now = new Date('2026-11-20T12:00:00Z')
const notice = { subject: 'Resumen', text: 'Sin contenido sensible', path: '/operaciones', officeId: null }
beforeEach(() => {
  vi.clearAllMocks(); vi.unstubAllEnvs()
  vi.stubEnv('OPERATIONS_NOTIFICATIONS_ENABLED','true'); vi.stubEnv('SYSTEM_MAIL_PROVIDER','resend'); vi.stubEnv('OPERATIONS_CENTER_URL','https://app.example')
  state.settings.mockResolvedValue([{ key: 'global', settings: { ...defaultAlertPolicy(), enabled: true, recipients: ['owner'], timezone: 'UTC' } }])
  state.rows.mockResolvedValue([{ id: 'notice', recipientId: 'owner', kind: 'digest', referenceId: 'window', status: 'QUEUED', content: notice, attempts: 0, createdAt: now, claimedAt: null }])
  state.owner.mockResolvedValue({ user: { email: 'test@example.invalid' } }); state.claim.mockResolvedValue({ count: 1 }); state.send.mockResolvedValue({ provider: 'resend', messageId: 'mock' }); state.update.mockResolvedValue({})
  state.maintenance.mockResolvedValue(null)
})
it('cannot send until the server explicitly enables deliveries', async () => {
  vi.stubEnv('OPERATIONS_NOTIFICATIONS_ENABLED','false')
  expect(await dispatchNotifications(now)).toEqual({ sent: 0, disabled: true }); expect(state.send).not.toHaveBeenCalled(); expect(state.rows).not.toHaveBeenCalled()
})
it('rechecks recipient authorization and cancels revoked owners', async () => {
  state.owner.mockResolvedValue(null)
  await dispatchNotifications(now)
  expect(state.send).not.toHaveBeenCalled(); expect(state.update.mock.calls[0][0].data.status).toBe('CANCELLED')
})
it('uses a stable provider key, private links and provider-accepted terminology', async () => {
  await dispatchNotifications(now)
  expect(state.send.mock.calls[0][0]).toMatchObject({ to: ['test@example.invalid'], idempotencyKey: 'operations-notice' })
  expect(state.send.mock.calls[0][0].text).toContain('https://app.example/operaciones')
  expect(state.update.mock.calls.at(-1)?.[0].data.status).toBe('ACCEPTED')
})
it('does not double-send a claimed row and stores safe bounded retries', async () => {
  state.claim.mockResolvedValueOnce({ count: 0 }); await dispatchNotifications(now); expect(state.send).not.toHaveBeenCalled()
  state.send.mockRejectedValue(new Error('secret body token=never-persist'))
  await dispatchNotifications(now)
  expect(state.update.mock.calls.at(-1)?.[0].data.status).toBe('RETRY')
  expect(JSON.stringify(state.update.mock.calls)).not.toContain('never-persist')
})
it('honors acknowledgement and maintenance changes before delivery', async () => {
  state.rows.mockResolvedValue([{ id: 'notice', recipientId: 'owner', kind: 'critical', referenceId: 'alert', status: 'QUEUED', content: { ...notice, generation: 1 }, attempts: 0, createdAt: now, claimedAt: null }])
  state.alert.mockResolvedValue({ status: 'ACKNOWLEDGED', generation: 1 })
  await dispatchNotifications(now); expect(state.send).not.toHaveBeenCalled()
  state.alert.mockResolvedValue({ status: 'OPEN', generation: 1 }); state.maintenance.mockResolvedValue({ id: 'maintenance' })
  await dispatchNotifications(now); expect(state.send).not.toHaveBeenCalled(); expect(state.update.mock.calls.at(-1)?.[0].data.availableAt).toBeInstanceOf(Date)
})
it('rejects public or attacker-controlled links and includes the digest window and verification backlog', () => {
  expect(() => renderNotice({ ...notice, path: '//evil.example' },'https://app.example')).toThrow()
  const text = digestText('2026-11-19','UTC',new Date('2026-11-19'),new Date('2026-11-20'),{newIncidents:1,unresolved:2,affectedOffices:3,failedReports:4,stuckReports:5,failedSigning:6,stuckSigning:7,certificates:8,recovery:9,emails:10,failedReceipts:1,stuckReceipts:2,missedRuns:3})
  expect(text).toContain('fin excluido'); expect(text).toContain('verificación: 9'); expect(text).toContain('2026-11-19')
})
