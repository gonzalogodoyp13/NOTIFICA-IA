import { describe, expect, it } from 'vitest'
import { CenterAction, CenterFilter, executionDateKey, signingBusinessDate } from '../../lib/signing/centerContracts'

describe('Firmados execution dates and input contracts', () => {
  it('preserves date-only and legacy midnight UTC calendar dates', () => {
    expect(executionDateKey('2026-09-10')).toBe('2026-09-10')
    expect(executionDateKey('2026-09-10T00:00:00.000Z')).toBe('2026-09-10')
  })
  it('converts actual timestamps with Chile summer and winter offsets', () => {
    expect(executionDateKey('2026-07-10T03:30:00Z')).toBe('2026-07-09')
    expect(executionDateKey('2026-10-10T03:30:00Z')).toBe('2026-10-10')
    expect(executionDateKey('2026-09-06T03:30:00Z')).toBe('2026-09-05')
    expect(executionDateKey('2026-09-06T04:30:00Z')).toBe('2026-09-06')
  })
  it('uses notification execution before diligence execution and never a document creation date', () => {
    expect(signingBusinessDate({ ejecucion: { fecha: '2026-05-04' } }, { fechaEjecucion: '2026-06-01' }, new Date('2026-07-01'))).toBe('2026-05-04')
    expect(signingBusinessDate({}, { fechaEjecucion: '2026-06-01' }, null)).toBe('2026-06-01')
    expect(signingBusinessDate({}, {}, null)).toBeNull()
  })
  it('rejects invalid and reversed dates, unknown filters and oversized selections', () => {
    expect(executionDateKey('2026-02-30')).toBeNull()
    expect(executionDateKey('2026-02-30T12:00:00Z')).toBeNull()
    expect(executionDateKey('2026-05-10T10:00:00')).toBeNull()
    for (const raw of [{ from: '2026-02-30' }, { from: '2026-05-10', to: '2026-05-01' }, { officeId: 3 }, { pageSize: 501 }])
      expect(CenterFilter.safeParse(raw).success).toBe(false)
    expect(CenterAction.safeParse({ action: 'retry', itemId: 'item', attemptCount: 1, reviewed: false }).success).toBe(false)
    expect(CenterAction.safeParse({ action: 'queue', signerFingerprint: 'a'.repeat(64), requestedLevel: 'PADES_B', sources: Array.from({ length: 501 }, () => ({ versionId: 'v', checksum: 'a'.repeat(64) })) }).success).toBe(false)
  })
})
