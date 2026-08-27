# Auditoría and Audit Reports — Phases 1–3 Implementation Record

**Record date:** 2026-08-25  
**Covered work:** Phase 1, Phase 2, and Phase 3  
**Purpose:** Preserve the technical and testing baseline before Phases 3–5 change the Reportes experience and eventually retire the legacy `AuditLog` subsystem.  
**Current release state:** Implemented in the repository and exercised against an isolated Supabase QA branch. Production deployment, real-provider mail validation, and the final credentialed in-app browser walkthrough remain pending.

> This document records what exists now. It is not a claim that every production rollout or manual acceptance step has already been completed. The exact remaining work is listed in [Open work and known limitations](#open-work-and-known-limitations).

## 1. Executive summary

The original Auditoría area exposed two separate pages:

- **Registros de Auditoría**, which mixed operational audit browsing with a small unmatched-email-reply queue.
- **Reportes de Auditoría**, which generated and delivered audit workbooks but did not have sufficiently safe file versioning, delivery history, integrity verification, or authorization boundaries.

Phases 1–3 changed that foundation as follows:

| Area | Before | Current result |
| --- | --- | --- |
| Event classification | Daily and monthly report logic used inconsistent or incorrect matching | One canonical classifier categorizes create, update, delete, and other activity across report and compatibility-summary paths |
| Report files | A period could point to a mutable Storage object | Every generation reserves an immutable version and changes the current pointer only after upload and checksum verification |
| Regeneration safety | A failed regeneration could endanger the current file | The last valid version remains current when candidate upload, verification, or activation fails |
| Delivery history | A mutable per-period batch was reused/reset | Every send or retry is a distinct immutable attempt pinned to an exact report version |
| Report authorization | Report operations were not consistently centralized as active-admin-only | Report page, APIs, files, restore, generation, sending, and cleanup enforce active office-administrator access and office scoping |
| Downloads | Files were returned without a complete integrity-and-audit gate | Size and SHA-256 are checked before response; successful downloads fail closed if their audit event cannot be committed |
| Unmatched replies | Located inside the retiring Registros page | Located in **Recibos → Gestión de envíos → Respuestas por asociar** with filtering, pagination, counts, URL state, and independent error handling |
| Registros UI | Separate page/card/components | Removed; the old URL temporarily redirects to the new Recibos queue |
| Reportes UI | One monolithic table with inline monthly detail | Three URL-backed operational-ledger sections provide paginated report, version, and delivery history with responsive and accessible interactions |
| Audit infrastructure | At risk of being removed together with the Registros UI | Preserved because Reportes and other workflows still depend on canonical activity and legacy compatibility APIs |

The resulting baseline is intentionally additive. Legacy report snapshot columns, legacy delivery tables, the `AuditLog` model, and `/api/logs` compatibility endpoints have not been destructively removed.

## 2. Current architecture at a glance

```text
Application actions
        │
        ├── canonical ActivityEvent / audit outbox / event catalog
        │                  │
        │                  ├── daily workbook
        │                  ├── monthly workbook
        │                  └── legacy log summary compatibility
        │
        ├── report generation
        │       ├── GeneratedReport (logical period + compatibility snapshot)
        │       └── GeneratedReportVersion (immutable Storage object)
        │
        ├── report delivery
        │       ├── ReportDeliveryAttempt (one intentional send/retry)
        │       └── ReportDeliveryAttemptRecipient (recipient snapshot + outcome)
        │
        └── report download / restore / delivery audit events

Receipt mailbox synchronization
        │
        ├── matched reply → delivery-recipient detail
        └── unmatched / needs_review → Recibos “Respuestas por asociar” queue
```

The application remains the only supported path for report access. The `reports` Storage bucket is private, and files are not exposed through public Storage URLs.

## 3. Phase 1 — Report correctness, safety, permissions, and traceability

### 3.1 Canonical event classification

#### What was added

A shared classifier was added in `lib/audit/classification.ts`:

```ts
classifyActivityAction(eventType, description) → CREATE | UPDATE | DELETE | OTHER
```

It evaluates the terminal event verb rather than matching arbitrary text inside the whole event name. This supports canonical event names such as `document.created` and avoids the previous erroneous `.create`, `.update`, and `.delete` regular-expression behavior.

The implemented verb groups are:

- **CREATE:** `create`, `created`, `generate`, `generated`.
- **UPDATE:** `update`, `updated`, `regenerated`, `corrected`, `status_changed`, `completed`, `scheduled`, `payment`, `boleta`, `undo`, `reset`, `toggled`, `resolution`, `reply_classify`.
- **DELETE:** `delete`, `deleted`, `voided`, `cancelled`, `canceled`, `anulled`.
- **Historical compatibility:** Spanish description matching still recognizes historical elimination, cancellation, and deletion wording.
- **OTHER:** anything not recognized remains available as general activity and is not silently discarded.

#### Where it is used

- Daily workbook action sheets in `lib/reports/dailyWorkbook.ts`.
- Monthly **Eliminaciones y anulaciones** selection in `lib/reports/monthlyReport.ts`.
- Existing audit-summary compatibility logic in `app/api/logs/summary/route.ts`.

The daily workbook also now has Spanish display labels for the `reports` and `system` modules.

#### Audit catalog additions

`lib/audit/catalog.ts` now contains strict, sanitized metadata schemas for report lifecycle events, including generation, delivery, download, and restoration. Important event types include:

- `report.monthly.generated`
- report regeneration/sending lifecycle events
- `report.downloaded`
- `report.download_denied`
- `report.download_failed`
- `report.version.restored`

The schemas reject unexpected metadata fields so sensitive mail content, credentials, raw Storage errors, or unrelated request data are not accidentally written to the canonical audit stream.

#### End result

Canonical and historical create/update/delete events appear on the correct workbook sheets. Unknown events remain visible in general activity. Daily, monthly, and compatibility-summary logic no longer disagree about the meaning of an action.

### 3.2 Immutable report versions and safe Storage

#### Database model

The additive migration is:

`prisma/migrations/20260824120000_add_report_versions_and_delivery_attempts/migration.sql`

It introduced `GeneratedReportVersion` and added `GeneratedReport.currentVersionId`.

`GeneratedReport` continues to represent the logical office/report-type/period record. Its historical file fields are retained as a compatibility snapshot of the current version. They have not been dropped.

`GeneratedReportVersion` is the authoritative immutable file record and contains:

- Logical report relation and sequential `versionNumber`.
- State: `UPLOADING`, `READY`, `FAILED`, `CORRUPT`, `DELETE_PENDING`, `DELETE_FAILED`, or `DELETED`.
- Immutable bucket/key, filename, MIME type, byte size, and SHA-256 checksum.
- Generator, generation mode, generated time, and metadata.
- Safe failure and deletion lifecycle fields.
- Unique constraints for `(reportId, versionNumber)` and `(storageBucket, storageKey)`.

#### Generation flow

The versioning implementation is primarily in:

- `lib/reports/versioning.ts`
- `lib/reports/storage.ts`
- `lib/reports/reportSafetyCore.ts`
- `lib/reports/dailyReport.ts`
- `lib/reports/monthlyReport.ts`

The implemented sequence is:

1. Identify or create the logical `GeneratedReport` for the office, report type, and period.
2. Reserve the next sequential version in `UPLOADING` state.
3. Generate the XLSX file.
4. Upload it to a unique immutable Storage key with overwrite disabled.
5. Download the candidate object again from private Storage.
6. Recalculate and compare its size and SHA-256 checksum.
7. In one database transaction, mark the candidate `READY`, point `currentVersionId` to it, refresh the compatibility snapshot fields, and enqueue the generation audit event.
8. If the candidate fails, mark only that version failed and remove only its candidate object. Do not change or delete the previous current version.

This order prevents a partially uploaded, corrupt, or uncommitted file from becoming current.

#### Storage controls

- The server-only report path requires a Supabase service-role credential; anonymous-key fallback was removed.
- The `reports` bucket is private.
- The bucket accepts the XLSX MIME type and has a 50 MB size limit in QA.
- Uploads use unique keys and do not overwrite existing objects.
- Application APIs stream authenticated files; public URLs are not used.

No actual secret or service-role value is committed to this document or to source-controlled environment files.

#### Retention and cleanup

The policy implemented for monthly reports is the current available version plus ten previous available versions. Older versions move through an explicit cleanup lifecycle:

1. Mark as `DELETE_PENDING`.
2. Remove the object through the Supabase Storage API.
3. Mark the metadata row `DELETED` while preserving its checksum and audit/history fields.
4. Mark a failed object removal as `DELETE_FAILED` so cleanup can retry it.

This preserves a reconstructable history even after an old binary is pruned.

#### Version history and restoration

Monthly report history can be queried and retained versions can be downloaded or restored. Restoration changes only the logical report’s current pointer and compatibility snapshot. It does not copy or overwrite the historical object.

Restoration is transactional, supports an already-current no-op/idempotent outcome, rejects unavailable/corrupt/deleted versions, preserves office scope, and emits `report.version.restored`.

#### End result

A generation failure cannot invalidate the previous good report. Every available file has an independently verifiable identity, and a retained monthly version can become current without mutating its Storage object.

### 3.3 Immutable delivery-attempt model

#### Database model

The same additive migration introduced:

- `ReportDeliveryAttempt`
- `ReportDeliveryAttemptRecipient`

The old `ReportDeliveryBatch` and recipient tables remain in the schema for compatibility, but new delivery logic writes the attempt model.

Each `ReportDeliveryAttempt` records:

- Office, logical report, and exact `reportVersionId` attachment.
- Sequential `attemptNumber`.
- Mode: `MANUAL` or `SCHEDULED`.
- Target: `ALL_AUTHORIZED` or `FAILED_ONLY`.
- Optional parent attempt for retry lineage.
- Office-scoped unique idempotency key.
- Requesting administrator, provider/from account, recipient counts, timestamps, final status, and safe error.
- Status: `PENDING`, `SENDING`, `SENT`, `PARTIAL`, `FAILED`, or `NO_RECIPIENTS`.

Each `ReportDeliveryAttemptRecipient` is an immutable recipient snapshot containing:

- User and email at the time of the attempt.
- Authorization decision: `AUTHORIZED` or `REVOKED`.
- Recipient state: `PREPARED`, `SENDING`, `SENT`, `FAILED`, or `SKIPPED`.
- Attempt count and provider message/thread identifiers.
- Attachment filename, MIME type, byte size, and SHA-256.
- Safe error and completion timestamps.

#### Send behavior

The implementation is centered in:

- `lib/reports/deliveryAttempts.ts`
- `lib/reports/dailyDelivery.ts`
- `lib/reports/monthlyDelivery.ts`
- `lib/reports/dailyDeliveryCore.ts`

Behavior now follows these rules:

- First send and **Resend to all** create a new attempt for all currently active administrators in that office.
- **Retry failed** creates a child attempt containing only failed recipients from the selected previous attempt.
- Retry authorization is checked again. A user whose administrator access was revoked is preserved in the attempt history as skipped rather than silently removed.
- A manual request requires a valid `Idempotency-Key` created for the intentional UI action.
- A repeated manual key returns the same attempt instead of sending twice.
- Scheduled sends use deterministic office/report/period identity so duplicate scheduler calls are idempotent.
- The attachment is pinned to `reportVersionId`; regeneration during delivery cannot change the bytes being sent.
- Completed attempts are never reset or reused.
- Recipient-level outcomes and attachment checksums remain queryable.

#### Legacy reconciliation

`scripts/reconcile-report-history.ts` supports preview and apply modes. It backfills legacy report files into version rows and legacy delivery batches into attempt 1 without requiring destructive changes to the old tables.

The rollout sequence is documented in `docs/AUDIT_REPORT_PHASE1_ROLLOUT.md`.

#### End result

The delivery timeline is reconstructable. A reviewer can determine who initiated a send, who was eligible, which recipients succeeded or failed, which exact report version/checksum was attached, and whether a retry or resend created the later attempt.

### 3.4 Active-office-administrator authorization

#### Central access rule

`lib/reports/access.ts` centralizes report access through `canAccessReports()` and `assertReportAdmin()`.

The existing authenticated-user resolver rejects inactive accounts before returning the application user. The report helper then requires `isOfficeAdmin`.

#### Protected operations

The active-office-administrator rule now covers:

- Report navigation and direct page access.
- Report listing and report/version/delivery details.
- Current and historical downloads.
- Daily and monthly generation/regeneration.
- Version restoration.
- Manual sends, failed-recipient retries, resend-to-all, and cleanup.

Authenticated non-administrators receive `403`. Queries remain office-scoped, and a report belonging to another office is treated as not found (`404`) so report existence and metadata are not leaked.

Internal scheduled routes continue to use their server secret rather than a user session. Their recipient query was narrowed to active office administrators only.

No new report role or recipient-management screen was introduced in Phase 1.

#### End result

Ordinary office users cannot discover, download, generate, restore, or receive audit reports. An administrator cannot cross the office boundary.

### 3.5 Download integrity and auditing

The report download route is:

`GET /api/reports/:id/download?versionId=...`

If `versionId` is omitted, it resolves the current version, preserving existing download links. If supplied, it resolves that retained historical version.

Before returning bytes, the route:

1. Resolves the authenticated user and active-admin permission.
2. Looks up the logical report and checks office ownership.
3. Resolves the requested/current available version.
4. Downloads it from private Storage.
5. Recalculates byte size and SHA-256.
6. Rejects a missing or mismatched object.
7. Commits `report.downloaded` before returning the file.

The sensitive file response fails closed when the success audit event cannot be committed.

Audit outcomes are:

- `report.downloaded` for a verified current or historical file.
- `report.download_denied` for authenticated permission or office-boundary denial.
- `report.download_failed` for a missing, corrupt, unavailable, or Storage-failed version.

Metadata is intentionally limited to report/version identifiers, report type, period, checksum, byte size, request identifier, and current-versus-historical context.

A checksum mismatch marks the version `CORRUPT`, blocks the response, and makes the logical report unavailable when the corrupt version was current.

#### End result

No known-corrupt file is returned, and no successful sensitive download occurs without a committed, office-attributable audit record.

### 3.6 Phase 1 public interfaces

The report listing contract now includes current-version metadata, retained-version count, latest delivery status, and delivery-attempt count.

Added or expanded interfaces:

| Interface | Purpose |
| --- | --- |
| `GET /api/reports` | Office-scoped report list with current version and delivery summary |
| `GET /api/reports/:id/versions` | Retained version history |
| `GET /api/reports/:id/download?versionId=...` | Integrity-checked current or historical download |
| `POST /api/reports/:id/versions/:versionId/restore` | Transactionally restore a retained version |
| `GET /api/reports/:id/delivery-attempts` | Immutable attempts and recipient outcomes |
| Daily/monthly generation routes | Generate into immutable version Storage |
| Daily/monthly send routes | Create idempotent attempts pinned to a version |
| `POST /api/reports/cleanup` | Retry safe version-object cleanup under administrator rules |

The current `app/(protected)/ajustes/reportes/reportes-client.tsx` was extended enough to expose Phase 1 history and actions. It is not the final Reportes design; the full three-section replacement belongs to Phase 3.

## 4. Phase 2 — Move unmatched replies into Recibos and retire Registros

### 4.1 Recibos workflow consolidation

The existing **Gestión de envíos** modal in Recibos now has two accessible tabs:

- **Envíos** — the existing delivery history, details, reply classifications, resolutions, resends, and provider information.
- **Respuestas por asociar** — the read-only queue for `unmatched` and `needs_review` replies.

The unmatched pending total appears both on the tab and on the main **Gestión de envíos** button. This makes pending replies discoverable without restoring a separate audit page.

The reusable queue component is:

`app/(protected)/recibos/components/UnmatchedRepliesPanel.tsx`

It displays:

- Status label: **Sin asociar** or **Revisión necesaria**.
- Received date and time.
- Sender email.
- Subject.
- Sanitized message preview.
- Provider/mailbox context.
- Candidate-match count.

It supports:

- `all`, `unmatched`, and `needs_review` filtering.
- 25-row pages by default.
- Previous/next pagination.
- Responsive card/table presentations.
- Independent loading, empty, and API-error states.
- Keyboard-operable tabs, selected-tab semantics, focus visibility, and screen-reader labels.

The queue remains deliberately read-only. Manual association, dismissal, and conflict resolution are not implemented in this phase.

### 4.2 Queue API contract

The retained endpoint is:

`GET /api/recibos/send/replies/unmatched`

Query parameters:

- `page`: positive integer, default `1`.
- `limit`: integer from `1` to `100`, default `25`.
- `status`: `all`, `unmatched`, or `needs_review`, default `all`.

Response shape:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 0,
    "totalPages": 0
  }
}
```

`lib/recibos/unmatched-replies-core.ts` owns strict query validation. `lib/recibos/reply-sync.ts` performs the database query.

The query is:

- Authenticated through the existing active-user API wrapper.
- Strictly restricted to `user.officeId`.
- Restricted to unmatched/needs-review states.
- Stably ordered by `receivedAt DESC, id DESC`.
- Paginated in the database.
- Limited to queue metadata. It does not return full message bodies or attachment contents.

Matched replies continue to appear only in the associated delivery recipient detail.

### 4.3 Refresh behavior

After **Actualizar respuestas**, the page refreshes the relevant delivery data and the unmatched-reply queue/count so a newly synchronized unmatched message can appear without closing and reopening the modal.

The queue’s loading/error state is isolated from delivery-history state. A queue API failure does not break the current Recibos list or the **Envíos** tab.

### 4.4 URL state and navigation behavior

The modal uses explicit URL state:

- `panel=dispatch-history` opens **Gestión de envíos** on **Envíos**.
- `panel=unmatched-replies` opens it on **Respuestas por asociar**.

Closing removes only `panel`, preserving existing Recibos search, filter, and pagination parameters.

Panel-only updates use `window.history.replaceState`, allowing the tab/modal state to change immediately without triggering an unnecessary server navigation. Browser back/forward behavior and existing receipt query parameters are kept predictable.

### 4.5 Removal of the Registros frontend

The **Registros de Auditoría** card was removed from Ajustes, together with its unused icon import.

The following exclusive frontend files were deleted:

- `app/(protected)/ajustes/logs/page.tsx`
- `app/(protected)/ajustes/logs/components/ExportButtons.tsx`
- `app/(protected)/ajustes/logs/components/LogDiffModal.tsx`
- `app/(protected)/ajustes/logs/components/LogFilterBar.tsx`
- `app/(protected)/ajustes/logs/components/LogRow.tsx`
- `app/(protected)/ajustes/logs/components/LogTable.tsx`
- `app/(protected)/ajustes/logs/components/LogsSummary.tsx`

`next.config.js` contains a temporary, non-permanent redirect:

```text
/ajustes/logs → /recibos?panel=unmatched-replies
```

Old bookmarks therefore land in the replacement workflow instead of returning a dead page.

### 4.6 Audit/report foundation intentionally preserved

Retiring the Registros UI did **not** remove:

- `ActivityEvent`.
- `AuditLog`.
- The audit outbox.
- The canonical event catalog and schemas.
- Classification or sanitization.
- Append-only protections.
- Daily/monthly report data sources and workbook generation.
- Receipt synchronization and classification audit events.
- `/api/logs`.
- `/api/logs/summary`.
- `/api/logs/export`.
- `/api/logs/recent`.

Those compatibility APIs have no active Registros page consumer, but they remain authenticated and office-scoped until the separate Phase 5 retention/migration decision is approved and executed.

No Prisma migration was needed for Phase 2.

#### End result

Receipt delivery and response monitoring now live in one coherent Recibos workflow. The obsolete frontend is gone, old bookmarks are safe, and the canonical audit/report foundation is unchanged.

## 5. Phase 3 — Three-section Reportes redesign and detailed history

### 5.1 Information architecture and URL state

The Reportes page now has three accessible, URL-backed sections:

- **Resumen y operaciones** (`section=operations`) for generation, regeneration, sending, verified downloads, maintenance, summary counts, and the logical report inventory.
- **Historial de versiones** (`section=versions`) for the global immutable file ledger.
- **Historial de entregas** (`section=deliveries`) for the global delivery-attempt ledger and recipient detail.

The tablist supports click, Left/Right Arrow, Home, and End navigation. Each section owns namespaced filter and pagination parameters, so reload and browser back/forward retain the selected view. Existing `reportId` links from report emails remain supported and constrain/highlight the selected logical report across sections.

The visual direction is an information-dense operational ledger within the existing slate/blue application shell. Desktop tables become complete mobile cards at smaller widths, and status meaning is never communicated by color alone.

### 5.2 Resumen y operaciones

The overview includes office-scoped counts for available reports, retained versions, delivery attempts, and reports whose latest delivery requires attention. Daily and monthly generation are separate operation cards with Chilean period inputs and explicit actions.

Regeneration no longer depends on a checkbox. It is a distinct confirmed action that creates a new immutable candidate while explaining that the previous valid version remains available. Resend-to-all and cleanup also use focus-trapped confirmation dialogs. Each intentional send generates one client idempotency key and disables duplicate actions while the request is pending.

The report inventory is server-paginated and filters by type, period range, logical state, and latest delivery state. It exposes current version, retained count, delivery count, activity count, size, generator, timestamps, verified download, send/resend, and direct navigation to the selected report's version or delivery history.

### 5.3 Global version history

The version ledger covers daily and monthly reports and filters by type, period range, state, and current/historical identity. It shows version number, current marker, generation mode, generator, timestamp, filename, size, safe lifecycle error, and the complete SHA-256 value.

Ready versions can be downloaded through the existing audited integrity route. Retained non-current monthly versions can be restored through an accessible confirmation that names the current and target versions. Daily versions remain visible and downloadable but cannot be restored.

### 5.4 Global delivery history

The delivery ledger filters by report type, period range, status, manual/scheduled mode, and all-authorized/failed-only target. Each row identifies its report period, attempt number, requester, pinned report version, counts, timestamps, parent retry, and child retry count.

Attempt detail is loaded independently and exposes the immutable recipient snapshot, authorization decision, provider outcome, attachment identity, provider message/thread identifiers, and safe errors. **Reintentar fallidos** creates a child pinned to the selected attempt's version. **Reenviar a todos** remains a separate confirmed action using the logical report's current version and current active administrators.

### 5.5 Read API contracts

`GET /api/reports` now returns `{ items, pagination, summary }` and accepts strictly validated pagination, report type, period range, logical state, latest delivery state, and optional `reportId` filters.

The global history interfaces are:

| Interface | Purpose |
| --- | --- |
| `GET /api/reports/versions` | Paginated global version history with lifecycle/current-state filters |
| `GET /api/reports/delivery-attempts` | Paginated global delivery-attempt summaries |
| `GET /api/reports/delivery-attempts/:attemptId` | One office-scoped attempt with recipients, provider identity, attachment identity, and retry lineage |

All new routes use the central active-administrator assertion, strict query schemas, office-scoped queries, stable newest-first ordering with an ID tie-breaker, a default page size of 25, and a maximum page size of 100. Cross-office identifiers remain indistinguishable from missing records. Storage keys, idempotency keys, and raw provider payloads are not returned.

The original per-report histories and all Phase 1 mutation/download contracts remain available. Phase 3 required no Prisma schema migration and did not change immutable Storage, delivery pinning, checksum, retention, or audit behavior.

## 6. QA environment and rollout work completed

### 6.1 Isolation boundary

The main Supabase project was not treated as disposable and was not used for mutation-heavy QA. Its operational records and Storage objects were preserved.

An isolated Supabase preview branch was prepared for QA:

- Branch name: `qa`.
- Region: `sa-east-1`.
- Environment marker: `NEXT_PUBLIC_ENVIRONMENT=qa`.
- Mutation guard: `QA_ALLOW_MUTATIONS=true` only in the ignored QA environment file.
- Mail mode: `MAIL_PROVIDER=dry-run`.
- Separate QA administrator identities and office fixtures.

The QA environment file is local and Git-ignored. Credentials are not recorded here.

### 6.2 Database migration history repair and deploy

The branch had cloned schema objects but initially had no Prisma `_prisma_migrations` history. The safe rollout was:

1. Run `prisma migrate status`.
2. Mark the 34 already-present historical migrations as applied with `prisma migrate resolve --applied`.
3. Leave `20260824120000_add_report_versions_and_delivery_attempts` pending.
4. Apply the pending migration with `prisma migrate deploy`.
5. Regenerate Prisma Client with `prisma generate`.

This avoided `prisma migrate dev`, reset prompts, or replaying old DDL against an already-cloned schema.

After deployment, all 35 committed migrations were reported current on QA.

### 6.3 Report reconciliation

The reconciliation process was run in preview/apply/preview form. The final preview reported:

- Zero missing report-version rows.
- Zero missing legacy attempt rows.
- Zero invalid ready objects requiring reconciliation.

### 6.4 Storage bucket restoration

The database branch did not clone Storage bucket rows automatically. Idempotent historical bucket configuration was restored in QA:

- `documents`: private, PDF-only, 50 MB.
- `pdf-assets`: private, PNG-only, 10 MB.
- `reports`: private, XLSX-only, 50 MB.

Unauthenticated access to a real QA report object was denied.

### 6.5 QA identities and deterministic fixtures

Synthetic identities were created for:

- Two active administrators in the first office.
- One active non-administrator in the first office.
- One active administrator in a second office.

The QA seed provides deterministic unmatched, needs-review, matched, paginated, and second-office reply cases. It also creates report-qualifying document/activity data.

The seed reset path was corrected so reset actually performs cleanup before returning, and a deterministic Estampo document was added so monthly report generation can qualify from a clean seed.

No production mailbox or real distribution list was used.

## 7. Testing and verification record

### 7.1 Automated code checks that passed

The following checks passed against the implemented working tree/isolated QA setup at the time of this record:

| Check | Recorded result |
| --- | --- |
| `npx prisma migrate status` | QA migrations current after baseline/deploy |
| `npx prisma validate` | Passed |
| `npx prisma generate` | Passed |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed |
| `npm run check:utf8` | Passed |
| `npm run check:auth-audit` | Passed across 296 checked files |
| `npm run check:infrastructure` | Passed |
| `npm run verify:infrastructure -- --mode=qa --allow-mutations` | Passed with zero warnings; runtime/migration connection modes verified |
| `npm run test:integration` | 27 files and 127 tests passed |
| `npm run build` | Passed |

### 7.2 Phase 1 focused coverage

Relevant integration suites include:

- `tests/integration/daily-report-core.test.ts`
  - Chile winter/summer day boundaries.
  - Canonical, legacy, and historical action classification.
  - Unknown activity retained.
  - Created, updated, and deleted events placed in the expected workbook sheets.
  - Required worksheets and safe display formatting.
- `tests/integration/report-safety-core.test.ts`
  - Current plus ten previous ready versions.
  - A slower/older candidate cannot replace a newer ready current version.
  - Delivery outcome derivation and idempotency-key validation.
  - Strict report audit metadata and sensitive-field rejection.
  - Migration constraints, private bucket setup, and legacy backfill source assertions.
  - Active-admin report APIs and fail-closed audited download source assertions.
- `e2e/reports.spec.ts`
  - Active QA administrator can open Reportes and list office reports.
  - Unauthenticated page/API access does not expose report data.
  - Monthly generation creates immutable downloadable versions and supports restore.

### 7.3 Phase 2 focused coverage

- `tests/integration/unmatched-replies-phase2.test.ts`
  - Bounded pagination/status validation.
  - Office-scoped, paginated, stable ordering.
  - URL-synchronized accessible Recibos tabs.
  - Removal of Registros UI, bookmark redirect, and preservation of audit/report foundations.
- `e2e/recibos-unmatched-replies.spec.ts`
  - The legacy URL opens the office-scoped replacement queue.
  - The queue API validates pagination and returns the new contract.
  - Closing the modal preserves Recibos filters and removes only the panel state.

### 7.4 Phase 3 focused coverage

- `tests/integration/report-history-phase3.test.ts`
  - Pagination defaults/bounds and stable pagination metadata.
  - Strict enum, real-date, date-range, and unexpected-field rejection.
  - Office-scoped, stably ordered query source and sensitive-field exclusion.
  - Three-section URL state, independent history endpoints, and client send idempotency source assertions.
- `tests/integration/report-safety-core.test.ts`
  - Central active-administrator assertion coverage extended to all Phase 3 routes.
- `e2e/reports.spec.ts`
  - Three accessible sections, URL changes, and browser back behavior.
  - Paginated global version and delivery contracts and strict filter validation.
  - Lazy attempt detail with recipient snapshots.
  - Existing generation, immutable version, verified download, restore, pinned send, and idempotency workflows retained.

### 7.5 QA behavior verified

The isolated QA run verified:

- Multiple immutable monthly versions can coexist as unique Storage objects.
- Current and historical versions can be downloaded.
- An older retained version can be restored.
- Repeating restoration of the already-current version behaves idempotently.
- A dry-run delivery pins the attempt to the current report version.
- Exactly the two active same-office administrators become recipients in the tested office.
- Repeating the same manual idempotency key returns the same attempt.
- Recipient results remain persisted as `SENT` in dry-run mode.
- Audit events were created for download, monthly generation/regeneration/sending, and version restoration.
- Public access to a real report object was denied.
- Cross-office fixtures did not appear in the unmatched-reply queue.
- Functional Playwright scenarios have passing evidence after the URL-state and seed corrections.

### 7.6 Playwright qualification status

All 18 functional workflow scenarios passed in the final clean QA batch. Targeted Reportes also passed independently with 4 of 4 scenarios green. Recibos, report, PDF, service-worker, Storage-blocked receipt, and full operational workflows passed.

However, the exact aggregate command `npm run test:qa` is still red because it also includes a nonfunctional latency benchmark. This is an environment/performance qualification failure, not a functional test failure:

- Suite: `e2e/workflow-performance.spec.ts`.
- Observed steady-state median from the local application to remote São Paulo QA: approximately 1,088.9 ms.
- Observed p95: approximately 1,139.2 ms.
- Required steady-state target: below 500 ms.
- Observed cold path: approximately 7,170.5 ms versus a target near 1,180 ms.

The benchmark should be rerun from an application deployment located near the QA database, or the latency path should be separately profiled and optimized. This record must not be interpreted as “the full QA command is green.”

### 7.7 Manual verification status

Automated browser, database, Auth, Storage, and audit-event checks were completed. On 2026-08-26, the authorized synthetic QA administrator session was also used for an in-app browser walkthrough of the Phase 3 interface. The walkthrough verified:

- The three sections at approximately 1440 px, 768 px, and 375 px, including desktop tables and responsive history cards.
- URL-backed filters, keyboard Arrow/Home/End tab navigation, browser back/forward, and `reportId` deep links.
- Full 64-character checksum presentation and the live copy confirmation.
- Restore, resend-to-all, regeneration, and maintenance dialogs, including initial focus, Escape dismissal, and focus-safe cancellation.
- Expanded delivery details containing recipient, provider, pinned attachment/checksum, and retry-lineage information.
- A clean authenticated reload without browser runtime errors.
- No document-level horizontal overflow at 375 px after correcting the protected top navigation to collapse labels and hide search below its responsive breakpoint.

This completes the requested responsive and semantic/keyboard acceptance pass for Phase 3. It is not evidence of a full assistive-technology certification or a human-operated replay of every Phase 1–3 edge fixture.

The remaining environment or specialist acceptance items include:

- Visual inspection of daily and monthly workbook contents in Excel/LibreOffice.
- A screen-reader-software review beyond the DOM semantics and keyboard checks completed in the in-app browser.
- Human confirmation of all empty/error/loading states.
- Human cross-office and non-admin denial checks in the deployed UI.
- A controlled corrupt-object fixture and visible recovery behavior.
- Real sandbox-provider email receipt and attachment verification.

## 8. Files and components added or materially changed

### 8.1 New Phase 1 implementation files

- `lib/audit/classification.ts`
- `lib/reports/access.ts`
- `lib/reports/deliveryAttempts.ts`
- `lib/reports/reportSafetyCore.ts`
- `lib/reports/versioning.ts`
- `app/api/reports/[id]/versions/route.ts`
- `app/api/reports/[id]/versions/[versionId]/restore/route.ts`
- `app/api/reports/[id]/delivery-attempts/route.ts`
- `prisma/migrations/20260824120000_add_report_versions_and_delivery_attempts/migration.sql`
- `scripts/reconcile-report-history.ts`
- `tests/integration/report-safety-core.test.ts`
- `e2e/reports.spec.ts`
- `docs/AUDIT_REPORT_PHASE1_ROLLOUT.md`

### 8.2 Material Phase 1 changes

- `prisma/schema.prisma`
- `lib/audit/catalog.ts`
- `lib/reports/storage.ts`
- `lib/reports/dailyWorkbook.ts`
- `lib/reports/dailyReport.ts`
- `lib/reports/dailyDelivery.ts`
- `lib/reports/monthlyReport.ts`
- `lib/reports/monthlyDelivery.ts`
- Report list, generate, send, download, cleanup, and report-page routes/components.
- `app/api/logs/summary/route.ts` for shared classification compatibility.
- QA seed and package reconciliation script entry.

### 8.3 New Phase 2 implementation files

- `app/(protected)/recibos/components/UnmatchedRepliesPanel.tsx`
- `lib/recibos/unmatched-replies-core.ts`
- `tests/integration/unmatched-replies-phase2.test.ts`
- `e2e/recibos-unmatched-replies.spec.ts`

### 8.4 Material Phase 2 changes

- `app/(protected)/recibos/page.tsx`
- `app/api/recibos/send/replies/unmatched/route.ts`
- `lib/recibos/reply-sync.ts`
- `app/(protected)/ajustes/page.tsx`
- `next.config.js`
- `scripts/qa-seed.ts`

### 8.5 New and material Phase 3 files

- `lib/reports/historyCore.ts`
- `lib/reports/history.ts`
- Global version and delivery API routes under `app/api/reports`.
- Reportes section, tab, confirmation, pagination, types, and UI utility components.
- `tests/integration/report-history-phase3.test.ts`
- Expanded `e2e/reports.spec.ts`.

### 8.6 Deleted Registros-only frontend files

The page and six exclusive components listed in section 4.5 are deleted. Audit APIs and data models are not part of that deletion.

## 9. Open work and known limitations

### 9.1 Required before production rollout

- Apply the Phase 1 migration to the production database with the required `status → deploy → generate` sequence.
- Pause production report schedulers and manual generation/sending during the migration/cutover window.
- Run report reconciliation in preview/apply/preview mode and require a clean final preview.
- Verify the production `reports` bucket restrictions and private-object behavior.
- Smoke-test an administrator list/download and then resume scheduler traffic.
- Do not run destructive corruption/failure injection against production.
- Do not use `prisma migrate dev`.

The main configured Supabase project remained unchanged by the isolated mutation-heavy QA exercise.

### 9.2 QA environment limitations

- The current QA branch is a nonpersistent preview branch. It should be made persistent or replaced with a durable isolated QA project/branch if it is expected to serve as an ongoing regression environment.
- The app was tested locally against a remote São Paulo database. That topology fails the repository’s strict latency benchmark.
- Mail delivery used `dry-run`. No real Gmail/Microsoft/sandbox-provider message was delivered.
- Provider message IDs, inbox arrival, and the attachment received by a real provider were therefore not end-to-end verified.
- The live QA run exercised multiple versions, but the full 11-version pruning threshold should still receive an explicit live cleanup exercise.
- Controlled checksum-corruption, Storage outage, database-activation failure, real partial-provider failure, role revocation between live attempts, and failed-object cleanup remain primarily automated/integration coverage rather than completed human live-provider scenarios.
- Scheduled secret endpoint and duplicate-cron behavior should receive a final deployed-environment smoke test.

### 9.3 Security findings outside the three feature phases

Supabase Security Advisor reported a broader legacy security backlog:

- 48 public tables were present at the time of review.
- RLS was reported disabled on 42 older public tables.
- The three new report tables have RLS enabled.
- Additional warnings included a mutable function search path and disabled leaked-password protection.

These findings are important, but enabling RLS blindly would risk breaking the application. A separate, table-by-table authorization and policy rollout is required. The current report APIs still enforce application-layer authentication, office scope, and administrator checks; that does not remove the need for the broader database-hardening project.

### 9.4 Compatibility debt deliberately retained

- Legacy file snapshot columns remain on `GeneratedReport`.
- Legacy report delivery tables remain available for read compatibility.
- `AuditLog` remains in Prisma and the database.
- `/api/logs`, `/api/logs/summary`, `/api/logs/export`, and `/api/logs/recent` remain active compatibility endpoints.
- No approved retention policy currently authorizes deleting or archiving historical audit data.
- The temporary `/ajustes/logs` redirect will eventually need removal after the bookmark-transition period is approved complete.

### 9.5 Functional work intentionally deferred

- Manual association/dismissal of unmatched replies.
- Final `AuditLog` archive/migration/removal.

## 10. Phase 4 implementation record

Phase 4 is implemented in the repository and was qualified against the isolated QA environment on 2026-08-26. Production migration, scheduler cutover, and schedule enablement were deliberately not performed.

### 10.1 Migration and persisted contracts

The additive migration `20260826190000_add_report_automation_phase4` adds durable report jobs and runs, administrator recipient configuration, report schedules, reusable custom-report definitions/recipients, custom identity on generated reports, and `CANCELLED` delivery attempts. It also adds the required indexes, foreign keys, unique idempotency identities, backfills, RLS enablement, and explicit `anon`/`authenticated` revocations.

The migration was applied only to isolated QA using the required `migrate status → migrate deploy → generate` sequence. `prisma migrate dev` was not used. Verification found all six new public tables with RLS enabled and zero forbidden `anon`/`authenticated` grants. The private `reports` bucket remained non-public and XLSX-only.

Standard report identities are `daily` and `monthly`; custom identities use `custom:<definitionId>`. Standard recipient eligibility was backfilled for active same-office administrators, custom eligibility remained opt-in, and the standard daily/monthly schedules were backfilled disabled.

### 10.2 Durable jobs and automation

Generation and delivery endpoints now return `202` report jobs. Jobs persist queued/running/cancel-requested/succeeded/failed/cancelled states, progress, leases, heartbeats, retry timing, safe errors, result identifiers, linked manual retries, and individual run attempts.

The worker claims work with `FOR UPDATE SKIP LOCKED`, uses ten-minute leases, recovers expired claims, retries only classified transient failures at approximately 1/5/15 minutes, and pins delivery retries to the original version and failed recipients. Generation checks cooperative cancellation before workbook construction, before Storage upload, and before current-version activation. Delivery checks between recipients and records already-sent/skipped outcomes.

`POST /api/internal/reports/tick` authenticates only with `REPORT_AUTOMATION_SECRET`, enqueues due schedules idempotently, performs bounded claims, and returns safe counts. Legacy internal daily/monthly scheduler routes remain compatibility wrappers that enqueue work.

### 10.3 Recipients and schedule health

The recipient matrix is office-scoped and limited to active administrators. It supports daily, monthly, and custom eligibility with an optimistic office revision; stale writes return `409`. Delivery revalidates activity, office, role, and report-specific configuration immediately before sending. Audit metadata stores identifiers/counts, not email lists.

Schedules support standard daily/monthly and custom daily/weekly/monthly completed Chilean periods. Calculation uses `America/Santiago`, including DST, weekday/month-day controls, resolved next execution, lateness thresholds, idempotent run identities, and disabled/healthy/running/attention/critical health derivation. Standard schedules stay disabled pending controlled production cutover.

### 10.4 Custom reports

Custom definitions are reusable, office-scoped, schedulable, and archived rather than deleted. They use curated `ActivityEvent` filters, optional same-office actor/system selection, ordered approved columns, custom-enabled recipients, a real Chilean range capped at 366 days, and a 50,000-row detail limit.

Custom XLSX output contains a definition/period summary, grouped counts, and only approved sanitized activity fields. Raw metadata, provider payloads, headers, tokens, document bodies, and arbitrary database fields are not selectable. Custom output reuses immutable versions, private Storage, checksums, verified downloads, delivery pinning, retention, and lifecycle audit events.

### 10.5 Phase 4 interface

The Phase 3 top-level sections remain. `Resumen y operaciones` now has URL-backed `control`, `jobs`, `recipients`, `schedules`, and `custom` views. The UI includes live job polling, progress/run lineage, cancel/retry actions, recipient revision handling, schedule health/run-now, and an accessible custom-definition editor with actor filters, column ordering, recipients, recurrence, and manual execution.

Tabs are real URL links with ARIA tab semantics and Home/End/arrow keyboard support. Desktop ledgers transition to mobile cards, active requests are independently loaded, and actions expose safe live announcements, confirmation focus trapping/return, duplicate-action disabling, and URL/browser-history persistence.

### 10.6 Verification evidence

- `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`, `npm run check:utf8`, `npm run check:auth-audit`, and `npm run check:infrastructure`: passed.
- `npm run test:integration`: 28 files and 135 tests passed.
- `npm run build`: passed; `/ajustes/reportes` production bundle measured 27.6 kB (133 kB first load in this build).
- `npm run verify:infrastructure -- --mode=qa --allow-mutations`: passed with zero warnings.
- `npm run verify:reports:phase4`: passed; 6/6 new tables had RLS, forbidden grant count was 0, and the `reports` bucket remained private/XLSX-only.
- Concurrent QA tick requests produced no duplicate schedule/run identity.
- Targeted `e2e/reports.spec.ts`: all 7 Phase 4 scenarios passed after URL-navigation synchronization was hardened.
- The aggregate QA run passed 19 of 22 browser scenarios before reset. Its Reportes navigation timing failure was corrected and the complete 7-scenario Reportes suite then passed. The aggregate command remains non-green because the known remote-region latency benchmark and an unrelated pre-existing missing-ROL handoff scenario also failed; the full aggregate was not represented as green.
- QA reset completed successfully after the aggregate run. Fixtures were reseeded for the manual walkthrough and are reset again at final handoff.

### 10.7 Manual browser evidence and remaining acceptance

The in-app browser used a clean QA production build at approximately 375, 768, and 1440 px. The pass confirmed no document-level horizontal overflow; mobile job/version cards; the desktop version/delivery ledgers; full accessible checksum values; long synthetic administrator emails; all five operations views; browser back/forward; and visible loading and health states.

The walkthrough created a weekly custom definition, selected safe modules/columns/recipient, enabled its schedule, queued a manual run, observed `En cola` become `Completado` through live polling, updated the recipient matrix, inspected schedule health, expanded pinned delivery/provider/recipient details, and verified dialog initial focus, focus trapping, Escape dismissal, and focus return. Browser content exposed no automation secret, public Storage URL, raw metadata/provider payload, or unsanitized error.

Outstanding environment/specialist acceptance is intentionally recorded rather than simulated:

- Real mail remains `dry-run`; provider inbox arrival and attachment receipt are not verified.
- Production migration/cutover, external scheduler configuration, duplicate-tick smoke test, and office-by-office schedule enablement are not performed.
- The São Paulo remote-QA latency qualification remains above the repository’s 500 ms target.
- A specialist screen-reader-software review remains outstanding beyond the semantic DOM, live-region, focus, and keyboard pass.
- Non-admin/inactive/second-office denial is covered by automated API/browser safety tests and cross-office 404 fixtures; separate interactive credentials were not available for a human sign-in replay.
- Controlled real Storage/provider/database outage and corrupt-object recovery remain safe automated-fixture coverage, not destructive live-provider acceptance.

## 11. Baseline and guardrails for Phase 5

Phase 5 is a separate data-retention and contract-removal project. It must begin with an approved retention policy, not with deleting the `AuditLog` model.

Required decision points:

- Legal/operational retention period by event type.
- Whether any records are subject to legal hold.
- Canonical source of truth for each historical event (`ActivityEvent`, `AuditLog`, or archived form).
- Archive format, encryption, Storage location, checksum manifest, access control, restore/query procedure, and deletion proof.
- Whether historical reports must remain reproducible after source-event deletion.
- Who may authorize and execute a purge.

Recommended execution order:

1. Inventory every writer and reader of `AuditLog` and the four `/api/logs` endpoints.
2. Compare legacy rows with canonical `ActivityEvent` coverage and identify non-migratable fields.
3. Approve retention, archive, legal-hold, and deletion rules.
4. Build and verify an idempotent archive/migration process with row counts and checksums.
5. Prove daily/monthly/custom reports no longer depend on legacy-only rows.
6. Stop new legacy writes while keeping read compatibility during the observation window.
7. Remove `/api/logs`, `/api/logs/summary`, `/api/logs/export`, and `/api/logs/recent` in an application contract release.
8. Only after backup/restore validation and the observation window, remove the Prisma `AuditLog` model and associated database objects in a separate migration.

Phase 5 must not remove `ActivityEvent`, the canonical catalog, audit outbox, sanitization, append-only protections, or report lifecycle audit events.

## 12. Definition of the current handoff baseline

Work may proceed to Phase 5 when the team accepts the following statements:

- Phase 1’s immutable version, delivery attempt, authorization, checksum, and audit foundations are the source of truth for new Reportes UI work.
- Phase 2’s Recibos unmatched-reply queue is the replacement for the deleted Registros frontend.
- Phase 3’s URL-backed Reportes sections and global paginated histories are the supported administrator UI and read contracts.
- Phase 4’s durable jobs, configured active-administrator recipients, Chilean schedules/health, and curated custom XLSX definitions are the supported automation contracts.
- The legacy audit APIs/model are compatibility debt intentionally reserved for Phase 5, not accidental leftovers to delete during Phase 3.
- The isolated QA Phase 4 functional evidence and responsive/keyboard walkthrough are complete, but the full aggregate QA command, real-mail provider validation, specialist assistive-technology review, and production rollout are still open.
- Broader Supabase RLS/security-advisor findings are tracked separately and must not be “fixed” with blanket policies during unrelated UI work.
- Existing unrelated user work in the repository must continue to be preserved.

This file should be updated at the end of each future phase so later changes can be evaluated against a clear, non-destructive audit/report baseline.

## 13. Phase 5 implementation record

Phase 5 was implemented and qualified against isolated QA on 2026-08-26. Later that day, the project owner explicitly authorized retirement on the default production-like Supabase target because the application remained in development and no user depended on its legacy data. The production-like rollout evidence is recorded in section 13.7.

### 13.1 Approved retention policy

The project owner approved `AUDITLOG-DEV-ZERO-RETENTION-V1` for the development-stage legacy `AuditLog` subsystem:

- Zero-day retention and no legal holds.
- Permanent purge with no row-level archive.
- No conversion or copy of legacy rows into `ActivityEvent`.
- One aggregate, non-sensitive `audit.legacy_retired` event per affected office.
- Production execution required separate explicit authorization; that authorization was subsequently granted for the development-stage production-like target and is recorded in section 13.7.

The policy is committed in `docs/AUDITLOG_RETENTION_POLICY.md`. Retirement metadata is catalog-validated and limited to the policy identifier, `PURGE_NO_ARCHIVE` strategy, deleted count, and oldest/newest timestamps. Legacy diffs, emails, names, user identifiers, table/action breakdowns, and record identifiers are prohibited.

### 13.2 Release 5A — guarded data retirement

Migration `20260826210000_retire_legacy_audit_data` was applied to isolated QA as an independently verified checkpoint. It enabled RLS, revoked `anon` and `authenticated` table/sequence privileges, recorded idempotent aggregate retirement evidence, removed the old delete blocker, purged all rows, and installed the `audit_logs_retired` mutation blocker.

The deterministic QA preflight created four synthetic legacy rows: two rows in office 1 and two rows in office 3. The guarded verifier confirmed zero rows afterward, active RLS, no client-role table grants, the retirement trigger, approved metadata only, and deterministic per-office deduplication keys.

Release 5A qualification passed:

- Prisma validation and generation.
- TypeScript and lint.
- UTF-8, authentication/audit, and infrastructure checks.
- 29 integration files and 138 tests.
- Production build.

### 13.3 Release 5B — compatibility contract removal

The following routes were physically removed and now use the normal 404 contract:

- `/api/log`
- `/api/logs`
- `/api/logs/summary`
- `/api/logs/export`
- `/api/logs/recent`

The `/ajustes/logs` bookmark redirect was removed. No replacement audit API was added because dashboards, role timelines, standard reports, and custom reports already use server-side `ActivityEvent` queries.

Static authorization verification now rejects any application reference to `prisma.auditLog`, Prisma `AuditLog` type imports, reintroduced legacy routes, or the old redirect. The empty guarded table remained present throughout the Release 5B observation gate.

The complete Release 5B QA cycle recorded 29 integration files/139 tests and 21 of 22 Playwright scenarios passing. Every Phase 5, Reportes, authorization, workflow, and disabled-user scenario passed. The only failure was the previously documented remote São Paulo performance benchmark: approximately 1,079.6 ms steady p95 and 7,207.3 ms cold versus its existing threshold.

### 13.4 Release 5C — model and table removal

After the Release 5B QA gate, migration `20260826230000_remove_legacy_audit_model` was applied separately to isolated QA. It dropped the retirement trigger and then dropped `audit_logs` without `CASCADE`, so an unexpected dependency would have blocked deployment.

The Prisma `AuditLog` model and the `User.auditLogs` and `Office.auditLogs` relations were removed. Prisma Client was regenerated. The removed-state verifier confirmed:

- `public.audit_logs` no longer exists.
- No application runtime, API, redirect, model, or relation references remain.
- `activity_events` and `activity_outbox` still exist.
- `activity_events_append_only` remains active.
- Canonical catalog, sanitization, outbox, deduplication, and office-scoping contracts remain in place.

Final qualification passed:

- Prisma validation.
- TypeScript and lint.
- UTF-8, authentication/audit, and infrastructure checks.
- 29 integration files and 140 tests.
- QA-scoped production build.
- Phase 5 browser contract suite: 3 of 3 passed.
- Post-drop Reportes and authenticated workflow regression: 16 of 16 passed.

### 13.5 Manual browser acceptance

The in-app browser verified the current QA-built production bundle:

- `/ajustes/logs` displays the normal 404 and does not redirect to Recibos.
- All five retired API URLs display the normal 404 without internal details.
- No AuditLog, Registros, diff, or raw metadata content appears.
- The removed page was inspected at 375, 768, and 1440 px.
- The default 404 shell has a one-pixel document-width overflow at 375 px; it is an application-shell detail unrelated to the removed audit subsystem.

The in-app authenticated cookie became stale after deterministic QA fixture reset and the QA account uses generated magic-link state rather than a stored password. Authenticated Reportes, workflow, office-isolation, keyboard, and responsive behavior therefore relied on the green Playwright qualification plus the unchanged Phase 4 manual responsive baseline. No credential, secret, or legacy payload was exposed in the browser.

### 13.6 Known limitations and post-Phase-5 baseline

- The aggregate `npm run test:qa` command remains non-green only because of the known São Paulo cold-start/latency benchmark; Phase 5 functional qualification is green.
- The default production-like Supabase target received both Phase 5 migrations after explicit authorization; see section 13.7. No separate live-user production deployment was identified or modified.
- Provider-managed database backups, if any, follow their independent platform lifecycle; Phase 5 created no custom legacy archive.
- `ActivityEvent` is now the only application audit model and source of truth.
- `AuditLog`, its APIs, its redirect, its Prisma model, and its database table are fully absent from the supported QA baseline.
- Historical generated XLSX versions remain immutable and downloadable through their existing checksum-verified contracts.

### 13.7 Authorized production-like retirement rollout

On 2026-08-26, the project owner confirmed that the application was still genuinely in development, nobody depended on the production-like database, and permanent legacy deletion could proceed. The target loaded from `.env` was verified to be a remote Supabase project distinct from the isolated `.env.qa.local` project. Credentials and connection strings were not printed or copied into this record.

The aggregate-only preflight found 881 `AuditLog` rows in one office, with timestamps from `2025-11-18T00:25:01.298Z` through `2026-07-04T22:23:24.285Z`. No row content was inspected, exported, or archived. Provider-managed backups, if any, remain governed by Supabase's independent lifecycle.

The target was four migrations behind. The two additive prerequisite migrations were applied first as their own checkpoint:

- `20260824120000_add_report_versions_and_delivery_attempts`
- `20260826190000_add_report_automation_phase4`

Release 5A was then applied separately with `20260826210000_retire_legacy_audit_data`. Guarded-state verification proved that all 881 rows were deleted, the table contained zero rows, RLS was active, `anon` and `authenticated` grants were absent, the retirement trigger rejected a deliberate test insert, and exactly one `audit.legacy_retired` event existed. Its metadata contained only the approved policy identifier, `PURGE_NO_ARCHIVE`, deleted count, and oldest/newest timestamps.

The Release 5B source gate passed before final removal: authentication/audit static verification covered 331 files, and the focused Phase 5 integration suite passed all five tests. The previously completed isolated-QA observation cycle remained the required functional gate.

Release 5C was then applied separately with `20260826230000_remove_legacy_audit_model`. PostgreSQL accepted the non-`CASCADE` drop, proving that no unexpected dependency blocked removal. Final verification confirmed all 38 migrations applied, `public.audit_logs` absent, Prisma Client regenerated without `AuditLog`, and canonical `activity_events`, `activity_outbox`, and `activity_events_append_only` protections intact.

The runtime connection configuration was corrected and requalified on 2026-08-27. `DATABASE_URL` now uses Supavisor transaction mode on port 6543 with `pgbouncer=true`, `connection_limit=1`, `pool_timeout=10`, `connect_timeout=10`, and `sslmode=require`; `DIRECT_URL` uses Supavisor session mode on port 5432 with `sslmode=require`. Production-read-only infrastructure verification passed with zero warnings, all 38 migrations were current, Supabase Auth/service access and the Data API passed, and the private XLSX-only `reports` bucket remained anonymously inaccessible. The tracked `.env.example` was sanitized back to placeholders while the functional `.env` remained Git-ignored.

### 13.8 Remaining operational activation for real report email

The report and audit implementation is functionally complete. Manual generation, checksum-verified download, immutable version history, delivery history, job execution, recipient configuration, schedules, and custom-report workflows are implemented and qualified. Remaining work concerns external service activation rather than new report application code.

Current development configuration and database readiness on 2026-08-27:

- `MAIL_PROVIDER=dry-run`; no real email leaves the application.
- No real sender address, Gmail SMTP account, or Microsoft Graph sender credentials are configured.
- `REPORT_AUTOMATION_SECRET` is configured.
- One daily and one monthly recipient are enabled; no custom-report recipient is enabled.
- Two standard schedules exist, but both are disabled and have no next execution.
- No public `APP_URL` or `NEXT_PUBLIC_APP_URL` is configured for links embedded in real emails.

Required for manual real-email delivery:

1. Choose and configure one provider:
   - Gmail SMTP: `MAIL_PROVIDER=gmail_smtp`, `MAIL_FROM_EMAIL`, `GMAIL_SMTP_USER`, and `GMAIL_SMTP_APP_PASSWORD`.
   - Microsoft Graph: `MAIL_PROVIDER=microsoft_graph`, `MAIL_FROM_EMAIL`, `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, and `MS_GRAPH_SENDER_EMAIL`.
2. Configure `APP_URL` or `NEXT_PUBLIC_APP_URL` with the deployed HTTPS application origin so report links resolve correctly.
3. Perform a controlled real-mail acceptance test covering receipt, attachment filename, pinned version/checksum, provider identifiers, resend-to-all, failed-recipient retry, and duplicate-send prevention.

Required additionally for automatic scheduled delivery:

1. Configure the external scheduler to call `POST /api/internal/reports/tick` every one to five minutes using `Authorization: Bearer <REPORT_AUTOMATION_SECRET>` or the supported `x-report-automation-secret` header.
2. Review configured recipients and enable the daily/monthly schedules through **Reportes → Programación**.
3. Confirm resolved next-run timestamps, execute a duplicate-tick smoke test, and verify the resulting jobs, versions, attempts, checksums, Storage objects, and audit events.
4. Enable at least one custom-report recipient and create an active custom definition before custom scheduled delivery is expected.

Operational interpretation:

- Manual report generation and download require no additional activation.
- Manual real-email sending requires the sender provider, deployed application URL, and real-mail acceptance test.
- Fully automatic delivery additionally requires the external scheduler and explicit schedule enablement.

Non-functional follow-up remains unchanged: the remote São Paulo latency benchmark is above the repository target, and a specialist screen-reader-software review remains outstanding beyond the completed semantic DOM, keyboard, focus, and responsive checks.
