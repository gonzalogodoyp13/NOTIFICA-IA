import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

function source(file: string) {
  return fs.readFileSync(path.resolve(file), 'utf8')
}

describe('cache revision and authoritative workflow architecture', () => {
  it('ships a non-null default office revision migration and schema field', () => {
    expect(source('prisma/schema.prisma')).toMatch(/cacheRevision\s+Int\s+@default\(1\)/)
    expect(source('prisma/migrations/20260803120000_add_office_cache_revision/migration.sql'))
      .toMatch(/"cacheRevision" INTEGER NOT NULL DEFAULT 1/)
  })

  it.each([
    'app/api/estampos/route.ts',
    'app/api/estampos/[id]/route.ts',
    'app/api/estampos-custom/route.ts',
    'app/api/estampos-custom/reset/route.ts',
    'app/api/aranceles/route.ts',
    'app/api/aranceles/[id]/route.ts',
    'app/api/ajustes/pdf/route.ts',
  ])('%s increments the shared revision and invalidates the local office cache', file => {
    const text = source(file)
    expect(text).toContain('bumpOfficeCacheRevision')
    expect(text).toContain('invalidateOfficeCaches')
  })

  it('uses the common authoritative stamp envelope and no follow-up draft PATCH', () => {
    const customRoute = source('app/api/diligencias/[id]/estampo/route.ts')
    const wizardRoute = source('app/api/diligencias/[id]/estampos/generate/route.ts')
    const client = source('app/(protected)/roles/[id]/diligencias/EjecutarWizard.tsx')
    expect(customRoute).toContain('documento: {')
    expect(customRoute).toContain('notificacion: serializedNotificacion')
    expect(wizardRoute).toContain('notificacion: serializedNotificacion')
    expect(client).toContain('applyStampGenerationToCache')
    expect(client).not.toMatch(/\.then\(\(\) => \{[\s\S]*updateMeta\.mutate\(\{ meta: metaUpdates \}/)
    expect(client).not.toContain('1500')
  })
})
