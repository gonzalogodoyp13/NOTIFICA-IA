import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'

/** Clone the deployed signing tables/constraints/triggers into a disposable
 * schema. Independent connections can commit and race without adding synthetic
 * signatures or append-only audit history to any application office.
 */
export async function createSigningTestDatabase() {
  loadEnvConfig(process.cwd())
  const url = new URL(process.env.DIRECT_URL ?? process.env.DATABASE_URL!)
  const admin = new PrismaClient({ datasourceUrl: url.toString() })
  const schema = `signing_test_${randomUUID().replaceAll('-', '')}`
  const tables = ['offices', 'users', 'Tribunal', 'RolCausa', 'Documento', 'DocumentoVersion',
    'signing_devices', 'device_enrollments', 'signing_jobs', 'signing_items', 'signing_attempts',
    'document_signatures', 'document_deliveries', 'activity_events']
  const functions = ['derive_document_office', 'check_signing_artifact', 'protect_signing_artifact', 'prevent_activity_history_mutation']
  let created = false
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
    created = true
    const enums = await admin.$queryRaw<Array<{ name: string; labels: string[] }>>`
      SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typnamespace = 'public'::regnamespace GROUP BY t.typname`
    for (const type of enums) await admin.$executeRawUnsafe(`CREATE TYPE "${schema}"."${type.name}" AS ENUM (${type.labels.map(l => `'${l.replaceAll("'", "''")}'`).join(',')})`)
    for (const table of tables) {
      await admin.$executeRawUnsafe(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`)
    }
    // LIKE retains public enum OIDs. Convert columns, checks and partial indexes
    // to the copied enum types so Prisma uses the exact production operators.
    const enumColumns = await admin.$queryRaw<Array<{ table: string; column: string; type: string; default: string | null }>>`
      SELECT c.relname AS table, a.attname AS column, t.typname AS type, pg_get_expr(d.adbin, d.adrelid) AS default
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_type t ON t.oid = a.atttypid
      LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
      WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY(${tables}::text[]) AND t.typtype = 'e'`
    const checks = await admin.$queryRaw<Array<{ table: string; name: string; definition: string }>>`
      SELECT c.relname AS table, k.conname AS name, pg_get_constraintdef(k.oid) AS definition
      FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
      WHERE k.contype = 'c' AND c.relnamespace = 'public'::regnamespace AND c.relname = ANY(${tables}::text[])`
    const partialIndexes = await admin.$queryRaw<Array<{ table: string; name: string; definition: string }>>`
      SELECT c.relname AS table, i.relname AS name, pg_get_indexdef(i.oid) AS definition
      FROM pg_index x JOIN pg_class c ON c.oid = x.indrelid JOIN pg_class i ON i.oid = x.indexrelid
      WHERE x.indpred IS NOT NULL AND c.relnamespace = 'public'::regnamespace AND c.relname = ANY(${tables}::text[])`
    const copiedPartialIndexes = await admin.$queryRaw<Array<{ table: string; name: string }>>`
      SELECT c.relname AS table, i.relname AS name FROM pg_index x
      JOIN pg_class c ON c.oid = x.indrelid JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE x.indpred IS NOT NULL AND n.nspname = ${schema}`
    const localTypes = (sql: string) => {
      let result = sql.replaceAll('public.', '')
      for (const type of enums) result = result.replaceAll(`"${type.name}"`, `"${schema}"."${type.name}"`)
      return result
    }
    for (const table of tables.filter(t => enumColumns.some(c => c.table === t))) {
      const statements: string[] = []
      for (const c of checks.filter(c => c.table === table)) statements.push(`ALTER TABLE "${schema}"."${table}" DROP CONSTRAINT "${c.name}"`)
      for (const i of copiedPartialIndexes.filter(i => i.table === table)) statements.push(`DROP INDEX "${schema}"."${i.name}"`)
      for (const c of enumColumns.filter(c => c.table === table)) {
        statements.push(`ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${c.column}" DROP DEFAULT`)
        statements.push(`ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${c.column}" TYPE "${schema}"."${c.type}" USING "${c.column}"::text::"${schema}"."${c.type}"`)
        if (c.default) statements.push(`ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${c.column}" SET DEFAULT ${localTypes(c.default)}`)
      }
      for (const c of checks.filter(c => c.table === table)) statements.push(`ALTER TABLE "${schema}"."${table}" ADD CONSTRAINT "${c.name}" ${localTypes(c.definition)}`)
      for (const i of partialIndexes.filter(i => i.table === table)) statements.push(localTypes(i.definition).replace(/ ON ("[^"]+"|\w+)/, ` ON "${schema}".$1`))
      await admin.$executeRawUnsafe(`DO $$ BEGIN ${statements.join('; ')}; END $$`)
    }
    for (const table of ['offices', 'activity_events']) {
      await admin.$executeRawUnsafe(`CREATE SEQUENCE "${schema}"."${table}_test_id_seq"`)
      await admin.$executeRawUnsafe(`ALTER TABLE "${schema}"."${table}" ALTER COLUMN id SET DEFAULT nextval('"${schema}"."${table}_test_id_seq"')`)
    }
    const fks = await admin.$queryRaw<Array<{ table: string; name: string; definition: string }>>`
      SELECT src.relname AS table, c.conname AS name, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c JOIN pg_class src ON src.oid = c.conrelid JOIN pg_class dst ON dst.oid = c.confrelid
      WHERE c.contype = 'f' AND src.relnamespace = 'public'::regnamespace
        AND src.relname = ANY(${tables}::text[]) AND dst.relname = ANY(${tables}::text[])`
    for (const fk of fks) {
      const definition = fk.definition.replace(/REFERENCES (?:public\.)?("[^"]+"|\w+)/, `REFERENCES "${schema}".$1`)
      await admin.$executeRawUnsafe(`ALTER TABLE "${schema}"."${fk.table}" ADD CONSTRAINT "${fk.name}" ${definition}`)
    }
    const funcs = await admin.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_functiondef(oid) AS definition FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace AND proname = ANY(${functions}::text[])`
    for (const f of funcs) await admin.$executeRawUnsafe(f.definition.replaceAll('public.', `"${schema}".`))
    const triggers = await admin.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace AND c.relname = ANY(${tables}::text[])`
    for (const t of triggers) await admin.$executeRawUnsafe(t.definition.replaceAll('public.', `"${schema}".`)
      .replace(/EXECUTE FUNCTION (?!")([a-z_]+)\(/, `EXECUTE FUNCTION "${schema}".$1(`))
    url.searchParams.set('schema', schema)
    const db = new PrismaClient({ datasourceUrl: url.toString() })
    return { db, schema, async dispose() {
      await db.$disconnect()
      // Exact generated schema name; never targets public or user-created data.
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)
      await admin.$disconnect()
    } }
  } catch (error) {
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)
    await admin.$disconnect()
    throw error
  }
}
