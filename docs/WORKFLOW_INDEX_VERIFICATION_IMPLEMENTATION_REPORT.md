# Workflow Index Verification Implementation Report

Date: 2026-07-31
Scope: audit recommendations 5 and 6 (workflow-specific indexes and reproducible `EXPLAIN ANALYZE` verification)

## Outcome

The three audit indexes were already deployed by `20260730150000_optimize_receipt_workflow`. This phase did not alter that deployed migration or create duplicate indexes. It completed the missing Prisma schema representation, added a guarded and reproducible verification harness, proved the indexes against realistic temporary data, and added an authenticated endpoint p95 regression test.

The final steady-state workflow read passed the audit's end-to-end target: 20 authenticated requests produced a 414.4 ms median and 466.6 ms p95 in the final QA suite. The initial endpoint measurement exposed a material non-index bottleneck (nested Prisma relation round trips); the workflow's existing nested read now uses PostgreSQL's join relation strategy. This reduced measured p95 from approximately 1.21–1.72 seconds before the change to 386.9–466.6 ms in passing post-change samples.

## Implemented changes

### Schema and query representation

- Added Prisma declarations for:
  - `Documento(notificacionId, tipo, voidedAt, createdAt)`
  - `Documento(diligenciaId, tipo, voidedAt, createdAt)`
- Preserved the existing `Notificacion(diligenciaId, createdAt)` declaration.
- Enabled Prisma's `relationJoins` client capability and set the receipt workflow's established nested notification graph to `relationLoadStrategy: 'join'`.
- Left `prisma/migrations/20260730150000_optimize_receipt_workflow/migration.sql` unchanged.

### Reproducible verification

Added `npm run db:verify:workflow-indexes` with three guarded modes:

- `inspect`: read-only catalog validation plus live-table `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.
- `benchmark`: requires `--allow-temporary-benchmark`, refuses unsafe environments, creates only connection-local temporary tables and indexes, and drops them automatically on commit/rollback.
- `production-confirm`: requires an explicit production environment and `--confirm-production-read-only`; uses a read-only transaction plus statement and lock timeouts and performs no DDL or seeding.

The harness verifies index names, validity/readiness, B-tree type, exact column order, plan nodes, expected index usage, sequential scans, row-estimate quality, buffer/temp activity, relative improvement, and unchanged persistent application counts.

Unit/integration coverage verifies schema-to-migration alignment, nested bitmap plan parsing, and environment safety guards. A Playwright test now performs five warmups and 20 authenticated workflow reads, reports median/p95/min/max, and fails when steady-state p95 is 500 ms or higher.

## Database verification results

Configured database at verification time: PostgreSQL 17.6, 33 committed migrations, schema current.

All three deployed indexes were valid, ready, B-tree indexes with the required ordered columns:

| Index | Live plan result |
| --- | --- |
| `notificaciones_diligenciaId_createdAt_idx` | Expected index used; 0.038 ms execution |
| `Documento_notificacionId_tipo_voidedAt_createdAt_idx` | Expected bitmap index used; 0.102 ms execution |
| `Documento_diligenciaId_tipo_voidedAt_createdAt_idx` | Expected index used; 0.754 ms execution |
| Receipt `OR` path using both document predicates | `BitmapOr` used both document indexes; 0.103 ms execution |

The live business tables were too small to serve as realistic performance evidence (63 notifications and 139 documents), so they were used only for read-only plan/catalog confirmation.

### Realistic temporary benchmark

The benchmark used exactly 55,000 notifications and 132,000 documents, matching the approved three-year volume range. Data existed only in temporary tables; persistent counts were 63 notifications, 139 documents, and 124 active documents before and after the run.

| Workflow query | Without audit index | With audit index | Relative improvement |
| --- | ---: | ---: | ---: |
| Notifications by diligence | 4.999 ms | 0.066 ms | 75.742x |
| Documents by notification | 27.744 ms | 0.083 ms | 334.265x |
| Documents by diligence | 27.603 ms | 2.241 ms | 12.317x |
| Receipt combined `OR` path | 24.844 ms | 0.207 ms | 120.019x |

Every indexed benchmark plan used the intended index shape, avoided sequential scans and temporary-disk sorts, and kept row estimates within the harness's 10x tolerance.

Temporary benchmark index sizes were approximately 1.7 MB for notifications and 6.6 MB for each document index. No permanent business rows or benchmark indexes were created.

## Endpoint finding and remediation

The first authenticated endpoint benchmark failed the under-500-ms target even though the indexed SQL plans were sub-millisecond. The dominant cost was a nested Prisma relation-loading waterfall across the QA network region, not a missing index. This met the approved exception for a material workflow problem.

Using Prisma's PostgreSQL join relation load for the existing workflow graph retained the response contract while reducing database round trips. Results:

- Before: 1,210.5 ms p95 in development and 1,724.7 ms p95 in the initial production-build sample.
- First post-change production sample: 556.0 ms p95, showing a remaining cold/connection spike.
- Warm post-change production sample: 386.9 ms p95.
- Final clean full-QA sample: 466.6 ms p95 across 20 authenticated requests (pass).

Plan shape and relative database improvement remain the primary evidence, as requested; endpoint timing is recorded as the environment-sensitive end-to-end threshold.

## Test evidence

- Prisma migration status/deploy/generate startup sequence: passed; no pending migrations.
- `prisma validate`: passed.
- `npm run check:utf8`: passed.
- `npm run lint`: passed with no lint errors or warnings.
- `npx tsc --noEmit`: passed.
- `npm run check:auth-audit`: passed across 276 files.
- `npm run test:integration`: 18 files, 74 tests passed.
- `npm run build`: passed.
- Final `npm run test:qa`: passed in a clean run:
  - 74/74 integration tests.
  - 6/6 authenticated Playwright tests.
  - Workflow p95 466.6 ms.
  - QA reset completed.

One earlier full-QA attempt was invalidated by exhaustion of the shared remote connection pool from prior local server processes; affected tests failed before their assertions. After those local processes were removed and database responsiveness was confirmed, the clean rerun above passed.

## Manual browser verification

The authenticated `QA-P9-CUSTOM` role was checked in Chrome against both the development server and the optimized production build. The Diligencias view loaded the expected notification, Step 2 opened from “Continuar con recibo,” all stamp options loaded, selecting `QA-P9 Custom Estampo` auto-filled CLP 25,000, and receipt actions became enabled. No application error was observed. The only console entry was a pre-existing browser-extension hydration warning caused by Grammarly-injected attributes; the optimized production navigation added no new application warning.

The automated browser suite separately exercised generation, idempotency, regeneration, correction, single workflow-request behavior, safety cases, and disabled-user enforcement using disposable fixtures, followed by reset.

## Production confirmation status

Production `EXPLAIN ANALYZE` was not run from this workspace because no explicit production target and low-traffic execution window were configured. The committed `production-confirm` mode is ready for that controlled operation and enforces the approved restrictions: read-only `SELECT` plans, explicit confirmation, and statement/lock timeouts; it cannot seed, create/drop indexes, or run no-index variants.

## Out-of-scope findings

- Small live child/version relations may still appear as sequential scans because their cardinality makes that plan cheaper; no additional index met the evidence threshold.
- Connection cold starts and QA-region variability can push a first sample above 500 ms. The committed endpoint check therefore measures steady state after five warmups and retains raw sample statistics.
- Dependency metadata warnings for `baseline-browser-mapping`/`caniuse-lite` and the existing Node `DEP0190` QA-runner warning remain maintenance items unrelated to workflow index behavior.

## Operational commands

```powershell
npm run db:verify:workflow-indexes -- --mode=inspect

$env:NEXT_PUBLIC_ENVIRONMENT='qa'
npm run db:verify:workflow-indexes -- --mode=benchmark --allow-temporary-benchmark --notifications=55000 --documents=132000

# Only during an approved low-traffic production window:
$env:NEXT_PUBLIC_ENVIRONMENT='production'
npm run db:verify:workflow-indexes -- --mode=production-confirm --confirm-production-read-only
```
