import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), raw: vi.fn(), pulse: vi.fn(), read: vi.fn(), observation: vi.fn(), history: vi.fn(), execute: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction, $executeRaw: mocks.execute, operationsPulse: { findMany: mocks.read } } }))
import { observeProcess, recordPulse, runHealthTick } from '@/lib/operations/monitoring'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async work => work({ operationsPulse: { upsert: mocks.pulse }, operationsObservation: { findFirst: mocks.history, create: mocks.observation }, $queryRaw: mocks.raw, $executeRaw: mocks.execute }))
  mocks.raw.mockResolvedValue([{ ok: true }]); mocks.history.mockResolvedValue(null); mocks.execute.mockResolvedValue(1)
})
it('records start, success and duration without recording the business payload', async () => {
  const sensitive = { token: 'never-store-me', body: 'private' }
  expect(await observeProcess('reports', async () => sensitive)).toBe(sensitive)
  expect(mocks.pulse.mock.calls.map(call => call[0].create.status)).toEqual(['running', 'healthy'])
  expect(JSON.stringify(mocks.pulse.mock.calls)).not.toContain('never-store-me')
  expect(mocks.observation).toHaveBeenCalledTimes(1)
})
it('reports partial failure even if no exception is thrown', async () => {
  await observeProcess('signing', async () => ({ failures: 2 }), x => x.failures === 0)
  expect(mocks.pulse.mock.calls.at(-1)?.[0].create.status).toBe('degraded')
})
it('preserves the exact successful result and original error when telemetry persistence fails', async () => {
  mocks.transaction.mockRejectedValue(new Error('database down'))
  expect(await observeProcess('activity', async () => 42)).toBe(42)
  const original = new Error('business failure')
  await expect(observeProcess('activity', async () => { throw original })).rejects.toBe(original)
})
it('rejects arbitrary telemetry keys and durably rate limits expensive checks', async () => {
  await recordPulse('untrusted-user-key', 'healthy', 'test')
  expect(mocks.transaction).not.toHaveBeenCalled()
  mocks.execute.mockResolvedValue(0)
  expect(await runHealthTick()).toEqual({ skipped: true })
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it('does not add historical rows more than once per minute', async () => {
  mocks.history.mockResolvedValue({ id: 'already-recorded' })
  await recordPulse('app', 'healthy', 'monitor tick')
  expect(mocks.observation).not.toHaveBeenCalled()
  expect(mocks.execute).toHaveBeenCalled() // bounded retention also runs without the monitor scheduler
})
it('aborts hanging HTTP probes and records degraded evidence without sending business requests', async () => {
  vi.useFakeTimers()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service')
  const fetchMock = vi.fn((_url: URL, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))))
  vi.stubGlobal('fetch', fetchMock)
  try {
    const tick = runHealthTick()
    await vi.advanceTimersByTimeAsync(3100)
    await tick
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(call => call[0].pathname)).toEqual(['/auth/v1/health', '/storage/v1/bucket'])
    expect(fetchMock.mock.calls.every(call => call[1].method === 'GET' && call[1].redirect === 'error')).toBe(true)
    expect(mocks.pulse.mock.calls.filter(call => ['auth', 'storage'].includes(call[0].create.key)).every(call => call[0].create.status === 'degraded')).toBe(true)
  } finally { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() }
})
