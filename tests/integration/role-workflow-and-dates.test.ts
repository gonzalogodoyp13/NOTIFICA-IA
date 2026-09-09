import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  deriveDiligenceWorkflowStatus,
  deriveRoleProgressStatus,
} from '../../lib/roles/workflowStateCore'
import {
  dmyDateToIso,
  formatDateCL,
  formatDateTimeCL,
  isIsoDateInFuture,
  isoDateToDmy,
} from '../../lib/utils/dateInput'

describe('role workflow state', () => {
  it('completes only when every active notification has a receipt and stamp', () => {
    expect(deriveDiligenceWorkflowStatus({ currentStatus: 'pendiente', activeNotificationDocumentTypes: [] })).toBe('pendiente')
    expect(deriveDiligenceWorkflowStatus({ currentStatus: 'pendiente', activeNotificationDocumentTypes: [['Recibo']] })).toBe('pendiente')
    expect(deriveDiligenceWorkflowStatus({ currentStatus: 'pendiente', activeNotificationDocumentTypes: [['Recibo', 'Estampo'], ['Recibo']] })).toBe('pendiente')
    expect(deriveDiligenceWorkflowStatus({ currentStatus: 'pendiente', activeNotificationDocumentTypes: [['Recibo', 'Estampo'], ['Estampo', 'Recibo']] })).toBe('completada')
  })

  it('reopens for a new incomplete cycle and preserves an explicit failure', () => {
    expect(deriveDiligenceWorkflowStatus({ currentStatus: 'completada', activeNotificationDocumentTypes: [['Recibo', 'Estampo'], []] })).toBe('pendiente')
    expect(deriveDiligenceWorkflowStatus({ currentStatus: 'fallida', activeNotificationDocumentTypes: [['Recibo', 'Estampo']] })).toBe('fallida')
  })

  it('promotes active roles without automatically terminating them', () => {
    expect(deriveRoleProgressStatus('pendiente', 1)).toBe('en_proceso')
    expect(deriveRoleProgressStatus('en_proceso', 3)).toBe('en_proceso')
    expect(deriveRoleProgressStatus('en_proceso', 0)).toBe('pendiente')
    expect(deriveRoleProgressStatus('terminado', 3)).toBe('terminado')
    expect(deriveRoleProgressStatus('archivado', 0)).toBe('archivado')
  })
})

describe('Chilean date formatting', () => {
  it('round-trips valid leap dates and rejects impossible dates', () => {
    expect(dmyDateToIso('29/02/2024')).toBe('2024-02-29')
    expect(isoDateToDmy('2024-02-29')).toBe('29/02/2024')
    expect(dmyDateToIso('29/02/2023')).toBeNull()
    expect(dmyDateToIso('31/04/2026')).toBeNull()
  })

  it('formats date-only values without a timezone shift and timestamps in 24-hour time', () => {
    expect(formatDateCL('2026-08-30T00:00:00.000Z')).toBe('30/08/2026')
    expect(formatDateTimeCL('2026-08-30T21:05:00.000Z')).toMatch(/^30\/08\/2026, \d{2}:05$/)
    expect(formatDateTimeCL('not-a-date')).toBe('—')
  })

  it('compares future calendar dates in local time', () => {
    const now = new Date(2026, 7, 30, 23, 30)
    expect(isIsoDateInFuture('2026-08-31', now)).toBe(true)
    expect(isIsoDateInFuture('2026-08-30', now)).toBe(false)
  })
})

describe('notification timestamp migration', () => {
  it('backfills legacy rows and enforces a non-null default', () => {
    const migration = readFileSync(
      join(process.cwd(), 'prisma/migrations/20260830120000_require_notification_created_at/migration.sql'),
      'utf8'
    )
    expect(migration).toContain('LEAST(')
    expect(migration).toContain('ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP')
    expect(migration).toContain('ALTER COLUMN "createdAt" SET NOT NULL')
  })
})
