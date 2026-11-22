import { expect, it } from 'vitest'
import { alertTransition, defaultAlertPolicy, digestWindow, inOperatingHours, type AlertSnapshot } from '@/lib/operations/alert-policy'
import { troubleshooting, supportedGuideCodes } from '@/lib/operations/guides'
const policy = { ...defaultAlertPolicy(), timezone: 'UTC', weekdays: [0,1,2,3,4,5,6] }
const now = new Date('2026-11-20T10:00:00Z')
const signal = { active: true, severity: 'critical', pending: 1, scope: 1, now, maintenance: false }
const previous: AlertSnapshot = { status: 'OPEN', firstObservedAt: new Date(now.getTime() - 600000), lastNotifiedAt: null, level: 0, generation: 1 }
it('requires persistence, deduplicates occurrences, escalates once and honors acknowledgement', () => {
  expect(alertTransition(null, signal, policy).notify).toBe(false)
  expect(alertTransition(previous, signal, policy).notify).toBe(true)
  const sent = { ...previous, lastNotifiedAt: now }
  expect(alertTransition(sent, { ...signal, now: new Date(now.getTime()+3600000) }, policy).notify).toBe(false)
  const later = { ...signal, now: new Date(now.getTime()+7200000) }
  expect(alertTransition(sent, later, policy).level).toBe(1)
  expect(alertTransition({ ...sent, level: 1 }, later, policy).notify).toBe(false)
  expect(alertTransition({ ...sent, status: 'ACKNOWLEDGED' }, later, policy).notify).toBe(false)
})
it('does not lose an escalation delayed by cooldown', () => {
  const sent = { ...previous, firstObservedAt: new Date(now.getTime()-3600000), lastNotifiedAt: now }
  const short = { ...policy, escalationMinutes: 15 }
  expect(alertTransition(sent, signal, short).level).toBe(0)
  expect(alertTransition(sent, { ...signal, now: new Date(now.getTime()+3600000) }, short).notify).toBe(true)
})
it('suppresses maintenance, closed hours and idle devices without treating them as healthy', () => {
  for (const input of [{ ...signal, maintenance: true }, { ...signal, now: new Date('2026-11-20T23:00:00Z') }, { ...signal, idleDevice: true, pending: 0 }]) {
    const result = alertTransition(previous, input, policy)
    expect(result.notify).toBe(false); expect(result.status).toBe('OPEN')
  }
  expect(alertTransition(previous, signal, policy).notify).toBe(true) // expiry unmutes
})
it('requires explicit verification of recovery and starts a new generation on recurrence', () => {
  expect(alertTransition(previous, { ...signal, active: false }, policy).status).toBe('RECOVERY_PENDING')
  const recurrence = alertTransition({ ...previous, status: 'RECOVERY_PENDING' }, signal, policy)
  expect(recurrence.generation).toBe(2); expect(recurrence.status).toBe('PENDING'); expect(recurrence.notify).toBe(false)
})
it('handles overnight office hours with the preceding weekday', () => {
  const night = { ...policy, weekdays: [5], start: '22:00', end: '06:00' }
  expect(inOperatingHours(new Date('2026-11-21T02:00:00Z'), night)).toBe(true)
  expect(inOperatingHours(new Date('2026-11-22T02:00:00Z'), night)).toBe(false)
})
it('uses a stable prior calendar day across DST and repeated evaluations', () => {
  const ny = { ...policy, timezone: 'America/New_York' }
  expect(digestWindow(new Date('2026-03-09T12:00:00Z'), ny)?.to.getTime()! - digestWindow(new Date('2026-03-09T12:00:00Z'), ny)?.from.getTime()!).toBe(23*3600000)
  expect(digestWindow(new Date('2026-11-02T13:00:00Z'), ny)?.to.getTime()! - digestWindow(new Date('2026-11-02T13:00:00Z'), ny)?.from.getTime()!).toBe(25*3600000)
  expect(digestWindow(new Date('2026-11-20T07:59:00Z'), policy)).toBeNull()
  expect(digestWindow(now, policy)).toEqual(digestWindow(new Date('2026-11-20T20:00:00Z'), policy))
})
it('provides versioned structured token guidance and admits unknown causes', () => {
  const guide = troubleshooting('TOKEN_MISSING')
  expect(guide.known).toBe(true); expect(guide.review[0]).toContain('heartbeat'); expect(guide.confirmed).toContain('no está confirmada')
  for (const code of supportedGuideCodes) { const g = troubleshooting(code); expect(g.version).toBeTruthy(); expect(g.review.length).toBeGreaterThan(1); expect(g.message).toBeTruthy() }
  expect(troubleshooting('sensitive raw error').code).toBe('UNKNOWN')
  expect(troubleshooting('new-code').possible).toContain('Causa sin confirmar.')
})
