# NOTIFICA IA — Authentication and Canonical Audit Implementation Report

## Document purpose

This report records the authentication and audit remediation implemented in NOTIFICA IA so a future developer or Codex conversation can resume without reconstructing the original audit, decisions, code changes, database state, or validation evidence.

- Report prepared: 2026-07-28
- Implementation and final QA performed: 2026-07-27 to 2026-07-28
- Workspace: `C:\Users\gonza\Desktop\NOTIFICA IA - WEB - (2)`
- Source audit supplied by the user: `C:\Users\gonza\Desktop\optimizations - NOTIFICA IA.docx`
- Git HEAD observed before the report: `abb03c89f31b0266be12d159452c9a6548126849`
- HEAD subject: `codex/Phase3DailyEmailAutomation`
- Implementation status: complete in the configured workspace and QA database
- Commit status: changes were deliberately left uncommitted and unstaged

## Executive summary

The application was migrated from repeated/ambiguous identity resolution and dual audit mechanisms to a request-scoped authentication model with one canonical audit stream.

The resulting architecture has these properties:

1. `ActivityEvent` is the canonical application audit source.
2. Existing `AuditLog` data is preserved as read-only historical data.
3. Each authenticated API request resolves Supabase identity once and the local `User` once.
4. The resulting `RequestContext` is reused by routes, services, transactions, and audit writers.
5. Legally relevant database operations write their audit event in the same transaction.
6. Operations involving PDF, storage, email, reports, or other external effects enqueue a durable audit outbox record atomically with business state.
7. The outbox is deduplicated, retryable, safe for concurrent processors, and capable of entering `DEAD` after ten attempts.
8. Audit metadata is schema-controlled and sanitized to prevent storage of prohibited PII, document content, credentials, or generation payloads.
9. All protected API routes use the canonical wrapper; internal routes require their own system secret.
10. The former Prisma audit middleware and second Prisma Client were removed.
11. Canonical and legacy audit consumers remain separate to prevent double counting.
12. The configured QA environment passed database, code, integration, E2E, production-build, and manual-browser checks.

## Decisions confirmed before implementation

The following decisions were supplied or approved by the user:

- Make `ActivityEvent` canonical and keep old `AuditLog` data read-only.
- Require durable audit for legally relevant business actions.
- Use an outbox when external work is involved.
- Permit all active users to read and export their own office audit, without adding an administrator-only restriction.
- Keep audit records indefinitely during this phase.
- Record successful login, logout, identified access denials, and business activity in NOTIFICA IA.
- Leave invalid credential attempts in Supabase Auth.
- Build the app-wide foundation, migrate the hot workflow first, then migrate remaining routes before deleting the previous middleware.

## Initial baseline

Before implementation, the established baseline was:

- ESLint: no errors.
- TypeScript: no errors.
- Integration suite: 56 of 56 tests passed.
- The repository already had user-owned modified and untracked files.

The following pre-existing user changes were explicitly preserved:

- `app/(protected)/ajustes/estampos/EstampoForm.tsx`
- `app/(protected)/ajustes/estampos/VariableToolbar.tsx`
- `app/(protected)/recibos/page.tsx`
- `app/(protected)/roles/[id]/diligencias/EjecutarWizard.tsx`
- `app/api/diligencias/[id]/estampo/preview/` was already untracked.
- `lib/estampos/legacy.ts` was already untracked.

The preview route intersected the authentication work and received the minimum necessary wrapper/identity-query changes. The other user changes were not reverted.

## Repository safety rules followed

The repository `AGENTS.md` requires the following order before implementation or schema-dependent work:

```powershell
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
```

These commands were run in the required order before schema work. `prisma migrate dev` was never used.

The same rule remains mandatory for future work.

## Database implementation

### Migration 1: additive canonical audit foundation

File:

`prisma/migrations/20260727160000_add_canonical_activity_audit/migration.sql`

This migration performs the following additive changes:

- Creates enums:
  - `ActivityActorType`: `USER`, `SYSTEM`
  - `ActivitySource`: `WEB`, `INTERNAL`, `SYSTEM`
  - `ActivityOutboxStatus`: `PENDING`, `PROCESSING`, `PROCESSED`, `DEAD`
- Adds nullable, unique `users.authUserId` for the safe backfill stage.
- Makes `activity_events.userId` nullable for system actors.
- Adds to `activity_events`:
  - `actorType`
  - `source`
  - `requestId`
  - `eventVersion`
  - `deduplicationKey`
- Adds a unique index over `(officeId, deduplicationKey)`.
- Adds query indexes for office, user, event type, module, result, date, and request ID.
- Adds historical `audit_logs` indexes for office/date, user/date, table/date, and action/date.
- Creates the `activity_outbox` table with actor, source, office, user, request, payload, deduplication, retry, error, and processing fields.
- Adds outbox uniqueness and processing indexes.
- Creates `prevent_activity_history_mutation()`.
- Installs append-only triggers rejecting `UPDATE` and `DELETE` on both `activity_events` and `audit_logs`.

### Migration 2: mandatory authentication linkage

File:

`prisma/migrations/20260727163000_require_auth_user_id/migration.sql`

This migration:

- Counts users that still have `authUserId IS NULL`.
- Aborts with a descriptive error if any user remains unresolved.
- Applies `NOT NULL` only when every local user is linked.

### Prisma schema result

File: `prisma/schema.prisma`

Important final models/fields:

- `User.authUserId String @unique`
- `ActivityEvent.userId` nullable
- `ActivityEvent.actorType`
- `ActivityEvent.source`
- `ActivityEvent.requestId`
- `ActivityEvent.eventVersion`
- `ActivityEvent.deduplicationKey`
- `ActivityOutbox` with all four processing states and required indexes

### Supabase user backfill

File: `scripts/backfill-auth-user-ids.ts`

Command:

```powershell
npm run db:backfill:auth-users
npm run db:backfill:auth-users -- --apply
```

Behavior:

- Dry-run is the default.
- Database mutation requires explicit `--apply`.
- Uses `SUPABASE_SERVICE_ROLE_KEY` and the Supabase Admin API.
- Paginates Supabase users.
- Matches only exact normalized email addresses.
- Stops on missing or ambiguous matches.
- Does not print secrets.
- Verifies that no local user remains unlinked after apply.

The configured database completed the backfill at 100%: 1 local user, 1 linked Supabase identity.

### QA seed protection

Files:

- `scripts/qa-seed.ts`
- `scripts/qa-support.ts`

Database mutations are permitted only when both conditions are true:

```text
NEXT_PUBLIC_ENVIRONMENT is local, test, or qa
QA_ALLOW_MUTATIONS=true
```

The seed aborts otherwise, including in production. This barrier was explicitly exercised during final testing: a run without the variables was rejected before mutation.

The QA seed now resolves and stores the real Supabase Auth UUID. It does not create an unlinked application user.

## Canonical authentication implementation

### Supabase SSR update

`@supabase/ssr` was upgraded to the compatible `0.10.x` line. The installed package declaration is `^0.10.0`.

Supabase helpers were consolidated around the current cookie API using `getAll`/`setAll`.

Relevant files:

- `lib/supabaseServer.ts`
- `middleware.ts`
- `lib/auth-server.ts`
- `lib/auth-core.ts`

### Request context

The API wrapper now supplies a `RequestContext` containing:

```ts
{
  id: string
  authUserId: string
  email: string
  officeId: number
  officeName: string
  isOfficeAdmin: boolean
  user: AuthUser
  requestId: string
  actorType: 'USER'
  source: 'WEB'
}
```

The flattened identity fields remain available for compatibility with existing handlers, while `context.user` provides the explicit canonical user object.

### Identity resolution contract

`resolveCanonicalUser` performs exactly:

1. One Supabase authenticated-user resolution.
2. One local user lookup by `authUserId`.
3. Active/provisioned validation from the returned local user row.

There is no second office-existence query and no business identity is trusted from a client-supplied header.

Final response distinctions:

| Condition | HTTP | Code |
| --- | ---: | --- |
| Invalid or missing session | 401 | `UNAUTHORIZED` |
| Valid Supabase user without a local account | 403 | `USER_NOT_PROVISIONED` |
| Local account disabled | 403 | `ACCOUNT_DISABLED` |
| Supabase or database infrastructure failure | 503 | `SERVICE_UNAVAILABLE` |

Disabled users are blocked immediately even when a session was already open. Their local Supabase session is signed out, and the disabled-account route redirects them to login with a specific message.

### API wrapper

File: `lib/api/server.ts`

`withApiUser(request, operation, handler)` now:

- Resolves the canonical request context.
- Executes the route handler inside request-scoped audit state.
- Reuses the same identity and request ID.
- Returns `x-request-id` on successful and failed responses.
- Records identified denials/failures as best-effort events.
- Adds a best-effort fallback event for a mutation only when the route/service did not record its own event.
- Avoids duplicate success events through `requestEventWasRecorded()`.

### Request IDs and middleware

`middleware.ts` now:

- Validates an incoming `x-request-id` against the allowed character/length format.
- Generates a UUID when no valid value is supplied.
- Propagates the ID into the request and response.
- Manages only Supabase session/cookie refresh.
- Preserves private/no-cache behavior.
- Does not resolve the local business user or trust identity headers from the browser.

### Protected server rendering

Protected server-rendered pages use a memoized resolver for the render tree, preventing repeated identity resolution during one render.

### `/api/user/me`

The endpoint remains compatible with existing `id` and `email` consumers and now includes:

- `officeId`
- `isOfficeAdmin`

Unused Supabase metadata is no longer returned as application identity.

### Removed authentication/audit infrastructure

Deleted:

- `lib/prismaNoMiddleware.ts`
- `lib/prisma/auditMiddleware.ts`

`lib/prisma.ts` is the only application Prisma Client. No Prisma `$use` audit middleware remains.

## Canonical auditing implementation

### Event catalog and validation

Relevant files:

- `lib/audit/catalog.ts`
- `lib/audit/activityEventCore.ts`
- `lib/audit/activityEvent.ts`
- `lib/audit/businessEvents.ts`
- `lib/audit/requestState.ts`

The catalog and sanitizer define event families, module classification, descriptions, result, criticality, and allowed metadata.

Metadata controls include:

- IDs, office IDs, ROL IDs, receipt/document numbers, versions, counts, and changed-field names are allowed.
- Approved before/after values are limited to operational/legal fields such as status, legal dates, amounts, payment method, and approved references.
- Lists are capped at 100 elements.
- Text is capped at 240 characters.
- Nested metadata is bounded and sanitized.
- Prohibited keys/content include personal names, unmasked emails, RUT, phones, addresses, notes, searches, email subject/body, PDF or document text, credentials, secrets, prompts, tokens, and generation variables.

The design records one business event per operation, not one event per affected database row.

### Internal audit APIs

`recordCriticalEvent(tx, context, event)`:

- Writes `ActivityEvent` through the supplied Prisma transaction.
- Propagates any failure.
- Ensures a legally relevant business transaction cannot commit without its event.

`recordBestEffortEvent(context, event)`:

- Handles observational events, failures, and access denials.
- Does not falsify or block a business commit.
- Produces safe error diagnostics rather than exposing payloads.

`enqueueExternalEvent(tx, context, event)`:

- Creates an outbox record inside the business transaction.
- Uses a validated payload and deduplication key.
- Makes audit materialization durable for flows with external side effects.

### Event families migrated

The implementation covers the requested application families:

- Authentication: successful login and logout.
- Roles/demands/executed parties: create, edit, state change, and delete paths.
- Diligences/notifications: create, edit, schedule, complete, and delete paths.
- Documents/receipts/stamps: generation, regeneration/versioning, download, payment, boleta association, and undo paths.
- Settings/catalogs: abogados, bancos, comunas, materias, procuradores, tribunales, diligence types, aranceles, stamps, and PDF-related configuration.
- Bulk operations: explicit single business events for `createMany`, `updateMany`, `deleteMany`, upsert-like, and raw/complex service operations.
- Email/replies: sending, test delivery, resend, synchronization, classification/resolution-related flows.
- Reports: daily/monthly generation, delivery, download/export paths.
- Security: identified access denials and audit exports.

### Hot workflow implementation

Receipt generation:

- Reuses one request context.
- Writes one `receipt.generated` or `receipt.regenerated` outbox item.
- Includes only approved receipt/document/version/amount/notification identifiers and values.
- Attempts targeted materialization immediately after commit.

Stamp generation:

- Enqueues one `stamp.generated` event for the completed generation.
- Does not create three audit rows for related document rows.
- Covers both custom/legacy-compatible and wizard generation paths.

Notification update/delete:

- Business mutation and critical audit event share a transaction.
- Metadata contains changed field names and approved related counts.
- No personal payload is copied into the event.

## Activity outbox

Relevant files:

- `lib/audit/outbox.ts`
- `lib/audit/outboxCore.ts`
- `app/api/internal/activity-outbox/process/route.ts`

Processor behavior:

- Claims no more than 50 rows per general batch.
- Uses a transaction with `FOR UPDATE SKIP LOCKED` semantics.
- Moves claimed rows to `PROCESSING` before processing.
- Inserts canonical events with `(officeId, deduplicationKey)` protection.
- Supports an optional exact outbox ID for immediate post-commit processing.
- Retries at 1, 5, 15, and then 60-minute intervals.
- Marks a row `DEAD` after ten attempts.
- Stores only a summarized/sanitized error.
- Marks successfully materialized rows `PROCESSED`.
- Is safe when two processors run concurrently.

The endpoint is protected by `ACTIVITY_OUTBOX_SECRET`:

```text
POST /api/internal/activity-outbox/process
```

PDF generation, storage, and email remain synchronous in this phase. The outbox durably materializes audit events; it is not yet a general-purpose background job queue.

## Audit queries and user interface

### Canonical versus legacy sources

`GET /api/logs` defaults to `ActivityEvent`.

`source=legacy` reads only `AuditLog`.

No summary combines both sources. This prevents historical activity from being counted twice.

Exports require an explicit source:

- `activity`
- `legacy`

Audit export is a critical action. If its audit event cannot be committed, the file is not delivered.

### UI behavior

Files:

- `app/(protected)/ajustes/logs/page.tsx`
- `app/(protected)/ajustes/logs/components/ExportButtons.tsx`

The logs screen has:

- A canonical activity view.
- A historical legacy tab.
- Office-scoped filters and pagination.
- Separate export behavior for each source.

All active users in an office retain read/export access. No administrator-only rule was introduced.

### Other consumers

The following now use only `ActivityEvent`:

- Dashboard activity.
- Recent activity.
- Role timeline.
- Daily audit reporting.
- Monthly audit reporting.
- Canonical summaries and exports.

### Removed event fabrication endpoint

`POST /api/logs` was removed. No browser/API client can submit arbitrary canonical events.

## Static enforcement

File: `scripts/verify-auth-audit.mjs`

Command:

```powershell
npm run check:auth-audit
```

The check fails when it detects:

- An import/reference to `prismaNoMiddleware`.
- An import/reference to `auditMiddleware`.
- Registration of Prisma `$use` middleware.
- Any application write through `prisma.auditLog.create/update/delete/upsert/createMany/updateMany/deleteMany`.
- A protected API route that does not use `withApiUser`.
- A protected API route importing the old authentication resolver directly.

Internal routes, `/api/ping`, and the existing `/api/log` exception are treated separately.

The final run checked 268 source files and passed.

## QA and automated test infrastructure

### Automatic QA authentication

File: `scripts/qa-auth-state.ts`

Command:

```powershell
npm run qa:auth:auto
```

It:

- Finds the linked active QA user.
- Uses Supabase Admin to generate a one-time link/token.
- Verifies the token server-side.
- Writes Playwright storage state without printing credentials.
- Confirms the returned Supabase user ID equals local `authUserId`.

The temporary `.auth/supabase-user.json` file was deleted after final QA.

### Full QA runner

File: `scripts/run-qa-tests.ts`

Command:

```powershell
$env:NEXT_PUBLIC_ENVIRONMENT='qa'
$env:QA_ALLOW_MUTATIONS='true'
npm run test:qa
```

Execution order:

1. Seed QA data.
2. Refresh authenticated Playwright state.
3. Run integration tests.
4. Run authenticated Playwright tests.
5. Reset QA data in cleanup/finalization.

### New integration coverage

Files:

- `tests/integration/auth-core.test.ts`
- `tests/integration/activity-event-core.test.ts`
- `tests/integration/canonical-audit-foundation.test.ts`
- `tests/integration/outbox-core.test.ts`

Coverage includes:

- Exactly one Supabase resolution and one local identity query.
- Active, disabled, unprovisioned, invalid-session, and infrastructure-failure cases.
- Metadata validation and redaction.
- Critical-event transaction behavior.
- No success event after rollback.
- Outbox retry schedules and `DEAD` transition.
- Deduplication and concurrent-processing behavior.
- Append-only database protection.
- Legacy read-only behavior.
- Removal of unsafe logging mechanisms.

### Authenticated E2E coverage

File: `e2e/workflows.spec.ts`

The final Playwright suite verifies:

- Demand creation.
- Diligence creation.
- Notification creation and update.
- Custom stamp generation.
- Wizard stamp generation.
- Receipt generation.
- XLSX export.
- Exactly one canonical event per successful business action.
- Exactly one successful event for each successful request ID.
- Presence and format of `x-request-id`.
- Absence of prohibited metadata and representative PII/document strings.
- Zero new rows in `AuditLog`.
- Invalid/unauthenticated requests return the expected status.
- Cross-office role reads and updates are blocked and do not mutate data.
- A disabled user with an already-open session receives `403 ACCOUNT_DISABLED` immediately.
- The disabled QA user is restored to active in `finally` cleanup.

## Verification results

### Required gates

| Gate | Final result |
| --- | --- |
| `npm run check:utf8` | Passed |
| `npm run lint` | Passed; no ESLint warnings or errors |
| `npx tsc --noEmit` | Passed |
| `npm run check:auth-audit` | Passed; 268 files checked |
| `npm run test:integration` | Passed; 16 files, 68 tests |
| `npm run build` | Passed; Next.js 14.2.33 production build |
| `npm run test:qa` | Passed |
| Playwright portion of QA | Passed; 3 of 3 tests |
| `git diff --check` | Passed; line-ending notices only |

The integration baseline increased from 56 tests to 68 tests.

### Final QA timing from the last complete run

- Integration: 68/68 in approximately 3.57 seconds.
- Playwright workflow 1: approximately 31.2 seconds.
- Playwright safety workflow: approximately 16.1 seconds.
- Disabled-account workflow: approximately 1.5 seconds.
- Playwright total: 3 tests passed in approximately 1 minute.
- Full QA runner: approximately 106 seconds.

### Final configured database state

- Prisma migrations discovered: 32.
- Prisma migration status: database schema is up to date.
- Local users: 1.
- Users linked through non-empty `authUserId`: 1.
- Active users: 1.
- Outbox rows: 33.
- Outbox status: all 33 `PROCESSED`.
- Outbox `PENDING`: 0.
- Outbox `PROCESSING`: 0.
- Outbox `DEAD`: 0.
- Append-only trigger `activity_events_append_only`: present.
- Append-only trigger `audit_logs_append_only`: present.

`information_schema.triggers` reports each trigger once for `UPDATE` and once for `DELETE`, which is why the raw verification output contained each trigger name twice.

## Manual software verification

The application was started locally and exercised through an authenticated browser session.

Manually checked:

- Dashboard rendered and showed the office workspace.
- Audit page rendered the canonical activity table.
- Historical/legacy tab switched and loaded independently.
- Audit export controls were visible.
- Roles list rendered.
- A real existing ROL opened successfully.
- Role history/timeline loaded.
- Receipts page rendered with export controls.
- Reports page rendered daily/monthly controls.
- Logout completed and returned to the login screen.
- A clean browser tab showed no browser console warnings/errors on dashboard and audit pages.

The full data-generation workflows, PDFs, stamp variants, receipt, and XLSX validation were covered by Playwright and programmatic file assertions. The browser review focused on rendered UI/navigation and session behavior.

## Additional defect found and fixed during manual QA

Manual testing found that a seeded ROL returned 404 from the list page.

Root cause:

- `/api/roles` queried `Demanda` rows and returned `Demanda.id` as the response `id`.
- `/roles/[id]` and `/api/roles/[id]` expect `RolCausa.id`.
- Older production-like records often used the same ID for both entities, hiding the mismatch.
- A QA fixture intentionally had different `Demanda.id` and `RolCausa.id`, exposing the bug.

Fix:

- `app/api/roles/route.ts` now exposes `RolCausa.id` as `id` for role navigation.
- It preserves the underlying demand identifier as `demandaId`.
- A Playwright regression verifies a fixture whose two IDs differ, confirms the list contract, and opens the detail API successfully.

The entire QA suite and production build were rerun after this fix.

## Temporary artifacts and cleanup

After final verification:

- QA records were reset.
- The QA user was restored to active.
- `.auth/supabase-user.json` was deleted.
- The empty `.auth` directory was removed.
- `test-results/` was deleted.
- Temporary browser-auth routes/scripts were deleted.
- Temporary verification scripts were deleted.
- Local development server processes used for manual QA were stopped.
- Existing unrelated `.codex-*.log` files were left untouched.

## Production deployment requirements

The code foundation is complete, but these environment/operations steps must be performed for each production deployment target.

### Deployment A

1. Back up/confirm the target database.
2. Run the required Prisma startup sequence.
3. Deploy the additive migration.
4. Configure `SUPABASE_SERVICE_ROLE_KEY` securely.
5. Run the auth-user backfill in dry-run mode.
6. Resolve every missing/ambiguous email.
7. Apply the backfill.
8. Verify 100% linkage before proceeding.

### Deployment B

1. Apply the `authUserId NOT NULL` migration.
2. Deploy canonical authentication and auditing code.
3. Configure `ACTIVITY_OUTBOX_SECRET`.
4. Schedule `POST /api/internal/activity-outbox/process` at least every minute.
5. Confirm canonical audit consumers and legacy tab behavior.
6. Keep both historical tables and additive migrations during rollback.

### Monitoring still requiring external platform configuration

The repository contains the endpoint and required state, but no hosting/monitoring provider was selected in this work. The deployment operator must wire:

- Outbox pending count.
- Oldest pending row age.
- Any `DEAD` row alert.
- Critical audit insertion failures.
- Authentication `401`, `403`, and `503` rates.
- Handler and authentication p50/p95 latency.
- Sudden increases in authentication failures.

Recommended alerts:

- Alert immediately when any row is `DEAD`.
- Alert when the oldest pending outbox row exceeds five minutes.
- Alert on a material increase in authentication failures or service-unavailable responses.

## Environment variables introduced or relied upon

Never record their values in issues, logs, commits, or future chat transcripts.

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
NEXT_PUBLIC_ENVIRONMENT
QA_ALLOW_MUTATIONS
ACTIVITY_OUTBOX_SECRET
```

The canonical outbox configuration is documented in `.env.example`.

## Non-blocking warnings observed

The completed gates had no functional failures. The tooling emitted these maintenance warnings:

- `baseline-browser-mapping` data was more than two months old.
- `caniuse-lite`/Browserslist data was approximately nine months old.
- Node emitted `DEP0190` because the QA runner uses a child process with `shell: true`.
- The installed Prisma CLI reported that a newer major version exists; no major upgrade was attempted during this security remediation.
- An earlier dependency installation reported 18 audit findings: 1 low, 3 moderate, and 14 high. No blind `npm audit fix` was run because dependency remediation was outside this change and could introduce breaking upgrades.

These warnings should be handled in a separate dependency/tooling maintenance task rather than mixed with authentication/audit rollout.

## Working tree and change ownership

At final inspection, the worktree remained intentionally dirty with implementation changes and the user's prior edits. There were approximately 141 modified/deleted/untracked entries because the migration touched nearly every protected route plus tests and migrations.

No files were staged, committed, reset, or force-checked-out.

Before future changes:

1. Run `git status --short`.
2. Preserve the pre-existing user files listed in the Initial baseline section.
3. Do not use `git reset --hard` or `git checkout --` to clean the tree.
4. Review and commit the authentication/audit change as a deliberate unit when requested by the user.

## Key implementation files

### Database and migration

- `prisma/schema.prisma`
- `prisma/migrations/20260727160000_add_canonical_activity_audit/migration.sql`
- `prisma/migrations/20260727163000_require_auth_user_id/migration.sql`
- `scripts/backfill-auth-user-ids.ts`

### Authentication

- `lib/auth-core.ts`
- `lib/auth-server.ts`
- `lib/api/server.ts`
- `lib/supabaseServer.ts`
- `middleware.ts`
- `app/api/user/me/route.ts`
- `app/auth/disabled/route.ts`
- `app/logout/route.ts`

### Canonical audit and outbox

- `lib/audit/activityEvent.ts`
- `lib/audit/activityEventCore.ts`
- `lib/audit/businessEvents.ts`
- `lib/audit/catalog.ts`
- `lib/audit/outbox.ts`
- `lib/audit/outboxCore.ts`
- `lib/audit/requestState.ts`
- `app/api/internal/activity-outbox/process/route.ts`

### Audit consumers

- `app/api/logs/route.ts`
- `app/api/logs/export/route.ts`
- `app/api/logs/recent/route.ts`
- `app/api/logs/summary/route.ts`
- `app/(protected)/ajustes/logs/page.tsx`
- `app/(protected)/ajustes/logs/components/ExportButtons.tsx`
- `lib/dashboard/activity.ts`

### QA and enforcement

- `scripts/verify-auth-audit.mjs`
- `scripts/qa-auth-state.ts`
- `scripts/qa-seed.ts`
- `scripts/qa-support.ts`
- `scripts/run-qa-tests.ts`
- `tests/integration/auth-core.test.ts`
- `tests/integration/activity-event-core.test.ts`
- `tests/integration/canonical-audit-foundation.test.ts`
- `tests/integration/outbox-core.test.ts`
- `e2e/workflows.spec.ts`

## Future-chat resumption checklist

A future conversation should begin with:

1. Read this report completely.
2. Read the repository `AGENTS.md`.
3. Inspect `git status --short` without cleaning the worktree.
4. Run the Prisma commands in the mandated order:

   ```powershell
   npx prisma migrate status
   npx prisma migrate deploy
   npx prisma generate
   ```

5. Never use `prisma migrate dev` unless the user explicitly overrides the repository rule.
6. Run at minimum:

   ```powershell
   npm run check:utf8
   npm run lint
   npx tsc --noEmit
   npm run check:auth-audit
   npm run test:integration
   npm run build
   ```

7. For destructive QA mutation tests, explicitly use only a local/test/QA environment:

   ```powershell
   $env:NEXT_PUBLIC_ENVIRONMENT='qa'
   $env:QA_ALLOW_MUTATIONS='true'
   npm run test:qa
   ```

8. Confirm cleanup after QA:
   - QA user active.
   - No QA business rows left behind.
   - No `.auth/supabase-user.json` retained.
   - No `test-results/` artifact retained unless needed for failure diagnosis.
9. Do not reintroduce `AuditLog` writes, Prisma audit middleware, a second Prisma Client, or direct protected-route authentication resolution.
10. Treat `ActivityEvent` as canonical and `AuditLog` as legacy read-only data.

## Final acceptance statement

Within the configured workspace and QA environment, the authentication and canonical-audit remediation passed all required automated gates and the documented manual UI checks.

The final verified invariants were:

- Every local user is linked to Supabase Auth.
- Disabled accounts are blocked immediately.
- Critical business operations cannot commit without durable audit.
- Tested actions produce exactly one canonical success event.
- `AuditLog` receives no new application writes.
- Canonical metadata excludes the tested prohibited PII/document values.
- Office isolation is enforced for tested reads and writes.
- No former audit middleware or second Prisma Client remains.
- The outbox contains no pending or dead work after final QA.
- Legacy audit data remains accessible separately and append-only.

Production readiness therefore depends only on executing the staged deployment procedure and configuring the external scheduler/monitoring integration described above.
