import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ guard: vi.fn(), calls: [] as Array<{ model: string; args: any }>, rows: {} as Record<string, any[]> }))
vi.mock('@/lib/operations/auth', () => ({ requirePlatformOwner: state.guard, OperationsAccessError: class extends Error { constructor(public status: number, code: string) { super(code) } } }))
vi.mock('@/lib/prisma', () => ({ prisma: new Proxy({}, { get: (_, model: string) => model === '$queryRaw' ? async () => [{ count: 2 }] : {
  findMany: async (args: any) => { state.calls.push({ model, args }); return state.rows[model] ?? [] },
  findFirst: async (args: any) => { state.calls.push({ model, args }); return null },
  count: async (args: any) => { state.calls.push({ model, args }); return 0 },
  groupBy: async (args: any) => { state.calls.push({ model, args }); return [] },
} }) }))
import { loadCoverage } from '@/lib/operations/coverage'
const dates = { gte: new Date('2026-11-01'), lte: new Date('2026-11-20') }
beforeEach(() => { state.calls = []; state.rows = {}; state.guard.mockReset().mockResolvedValue({ id: 'owner' }) })
it.each(['trabajos', 'reportes', 'recibos', 'correos', 'salud'])('guards %s before reading and bounds all record lists', async section => {
  state.guard.mockRejectedValueOnce(new Error('denied'))
  await expect(loadCoverage(section, undefined, { office: 12, q: '', page: 1 }, dates)).rejects.toThrow('denied')
  expect(state.calls).toHaveLength(0)
  const view = await loadCoverage(section, undefined, { office: 12, q: '', page: 2 }, dates)
  expect(view.title).toBeTruthy()
  for (const { model, args } of state.calls) {
    if (args.take) { expect(args.take).toBeLessThanOrEqual(26); expect(args.skip ?? 0).toBeLessThanOrEqual(25) }
    if (!model.startsWith('operations')) expect(JSON.stringify(args.where)).toContain('12')
    expect(JSON.stringify(args.select ?? {})).not.toMatch(/"(body|subject|leaseToken|storageKey|cursor|graphDeltaLink|mailboxAddress|errorMessage)":true/)
  }
})
it('shows a validated stored signature separately from failed delivery and expired processing claims', async () => {
  state.rows.signingItem = [{ id: 'item', jobId: 'job', officeId: 12, documentoId: 'doc', status: 'SIGNING', signerFingerprint: 'fp', leaseOwner: 'device', leaseExpiresAt: new Date(0), attemptCount: 2, maxAttempts: 4, errorCode: null, createdAt: new Date(0), updatedAt: new Date(0), completedAt: null, job: { requestedByUserId: 'user' }, attempts: [], signature: { id: 'signature', validatedAt: new Date(), signedVersionId: 'version' }, artifacts: [] }]
  state.rows.documentDelivery = [{ id: 'delivery', deviceId: 'receiver', status: 'FAILED', attemptCount: 2, errorCode: 'OFFLINE', deliveredAt: null, signature: { item: { jobId: 'job' } } }]
  const json = JSON.stringify(await loadCoverage('trabajos', 'job', { office: 12, q: '', page: 1 }, dates))
  expect(json).toContain('claim vencido'); expect(json).toContain('Firma validada'); expect(json).toContain('Versión confirmada'); expect(json).toContain('Fallido'); expect(json).toContain('/operaciones/tokens/device')
})
it('preserves search alongside active-work date conditions and rejects unbounded paging', async () => {
  await loadCoverage('trabajos', undefined, { office: 12, q: 'wanted', page: 1 }, dates)
  const item = state.calls.find(x => x.model === 'signingItem' && x.args.take)
  expect(item?.args.where.AND[0].OR[0].jobId.contains).toBe('wanted')
  expect(item?.args.where.OR).toBeDefined()
  await expect(loadCoverage('trabajos', undefined, { q: '', page: 1001 }, dates)).rejects.toThrow('INVALID_FILTER')
})
