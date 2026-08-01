import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

import { validateCatalogEvent } from '../../lib/audit/catalog'

describe('canonical authentication and audit foundation', () => {
  it('accepts the approved receipt metadata and rejects extra personal data', () => {
    const metadata = {
      reservationId: 'reservation-1',
      receiptId: 'receipt-1',
      documentId: 'document-1',
      documentVersionId: 'version-1',
      numeroRecibo: 'R-2026-000001',
      version: 1,
      amount: 12500,
      paymentMethod: 'Transferencia',
      operationalReference: 'OP-1',
      notificationId: 'notification-1',
    }
    expect(validateCatalogEvent('receipt.generated', 'recibos', metadata)).toEqual(metadata)
    expect(() => validateCatalogEvent('receipt.generated', 'recibos', {
      ...metadata,
      personalName: 'Dato prohibido',
    })).toThrow()
  })

  it('rejects a known event assigned to the wrong module', () => {
    expect(() => validateCatalogEvent('audit.export', 'documents', {
      format: 'csv',
      source: 'activity',
      count: 1,
    })).toThrow(/must use module audit/)
  })

  it('keeps AuditLog read-only from application code and removes the old client', () => {
    const root = process.cwd()
    const files = [
      'lib/audit/operationalActivity.ts',
      'lib/recibos/bulk.ts',
      'app/api/logs/route.ts',
    ].map(file => readFileSync(join(root, file), 'utf8'))
    expect(files.join('\n')).not.toMatch(/auditLog\.(create|update|delete|upsert|createMany|updateMany|deleteMany)/)
    expect(existsSync(join(root, 'lib/prismaNoMiddleware.ts'))).toBe(false)
    expect(existsSync(join(root, 'lib/prisma/auditMiddleware.ts'))).toBe(false)
    expect(readFileSync(join(root, 'app/api/logs/route.ts'), 'utf8')).not.toContain('export async function POST')
  })

  it('commits append-only triggers and the QA mutation barrier', () => {
    const root = process.cwd()
    const migration = readFileSync(join(root, 'prisma/migrations/20260727160000_add_canonical_activity_audit/migration.sql'), 'utf8')
    const qaSeed = readFileSync(join(root, 'scripts/qa-seed.ts'), 'utf8')
    expect(migration).toContain('activity_events_append_only')
    expect(migration).toContain('audit_logs_append_only')
    expect(migration).toContain('BEFORE UPDATE OR DELETE')
    expect(qaSeed).toContain('QA_ALLOW_MUTATIONS')
    expect(qaSeed).toContain('NEXT_PUBLIC_ENVIRONMENT')
  })

  it('uses safe concurrent claiming, deduplication, and ten-attempt dead-lettering', () => {
    const source = readFileSync(join(process.cwd(), 'lib/audit/outbox.ts'), 'utf8')
    expect(source).toContain('FOR UPDATE SKIP LOCKED')
    expect(source).toContain('skipDuplicates: true')
    expect(source).toContain('row.attempts >= 10')
    expect(source).toContain('Math.min(50, limit)')
    const migration = readFileSync(join(process.cwd(), 'prisma/migrations/20260727160000_add_canonical_activity_audit/migration.sql'), 'utf8')
    expect(migration).toContain('activity_events_officeId_deduplicationKey_key')
    expect(migration).toContain('activity_outbox_officeId_deduplicationKey_key')
  })
})
