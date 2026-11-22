import { describe, expect, it, vi } from 'vitest'
import { deadline, elapsed, expiredLease, missedRun, observationState } from '@/lib/operations/lifecycle'
const now = new Date('2026-11-20T12:00:00Z')
const before = new Date(now.getTime() - 600000)
describe('operational evidence rules', () => {
  it.each(['RUNNING', 'CANCEL_REQUESTED', 'CLAIMED', 'SIGNING'])('detects silent expired claims for %s', status => {
    expect(expiredLease(status, before, now)).toBe(true)
    expect(expiredLease(status, null, now)).toBe(true)
    expect(expiredLease(status, new Date(now.getTime() + 1000), now)).toBe(false)
  })
  it.each(['COMPLETED', 'FAILED', 'CANCELLED', 'QUEUED', 'RETRY_PENDING', 'WAITING_FOR_OPERATOR'])('does not invent an active claim for %s', status => expect(expiredLease(status, before, now)).toBe(false))
  it('uses schedule-specific grace, respects disabled and unknown schedules', () => {
    expect(missedRun(true, before, 9, now)).toBe(true)
    expect(missedRun(true, before, 10, now)).toBe(false)
    expect(missedRun(false, before, 0, now)).toBe(false)
    expect(missedRun(true, null, 0, now)).toBe(false)
  })
  it('never treats missing, stale, future or unsupported signals as healthy', () => {
    for (const date of [null, before, new Date(now.getTime() + 1)]) expect(observationState('healthy', date, 180, now)).toContain('Desconocido')
    expect(observationState('healthy', now, 180, now)).toBe('Saludable')
    expect(observationState('degraded', now, 180, now)).toBe('Degradado')
    expect(observationState('invented', now, 180, now)).toBe('Desconocido')
  })
  it('reports completed and open durations without negative values', () => {
    expect(elapsed(before, now, now)).toBe('10 min')
    expect(elapsed(before, null, now)).toBe('10 min · abierto')
    expect(elapsed(null, null, now)).toBe('Sin registro')
  })
  it('bounds a stalled probe and clears timers after successful work', async () => {
    vi.useFakeTimers()
    const slow = expect(deadline(new Promise(() => {}), 1500)).rejects.toThrow('OBSERVATION_TIMEOUT')
    await vi.advanceTimersByTimeAsync(1500); await slow
    expect(await deadline(Promise.resolve(42), 1500)).toBe(42)
    expect(vi.getTimerCount()).toBe(0); vi.useRealTimers()
  })
})
