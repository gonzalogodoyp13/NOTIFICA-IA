import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({
  findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(),
  update: vi.fn(), updateMany: vi.fn(), query: vi.fn(), transaction: vi.fn(),
  runCreate: vi.fn(), runUpdate: vi.fn(), generate: vi.fn(), deliver: vi.fn(), waitUntil: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@vercel/functions', () => ({ waitUntil: m.waitUntil }))
vi.mock('@/lib/api/server', () => ({ ApiError: class extends Error { constructor(public code: string, message: string, public status: number) { super(message) } } }))
vi.mock('@/lib/audit/activityEvent', () => ({ recordBestEffortEvent: vi.fn() }))
vi.mock('@/lib/email/system-mailer', () => ({ createSystemMailAdapter: vi.fn() }))
vi.mock('@/lib/reports/dailyReport', () => ({ generateDailyReport: m.generate }))
vi.mock('@/lib/reports/dailyDelivery', () => ({ sendDailyReportForOffice: m.deliver }))
vi.mock('@/lib/reports/monthlyReport', () => ({ generateMonthlyReport: vi.fn() }))
vi.mock('@/lib/reports/monthlyDelivery', () => ({ sendMonthlyReportForOffice: vi.fn() }))
vi.mock('@/lib/reports/customReports', () => ({ generateCustomReport: vi.fn() }))
vi.mock('@/lib/reports/deliveryAttempts', () => ({ validateReportIdempotencyKey: (key: string) => key, executeReportDelivery: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  $transaction: m.transaction,
  reportJob: { findFirst: m.findFirst, findUnique: m.findUnique, findUniqueOrThrow: m.findUniqueOrThrow, create: m.create, update: m.update, updateMany: m.updateMany },
  reportJobRun: { create: m.runCreate, update: m.runUpdate },
} }))
import { enqueueReportJob, runRequestedReportJob } from '@/lib/reports/jobs'

const parent = { id: 'parent', officeId: 77, type: 'GENERATE', status: 'QUEUED', reportKind: 'daily', requestedPeriodLabel: '2026-11-10', requestedPeriodStart: new Date('2026-11-10'), requestedPeriodEnd: new Date('2026-11-11'), origin: 'MANUAL', payload: { deliverAfter: true }, attemptCount: 1 }
const child = { ...parent, id: 'child', type: 'DELIVER', origin: 'CHAINED', payload: {} }
beforeEach(() => {
  vi.resetAllMocks()
  m.transaction.mockImplementation(async value => typeof value === 'function' ? value({ $queryRaw: m.query, reportJob: { findUniqueOrThrow: m.findUniqueOrThrow }, reportJobRun: { create: m.runCreate } }) : Promise.all(value))
  m.findFirst.mockImplementation(async ({ where }) => where.status === 'CANCEL_REQUESTED' ? null : { ...parent, ...(where.status ? { status: where.status } : {}) })
  m.generate.mockResolvedValue({ status: 'generated', report: { id: 'report', currentVersionId: 'version' } })
  m.deliver.mockResolvedValue({ status: 'sent', reportId: 'report', reportVersionId: 'version', attemptId: 'delivery' })
})
describe('targeted report worker', () => {
  it('rejects an unknown job or another office before claiming anything', async () => {
    m.findFirst.mockResolvedValue(null)
    await expect(runRequestedReportJob({ officeId: 88, jobId: 'parent' })).rejects.toMatchObject({ status: 404 })
    expect(m.query).not.toHaveBeenCalled()
    expect(m.deliver).not.toHaveBeenCalled()
  })
  it('claims only the requested job and its own chained delivery', async () => {
    m.query.mockResolvedValueOnce([{ id: 'parent' }]).mockResolvedValueOnce([{ id: 'child' }])
    m.findUniqueOrThrow.mockResolvedValueOnce(parent).mockResolvedValueOnce(child)
    m.findUnique.mockResolvedValue(child)
    expect(await runRequestedReportJob({ officeId: 77, jobId: 'parent' })).toEqual({ claimed: 2, outcomes: ['succeeded', 'succeeded'] })
    expect(m.generate).toHaveBeenCalledOnce()
    expect(m.deliver).toHaveBeenCalledOnce()
    const queries = m.query.mock.calls.map(call => call[0])
    expect(queries[0].values).toEqual([77, 'parent'])
    expect(queries[1].values).toEqual([77, 'child'])
    expect(queries[0].strings.join('')).toContain('FOR UPDATE SKIP LOCKED')
  })
  it('does not send if a concurrent worker already claimed the job', async () => {
    m.query.mockResolvedValue([])
    m.findFirst.mockResolvedValueOnce(parent).mockResolvedValueOnce(null)
    expect(await runRequestedReportJob({ officeId: 77, jobId: 'parent' })).toEqual({ claimed: 0, outcomes: [] })
    expect(m.deliver).not.toHaveBeenCalled()
    expect(m.generate).not.toHaveBeenCalled()
  })
  it('registers manual requests with waitUntil while scheduled requests remain queued', async () => {
    m.findUnique.mockResolvedValue(null)
    m.create.mockResolvedValue(parent)
    m.query.mockResolvedValue([])
    const input = { officeId: 77, type: 'GENERATE' as const, origin: 'MANUAL' as const, reportKind: 'daily' as const, idempotencyKey: 'manual-test', periodStart: parent.requestedPeriodStart, periodEnd: parent.requestedPeriodEnd, periodLabel: '2026-11-10' }
    await enqueueReportJob(input)
    expect(m.waitUntil).toHaveBeenCalledOnce()
    await m.waitUntil.mock.calls[0][0]
    await enqueueReportJob({ ...input, origin: 'SCHEDULED', idempotencyKey: 'scheduled-test' })
    expect(m.waitUntil).toHaveBeenCalledOnce()
  })
})
