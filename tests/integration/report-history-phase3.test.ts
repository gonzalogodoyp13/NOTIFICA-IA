import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  paginationResult,
  paginationSkip,
  ReportDeliveryHistoryQuerySchema,
  ReportHistoryQuerySchema,
  ReportVersionHistoryQuerySchema,
} from '../../lib/reports/historyCore'

describe('Phase 3 report history contracts', () => {
  it('applies bounded pagination defaults and accepts office-history filters', () => {
    expect(ReportHistoryQuerySchema.parse({})).toMatchObject({ page: 1, limit: 25, reportType: 'all', status: 'all', deliveryStatus: 'all' })
    expect(ReportVersionHistoryQuerySchema.parse({ page: '2', limit: '100', reportType: 'monthly', status: 'READY', scope: 'historical' })).toMatchObject({ page: 2, limit: 100, reportType: 'monthly', status: 'READY', scope: 'historical' })
    expect(ReportDeliveryHistoryQuerySchema.parse({ mode: 'SCHEDULED', target: 'FAILED_ONLY', status: 'PARTIAL' })).toMatchObject({ mode: 'SCHEDULED', target: 'FAILED_ONLY', status: 'PARTIAL' })
    expect(() => ReportHistoryQuerySchema.parse({ page: '0' })).toThrow()
    expect(() => ReportHistoryQuerySchema.parse({ limit: '101' })).toThrow()
    expect(ReportHistoryQuerySchema.parse({ reportType: 'custom' }).reportType).toBe('custom')
  })

  it('validates real Chilean date ranges and rejects unexpected query fields', () => {
    expect(ReportHistoryQuerySchema.parse({ dateFrom: '2026-06-01', dateTo: '2026-06-30' })).toMatchObject({ dateFrom: '2026-06-01', dateTo: '2026-06-30' })
    expect(() => ReportHistoryQuerySchema.parse({ dateFrom: '2026-02-30' })).toThrow()
    expect(() => ReportHistoryQuerySchema.parse({ dateFrom: '2026-07-01', dateTo: '2026-06-01' })).toThrow()
    expect(() => ReportHistoryQuerySchema.parse({ unknown: 'secret' })).toThrow()
  })

  it('produces stable pagination metadata', () => {
    expect(paginationSkip(3, 25)).toBe(50)
    expect(paginationResult(1, 25, 0)).toEqual({ page: 1, limit: 25, total: 0, totalPages: 0 })
    expect(paginationResult(2, 25, 51)).toEqual({ page: 2, limit: 25, total: 51, totalPages: 3 })
  })

  it('keeps global queries office scoped, paginated, stably ordered, and sanitized', () => {
    const source = readFileSync(join(process.cwd(), 'lib/reports/history.ts'), 'utf8')
    expect(source).toContain('officeId,')
    expect(source).toContain("orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }]")
    expect(source).toContain("orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]")
    expect(source).toContain('skip: paginationSkip(query.page, query.limit)')
    expect(source).toContain('take: query.limit')
    expect(source).not.toContain('storageKey: true')
    expect(source).not.toContain('idempotencyKey: true')
  })

  it('implements the URL-backed three-section client with independent history endpoints', () => {
    const client = readFileSync(join(process.cwd(), 'app/(protected)/ajustes/reportes/reportes-client.tsx'), 'utf8')
    const tabs = readFileSync(join(process.cwd(), 'app/(protected)/ajustes/reportes/ReportTabs.tsx'), 'utf8')
    expect(client).toContain("['operations', 'versions', 'deliveries']")
    expect(client).toContain("searchParams.get('reportId')")
    expect(client).toContain('/api/reports/versions?')
    expect(client).toContain('/api/reports/delivery-attempts?')
    expect(client).toContain('crypto.randomUUID()')
    expect(tabs).toContain('role="tablist"')
    expect(tabs).toContain("event.key === 'ArrowRight'")
    expect(tabs).toContain("event.key === 'Home'")
  })
})
