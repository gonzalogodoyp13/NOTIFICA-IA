import { loadEnvConfig } from '@next/env'
import { Prisma, PrismaClient } from '@prisma/client'

import {
  EXPECTED_WORKFLOW_INDEXES,
  ExplainDocument,
  ExplainSummary,
  assertProductionConfirmationAllowed,
  assertTemporaryBenchmarkAllowed,
  explainUsesIndexes,
  summarizeExplain,
} from '../lib/performance/workflow-indexes'

loadEnvConfig(process.cwd())

type Mode = 'inspect' | 'benchmark' | 'production-confirm'
type SqlClient = PrismaClient | Prisma.TransactionClient
type ExplainRow = { 'QUERY PLAN': Prisma.JsonValue | string }

type PlanResult = {
  scenario: string
  expectedIndexes: string[]
  summary: ExplainSummary
  usesExpectedIndexes: boolean
}

type CatalogRow = {
  index_name: string
  access_method: string
  is_valid: boolean
  is_ready: boolean
  definition: string
  size_bytes: bigint
  scans: bigint
  tuples_read: bigint
  tuples_fetched: bigint
}

type CountRow = {
  notifications: bigint
  documents: bigint
  active_documents: bigint
}

type DatabaseInfoRow = {
  database_name: string
  server_version: string
}

const INDEX_NAMES = Object.values(EXPECTED_WORKFLOW_INDEXES)
const prisma = new PrismaClient()

function integerArg(name: string, fallback: number) {
  const prefix = `--${name}=`
  const raw = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length)
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`)
  }
  return value
}

function parseMode(): Mode {
  const value = process.argv.find(argument => argument.startsWith('--mode='))?.slice('--mode='.length)
  if (!value) return 'inspect'
  if (value === 'inspect' || value === 'benchmark' || value === 'production-confirm') return value
  throw new Error('mode must be inspect, benchmark, or production-confirm.')
}

function explainDocument(value: Prisma.JsonValue | string): ExplainDocument {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  const document = Array.isArray(parsed) ? parsed[0] : parsed
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('PostgreSQL returned an unexpected EXPLAIN JSON payload.')
  }
  return document as ExplainDocument
}

async function explain(
  db: SqlClient,
  scenario: string,
  expectedIndexes: string[],
  sql: string,
  ...parameters: unknown[]
): Promise<PlanResult> {
  const rows = await db.$queryRawUnsafe<ExplainRow[]>(sql, ...parameters)
  const row = rows[0]
  if (!row) throw new Error(`No EXPLAIN output returned for ${scenario}.`)
  const summary = summarizeExplain(explainDocument(row['QUERY PLAN']))
  return {
    scenario,
    expectedIndexes,
    summary,
    usesExpectedIndexes: explainUsesIndexes(summary, expectedIndexes),
  }
}

async function databaseInfo(db: SqlClient) {
  const rows = await db.$queryRawUnsafe<DatabaseInfoRow[]>(`
    SELECT current_database() AS database_name,
           current_setting('server_version') AS server_version
  `)
  return rows[0]
}

async function applicationCounts(db: SqlClient) {
  const rows = await db.$queryRawUnsafe<CountRow[]>(`
    SELECT
      (SELECT COUNT(*) FROM notificaciones) AS notifications,
      (SELECT COUNT(*) FROM "Documento") AS documents,
      (SELECT COUNT(*) FROM "Documento" WHERE "voidedAt" IS NULL) AS active_documents
  `)
  return rows[0]
}

async function catalogState(db: SqlClient) {
  return db.$queryRawUnsafe<CatalogRow[]>(`
    SELECT
      index_class.relname AS index_name,
      access_method.amname AS access_method,
      index_state.indisvalid AS is_valid,
      index_state.indisready AS is_ready,
      pg_get_indexdef(index_class.oid) AS definition,
      pg_relation_size(index_class.oid) AS size_bytes,
      COALESCE(stats.idx_scan, 0) AS scans,
      COALESCE(stats.idx_tup_read, 0) AS tuples_read,
      COALESCE(stats.idx_tup_fetch, 0) AS tuples_fetched
    FROM pg_class index_class
    JOIN pg_namespace namespace ON namespace.oid = index_class.relnamespace
    JOIN pg_index index_state ON index_state.indexrelid = index_class.oid
    JOIN pg_am access_method ON access_method.oid = index_class.relam
    LEFT JOIN pg_stat_user_indexes stats ON stats.indexrelid = index_class.oid
    WHERE namespace.nspname = 'public'
      AND index_class.relname IN (
        'notificaciones_diligenciaId_createdAt_idx',
        'Documento_notificacionId_tipo_voidedAt_createdAt_idx',
        'Documento_diligenciaId_tipo_voidedAt_createdAt_idx'
      )
    ORDER BY index_class.relname
  `)
}

function validateCatalog(rows: CatalogRow[]) {
  const rowsByName = new Map(rows.map(row => [row.index_name, row]))
  const expectedFragments = new Map<string, string>([
    [
      EXPECTED_WORKFLOW_INDEXES.notifications,
      '("diligenciaId", "createdAt")',
    ],
    [
      EXPECTED_WORKFLOW_INDEXES.documentsByNotification,
      '("notificacionId", tipo, "voidedAt", "createdAt")',
    ],
    [
      EXPECTED_WORKFLOW_INDEXES.documentsByDiligence,
      '("diligenciaId", tipo, "voidedAt", "createdAt")',
    ],
  ])

  return INDEX_NAMES.map(indexName => {
    const row = rowsByName.get(indexName)
    const expectedFragment = expectedFragments.get(indexName) ?? ''
    return {
      indexName,
      present: !!row,
      valid: row?.is_valid === true,
      ready: row?.is_ready === true,
      btree: row?.access_method === 'btree',
      correctColumns: row?.definition.includes(expectedFragment) === true,
      passed:
        !!row &&
        row.is_valid &&
        row.is_ready &&
        row.access_method === 'btree' &&
        row.definition.includes(expectedFragment),
    }
  })
}

async function runLivePlans(db: SqlClient) {
  const diligenceRows = await db.$queryRawUnsafe<Array<{ diligence_id: string }>>(`
    SELECT "diligenciaId" AS diligence_id
    FROM notificaciones
    GROUP BY "diligenciaId"
    ORDER BY COUNT(*) DESC, "diligenciaId" ASC
    LIMIT 1
  `)
  const notificationRows = await db.$queryRawUnsafe<Array<{ notification_id: string }>>(`
    SELECT "notificacionId" AS notification_id
    FROM "Documento"
    WHERE "notificacionId" IS NOT NULL
    GROUP BY "notificacionId"
    ORDER BY COUNT(*) DESC, "notificacionId" ASC
    LIMIT 1
  `)
  const documentDiligenceRows = await db.$queryRawUnsafe<Array<{ diligence_id: string }>>(`
    SELECT "diligenciaId" AS diligence_id
    FROM "Documento"
    WHERE "diligenciaId" IS NOT NULL
    GROUP BY "diligenciaId"
    ORDER BY COUNT(*) DESC, "diligenciaId" ASC
    LIMIT 1
  `)

  const diligenceId = diligenceRows[0]?.diligence_id
  const notificationId = notificationRows[0]?.notification_id
  const documentDiligenceId = documentDiligenceRows[0]?.diligence_id
  if (!diligenceId || !notificationId || !documentDiligenceId) return []

  return Promise.all([
    explain(
      db,
      'live.notifications-by-diligence',
      [EXPECTED_WORKFLOW_INDEXES.notifications],
      `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)
       SELECT id, "createdAt"
       FROM notificaciones
       WHERE "diligenciaId" = $1
       ORDER BY "createdAt" ASC`,
      diligenceId,
    ),
    explain(
      db,
      'live.documents-by-notification',
      [EXPECTED_WORKFLOW_INDEXES.documentsByNotification],
      `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)
       SELECT document.id, document."createdAt"
       FROM "Documento" document
       WHERE document."notificacionId" = $1
         AND document.tipo IN ('Recibo', 'Estampo')
         AND document."voidedAt" IS NULL
         AND (
           document."pdfId" IS NOT NULL
           OR EXISTS (
             SELECT 1
             FROM "DocumentoVersion" version
             WHERE version.id = document."currentVersionId"
               AND version."deletedAt" IS NULL
           )
         )
       ORDER BY document."createdAt" DESC`,
      notificationId,
    ),
    explain(
      db,
      'live.documents-by-diligence',
      [EXPECTED_WORKFLOW_INDEXES.documentsByDiligence],
      `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)
       SELECT document.id, document."createdAt"
       FROM "Documento" document
       WHERE document."diligenciaId" = $1
         AND document.tipo IN ('Recibo', 'Estampo')
         AND document."voidedAt" IS NULL
         AND (
           document."pdfId" IS NOT NULL
           OR EXISTS (
             SELECT 1
             FROM "DocumentoVersion" version
             WHERE version.id = document."currentVersionId"
               AND version."deletedAt" IS NULL
           )
         )
       ORDER BY document."createdAt" DESC`,
      documentDiligenceId,
    ),
    explain(
      db,
      'live.receipt-search-or-branches',
      [
        EXPECTED_WORKFLOW_INDEXES.documentsByNotification,
        EXPECTED_WORKFLOW_INDEXES.documentsByDiligence,
      ],
      `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)
       SELECT document.id, document."createdAt"
       FROM "Documento" document
       WHERE (
         document."notificacionId" = $1
         OR document."diligenciaId" = $2
       )
         AND document.tipo = 'Estampo'
         AND document."voidedAt" IS NULL
         AND (
           document."pdfId" IS NOT NULL
           OR EXISTS (
             SELECT 1
             FROM "DocumentoVersion" version
             WHERE version.id = document."currentVersionId"
               AND version."deletedAt" IS NULL
           )
         )
       ORDER BY document."createdAt" DESC`,
      notificationId,
      documentDiligenceId,
    ),
  ])
}

async function createBenchmarkTables(
  tx: Prisma.TransactionClient,
  notificationCount: number,
  documentCount: number,
) {
  await tx.$executeRawUnsafe(`
    CREATE TEMP TABLE workflow_index_bench_notifications (
      id BIGINT PRIMARY KEY,
      diligence_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    ) ON COMMIT DROP
  `)
  await tx.$executeRawUnsafe(`
    CREATE TEMP TABLE workflow_index_bench_versions (
      id BIGINT PRIMARY KEY,
      deleted_at TIMESTAMPTZ
    ) ON COMMIT DROP
  `)
  await tx.$executeRawUnsafe(`
    CREATE TEMP TABLE workflow_index_bench_documents (
      id BIGINT PRIMARY KEY,
      notification_id BIGINT,
      diligence_id INTEGER,
      tipo TEXT NOT NULL,
      voided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL,
      pdf_id TEXT,
      current_version_id BIGINT
    ) ON COMMIT DROP
  `)

  await tx.$executeRawUnsafe(`
    INSERT INTO workflow_index_bench_notifications (id, diligence_id, created_at)
    SELECT
      generated_id,
      CASE
        WHEN generated_id <= 100 THEN 1
        ELSE 2 + ((generated_id - 101) / 5)::INTEGER
      END,
      TIMESTAMPTZ '2026-07-31 12:00:00+00'
        - ((generated_id % 1095)::TEXT || ' days')::INTERVAL
        - ((generated_id % 86400)::TEXT || ' seconds')::INTERVAL
    FROM generate_series(1, ${notificationCount}) generated_id
  `)

  await tx.$executeRawUnsafe(`
    INSERT INTO workflow_index_bench_versions (id, deleted_at)
    SELECT
      generated_id,
      CASE
        WHEN generated_id % 25 = 0
          THEN TIMESTAMPTZ '2026-07-31 12:00:00+00'
        ELSE NULL
      END
    FROM generate_series(1, ${documentCount}) generated_id
  `)

  await tx.$executeRawUnsafe(`
    INSERT INTO workflow_index_bench_documents (
      id,
      notification_id,
      diligence_id,
      tipo,
      voided_at,
      created_at,
      pdf_id,
      current_version_id
    )
    SELECT
      generated_id,
      notification_id,
      CASE
        WHEN notification_id <= 100 THEN 1
        ELSE 2 + ((notification_id - 101) / 5)::INTEGER
      END,
      CASE WHEN generated_id % 100 < 63 THEN 'Recibo' ELSE 'Estampo' END,
      CASE
        WHEN generated_id % 10 = 0
          THEN TIMESTAMPTZ '2026-07-31 12:00:00+00'
        ELSE NULL
      END,
      TIMESTAMPTZ '2026-07-31 12:00:00+00'
        - ((generated_id % 1095)::TEXT || ' days')::INTERVAL
        - ((generated_id % 86400)::TEXT || ' seconds')::INTERVAL,
      CASE WHEN generated_id % 4 = 0 THEN NULL ELSE 'pdf-' || generated_id::TEXT END,
      generated_id
    FROM (
      SELECT
        generated_id,
        1 + ((generated_id - 1) % ${notificationCount}) AS notification_id
      FROM generate_series(1, ${documentCount}) generated_id
    ) generated
  `)

  await tx.$executeRawUnsafe('ANALYZE workflow_index_bench_notifications')
  await tx.$executeRawUnsafe('ANALYZE workflow_index_bench_versions')
  await tx.$executeRawUnsafe('ANALYZE workflow_index_bench_documents')
}

async function benchmarkPlans(tx: Prisma.TransactionClient, prefix: string) {
  return Promise.all([
    explain(
      tx,
      `${prefix}.notifications-by-diligence`,
      prefix === 'indexed' ? [EXPECTED_WORKFLOW_INDEXES.notifications] : [],
      `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)
       SELECT id, created_at
       FROM workflow_index_bench_notifications
       WHERE diligence_id = 1
       ORDER BY created_at ASC`,
    ),
    explain(
      tx,
      `${prefix}.documents-by-notification`,
      prefix === 'indexed' ? [EXPECTED_WORKFLOW_INDEXES.documentsByNotification] : [],
      `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)
       SELECT document.id, document.created_at
       FROM workflow_index_bench_documents document
       WHERE document.notification_id = 501
         AND document.tipo IN ('Recibo', 'Estampo')
         AND document.voided_at IS NULL
         AND (
           document.pdf_id IS NOT NULL
           OR EXISTS (
             SELECT 1
             FROM workflow_index_bench_versions version
             WHERE version.id = document.current_version_id
               AND version.deleted_at IS NULL
           )
         )
       ORDER BY document.created_at DESC`,
    ),
    explain(
      tx,
      `${prefix}.documents-by-diligence`,
      prefix === 'indexed' ? [EXPECTED_WORKFLOW_INDEXES.documentsByDiligence] : [],
      `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)
       SELECT document.id, document.created_at
       FROM workflow_index_bench_documents document
       WHERE document.diligence_id = 1
         AND document.tipo IN ('Recibo', 'Estampo')
         AND document.voided_at IS NULL
         AND (
           document.pdf_id IS NOT NULL
           OR EXISTS (
             SELECT 1
             FROM workflow_index_bench_versions version
             WHERE version.id = document.current_version_id
               AND version.deleted_at IS NULL
           )
         )
       ORDER BY document.created_at DESC`,
    ),
    explain(
      tx,
      `${prefix}.receipt-search-or-branches`,
      prefix === 'indexed'
        ? [
            EXPECTED_WORKFLOW_INDEXES.documentsByNotification,
            EXPECTED_WORKFLOW_INDEXES.documentsByDiligence,
          ]
        : [],
      `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)
       SELECT document.id, document.created_at
       FROM workflow_index_bench_documents document
       WHERE (
         document.notification_id IN (501, 502, 503, 504, 505, 506, 507, 508, 509, 510)
         OR document.diligence_id IN (1, 2, 3, 4)
       )
         AND document.tipo = 'Estampo'
         AND document.voided_at IS NULL
         AND (
           document.pdf_id IS NOT NULL
           OR EXISTS (
             SELECT 1
             FROM workflow_index_bench_versions version
             WHERE version.id = document.current_version_id
               AND version.deleted_at IS NULL
           )
         )
       ORDER BY document.created_at DESC`,
    ),
  ])
}

async function runBenchmark(notificationCount: number, documentCount: number) {
  const countsBefore = await applicationCounts(prisma)
  const benchmark = await prisma.$transaction(
    async tx => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '120s'")
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2s'")
      await createBenchmarkTables(tx, notificationCount, documentCount)

      const unindexed = await benchmarkPlans(tx, 'unindexed')

      await tx.$executeRawUnsafe(`
        CREATE INDEX "${EXPECTED_WORKFLOW_INDEXES.notifications}"
        ON workflow_index_bench_notifications (diligence_id, created_at)
      `)
      await tx.$executeRawUnsafe(`
        CREATE INDEX "${EXPECTED_WORKFLOW_INDEXES.documentsByNotification}"
        ON workflow_index_bench_documents (notification_id, tipo, voided_at, created_at)
      `)
      await tx.$executeRawUnsafe(`
        CREATE INDEX "${EXPECTED_WORKFLOW_INDEXES.documentsByDiligence}"
        ON workflow_index_bench_documents (diligence_id, tipo, voided_at, created_at)
      `)
      await tx.$executeRawUnsafe('ANALYZE workflow_index_bench_notifications')
      await tx.$executeRawUnsafe('ANALYZE workflow_index_bench_documents')

      const indexed = await benchmarkPlans(tx, 'indexed')
      const indexSizes = await tx.$queryRawUnsafe<Array<{ index_name: string; size_bytes: bigint }>>(`
        SELECT relation.relname AS index_name, pg_relation_size(relation.oid) AS size_bytes
        FROM pg_class relation
        WHERE relation.relnamespace = pg_my_temp_schema()
          AND relation.relname IN (
            'notificaciones_diligenciaId_createdAt_idx',
            'Documento_notificacionId_tipo_voidedAt_createdAt_idx',
            'Documento_diligenciaId_tipo_voidedAt_createdAt_idx'
          )
        ORDER BY relation.relname
      `)

      const unindexedByScenario = new Map(
        unindexed.map(plan => [plan.scenario.replace(/^unindexed\./, ''), plan]),
      )
      const acceptance = indexed.map(plan => {
        const scenarioKey = plan.scenario.replace(/^indexed\./, '')
        const baseline = unindexedByScenario.get(scenarioKey)
        const indexedTime = plan.summary.executionTimeMs
        const baselineTime = baseline?.summary.executionTimeMs ?? null
        const relativeSpeedup =
          indexedTime !== null && indexedTime > 0 && baselineTime !== null
            ? baselineTime / indexedTime
            : null
        const estimatedRows = plan.summary.planRows
        const actualRows = plan.summary.actualRows
        const estimateRatio =
          estimatedRows !== null && estimatedRows > 0 && actualRows !== null
            ? actualRows / estimatedRows
            : null
        const estimateWithinOrderOfMagnitude =
          estimateRatio === null || (estimateRatio >= 0.1 && estimateRatio <= 10)
        const executionImproved = relativeSpeedup !== null && relativeSpeedup > 1
        const noDiskSort =
          plan.summary.tempReadBlocks === 0 && plan.summary.tempWrittenBlocks === 0
        return {
          scenario: plan.scenario,
          usesExpectedIndexes: plan.usesExpectedIndexes,
          noSequentialScan: !plan.summary.hasSequentialScan,
          noDiskSort,
          estimateWithinOrderOfMagnitude,
          executionImproved,
          relativeSpeedup,
          passed:
            plan.usesExpectedIndexes &&
            !plan.summary.hasSequentialScan &&
            noDiskSort &&
            estimateWithinOrderOfMagnitude &&
            executionImproved,
        }
      })

      return { unindexed, indexed, indexSizes, acceptance }
    },
    { maxWait: 10_000, timeout: 300_000 },
  )
  const countsAfter = await applicationCounts(prisma)
  const applicationCountsUnchanged =
    countsBefore.notifications === countsAfter.notifications &&
    countsBefore.documents === countsAfter.documents &&
    countsBefore.active_documents === countsAfter.active_documents

  return {
    dataset: { notifications: notificationCount, documents: documentCount },
    ...benchmark,
    countsBefore,
    countsAfter,
    applicationCountsUnchanged,
    passed: benchmark.acceptance.every(item => item.passed) && applicationCountsUnchanged,
  }
}

async function runReadOnlyLivePlans(production: boolean) {
  return prisma.$transaction(
    async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${production ? '5s' : '15s'}'`)
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'")
      return runLivePlans(tx)
    },
    { maxWait: 10_000, timeout: production ? 15_000 : 60_000 },
  )
}

async function main() {
  const mode = parseMode()
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT?.trim().toLowerCase()
  const notificationCount = integerArg('notifications', 55_000)
  const documentCount = integerArg('documents', 132_000)

  if (mode === 'benchmark') {
    assertTemporaryBenchmarkAllowed({
      environment,
      allowTemporaryBenchmark: process.argv.includes('--allow-temporary-benchmark'),
    })
    if (notificationCount !== 55_000 || documentCount < 110_000 || documentCount > 165_000) {
      throw new Error('The approved realistic benchmark requires 55,000 notifications and 110,000-165,000 documents.')
    }
  }
  if (mode === 'production-confirm') {
    assertProductionConfirmationAllowed({
      environment,
      confirmed: process.argv.includes('--confirm-production-read-only'),
    })
  }

  const info = await databaseInfo(prisma)
  const catalog = await catalogState(prisma)
  const catalogAcceptance = validateCatalog(catalog)
  const livePlans = await runReadOnlyLivePlans(mode === 'production-confirm')
  const benchmark = mode === 'benchmark' ? await runBenchmark(notificationCount, documentCount) : null
  const catalogPassed = catalogAcceptance.every(item => item.passed)

  const result = {
    generatedAt: new Date().toISOString(),
    mode,
    environment: environment ?? 'unset',
    database: info,
    catalog,
    catalogAcceptance,
    liveData: await applicationCounts(prisma),
    livePlans,
    livePlanNote:
      'The configured database is small; sequential scans in live plans are informational and not benchmark failures.',
    benchmark,
    passed: catalogPassed && (benchmark?.passed ?? true),
  }

  console.log(
    JSON.stringify(result, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
  )
  if (!result.passed) process.exitCode = 1
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
