import { describe, expect, it } from 'vitest'

import {
  applyTimingHeaders,
  createRequestTiming,
  operationalTimingRecord,
  safeApiPath,
  safeRegion,
  serverTimingHeader,
} from '../../lib/api/requestTimingCore'

describe('request timing', () => {
  it('measures authentication, handler, and total duration', async () => {
    let now = 10
    const timing = createRequestTiming(() => now)
    await timing.measureAuth(async () => { now += 4 })
    now += 1
    await timing.measureHandler(async () => { now += 7 })
    now += 2
    expect(timing.durations()).toEqual({ auth: 4, handler: 7, total: 14 })
  })

  it('records phase duration when authentication or a handler fails', async () => {
    let now = 0
    const timing = createRequestTiming(() => now)
    await expect(timing.measureAuth(async () => {
      now += 3
      throw new Error('denied')
    })).rejects.toThrow('denied')
    await expect(timing.measureHandler(async () => {
      now += 5
      throw new Error('failed')
    })).rejects.toThrow('failed')
    expect(timing.durations()).toEqual({ auth: 3, handler: 5, total: 8 })
  })

  it('sets standards-based timing and request headers', () => {
    const durations = { auth: 1.2, handler: 3.4, total: 5.6 }
    expect(serverTimingHeader(durations)).toBe('auth;dur=1.2, handler;dur=3.4, total;dur=5.6')
    const response = applyTimingHeaders(new Response(), 'request-1', durations)
    expect(response.headers.get('server-timing')).toBe(serverTimingHeader(durations))
    expect(response.headers.get('x-request-id')).toBe('request-1')
  })

  it('sanitizes dynamic path segments and emits only the operational allowlist', () => {
    const path = '/api/roles/123/550e8400-e29b-41d4-a716-446655440000/sensitiveidentifier123'
    expect(safeApiPath(path)).toBe('/api/roles/:id/:id/:id')
    const record = operationalTimingRecord({
      operation: 'role.read', method: 'GET', pathname: path, status: 200,
      requestId: 'request-2', durations: { auth: 1, handler: 2, total: 3 },
    })
    expect(record).toEqual({
      operation: 'role.read', method: 'GET', path: '/api/roles/:id/:id/:id', status: 200,
      requestId: 'request-2', region: 'local', durations: { auth: 1, handler: 2, total: 3 },
    })
    expect(Object.keys(record).sort()).toEqual(['durations', 'method', 'operation', 'path', 'region', 'requestId', 'status'].sort())
  })

  it('uses a safe local region fallback', () => {
    expect(safeRegion(undefined)).toBe('local')
    expect(safeRegion('gru1')).toBe('gru1')
  })
})
