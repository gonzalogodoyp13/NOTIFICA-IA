import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth-server', () => {
  class AuthResolutionError extends Error { status = 401 }
  return { resolveAuthenticatedUser: async () => { if (state.anonymous) throw new AuthResolutionError(); return { id: 'trusted-user', officeId: 12 } }, AuthResolutionError }
})
vi.mock('@/lib/supabaseServer', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/security/rateLimit', () => ({ enforceRequestQuota: async () => {} }))
vi.mock('@/lib/audit/activityEvent', () => ({ recordActivityEvent: vi.fn(), recordBestEffortEvent: vi.fn() }))
const state = vi.hoisted(() => ({ events: [] as any[], incidents: new Map<string, any>(), monitor: vi.fn(), fail: false, anonymous: false }))
vi.mock('@/lib/diagnostics/monitor', () => ({ reportToMonitor: state.monitor, flushMonitor: async () => true }))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: async () => [{ count: 1 }], $transaction: async (fn: any) => {
  if (state.fail) throw new Error('password=secret')
  return fn({ platformAudit: { create: async () => ({}) }, diagnosticIncident: {
    updateMany: async ({ where, data }: any) => { const row = state.incidents.get(where.fingerprint); if (!row || row.status !== where.status) return { count: 0 }; Object.assign(row, data); return { count: 1 } },
    upsert: async ({ where, create, update }: any) => {
    let row = state.incidents.get(where.fingerprint)
    if (row) Object.assign(row, update, { occurrences: row.occurrences + 1 })
    else { row = { id: where.fingerprint, ...create }; state.incidents.set(where.fingerprint, row) }
    return row
  } }, diagnosticEvent: { create: async ({ data }: any) => { state.events.push(data); return data } } })
} } }))
import { diagnosticEvent, groupingKey } from '@/lib/diagnostics/core'
import { reportUnexpected } from '@/lib/diagnostics/server'
import { withDiagnosticContext } from '@/lib/diagnostics/context'
import { requestIdFor } from '@/lib/api/requestTiming'
import { NextRequest } from 'next/server'
import { withApiUser, ApiError, handleApiError } from '@/lib/api/server'
import { POST as browserReport } from '@/app/api/diagnostics/browser/route'

const context = { module: 'reports', operation: 'report.generate', requestId: 'request-1', officeId: 12, userId: 'user-1' }
function failure() { const e = new Error('token=abc cookie=123 PIN=456 PRIVATE KEY document contents'); e.stack = 'Error: secret\n at fn (C:\\repo\\jobs.ts:42:7)'; return e }
beforeEach(() => { state.events.length = 0; state.incidents.clear(); state.fail = false; state.anonymous = false; state.monitor.mockReset(); vi.stubEnv('APP_ORIGIN', 'http://localhost') })
describe('diagnostic evidence', () => {
  it('captures browser evidence with trusted session context or explicit anonymous context', async () => {
    for (const anonymous of [false, true]) {
      state.anonymous = anonymous
      const response = await browserReport(new NextRequest('http://localhost/api/diagnostics/browser', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ errorType: 'TypeError', frames: ['page.js:8:4'] }) }))
      expect(response.status).toBe(200)
      const { supportReference } = await response.json()
      expect(state.events.find(e => e.reference === supportReference)).toMatchObject({ officeId: anonymous ? null : 12, userId: anonymous ? null : 'trusted-user' })
    }
  })
  it('rejects browser identity injection and cross-origin intake', async () => {
    const make = (origin: string, extra: object) => new NextRequest('http://localhost/api/diagnostics/browser', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ errorType: 'Error', frames: [], ...extra }) })
    expect((await browserReport(make('http://localhost', { officeId: 999 }))).status).toBe(400)
    expect((await browserReport(make('https://evil.test', {}))).status).toBe(403)
    expect(state.events).toHaveLength(0)
  })
  it('locates a controlled API failure by its displayed reference and trusted identity', async () => {
    const request = new NextRequest('http://localhost/api/test', { headers: { 'x-office-id': '999' } })
    const response = await withApiUser(request, 'report.test', async () => { throw failure() })
    const body = await response.json()
    expect(response.status).toBe(500)
    const event = state.events.find(e => e.reference === body.error.details.supportReference)
    expect(event).toMatchObject({ officeId: 12, userId: 'trusted-user', requestId: response.headers.get('x-request-id') })
    expect(body.error.message).toContain(event.reference)
    expect(JSON.stringify(body)).not.toContain('token=')
  })
  it('does not index expected validation or permission failures', async () => {
    for (const status of [400, 403, 409]) await withApiUser(new NextRequest('http://localhost/api/test'), 'report.test', async () => { throw new ApiError('VALIDATION_ERROR', 'Revisa los datos', status) })
    expect(state.events).toHaveLength(0)
  })
  it('preserves authenticated context when a legacy catch omits the user', async () => {
    const request = new NextRequest('http://localhost/api/test')
    await withApiUser(request, 'report.test', () => handleApiError(failure(), { operation: 'report.test', request }))
    expect(state.events).toHaveLength(1)
    expect(state.events[0]).toMatchObject({ officeId: 12, userId: 'trusted-user' })
  })
  it('drops messages, arbitrary properties and payloads but retains source locations', () => {
    const event = diagnosticEvent(Object.assign(failure(), { password: 'pw', body: 'document', cookie: 'session' }), context, 'reference')
    expect(event.frames).toEqual(['jobs.ts:42:7'])
    expect(JSON.stringify(event)).not.toMatch(/abc|456|PRIVATE|contents|password|session|document/)
  })
  it('groups recurring failures across users/releases, distinguishes operations and callsites', () => {
    const a = diagnosticEvent(failure(), context, 'a')
    const b = { ...a, userId: 'user-2', officeId: 23, reference: 'b', release: 'new' }
    expect(groupingKey(a)).toBe(groupingKey(b))
    expect(groupingKey(a)).not.toBe(groupingKey({ ...b, operation: 'report.send' }))
    expect(groupingKey(a)).not.toBe(groupingKey({ ...b, frames: ['other.ts:4:1'] }))
  })
  it('preserves each occurrence and affected identities and reopens resolved incidents', async () => {
    const a = await reportUnexpected(failure(), context)
    const incident = [...state.incidents.values()][0]; incident.status = 'RESOLVED'; incident.resolvedAt = new Date()
    const b = await reportUnexpected(failure(), { ...context, officeId: 23, userId: 'user-2' })
    expect(a).not.toBe(b); expect(state.events).toHaveLength(2)
    expect(incident).toMatchObject({ occurrences: 2, status: 'OPEN', resolvedAt: null })
    expect(state.events.map(e => e.officeId)).toEqual([12, 23])
    expect(state.events.find(e => e.reference === a)).toMatchObject({ userId: 'user-1', requestId: 'request-1' })
  })
  it('propagates trusted async context without crossing concurrent offices', async () => {
    await Promise.all([12, 23].map(officeId => withDiagnosticContext({ ...context, officeId, jobId: `job-${officeId}`, source: 'background' }, async () => {
      await Promise.resolve(); await reportUnexpected(failure(), { module: 'reports', operation: 'report.generate' })
    })))
    expect(state.events.map(e => [e.officeId, e.jobId])).toEqual([[12, 'job-12'], [23, 'job-23']])
  })
  it('captures anonymous failures and deduplicates propagation of the same exception', async () => {
    const e = failure(); const a = await reportUnexpected(e, { module: 'browser', operation: 'browser.error', source: 'browser' })
    expect(await reportUnexpected(e, context)).toBe(a)
    expect(state.events).toHaveLength(1); expect(state.events[0].userId).toBeNull()
  })
  it('isolates failures from both monitoring sinks', async () => {
    state.fail = true; state.monitor.mockImplementation(() => { throw new Error('monitor failed') })
    expect(await reportUnexpected(failure(), context)).toMatch(/^[a-f0-9-]{36}$/)
  })
  it('uses one server-generated request ID and ignores forged client identity/correlation', () => {
    const request = new NextRequest('https://example.test/api/test', { headers: { 'x-request-id': 'forged', 'x-office-id': '23' } })
    expect(requestIdFor(request)).toBe(requestIdFor(request)); expect(requestIdFor(request)).not.toBe('forged')
  })
})
