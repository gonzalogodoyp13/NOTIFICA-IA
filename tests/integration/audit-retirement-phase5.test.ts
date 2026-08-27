import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { validateCatalogEvent } from '../../lib/audit/catalog'

const root = process.cwd()
const phase5a = join(root, 'prisma/migrations/20260826210000_retire_legacy_audit_data/migration.sql')
const phase5c = join(root, 'prisma/migrations/20260826230000_remove_legacy_audit_model/migration.sql')

describe('Phase 5 legacy audit retirement', () => {
  it('commits the approved zero-retention policy without a row archive', () => {
    const policy = readFileSync(join(root, 'docs/AUDITLOG_RETENTION_POLICY.md'), 'utf8')
    expect(policy).toContain('AUDITLOG-DEV-ZERO-RETENTION-V1')
    expect(policy).toContain('zero-day retention')
    expect(policy).toContain('No row-level archive')
    expect(policy).toContain('No legacy row will be copied or transformed into `ActivityEvent`')
  })

  it('strictly validates the aggregate retirement evidence', () => {
    const valid = {
      policyId: 'AUDITLOG-DEV-ZERO-RETENTION-V1',
      strategy: 'PURGE_NO_ARCHIVE',
      deletedCount: 12,
      oldestAt: '2026-01-01T00:00:00.000Z',
      newestAt: '2026-08-01T00:00:00.000Z',
    }
    expect(validateCatalogEvent('audit.legacy_retired', 'audit', valid)).toEqual(valid)
    expect(() => validateCatalogEvent('audit.legacy_retired', 'audit', { ...valid, diff: { secret: true } })).toThrow()
    expect(() => validateCatalogEvent('audit.legacy_retired', 'reports', valid)).toThrow()
  })

  it('records aggregate evidence before purge and installs the guarded state', () => {
    expect(existsSync(phase5a)).toBe(true)
    const migration = readFileSync(phase5a, 'utf8')
    const evidence = migration.indexOf('audit.legacy_retired')
    const oldTrigger = migration.indexOf('DROP TRIGGER IF EXISTS audit_logs_append_only')
    const purge = migration.indexOf('DELETE FROM "audit_logs"')
    const guard = migration.indexOf('CREATE TRIGGER audit_logs_retired')
    expect(evidence).toBeGreaterThan(-1)
    expect(evidence).toBeLessThan(oldTrigger)
    expect(oldTrigger).toBeLessThan(purge)
    expect(purge).toBeLessThan(guard)
    expect(migration).toContain('ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE "audit_logs" FROM anon, authenticated')
    expect(migration).toContain("ON CONFLICT (\"officeId\", \"deduplicationKey\") DO NOTHING")
    expect(migration).not.toMatch(/legacy\."diff"|legacy\."userId"|legacy\."tabla"|legacy\."accion"/)
  })

  it('removes the compatibility APIs and bookmark redirect in a separate contract release', () => {
    for (const route of [
      'app/api/log/route.ts',
      'app/api/logs/route.ts',
      'app/api/logs/summary/route.ts',
      'app/api/logs/export/route.ts',
      'app/api/logs/recent/route.ts',
    ]) {
      expect(existsSync(join(root, route))).toBe(false)
    }
    expect(readFileSync(join(root, 'next.config.js'), 'utf8')).not.toContain('/ajustes/logs')
  })

  it('removes the empty AuditLog model and table without cascade in the final release', () => {
    const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8')
    expect(schema).not.toMatch(/model\s+AuditLog\s*\{/)
    expect(schema).not.toMatch(/\bauditLogs\s+AuditLog\[\]/)

    const migration = readFileSync(phase5c, 'utf8')
    expect(migration).toContain('DROP TRIGGER IF EXISTS audit_logs_retired')
    expect(migration).toContain('DROP TABLE "audit_logs"')
    expect(migration).not.toMatch(/DROP TABLE[^;]*CASCADE/i)
    expect(migration).not.toContain('prevent_activity_history_mutation')
  })
})
