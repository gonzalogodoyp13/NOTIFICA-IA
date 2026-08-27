import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  CUSTOM_REPORT_COLUMNS,
  CustomDefinitionInputSchema,
  deriveScheduleHealth,
  isTransientReportError,
  JobListQuerySchema,
  ManualCustomRunSchema,
  nextScheduleRun,
  reportRetryDelayMs,
  schedulePeriod,
} from '../../lib/reports/automationCore'

describe('Phase 4 report automation contracts', () => {
  it('validates bounded job filters and manual custom ranges', () => {
    expect(JobListQuerySchema.parse({})).toMatchObject({ page: 1, limit: 25, status: 'all', type: 'all', reportKind: 'all' })
    expect(JobListQuerySchema.parse({ page: '2', limit: '100', status: 'RUNNING', reportKind: 'custom' })).toMatchObject({ page: 2, limit: 100, status: 'RUNNING', reportKind: 'custom' })
    expect(() => JobListQuerySchema.parse({ limit: 101 })).toThrow()
    expect(ManualCustomRunSchema.parse({ dateFrom: '2026-01-01', dateTo: '2026-12-31', deliver: true }).deliver).toBe(true)
    expect(() => ManualCustomRunSchema.parse({ dateFrom: '2025-01-01', dateTo: '2026-01-02' })).toThrow()
    expect(() => ManualCustomRunSchema.parse({ dateFrom: '2026-02-30', dateTo: '2026-03-01' })).toThrow()
  })

  it('allows only curated custom columns and rejects duplicate or unknown fields', () => {
    const valid = { name: 'Actividad sensible', modules: ['reports'], actionCategories: ['READ'], results: ['success'], actorUserIds: [], includeSystem: true, selectedColumns: [...CUSTOM_REPORT_COLUMNS], recipientUserIds: [] }
    expect(CustomDefinitionInputSchema.parse(valid).selectedColumns).toHaveLength(CUSTOM_REPORT_COLUMNS.length)
    expect(() => CustomDefinitionInputSchema.parse({ ...valid, selectedColumns: ['metadata'] })).toThrow()
    expect(() => CustomDefinitionInputSchema.parse({ ...valid, selectedColumns: ['timestamp', 'timestamp'] })).toThrow()
    expect(() => CustomDefinitionInputSchema.parse({ ...valid, rawQuery: 'select *' })).toThrow()
  })

  it('calculates Chilean schedule times and completed daily, weekly, and monthly periods', () => {
    const next = nextScheduleRun({ frequency: 'DAILY', localTime: '07:30' }, new Date('2026-09-05T12:00:00.000Z'))
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(next)
    expect(parts).toBe('07:30')
    expect(next.getTime()).toBeGreaterThan(new Date('2026-09-05T12:00:00.000Z').getTime())
    expect(schedulePeriod({ kind: 'DAILY', frequency: 'DAILY' }, new Date('2026-08-26T18:00:00.000Z')).label).toBe('2026-08-25')
    expect(schedulePeriod({ kind: 'MONTHLY', frequency: 'MONTHLY' }, new Date('2026-08-26T18:00:00.000Z')).label).toBe('2026-07')
    expect(schedulePeriod({ kind: 'CUSTOM', frequency: 'WEEKLY' }, new Date('2026-08-26T18:00:00.000Z')).label).toBe('2026-08-17_2026-08-23')
  })

  it('derives every health state from timing, leases, failures, and recipients', () => {
    const now = new Date('2026-08-26T18:00:00.000Z')
    const base = { enabled: true, nextRunAt: new Date('2026-08-26T20:00:00.000Z'), lastAttemptAt: new Date('2026-08-26T17:00:00.000Z'), lastSuccessAt: new Date('2026-08-26T17:00:00.000Z'), lastFailureAt: null, consecutiveFailures: 0, latenessThresholdMinutes: 60, hasRecipients: true, lastJob: null }
    expect(deriveScheduleHealth({ ...base, enabled: false }, now).state).toBe('DISABLED')
    expect(deriveScheduleHealth(base, now).state).toBe('HEALTHY')
    expect(deriveScheduleHealth({ ...base, lastJob: { status: 'RUNNING', leaseExpiresAt: new Date('2026-08-26T18:10:00.000Z') } }, now).state).toBe('RUNNING')
    expect(deriveScheduleHealth({ ...base, hasRecipients: false }, now).state).toBe('ATTENTION')
    expect(deriveScheduleHealth({ ...base, consecutiveFailures: 3 }, now).state).toBe('CRITICAL')
    expect(deriveScheduleHealth({ ...base, nextRunAt: new Date('2026-08-26T16:00:00.000Z') }, now).state).toBe('CRITICAL')
  })

  it('uses the locked retry policy and classifies transient failures conservatively', () => {
    expect([1, 2, 3].map(reportRetryDelayMs)).toEqual([60_000, 300_000, 900_000])
    expect(isTransientReportError(new Error('network timeout from provider'))).toBe(true)
    expect(isTransientReportError(Object.assign(new Error('transaction conflict'), { code: 'P2034' }))).toBe(true)
    expect(isTransientReportError(new Error('validation failed'))).toBe(false)
  })

  it('commits additive tables, identity backfill, RLS, grants, and disabled schedule backfills', () => {
    const migration = readFileSync(join(process.cwd(), 'prisma/migrations/20260826190000_add_report_automation_phase4/migration.sql'), 'utf8')
    for (const table of ['report_jobs', 'report_job_runs', 'report_recipient_configs', 'report_schedules', 'custom_report_definitions', 'custom_report_definition_recipients']) {
      expect(migration).toContain(`CREATE TABLE "${table}"`)
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`)
      expect(migration).toContain(`REVOKE ALL ON TABLE "${table}" FROM anon, authenticated`)
    }
    expect(migration).toContain('SET "identityKey" = "reportType"')
    expect(migration).toContain('"customEnabled", "isEnabled"')
    expect(migration).toContain("'DAILY', 'daily', 'DAILY', '07:00', 'America/Santiago', false")
    expect(migration).toContain("'MONTHLY', 'monthly', 'MONTHLY', '07:15', 1, 'America/Santiago', false")
  })

  it('implements atomic claiming, leases, heartbeats, recovery, pinned retries, and safe recipient selection', () => {
    const jobs = readFileSync(join(process.cwd(), 'lib/reports/jobs.ts'), 'utf8')
    const delivery = readFileSync(join(process.cwd(), 'lib/reports/deliveryAttempts.ts'), 'utf8')
    const custom = readFileSync(join(process.cwd(), 'lib/reports/customReports.ts'), 'utf8')
    expect(jobs).toContain('FOR UPDATE SKIP LOCKED')
    expect(jobs).toContain("INTERVAL '10 minutes'")
    expect(jobs).toContain("progressPhase: 'retry_wait'")
    expect(jobs).toContain("target: 'failed', previousAttemptId: error.attemptId")
    expect(delivery).toContain('configuredRecipients({')
    expect(delivery).toContain('const pinnedVersionId = parent?.reportVersionId ?? input.report.currentVersionId')
    expect(custom).toContain('take: 50_001')
    expect(custom).toContain('dailyEventDetail(event)')
    expect(custom).not.toContain('metadata: event.metadata')
  })

  it('keeps five URL-backed operations views and independent panels', () => {
    const client = readFileSync(join(process.cwd(), 'app/(protected)/ajustes/reportes/reportes-client.tsx'), 'utf8')
    const nav = readFileSync(join(process.cwd(), 'app/(protected)/ajustes/reportes/OperationsSubnav.tsx'), 'utf8')
    expect(client).toContain("['control', 'jobs', 'recipients', 'schedules', 'custom']")
    expect(client).toContain("searchParams.get('view')")
    expect(client).toContain('<JobsSection')
    expect(client).toContain('<RecipientsSection')
    expect(client).toContain('<SchedulesSection')
    expect(client).toContain('<CustomReportsSection')
    expect(nav).toContain('role="tablist"')
    expect(nav).toContain("'ArrowRight'")
    expect(nav).toContain("'Home'")
  })
})
