import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { overallHealth, permits, tokenState } from '@/lib/operations/policy'
const now = new Date('2026-11-20T12:00:00Z')
const device = { role: 'SIGNER', revokedAt: null, lastHeartbeatAt: now, health: 'TOKEN_READY', healthErrorCode: null, certificateExpiresAt: new Date('2027-01-01') }
describe('operational evidence semantics', () => {
  it('never treats offline evidence as a currently missing token or ready device', () => {
    const state = tokenState({ ...device, lastHeartbeatAt: new Date(now.getTime() - 91000), health: 'AGENT_ONLINE_TOKEN_MISSING' }, now)
    expect(state.token).toBe('Desconocido actualmente'); expect(state.ready).toBe(false); expect(state.connection).toContain('vencida')
  })
  it('distinguishes reported missing token, expired certificate and unknown evidence', () => {
    expect(tokenState({ ...device, health: 'AGENT_ONLINE_TOKEN_MISSING' }, now).token).toContain('ausente')
    const expired = tokenState({ ...device, certificateExpiresAt: new Date('2026-01-01') }, now)
    expect(expired.certificate).toContain('Vencido'); expect(expired.ready).toBe(false)
    expect(tokenState({ ...device, lastHeartbeatAt: null }, now).certificate).toContain('desconocido')
  })
  it('uses explicit operator codes only while fresh and distinguishes receiver devices', () => {
    expect(tokenState({ ...device, healthErrorCode: 'PIN_LOCKED' }, now).pin).toBe('PIN_LOCKED')
    expect(tokenState({ ...device, healthErrorCode: 'PIN_LOCKED', lastHeartbeatAt: null }, now).pin).not.toBe('PIN_LOCKED')
    expect(tokenState({ ...device, role: 'RECEIVER' }, now).token).toContain('No aplica')
    expect(tokenState(device, now).ready).toBe(true)
  })
  it('does not equate lack of failures with confirmed health', () => {
    expect(overallHealth({ critical: 0, failures: 0, stale: true })).toBe('unknown')
    expect(overallHealth({ critical: 0, failures: 0, stale: false })).toBe('healthy')
    expect(overallHealth({ critical: 0, failures: 1, stale: true })).toBe('degraded')
    expect(overallHealth({ critical: 1, failures: 0, stale: true })).toBe('critical')
  })
  it('does not implicitly authorize future roles', () => {
    expect(permits('OWNER', 'incidents.write')).toBe(true)
    for (const role of ['SUPPORT', 'OPERATOR', 'ADMIN', '', null]) expect(permits(role, 'operations.read')).toBe(false)
  })
})
