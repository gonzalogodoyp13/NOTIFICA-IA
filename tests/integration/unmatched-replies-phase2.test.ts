import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

import { UnmatchedReplyQuerySchema, unmatchedReplyStatuses } from '../../lib/recibos/unmatched-replies-core'

describe('Phase 2 unmatched reply consolidation', () => {
  it('validates pagination and status filters with bounded defaults', () => {
    expect(UnmatchedReplyQuerySchema.parse({})).toEqual({ page: 1, limit: 25, status: 'all' })
    expect(UnmatchedReplyQuerySchema.parse({ page: '2', limit: '100', status: 'needs_review' })).toEqual({ page: 2, limit: 100, status: 'needs_review' })
    expect(() => UnmatchedReplyQuerySchema.parse({ page: 0 })).toThrow()
    expect(() => UnmatchedReplyQuerySchema.parse({ limit: 101 })).toThrow()
    expect(() => UnmatchedReplyQuerySchema.parse({ status: 'matched' })).toThrow()
    expect(() => UnmatchedReplyQuerySchema.parse({ unexpected: 'value' })).toThrow()
    expect(unmatchedReplyStatuses('all')).toEqual(['unmatched', 'needs_review'])
    expect(unmatchedReplyStatuses('unmatched')).toEqual(['unmatched'])
  })

  it('keeps the database query office scoped, paginated and stably ordered', () => {
    const source = readFileSync(join(process.cwd(), 'lib/recibos/reply-sync.ts'), 'utf8')
    expect(source).toContain('officeId: input.officeId')
    expect(source).toContain("matchStatus: { in: unmatchedReplyStatuses(status) }")
    expect(source).toContain("orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }]")
    expect(source).toContain('skip: (page - 1) * limit')
    expect(source).toContain('prisma.recibosDispatchReply.count({ where })')
    expect(source).toContain('pagination:')
  })

  it('moves the queue into URL-synchronized accessible Recibos tabs', () => {
    const page = readFileSync(join(process.cwd(), 'app/(protected)/recibos/page.tsx'), 'utf8')
    const panel = readFileSync(join(process.cwd(), 'app/(protected)/recibos/components/UnmatchedRepliesPanel.tsx'), 'utf8')
    expect(page).toContain("type HistoryPanel = 'dispatch-history' | 'unmatched-replies'")
    expect(page).toContain('role="tablist"')
    expect(page).toContain('Respuestas por asociar')
    expect(page).toContain("params.set('panel', panel)")
    expect(page).toContain("params.delete('panel')")
    expect(page).toContain('loadUnmatchedReplies(1, unmatchedStatus)')
    expect(panel).toContain('Revisión necesaria')
    expect(panel).toContain('No hay respuestas pendientes')
    expect(panel).toContain('Cargando respuestas pendientes')
    expect(panel).toContain('Página {pagination.page}')
  })

  it('removes the Registros compatibility surface and preserves report foundations', () => {
    const root = process.cwd()
    expect(existsSync(join(root, 'app/(protected)/ajustes/logs/page.tsx'))).toBe(false)
    for (const component of ['ExportButtons', 'LogDiffModal', 'LogFilterBar', 'LogRow', 'LogsSummary', 'LogTable']) {
      expect(existsSync(join(root, `app/(protected)/ajustes/logs/components/${component}.tsx`))).toBe(false)
    }
    expect(readFileSync(join(root, 'app/(protected)/ajustes/page.tsx'), 'utf8')).not.toContain('Registros de Auditoria')

    const nextConfig = readFileSync(join(root, 'next.config.js'), 'utf8')
    expect(nextConfig).not.toContain('/ajustes/logs')

    for (const route of ['route.ts', 'summary/route.ts', 'export/route.ts', 'recent/route.ts']) {
      expect(existsSync(join(root, 'app/api/logs', route))).toBe(false)
    }
    expect(readFileSync(join(root, 'lib/reports/dailyReport.ts'), 'utf8')).toContain('prisma.activityEvent.findMany')
    expect(readFileSync(join(root, 'lib/reports/monthlyReport.ts'), 'utf8')).toContain('prisma.activityEvent.findMany')
    expect(readFileSync(join(root, 'lib/recibos/reply-sync.ts'), 'utf8')).toContain("eventType: 'receipt.reply_sync'")
  })
})
