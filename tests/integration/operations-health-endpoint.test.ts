import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ read: vi.fn(), tick: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { operationsPulse: { findMany: state.read }, $executeRaw: state.tick } }))
vi.mock('@/lib/diagnostics/server', () => ({ reportUnexpected: vi.fn() }))
import { NextRequest } from 'next/server'
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.unstubAllEnvs() })
it('returns only unavailable when evidence is missing, and coalesces anonymous requests', async () => {
  state.read.mockResolvedValue([])
  const { GET } = await import('@/app/api/health/route')
  const responses = await Promise.all(Array.from({ length: 10 }, () => GET(new NextRequest('https://app.example/api/health'))))
  expect(state.read).toHaveBeenCalledTimes(1)
  for (const response of responses) { expect(response.status).toBe(503); expect(await response.json()).toEqual({ status: 'unavailable' }) }
})
it('requires all four fresh observations and fails closed on DB errors', async () => {
  state.read.mockResolvedValue(['app', 'database', 'auth', 'storage'].map(key => ({ key, status: 'healthy', checkedAt: new Date() })))
  let { publicHealth } = await import('@/lib/operations/monitoring')
  expect(await publicHealth()).toBe(true)
  vi.resetModules(); state.read.mockRejectedValue(new Error('secret database details'))
  ;({ publicHealth } = await import('@/lib/operations/monitoring'))
  expect(await publicHealth()).toBe(false)
})
it('denies health tick without a strong server secret before querying or probing', async () => {
  vi.stubEnv('OPERATIONS_MONITOR_SECRET', 'short')
  const { POST } = await import('@/app/api/internal/operations/health/route')
  expect((await POST(new NextRequest('https://app.example/api/internal/operations/health', { method: 'POST', headers: { Authorization: 'Bearer short' } }))).status).toBe(401)
  expect(state.tick).not.toHaveBeenCalled(); expect(state.read).not.toHaveBeenCalled()
})
