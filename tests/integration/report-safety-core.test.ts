import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

import { finalDeliveryAttemptStatus, isValidReportIdempotencyKey, shouldSwitchCurrentVersion, versionIdsToPrune } from '../../lib/reports/reportSafetyCore'
import { validateCatalogEvent } from '../../lib/audit/catalog'

describe('report safety core', () => {
  it('keeps the current version plus ten previous ready versions', () => {
    const versions = Array.from({ length: 14 }, (_, index) => ({ id: `v${index + 1}`, versionNumber: index + 1 }))
    expect(versionIdsToPrune(versions, 'v14')).toEqual(['v3', 'v2', 'v1'])
    expect(versionIdsToPrune(versions, 'v2')).toEqual(['v4', 'v3', 'v1'])
  })

  it('never lets a slower older candidate replace a newer ready version', () => {
    expect(shouldSwitchCurrentVersion(1, null)).toBe(true)
    expect(shouldSwitchCurrentVersion(2, 1)).toBe(true)
    expect(shouldSwitchCurrentVersion(1, 2)).toBe(false)
    expect(shouldSwitchCurrentVersion(2, 2)).toBe(false)
  })

  it('derives immutable attempt outcomes and validates request idempotency keys', () => {
    expect(finalDeliveryAttemptStatus({ intended: 0, sent: 0 })).toBe('NO_RECIPIENTS')
    expect(finalDeliveryAttemptStatus({ intended: 2, sent: 2 })).toBe('SENT')
    expect(finalDeliveryAttemptStatus({ intended: 2, sent: 1 })).toBe('PARTIAL')
    expect(finalDeliveryAttemptStatus({ intended: 2, sent: 0 })).toBe('FAILED')
    expect(isValidReportIdempotencyKey('report-1234567890abcdef')).toBe(true)
    expect(isValidReportIdempotencyKey('short')).toBe(false)
    expect(isValidReportIdempotencyKey('invalid key with spaces')).toBe(false)
  })

  it('strictly validates report audit metadata and rejects extra sensitive fields', () => {
    const metadata = {
      reportId: 'report-1',
      versionId: 'version-1',
      reportType: 'monthly',
      periodDate: '2026-06',
      checksumSha256: 'a'.repeat(64),
      sizeBytes: 1200,
      requestId: 'request-123456789',
      current: true,
    }
    expect(validateCatalogEvent('report.downloaded', 'reports', metadata)).toEqual(metadata)
    expect(() => validateCatalogEvent('report.downloaded', 'reports', { ...metadata, recipientEmail: 'secret@example.com' })).toThrow()
  })

  it('commits immutable tables, constraints, private storage and legacy backfills', () => {
    const migration = readFileSync(join(process.cwd(), 'prisma/migrations/20260824120000_add_report_versions_and_delivery_attempts/migration.sql'), 'utf8')
    expect(migration).toContain('CREATE TABLE "generated_report_versions"')
    expect(migration).toContain('CREATE TABLE "report_delivery_attempts"')
    expect(migration).toContain('CREATE TABLE "report_delivery_attempt_recipients"')
    expect(migration).toContain('ON CONFLICT ("legacyBatchId") DO NOTHING')
    expect(migration).toContain("'reports',\n  'reports',\n  false")
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('REVOKE ALL ON TABLE "generated_report_versions" FROM anon, authenticated')
  })

  it('enforces admin report APIs and fail-closed audited downloads in source', () => {
    const root = process.cwd()
    const adminRoutes = [
      'app/api/reports/route.ts',
      'app/api/reports/daily/generate/route.ts',
      'app/api/reports/monthly/generate/route.ts',
      'app/api/reports/daily/send/route.ts',
      'app/api/reports/monthly/send/route.ts',
      'app/api/reports/cleanup/route.ts',
      'app/api/reports/[id]/versions/route.ts',
      'app/api/reports/[id]/versions/[versionId]/restore/route.ts',
      'app/api/reports/[id]/delivery-attempts/route.ts',
      'app/api/reports/versions/route.ts',
      'app/api/reports/delivery-attempts/route.ts',
      'app/api/reports/delivery-attempts/[attemptId]/route.ts',
      'app/api/reports/[id]/send/route.ts',
      'app/api/reports/jobs/route.ts',
      'app/api/reports/jobs/[jobId]/route.ts',
      'app/api/reports/jobs/[jobId]/cancel/route.ts',
      'app/api/reports/jobs/[jobId]/retry/route.ts',
      'app/api/reports/recipients/route.ts',
      'app/api/reports/schedules/route.ts',
      'app/api/reports/schedules/[scheduleId]/route.ts',
      'app/api/reports/schedules/[scheduleId]/run-now/route.ts',
      'app/api/reports/custom-definitions/route.ts',
      'app/api/reports/custom-definitions/[definitionId]/route.ts',
      'app/api/reports/custom-definitions/[definitionId]/archive/route.ts',
      'app/api/reports/custom-definitions/[definitionId]/run/route.ts',
    ]
    for (const route of adminRoutes) {
      expect(readFileSync(join(root, route), 'utf8')).toContain('assertReportAdmin(user)')
    }
    const download = readFileSync(join(root, 'app/api/reports/[id]/download/route.ts'), 'utf8')
    expect(download).toContain('downloadVerifiedReportVersion')
    expect(download).toContain("eventType: 'report.downloaded'")
    expect(download.indexOf('await auditDownload')).toBeLessThan(download.indexOf('return new Response'))
    const delivery = readFileSync(join(root, 'lib/reports/deliveryAttempts.ts'), 'utf8')
    expect(delivery.indexOf('reportDeliveryAttempt.create')).toBeLessThan(delivery.indexOf('downloadVerifiedReportVersion({'))
    expect(delivery).toContain('attachmentSha256: attachment.checksumSha256')
    expect(readFileSync(join(root, 'lib/reports/storage.ts'), 'utf8')).not.toContain('upsert: true')
  })
})
