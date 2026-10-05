# FIRMAR DIGITAL IMPLEMENTATION

This file is the central record for all Firmar Digital implementation notes,
decisions, phase results, and verification evidence. Add future implementation
notes here as subsequent phases are completed.

**Current storage policy, October 1, 2026 (agent 0.13.0):** signed PDFs now use a
shared, cloud-backed office archive with an on-demand Windows folder on every
authorized device, including signer-only laptops. The folder shows the last
**50 elapsed days**; older signed documents remain searchable and retrievable in
the application. New signatures and enrollments no longer schedule automatic PDF
copies to every PC. A storage-provider adapter supports a later move from
Supabase object storage to a dedicated archive server without changing how users
find or retrieve documents. See the
[current behavior, storage contract and rollout evidence](#shared-office-storage-update-october-1-2026).
Earlier delivery/mirror sections and the September 28 installed pilot are
historical evidence; their automatic-delivery behavior is superseded by this
policy after the updated backend and Windows agents are deployed. The 0.13.0
release package is prepared locally, not yet published or installed by this work.

**Deployment policy update, September 24, 2026:** the owner selected unsigned,
personally managed installation by remote control. A purchased code-signing
certificate is no longer a prerequisite for that path. Follow
`agents/windows/release/managed/INSTALACION.md` and `GUIA_GITHUB.md` for the current
package. Earlier signed-installer requirements describe the retained optional
Authenticode system.

**Pilot status update, September 28, 2026:** elevated managed installation and
enrollment succeeded on GONZA (signer) and JARVIS (one separate receiver), with
an installation recovery workaround on JARVIS. Two manual requests processed
three real token-signed documents, accepted by the server and automatically
delivered to JARVIS. Full pilot acceptance and production activation remain
pending. See the September 28 results below and the
[Phase 11 runbook](signing/PHASE-11-RUNBOOK.md). Earlier dated statements that no
installation or remote hardware signing had occurred describe those earlier
sessions, not the current status. A publisher certificate remains optional for
the selected managed distribution path.

## Current signing policy — remote office session (September 23, 2026)

Any authenticated, active member of the receptor's office can authorize new
signatures from any computer. Administrator rights are required for recovery,
cancellation and device management, not for requesting a signature. On the token
computer, the configured Windows operator explicitly enables **Sesión de firma
remota…** with consent and one local PIN entry. Requests then run without local
per-document approval while that session remains active, for at most eight hours.
The PIN is cleared after one PKCS#11 login; it is never persisted or transmitted
to the web/server. Closing the session, restarting the service, expiry or a
token/engine failure disables signing until local reactivation. Closing the tray
window alone leaves the session active. Requests waiting in the queue can execute
when a session is enabled; review the queue before enabling it.

The phase sections below retain dated test evidence. Their current operational
instructions have been revised to this policy. Historical controlled-test approval
dialogs are test utilities, not the enrolled agent's production authorization flow.

## Scope and sequencing

The owner explicitly authorized phases 1 and 2 before Phase 0 provider/token
confirmation. This exception does not authorize real signing, a stored PIN,
automatic workflow enqueue, public device endpoints, Windows software, or UI.
Those remain in their respective later phases.

Prisma remains the migration authority for this repository. The required startup
sequence was run: `prisma migrate status`, `prisma migrate deploy`, then
`prisma generate`. The initial sandbox network failures were resolved by running
the database commands with network access. `prisma migrate dev` was never used.

## Phase 1

Migration: `prisma/migrations/20260909120000_add_signing_foundation/migration.sql`.

The migration creates `SigningDevice`, `DeviceEnrollment`, `SigningJob`,
`SigningItem`, `SigningAttempt`, `DocumentSignature`, and `DocumentDelivery`, with
the seven requested enum families. Provider metadata is generic. Device identity
stores only a public key; enrollment stores only a SHA-256 secret hash. No PIN,
private signing key, database password, or unrestricted storage credential field
is introduced.

All signing relationships include the office in their foreign keys. Jobs and
enrollments also constrain their requesting/creating user to the same office.
Signature source and output versions must belong to the same document and office.
Delivery records must refer to a signature and receiver in the same office.

To make document tenancy enforceable in PostgreSQL, `Documento` and
`DocumentoVersion` gain non-null `officeId` columns. Existing values are backfilled
through `RolCausa`. Insert triggers derive the office for existing writers that
omit it; explicit forged office values are rejected by composite foreign keys.
Parent office transfers cannot invalidate these relationships.

Once a version is referenced by signing work, its storage locator, checksum,
length, MIME type, deletion state, document and office cannot change. Signed
evidence is append-only. Unsigned and signed versions remain separate rows.

Uniqueness includes office/job idempotency, job/source version, one active
source/signer reservation across jobs, one signature per source/signer, one
signature per signed output, one attempt number per item, and one delivery per
signature/receiver. Indexes support office/status queues, device lease expiration,
document signature history and pending receiver delivery.

The existing application data policy is preserved: Prisma-only access, RLS
enabled, and no Data API grants or permissive policies for the signing tables.
`PUBLIC`, `anon`, `authenticated` and `service_role` have no table grants. This
deliberately denies even same-office direct browser Data API access. Future APIs
must authenticate users/devices and call the office-scoped backend service.

## Phase 2

`lib/signing/core.ts` holds validated inputs, complete item/job transition maps,
batch aggregation, source eligibility, bounded retry delay and error-code mapping.
`lib/signing/service.ts` is guarded by `server-only` and separates Prisma
orchestration from those pure rules.

Service methods:

| Method | Contract |
| --- | --- |
| `createJob(context, input)` | Validate active office membership and exact current, non-voided Estampo PDF versions; atomically create a job, items and audit event. |
| `getJob(context, jobId)` | Return only the active user's office job and its attempts/evidence. |
| `claim(officeId, deviceId, durationMs)` | Authorize the signer, recover expired work and atomically reserve an eligible item. |
| `renew(lease, durationMs)` | Extend only an unexpired lease held by the exact device and claim token. |
| `start(lease)` | Recheck the source and mark the start of irreversible signing work. |
| `release(lease)` | Safely release work that has not started signing. |
| `fail(lease, errorCode)` | Close the attempt and choose bounded retry, operator action or permanent failure. |
| `complete(lease, evidence)` | Accept independently validated evidence, bind an existing output version and atomically record success. |
| `retry(context, itemId)` | Office-admin recovery for eligible failures, within the attempt limit. |
| `cancel(context, itemId)` | Office-admin cancellation before signing begins; repeat cancellation is harmless. |
| `recoverExpired(context)` | Office-admin sweep of up to 100 expired items; claim also runs this recovery. |

### Stable integration decisions

- **Signer identity:** the lowercase SHA-256 fingerprint of the certificate DER,
  independent of a device ID or a middleware's SHA-1 thumbprint display. A job
  requires this configured identity. A future automatic enqueue implementation
  must resolve the office's signer configuration before submitting work.
- **Concurrency:** transaction-scoped advisory locks serialize queue mutations
  within one office. Different offices proceed independently. This makes job
  aggregation, claim, cancellation and idempotency atomic without holding any
  transaction open during PDF processing. Later throughput changes must preserve
  this lock discipline or replace it with equivalent tested guarantees.
- **Lease fence:** every claim generates a fresh random UUID, even when the same
  device reclaims the item. Device ID alone is never sufficient. Database time
  controls lease expiration and backoff.
- **Expired work:** expired `CLAIMED` work may be reassigned within the attempt
  limit. Expired `SIGNING` work becomes `WAITING_FOR_OPERATOR`; the backend cannot
  assume an irreversible token operation never occurred. Operator recovery must
  investigate the prior artifact before explicitly retrying or cancelling.
- **Retry policy:** exact recognized infrastructure codes can retry with bounded
  exponential backoff. A wrong PIN never retries automatically. Unknown error
  objects/text become a fixed generic message; arbitrary exception text is never
  persisted in signing attempts or canonical events.
- **No silent downgrade:** requested levels are PAdES-LT or PAdES-LTA; completion
  cannot satisfy an LTA request with LT. Actual cryptographic checks remain Phase 7.
- **Idempotency:** the same office/key and normalized request returns the original
  job. Reusing a key with changed input fails. Duplicate successful callbacks only
  succeed for the original successful lease and the same artifact identity.
- **Evidence boundary:** `complete()` is an internal trusted-validator boundary,
  not an HTTP result-submission endpoint. It checks structural identity, tenancy,
  version/checksum and requested level. Phase 7 must independently verify the PDF,
  certificate, TSA and revocation evidence before calling it. The fake worker
  proves orchestration only and does not create a cryptographically signed PDF.
- **Version promotion/delivery:** phase 2 does not update `Documento.currentVersionId`,
  upload storage objects, or enqueue delivery. Those are phases 7 and 9.
- **Audit:** all critical queue mutations and aggregate status changes write
  catalog-validated canonical activity events in the same transaction. Audit
  persistence failure rolls back the domain mutation. Lease secrets and raw
  errors are excluded from event metadata.

## Verification and reproduction

Run `npm run test:signing` for the pure rules and validation tests.

Run `npm run test:signing:database` with access to the configured PostgreSQL database:

- Phase 1 uses a rollback-only transaction against the deployed public tables.
  It proves cross-office FK rejection, checksum binding, immutable versions,
  uniqueness and CRUD denial under both client roles. Temporary grants inside
  the same rolled-back transaction separately verify default-deny RLS.
- Phase 2 clones the deployed table definitions, enums, constraints, indexes and
  triggers into a uniquely named disposable schema. Real independent Prisma
  transactions commit and race there. Cleanup drops only that generated schema,
  preserving application documents, offices, signatures and append-only history.
  The tests exercise the real orchestration service with synthetic version metadata
  and no storage writes or signing hardware.

Database tests are explicitly opt-in and skipped by the ordinary integration run.
They require schema creation privileges in addition to the usual migration role.

### Database observations

The signing migration deployed successfully to the configured database. The
schema comparison reports no differences in the new signing tables or document
office columns. It does report pre-existing legacy tables, extra audit indexes,
timestamp defaults and older index names elsewhere in the application. These
unrelated differences were not changed or reset.

Supabase's security advisor reports informational `rls_enabled_no_policy` entries,
consistent with the deliberate Prisma-only/default-deny policy. It also reports
the existing project-level leaked-password-protection setting as disabled. This
implementation does not change Auth settings. References:
[RLS advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Current Supabase changelog and RLS/API-security documentation were checked before
implementation. No applicable breaking change was found for this direct-Prisma,
PostgreSQL-only scope.

### Verified results (September 9, 2026)

- Prisma validation and generation passed; migration history reports 41 applied
  migrations with no pending migration.
- Database inspection confirms the signing migration is applied, with zero
  document-office or version-office mismatches after backfill.
- Standard integration suite: 271 passed; the 12 opt-in database tests are
  intentionally skipped in this command.
- Signing database suite: 12 passed, covering the rollback-only Phase 1 matrix
  and 11 real-worker scenarios in the disposable schema.
- TypeScript `tsc --noEmit --incremental false`, Next.js production build, lint,
  auth/audit static verification and UTF-8 checks passed.
- The fake worker demonstrated complete batch processing with one signature
  record per source, no duplicate success events, no document promotion, no
  receiver delivery creation, and no storage or token operation.

This proves phases 1 and 2 only. It does not establish token compatibility,
cryptographic validity, production signing, or delivery readiness.

### Follow-up environment and software verification (September 10, 2026)

- Re-ran Prisma migration status/deploy and client generation: 41 migrations,
  none pending, and generation successful.
- Re-ran the standard integration suite: 271 passed. Separately ran all 12
  signing database tests: all passed, including independent concurrent workers.
- Re-ran TypeScript, lint, auth/audit static verification and UTF-8 checks:
  all passed.
- `npm run verify:infrastructure` passed with zero warnings. Live configuration
  uses the transaction pooler for application queries and session pooler for
  migrations; database connectivity succeeded.
- Rebuilt the current checkout with `npm run build`: passed. Started that fresh
  production build at `http://127.0.0.1:3002`. Chrome inspection confirmed the
  login form renders and `/firmados` redirects to
  `/login?error=invalid_session` without a usable authenticated session.
- HTTP smoke checks: `/api/ping` returned 200 with request ID and server timing
  headers; anonymous `/api/user/me` returned 401; anonymous `/firmados` redirected
  to `/login?error=invalid_session`. The landing page returned 200.
- Authenticated manual inspection of document workflows remains pending a
  test-account login in the opened browser. It is not counted as passed.
  No production document was generated, modified, or signed for these checks.
- There is no signing UI operation to manually test in phases 1 and 2. The
  existing Firmados route is an empty application shell; its control center is
  Phase 8. The live fake-worker tests are the execution proof for Phase 2.
- Cleanup inspection after the repeat database run confirmed zero disposable
  `signing_test_*` schemas and zero synthetic signing-verification offices.
- These results covered Phase 1–2 before Phase 3 implementation began. They did
  not verify automatic workflow enqueue. That verification pass changed
  documentation only; the Phase 3 implementation and evidence follow below.

## Phase 3 — Automatic enqueue on workflow completion

Implemented September 10, 2026 under the owner's subsequent Phase 3 assignment.
This extends the earlier sequencing authorization: implementation and testing do
not require Phase 0 hardware. Production activation remains deliberately gated.
No schema migration, token operation, device assignment UI, manual bulk signing,
PDF cryptography, version promotion, or receiver distribution was added.

### Completion and transaction behavior

- `app/api/diligencias/[id]/complete/route.ts` reads the office-scoped diligence,
  validates that its ROL is writable, updates the requested legal date/notes,
  derives completion, enqueues eligible sources, and records the critical audit
  in one transaction. The response reads the final diligence after derivation,
  fixing the old response's stale `estado` value.
- The application's normal stamp and receipt generators already complete a
  diligence through `syncDiligenceWorkflowState`; they do not call `/complete`.
  The shared helper now also enqueues, covering stamp-last and receipt-last
  completion. Both stamp-generation responses and first receipt finalization
  include signing metadata. Notification edits and document mutations keep
  using that same helper. The legacy diligence update endpoint can no longer
  bypass derived completion by directly requesting `estado: completada`.
- `workflowTransaction` takes the existing signing office advisory lock before
  workflow/document mutations. This gives queue workers and completion writers
  the same lock order. Offices are independent; mutations inside one office
  serialize. Transactions allow 30 seconds with a 15-second acquisition wait.
- `createSigningJobInTransaction` reuses the Phase 2 validation and creation
  behavior without starting a nested transaction. Completion, pending items and
  canonical audit either commit together or all roll back. Document current
  pointers are row-locked while capturing their exact versions. The existing
  checksum-binding/immutability triggers continue protecting queued artifacts.
- The response waits only for this database transaction, never for a device,
  token, storage download, TSA request, or signing execution.

### Eligibility, identity and traceability

Only office-owned `Estampo` documents attached directly to the diligence or
through one of its notifications are candidates. Conflicting ROL/diligence/
notification associations are invalid. Foreign documents are filtered at the
query boundary and are not enumerated in responses or audit. A malformed pointer
to a foreign version is excluded without exposing that version's ID.

Each newly eligible source produces one pending `SigningItem` with the exact
`sourceVersionId` and `sourceChecksum`. One job contains the eligible batch;
an all-excluded batch creates no empty job. The existing limit is 500 eligible
items per job: larger batches fail atomically rather than silently truncating.

Exclusions returned and recorded as `signing.document_excluded` are:

| Reason | Meaning |
| --- | --- |
| `MISSING_PDF` | No current version, deleted version, missing storage identity, or empty PDF metadata. A legacy `pdfId` alone cannot pin a signing source. |
| `VOIDED` | The document or its notification is voided. |
| `ALREADY_SIGNED` | The current version is a signed output or already has signature evidence as a source. |
| `ALREADY_QUEUED` | The exact source already belongs to a non-failed/non-cancelled signing item; its job ID is returned. |
| `INVALID_STATE` | Invalid checksum/MIME type, foreign or mismatched current version, or conflicting workflow associations. |

Automatic enqueue avoids signed/queued sources even if the configured
certificate changes. It does not initiate an additional signature automatically.
Phase 2's internal explicit-job service retains its per-signer contract.
Phase 3 validates stored metadata; downloading bytes, proving object existence,
checking the actual hash, and cryptographic validation remain worker/Phase 7 work.

The helper stores `meta.signingCompletionEventId` and `meta.completadaEn` once
per derived completion event. Replays preserve both; a real transition back to
pending followed by completion gets a new event. General metadata editors read
and preserve these server-owned fields inside the transaction, preventing stale
form data or supplied metadata from replacing the event identity.

The job idempotency key hashes office, diligence, completion event, canonical
sorted source-version IDs and checksums, signer fingerprint, and requested PAdES
level. Valid sources remain in this identity after they become queued or signed,
so repeating a completion request finds the original job. Existing failed or
cancelled jobs are not automatically resurrected by the same request. A newly
generated source version has a new identity and can receive its own pending item.

`signing.completion_evaluated` connects the diligence/event to the job and counts.
Exclusions have individual catalog-validated events, avoiding the audit system's
array truncation limit. Deterministic event deduplication suppresses repeated
identical evaluations/exclusions. Neither PINs nor storage URLs are logged.

### API metadata and activation

`PUT /api/diligencias/:id/complete` retains `{ ok, data }` and adds top-level
`signing` containing `status`, `completionEventId`, `jobId`, `jobStatus`,
`queuedCount`, `existingJobIds`, and `exclusions`.

- `QUEUED`: this transaction created a job; `queuedCount` is newly queued items.
- `EXISTING_JOB`: an idempotent replay returned the original job and current status;
  newly queued count is zero.
- `NO_ELIGIBLE_DOCUMENTS`: completion succeeded but every candidate was excluded.
  Already queued sources can still be traced through `existingJobIds`/exclusions.
- `DISABLED`: rollout is off globally or this office is not configured.
- `NOT_COMPLETED`: shared workflow helpers did not derive completion; `/complete`
  itself rejects an incomplete diligence and rolls back its requested changes.

Server-only settings are documented in `.env.example`:

```dotenv
SIGNING_AUTO_ENQUEUE_ENABLED=false
SIGNING_AUTO_ENQUEUE_OFFICES={}
```

Activation requires the global value `true` and an entry keyed by the real office
ID, with `signerFingerprint` (64 lowercase SHA-256 hexadecimal characters) and
optional `requestedLevel` (`PADES_B`, `PADES_LT` by default, or `PADES_LTA`). Use the certificate
identity expected by the Phase 2 worker; never use a device ID, PIN, or private key.
Unlisted offices remain disabled. Malformed enabled configuration fails the
completion transaction with a fixed configuration error, rather than silently
losing an intended signing request.

The real `.env` was not changed and no production office was enabled by this
implementation. Enable only when the authenticated signing pipeline is ready,
so unattended jobs do not accumulate before the signer exists. There is no
automatic historical backfill: an enabled completion/re-evaluation invokes the
hook. Phase 0 is still required for real token/PAdES work.

### Related source preservation fix

Document and notification deletion previously removed storage objects before
attempting their database transaction. Queued-source foreign keys can reject
that transaction, leaving a retained queue item pointing to a removed PDF.
Storage cleanup now runs only after a successful database commit. If post-commit
storage cleanup fails, it logs a fixed operational warning; leftover unreferenced
objects may require cleanup. No external storage operation occurs in the tests.

### Phase 3 verification

`npm run test:signing` includes the pure queue rules and automatic configuration/
idempotency checks. `npm run test:signing:database` now includes the real completion
handler and workflow tests in addition to Phase 1–2. The disposable schema also
clones diligence types, diligences and notifications with deployed constraints.
Authentication is simulated at the existing `withApiUser` boundary; the handler,
Prisma transactions, workflow derivation, queue service and canonical audit are
real. Tests never create an Auth account, upload a PDF, or use signing hardware.

The test matrix covers concurrent completion replays; exact version/checksum
binding; notification-only linkage; missing, voided, malformed and foreign
sources; signed and queued exclusions across certificate changes; incomplete
and failed workflows; disabled and invalid configuration; late audit failure;
document-finalization rollback; stamp-last and receipt-last completion; new
versions; all-excluded batches; cancelled-job replay; metadata identity
preservation; reopened diligence; legacy route behavior; and storage preservation
when deleting a queued source is rejected.

Final verification results (September 10, 2026):

- Required Prisma startup sequence passed: 41 migrations, none pending, client
  generation successful. No new migration was needed.
- `npm run test:integration`: **274 passed**; the 24 opt-in database cases are
  intentionally skipped here and executed separately below.
- `npm run test:signing`: **120 passed** (included in the standard suite).
- `npm run test:signing:database`: **24 passed**: the original 12 Phase 1–2 cases
  and 12 Phase 3 cases. Test fixtures and fault-injection triggers ran exclusively
  in disposable schemas, except the existing rollback-only Phase 1 checks.
- TypeScript (`tsc --noEmit --incremental false`), production build, lint,
  auth/audit static checks (342 files), UTF-8 checks, and `git diff --check` passed.
- `npm run verify:infrastructure`: database connectivity passed, zero warnings;
  application queries use the transaction pooler and migrations the session pooler.
- Started the fresh production build locally. Landing page and `/api/ping`
  returned 200; `/firmados` redirected to login; an anonymous PUT to the completion
  endpoint returned 401. Each smoke response included a request ID. Stopped the
  verification server afterward to avoid leaving a Prisma DLL lock.
- Post-test inspection found **zero** `signing_test_*` schemas and **zero**
  synthetic signing-verification offices. Local automatic signing remains off.

| Phase 3 requirement | Authoritative verification |
| --- | --- |
| Completed eligible diligence creates one job | Real completion-handler race: both responses succeed, one job exists, each eligible source has one `QUEUED` item with its original checksum. |
| Repeated requests do not duplicate jobs | Concurrent and sequential handler replays preserve job/event/time; one `signing.requested` event; identical exclusions deduplicate. |
| Foreign and voided sources are excluded | Real malformed cross-office links and version pointers, voided document and notification fixtures; only the valid office-owned source queues, foreign IDs are absent from response. |
| Failed transaction leaves no completion or orphan job | Database trigger rejects final `diligence.completed` audit after enqueue: state, legal date and metadata roll back; job, item and audit counts are zero. Separate finalization failure also rolls back the document pointer. |
| Existing workflow remains valid | All 274 standard tests and the original 12 signing database tests pass; new shared-hook tests cover stamp-last, receipt-last, reopening, and the legacy update route. |
| Every newly eligible source is traceable | Stored item source/version/checksum assertions, completion evaluation audit, existing-job references, and new-version tests; no attempts/signatures/deliveries are created by the completion handler. |

Phase 3's backend exit criteria are verified under the enabled test configuration.
Production activation remains off as agreed. Authenticated browser generation of
real documents was not performed during this implementation run. This phase adds
no signing UI. Real PDF/token validity and end-to-end delivery are not claimed by
these results and remain later-phase work.

### Follow-up authenticated software verification — September 10, 2026

The subsequent verification request prompted inspection of the existing local
Playwright test-session file. That saved session was usable: no new account,
password change, or administrator-generated login was necessary. The earlier
missing-browser-login limitation therefore did not prevent authenticated checks.

- Re-ran infrastructure verification: database connectivity passed with zero
  warnings. Automatic enqueue remains disabled; the real environment file and
  application source were unchanged during this follow-up.
- The local verification server initially could not reach Supabase from its
  restricted process. Restarting this server with network access resolved the
  authentication fetch failure. Authenticated `/api/user/me` returned **200**.
- Used Chromium with the saved test session and inspected captured screenshots.
  The dashboard, loaded roles table, and an existing `QA-P9-E2E-UI` case's
  Diligencias and Documentos tabs rendered successfully. The document API returned
  **200**, its loading indicator cleared, and two existing receipt documents were
  displayed. No case, diligence, receipt, or document was changed.
- Authenticated `/firmados` returned **200** and rendered the expected empty
  application shell. A signing control center is still Phase 8 work.
- An authenticated completion request for a deliberately nonexistent diligence
  returned **404**, confirming the real authentication/route lookup path. No
  completion or queue mutation was requested for an existing record.
- Successful browser runs reported **zero JavaScript page errors** and no
  unexpected API failures. Initial harness waits for network idleness and for a
  heading on the wrong tab were corrected to wait for the actual tab/data state;
  those timeouts were not counted as successful application checks.
- Local screenshots and machine-readable observations are in
  `test-results/signing-browser-verification/`. The verification server was
  stopped after testing.

This follow-up closes the authenticated navigation and visual-inspection gap.
It does not claim browser-driven signing execution or a new PDF-generation test:
Phase 3's enabled enqueue, idempotency, exclusions and rollback remain proven by
the **24 live database tests**, including **12 Phase 3 cases**. The prior **274
standard tests**, build, TypeScript, lint and static checks passed on the same
application source. No production signing feature was enabled for verification.

### Verification rerun — September 15, 2026

Rechecked the current implementation at the user's request; no application code
or environment settings were changed.

- Prisma status, deploy and generate passed in the required order: all 41
  migrations applied, no pending migrations, client generated successfully.
- Standard suite: **274 passed**. Its 24 opt-in database cases were then run
  separately: **24 passed**, covering RLS, tenant isolation, source integrity,
  queue transitions, concurrency, automatic completion and transaction rollback.
- Production build (including TypeScript validation), lint, auth/audit checks
  (342 files), UTF-8 and diff whitespace checks passed. Live infrastructure
  verification reported successful database connectivity and zero warnings.
- Chromium used the existing saved test session against the fresh local
  production build. Dashboard data, the roles list, and the existing QA case's
  Diligencias and Documentos tabs loaded successfully. Screenshots were visually
  inspected after data loading. Their APIs returned 200 with no JavaScript page
  errors. The documents tab displayed two existing receipts.
- Authenticated user lookup returned 200; completion for a nonexistent diligence
  returned 404; anonymous completion returned 401; health returned 200.
- `/firmados` returned 200 with the existing empty shell, consistent with its
  current source. This verifies navigation, not a signing interface or real
  token/PDF signing. No existing record was completed or document generated.
- Cleanup query found zero disposable signing schemas and zero synthetic test
  offices. Automatic enqueue remains disabled; local verification servers were
  stopped. Current screenshots and JSON observations are under
  `test-results/signing-browser-verification/current-*`.

### Phase 0 alignment adjustments — September 15, 2026

The Phase 0 review identified that ordinary token signing must be available
without making TSA/LT mandatory for every office. The following changes adjust
the existing Phases 1–3 backend contracts. They do not implement a token agent,
PDF cryptography, a signing UI, or unattended PIN storage.

- **Phase 1:** `DocumentSignature.timestampAt` is nullable. Forward migration
  `20260915230000_allow_basic_signature_evidence` adds
  `signature_timestamp_level_check`: absence is permitted only for `PADES_B`.
  The database still requires timestamps for T, LT and LTA. Existing signatures
  are untouched; revocation/validation dates, SHA-256 identity, RLS, tenant keys,
  artifact immutability and append-only evidence remain enforced.
- **Phase 2:** job requests and validated results accept `PADES_B`, `PADES_LT`
  and `PADES_LTA`. Basic results may omit `timestampAt` or provide null; omitted
  timestamps are normalized to null, never fabricated from the current time.
  Every profile still requires revocation and validation evidence. Timestamped
  profiles require an actual timestamp date. Results must meet or exceed the
  requested profile, so a failed TSA cannot silently turn an LT job into a basic
  success. Repeated completion with a conflicting profile is rejected. The
  existing database enum's T value remains reserved; this change does not add
  a new T-only request option.
- **Phase 3:** server-only per-office configuration accepts `PADES_B` as well
  as existing LT/LTA. Omission still means LT. The configured profile remains
  part of job and completion idempotency; changing it cannot rewrite an
  existing request. The real environment stays disabled, with no office rollout.
- **Local token session:** the future agent can report `PIN_REQUIRED` when a
  session needs unlocking, including after a restart or token reconnection.
  This is distinct from `PIN_INCORRECT`. Both pause in `WAITING_FOR_OPERATOR`,
  produce fixed sanitized messages, and never retry automatically. An office
  administrator can use the existing retry operation after local recovery,
  subject to the existing attempt budget. No PIN travels through this contract.
  Session reuse, timeout policy and real token detection remain agent work.

The chosen profile describes requested technical evidence, not a statement of
court acceptance. LTA and unattended signing remain unproven by the token PoC.
Provider-specific TSA configuration, DSS/CRL handling and independent validation
of final PDF bytes remain later signing-engine/integration work. The queue keeps
the final validated output version/checksum rather than assuming the initial
signing revision is the final artifact.

Verification for this adjustment includes profile-specific pure validation,
direct database constraints, basic job completion and idempotency, stronger
results, rejected downgrades without success side effects, local-unlock operator
recovery, and a real completion-handler-to-worker flow using synthetic evidence.
These tests do not contact a TSA, sign a PDF or use a physical token.

Final verification: **278 standard tests**, including **124 pure signing tests**,
and **31 live database cases** passed. The seven added database cases cover basic
completion, LT/LTA downgrade rejection, stronger results for B/LT, operator unlock
recovery and automatic basic completion; the existing Phase 1 case now also
tests the new database constraint and required validation dates. Production build
with TypeScript validation, lint, auth/audit, UTF-8, diff whitespace and live
infrastructure checks passed. The new test's initial TypeScript iteration error
was corrected before the successful final build. Migration status confirms all
**42 migrations applied** and Prisma Client generation passed. Direct inspection
confirms both signature evidence constraints are validated. No browser signing
test is claimed: the earlier navigation checks cover the unchanged UI; profile
selection and token-session errors currently have internal backend interfaces.

## Phases 4–5 — Device authentication and Windows foundation

Status as of September 17, 2026: **Phases 4 and 5 completed and verified.**
Administrator installation, normal-user pipe access, three service restarts,
automatic recovery, graceful shutdown and the previously pending enrollment
dialog inspection have passed. The final service acceptance run began at
21:48:38 UTC; its temporary installation was removed successfully.

### Implemented backend contracts

- Required Prisma startup sequence passed before implementation. Forward
  migration `20260917120000_device_authentication` is deployed (43 migrations).
  It adds device challenges/sessions, shared rate-limit counters and bounded
  heartbeat metadata. Challenge/session device relations include office identity;
  all three new tables have RLS enabled and grants revoked from PUBLIC, anon,
  authenticated and service_role. Prisma remains the migration authority.
- `lib/signing/deviceProtocol.ts`, `devices.ts` and `deviceHttp.ts` implement
  canonical RSA-3072 public device identities and domain-separated SHA-256 proofs.
  Ten-minute enrollment codes are stored only as hashes and consumed with their
  device relationship atomically. One-minute authentication challenges are
  single-use; five-minute session tokens are stored only as hashes. Session renewal
  requires a fresh signed challenge. This device key is separate from the USB
  signing key and application-account authentication.
- Office administrators can list devices, issue/revoke enrollment codes and
  revoke devices through `/api/signing/devices`. Mutations require authenticated
  office-admin membership, matching Origin and HTTPS. Device actions live under
  `/api/signing/device/[action]`, use independent device authentication, and skip
  browser Supabase-cookie refresh. The static auth verifier explicitly recognizes
  this single device route and its dedicated authentication handler.
- Enrollment, authentication, heartbeat and queue endpoints have database-backed
  rate limits. Authenticated quotas follow stable device identity across renewed
  sessions. Request bodies are bounded and strictly validated; arbitrary errors,
  PIN fields and extra credential fields are rejected. Revocation deletes device
  sessions/challenges and is checked again inside the office transaction lock for
  queue mutations. Device office/role comes from stored identity, not request JSON.
- Signers can claim/renew/release/report bounded failure codes. Receivers cannot
  claim signing jobs. Input authorization checks the active lease and immutable
  current source, and returns only version/checksum/size metadata. Artifact
  transfer remains Phase 7 (`transferAvailable: false`). Result submission checks
  authorization and fails closed with `ARTIFACT_VALIDATION_NOT_AVAILABLE` until
  Phase 7 independently validates PDF bytes. It never accepts a device assertion
  of successful validation. Receiver acknowledgement checks an existing assigned
  DOWNLOADING delivery and its checksum; delivery creation/download remains Phase 9.
- HTTPS is mandatory. `SIGNING_TRUST_PROXY=false` is the default; enabling it is
  appropriate only behind a proxy that strips and replaces X-Forwarded-Proto
  and prevents direct access to the backend. Next.js can reconstruct the URL
  from that header, so an HTTPS URL never overrides an untrusted forwarded scheme.
  The actual environment/automatic enqueue activation was not changed.
- Heartbeats carry version, role, free disk bytes, last successful contact, fixed
  token codes and public certificate metadata. Server time determines expiration
  and the 30-day warning period. Device listing derives OFFLINE after 90 seconds
  without heartbeat. Token removal clears stale certificate metadata.

### Implemented Windows foundation

- `agents/windows/Notifica.Agent` is an x64 .NET 10 Windows service/tray application,
  pinned to SDK 10.0.401. It uses Microsoft's `System.ServiceProcess.ServiceController`
  10.0.12 and `ServiceBase` lifecycle, with no third-party NuGet dependencies. A self-contained
  build is under the gitignored `agents/windows/artifacts/win-x64` directory.
  Source, build/install/verification scripts and API documentation are retained in
  `agents/windows`. The production signed installer/update channel remains Phase 11.
- Windows CNG persists a non-exportable RSA-3072 device authentication key. The
  agent provisions this machine key locally during administrator installation,
  grants the virtual service key-use access, and retains SYSTEM/administrator
  management. The interactive tray receives no private-key access. Startup
  signs/verifies a random software-device-key challenge to prove the credential
  is usable; this never operates the USB key. Device sessions remain in memory.
  The service/tray pipe has a restricted DACL, denies
  network logons, checks client SID, bounds input and duration, and supports only
  status and enrollment. Installed tray clients verify the pipe server executable
  and SCM process identity. The configured user receives only
  `PROCESS_QUERY_LIMITED_INFORMATION` on the service process for that identity
  check; the added permission grants no process-memory, termination or credential
  access. No token PIN entry or PDF signing operation is implemented.
- The installer configures a virtual service account, protected directories,
  recovery (including reported service failures) and a per-user tray logon task.
  It refuses existing service/files/tray tasks and reparse-point installation
  paths. Task Scheduler receives the resolved Windows account name; the tray
  also runs on battery power. The elevated `verify-service.ps1` has now passed
  installation, normal-user access, three restarts, automatic recovery, graceful
  stop and exact test-artifact cleanup. Failures discovered by the real tests
  were corrected: tray-task account resolution, restricted-account machine-key
  provisioning, the custom dispatcher lifecycle, and normal-user process-query
  access. The service now uses Microsoft's lifecycle implementation. Protected
  startup diagnostics contain only a fixed error code, numeric HRESULT and time.
- PKCS#11 health probing runs in a separate child process with a timeout, so a
  vendor DLL failure cannot hang the service. It uses the configured absolute DLL
  path, enumerates public certificates, selects by SHA-256 identity, checks usage
  and validity, and reports ambiguous certificates. There is no C_Login or signing
  API in the probe. Trust/revocation/signature validation remains Phases 6–7.
- The worker reconnects and authenticates from its persisted CNG identity after
  restart. It reports heartbeat only, without claiming/signing/downloading work.
  The tray shows service/connection/token status and local enrollment approval.

### Verification evidence

- New protocol unit tests: **5 passed**; final standard integration suite:
  **283 passed**, with 41 explicitly opt-in database/Windows cases skipped.
  The database verification covers **39 cases**: the existing 31 passed in the
  final full run, and the final targeted device suite passed all **8** cases.
  The first full run exposed a minute-boundary assumption in the new rate-limit
  test; its rerun waits for sufficient time in the real database quota window.
  These tests use disposable schemas or rollback-only fixtures; no production
  office was enrolled or enabled.
- Device cases cover consumed/expired/revoked enrollment, administrator access,
  challenge races/replay/expiry/wrong-key proofs, session expiry/renewal, office/role boundaries,
  source/lease authorization, revocation across endpoints, heartbeat state and
  concurrent rate limiting and quotas across session renewal. Enrollment races
  create exactly one device, and an injected audit failure rolls back code/device
  changes. Receiver acknowledgements check assignment, role, checksum, revocation
  and idempotency. The expanded RLS test includes challenge/session tables and
  verifies the global technical rate-limit table's RLS/grants.
- TypeScript, lint, auth/audit static verification (347 files), UTF-8, diff
  whitespace and the final Next.js production build passed. The device route uses
  canonical request timing without browser authentication. Final live infrastructure
  verification passed with zero warnings. Read-only cleanup inspection confirms
  **0 disposable test schemas**, **0 production test offices** and **43 applied
  migrations**. No temporary agent process or installed service remains; the
  temporary tray identity and failed sandbox test's TLS directory were removed.
- Windows build/publish passed with zero warnings/errors. The Windows self-test
  passed **12 assertions**, including CNG proof, denied private export, persistent
  identity, certificate health and real local IPC. Its output is
  `agents/windows/artifacts/self-test.json`.
- **Real compiled Windows agent + local HTTPS + actual backend + disposable DB**
  integration passed **2 cases / 4 recorded acceptance checks**: enrollment, heartbeat with the connected token, identity
  preservation/reconnection after process restart, and rejection after revocation.
  Evidence: `agents/windows/artifacts/integration-results.json`. The test uses an
  ephemeral loopback CA with explicit test-only chain/hostname validation; it
  changes no Windows trust store and the installed service has no TLS bypass.
  An independent client also enrolled/authenticated/heartbeated over actual TLS,
  claimed only its office's synthetic work, checked input/lease authorization and
  revocation, and verified that receiver/foreign-office access was denied. No
  synthetic signature was promoted through the device API. This proves Phase 4's
  HTTPS fake-work exit criterion. Both cases passed again after the credential
  and service-host changes. This HTTPS test uses worker mode with an isolated
  trust root; the separate SCM test below exercises the real installed service.
- **Administrator SCM acceptance passed:** the actual
  `NT SERVICE\NotificaSigningAgent` account started, proved CNG private-key access
  and reported the connected token as `TOKEN_READY`. A temporary interactive task
  proved installed pipe/process identity checking as the intended **non-administrator**
  user. Three `Restart-Service` cycles preserved the device-key fingerprint and
  token health. Terminating only the test-created service process exercised SCM's
  automatic recovery; the recovered process preserved identity and token health.
  A final `Stop-Service` completed gracefully. Evidence:
  `agents/windows/artifacts/service-verification.json`, with every acceptance and
  cleanup flag true and `restartCycles: 3`.
- The connected SafeNet probe reported the expected E-Cert certificate and
  `READY`, without PIN entry/login/signing. The user's physical unplug/replug was
  observed as **READY → MISSING → READY** at 20:25:53, 20:27:06 and 20:27:38 UTC
  on September 17. Evidence: `agents/windows/artifacts/usb-transition-results.jsonl`.
- Native visual inspection showed the status dialog reporting the running,
  unenrolled test agent with `Token disponible`, then `Servicio de Windows sin
  conexión` after its worker stopped. After the user explicitly authorized
  resuming the previously stopped UI check, the empty enrollment dialog was opened
  and inspected: temporary-code label/field, device-name field and explicit
  `Autorizar inscripción` button were visible. The dialog was closed without
  entering a code or submitting enrollment, and the temporary tray process was
  stopped. Evidence: `agents/windows/artifacts/tray-dialog-verification.json`.

### Acceptance and reproduction

No Phase 4–5 acceptance items remain open. Phases 6–11, token PIN sessions,
real PDF signatures, artifact promotion and receiver distribution remain outside
this implementation. Production automatic signing has not been enabled and no
production office/device was enrolled by these tests.

Run the following from an **administrator PowerShell 7**, as the same interactive
Windows user, with the token connected:

```powershell
& 'C:\Users\gonza\Desktop\NOTIFICA IA - WEB - (2)\agents\windows\verify-service.ps1'
```

The script refuses an existing installation, creates a temporary unenrolled
service and tray/verification tasks, checks the real virtual account and persistent
machine credential, then removes only its own installation/key/tasks. Its recovery
test terminates only the verified test-service process. It never asks for a token
PIN or signs a document. Inspect
`agents/windows/artifacts/service-verification.json` for `completed: true`,
`serviceStarted: true`, `standardUserPipeVerified: true`,
`restartIdentityPreserved: true`, `restartCycles: 3`,
`automaticRecoveryVerified: true`, `gracefulStopVerified: true`,
`tokenHealth: TOKEN_READY` and `cleanupCompleted: true`. All were true in the
accepted run. A future regression must be investigated before accepting a new build.

### Pre-Phase 6 verification — September 17, 2026

The requested code, environment and manual software verification is complete.
The checks found and fixed one transport-security defect before accepting this
baseline for Phase 6. No Phase 6 implementation was started.

**Defect and correction.** A real request to the production Next.js server with
`X-Forwarded-Proto: https` reached device input validation even though proxy trust
was disabled. Next.js 14.2.33 reconstructs its request URL from this header;
checking `nextUrl.protocol` first therefore allowed an untrusted header to bypass
the HTTPS gate. `requireDeviceHttps` now checks the presence of the forwarded
scheme first and accepts it only with explicit proxy trust and the exact value
`https`. Conflicting schemes and comma-separated scheme lists are rejected.
The rejection occurs before database throttling or device actions. Regression
tests cover reconstructed URLs, trusted-proxy behavior and rejection before
service calls. Both device and browser-administration routes use this guard.

A normal Next.js deployment supplies forwarded headers, so signing actions stay
disabled by default until a verified TLS boundary overwrites these headers,
blocks direct backend access and `SIGNING_TRUST_PROXY=true` is explicitly set.
Header-free HTTPS from a direct TLS adapter remains supported. This deployment
requirement is documented in `.env.example` and the Windows agent README; the
actual `.env` was unchanged.

| Area | Verified result |
| --- | --- |
| Prisma startup | Status, deploy and generate passed in order; 43 applied migrations, none pending. |
| Standard tests after the fix | **285 passed**, with the 41 opt-in live cases run separately. |
| Live PostgreSQL tests | **39 passed**: immutable sources, tenant isolation, RLS, queue concurrency, atomic completion, enrollment, authentication and revocation. |
| Real Windows agent + HTTPS after the fix | **2 passed**: real token heartbeat, persistent identity/reconnect, revocation and office-scoped synthetic work. Temporary TLS trust remained confined to the test. |
| Production build after the fix | Passed, including TypeScript and lint. |
| Static checks | Auth/audit passed for 347 files; UTF-8 and diff whitespace checks passed. |
| Live environment | Database connectivity passed with **zero warnings**; transaction pooler/runtime and session pooler/migrations verified. |
| Real production-server HTTP checks after the fix | **15 passed**, including authenticated reads, PDF retrieval, anonymous denial, HTTP rejection, spoofed/combined forwarded schemes and harmless nonexistent-record completion. |
| Physical token | Fresh read-only probe returned **READY**, with certificate expiry September 14, 2027. No PIN login or signature was attempted. |

The first restricted-process database attempt could not reach Supabase; the
network-enabled run passed. An initial standard-suite run overlapped Prisma
generation and encountered a transient client import failure; the run after
generation completed passed, as did the final suite after the HTTPS correction.
These failed attempts were not counted as successful checks.

**Manual browser walkthrough.** Opened the local production build in Chrome and
used the existing `localhost` session. The separate `127.0.0.1` origin correctly
showed the login page without that session. Checked the loaded dashboard, the
roles list, the existing `QA-P9-E2E-UI` case's Diligencias and Documentos tabs,
and `/firmados`. The two existing receipt documents rendered, the download
button completed without an error, and the download endpoint returned 200 with
PDF bytes. Captured browser warning/error logs were empty. The final rebuilt
application was reloaded and its roles/signing navigation checked again.

`/firmados` remains the planned empty application shell: the signing control
center is Phase 8. These manual checks do not claim browser-driven signing,
enrollment UI in the web app, PIN sessions, or newly generated PDF signatures.
Existing case records were not completed or changed. Windows tray/enrollment
dialog inspection, physical unplug/replug, normal-user IPC, three SCM restarts,
automatic recovery and graceful stop were already verified on the unchanged
Windows binary earlier in this session, as recorded above.

**Evidence and cleanup.** Browser screenshots, HTTP observations and cleanup
counts are in `test-results/signing-browser-verification/pre-phase6-*`; the HTTP
and cleanup scripts in that directory reproduce these checks using the existing
local test session. Agent evidence remains under `agents/windows/artifacts`,
including the refreshed `integration-results.json` and `pre-phase6-token.json`.
Final read-only checks found zero disposable signing schemas, zero synthetic
signing offices, zero production signing devices, no temporary agent process,
no test TLS directory and no leftover service installation/configuration.
Automatic enqueue and proxy trust remain disabled. The temporary web server was
stopped after verification.

**Phase 6 gate:** no unresolved defect was found in the verified Phase 1–5 scope
after the transport correction. The next work is the Phase 6 PIN/session and
signing engine implementation; production activation and later-phase acceptance
remain separate work.

### Verification refresh — September 21, 2026

The requested code, environment and manual verification was repeated against the
current workspace. Unlike the September 17 baseline, this workspace already
contains preliminary Phase 6 sources. Those sources are not a completed Phase 6.

Two findings were resolved during verification:

- The Windows build failed in `DssSignerAdapter.cs`: `Contains` has no character
  overload accepting a start index. The local-path check now uses
  `IndexOf(':', 2) >= 0`, retaining rejection of additional colons. The rebuilt
  agent publishes successfully and the existing DSS Java bridge also compiles.
- The current hardware environment exposes multiple eligible certificates.
  With no fingerprint configured, public probing correctly returns
  `CERT_AMBIGUOUS`, shown as `DRIVER_ERROR` by health reporting. The integration
  harness now accepts `SIGNING_AGENT_TEST_CERTIFICATE_FINGERPRINT` and verifies
  that exact certificate. Selecting the Phase 0 E-Cert SHA-256 fingerprint in
  disposable test configurations restored `TOKEN_READY`. No production config
  was changed and ambiguous selection remains fail-closed.

Fresh results: **285 standard tests**, **39 live PostgreSQL tests**, **2 real
Windows-agent HTTPS tests**, **15 production-server HTTP checks**, **12 Windows
CNG/IPC self-test checks**, and **18 simulated signing-session checks** passed.
Prisma status/deploy/generate passed in order with 43 applied migrations and no
pending migrations. The Next.js production build, including lint/type checking,
auth/audit static verification and UTF-8 checks passed. Live infrastructure
verification reported zero warnings. The first restricted database and NuGet
attempts failed on network permissions; successful network-enabled reruns are
the results counted above. The initial unselected-certificate agent test failed;
the explicit-fingerprint rerun passed both cases.

Manual checks used the rebuilt local production application in Chrome with the
existing local session: the loaded dashboard, the existing QA case's Diligencias
and Documentos tabs, PDF download, and `/firmados`. The PDF HTTP response was 200
with a valid PDF header. `/firmados` remains the Phase 8 empty shell. In the
rebuilt native tray, the unselected-certificate warning, selected-token readiness,
empty enrollment fields/explicit approval button, and worker-offline status were
inspected. Enrollment was closed without submission. No existing case was edited
or completed, no real token login was attempted, and no PDF was signed.

The physical USB transition and administrator SCM installation, three restarts,
automatic recovery and graceful stop remain **September 17 evidence**; they were
not repeated in this refresh. The refreshed process-restart check uses the real
compiled agent in its isolated HTTPS test mode, not an installed SCM service.

Refreshed evidence is in `agents/windows/artifacts/integration-results.json`,
`self-test.json`, `signing-self-test.json`, and
`test-results/signing-browser-verification/pre-phase6-http-results.json` and
`pre-phase6-cleanup-results.json` (see each timestamp). Cleanup inspection found
zero disposable schemas, synthetic signing offices, or production signing
devices. Automatic enqueue and proxy trust remained disabled.

This refresh supports continuing development from the Phase 1–5 foundation.
It does not establish Phase 6 acceptance: the local approval/PIN workflow and
controlled real-token PDF signing still require implementation and end-to-end
verification. The 18 simulated checks do not substitute for those acceptance
tests.

### Phase 6 implementation in progress — September 21, 2026

The local signing path now connects the tray, restricted named pipe, isolated
native signing worker and replaceable DSS adapter. It is available only through
an explicitly configured, unenrolled controlled-test agent; server artifact
transfer and production version promotion remain Phase 7.

Implemented:

- Immutable batch metadata binds office, requester, signer, certificate, profile
  and exact input checksums. The controlled-test utility retains a one-use,
  five-minute local approval; the enrolled agent now uses web authorization and
  the locally enabled office token session. Receiver-only agents cannot sign.
- A custom masked PIN control with no PIN-bearing Windows text value; bounded
  binary transfer after pipe-server and client-SID verification; explicit buffer
  clearing in tray, service and worker. No PIN persistence, JSON, arguments or
  environment fields. Unsupported PIN characters/overflow prevent submission.
- One PKCS#11 login per authenticated session, no incorrect-PIN retry, explicit certificate
  selection, RSA/SHA-256 signing with immediate public-key verification, private
  key attribute checks, logout/session cleanup, and a five-minute parent-enforced
  worker deadline in controlled-test mode. The enrolled remote session lasts up
  to eight hours with a five-minute deadline per document. A Windows job
  terminates owned children if their owner exits.
  The worker waits for existing health probing to finish and suppresses new
  probes during the signing session.
- Current-process WER no-heap/no-snapshot flags, disabled child .NET diagnostics,
  bounded protocols, fixed failure codes, local path restrictions, pre-login
  checksum checks and immutable-file checks again before signing.
- Direct DSS 6.5 bridge for B, LT and LTA, SHA-256 document/timestamp imprints,
  CRL-first revocation acquisition, explicit test trust roots, and fail-closed
  validation of the requested profile before writing a uniquely named output.
  Java never receives the PIN or private key. Setup is documented in
  `agents/windows/dss-engine/README.md`.

Current evidence in `agents/windows/artifacts/phase6`:

| Check | Result |
| --- | --- |
| Windows build/publish | Passed, no compile errors. |
| Foundation CNG/IPC regression | 12 passed; no hardware login. |
| Session/protocol/process lifetime | 22 passed, including termination of a real blocked test child when its owning job closes. |
| Secured pipe through real worker and approval expiry | 9 passed, using a deliberately missing provider and synthetic PIN; zero possible hardware login attempts. Includes late preview, expiration and approval without intervening polling. |
| Real DSS adapter with software RSA key | 5 passed: B, LT, LTA, input-checksum rejection and missing-TSA rejection. |
| Independent pyHanko 0.37 offline validation | Synthetic LT and LTA outputs passed current-time signature, timestamp, chain and required revocation validation. Both contain SHA-256 imprints and embedded CRL evidence. This is not an archival proof-of-existence assessment. |
| Deliberately tampered synthetic output | Rejected by independent validation; original output preserved. |
| Native token preflight | Documented E-Cert fingerprint selected, unauthenticated session opened, zero login attempts. |
| Approval UI | Requester, office, signer/fingerprint, profile, two document IDs, empty protected PIN field and disabled-until-approved signing button inspected. |

During UI setup, a temporary configuration initially contained the sandbox
account SID. The secured pipe correctly refused the interactive user. Only that
test configuration was corrected to the actual interactive SID; authorization
checks were not weakened. Startup of the async approval dialog was also moved
onto the WinForms message loop.

**Initial acceptance status (superseded by the successful run below).** A two-document controlled E-Cert LT batch was
prepared and the user was asked to enter the PIN only in the local dialog.
Completion requires observing that authorized real-token run, independently
validating its outputs, verifying the privacy/cleanup evidence and closing the
remaining acceptance audit. Successful software-key tests do not substitute for
the real-token exit criterion. No completed Phase 6 claim is made here.

The first approval window expired without submission. Public batch status was
still `AWAITING_APPROVAL` after 323 seconds, with zero outputs. Its worker, tray
and temporary CNG device key were then removed; `cleanup.json` in the controlled
test directory records that outcome. A fresh local window must be opened when
the user is ready. There was no token PIN attempt in this run.

The subsequent build additionally suppresses system WER invocation for this
process via `SEM_NOGPFAULTERRORBOX`, preserving inherited flags, and checks its
no-heap/no-snapshot flags. Public worker results now include login/signature
operation counts; successful batches require exactly one login and one signature
operation per document. Interrupted workers report unknown counts rather than
inventing successful operations. The PIN is cleared immediately after `C_Login`,
before reading private-key policy attributes. Final native regressions remained
12/22/6 passed. No crash dump was found under the Phase 6 test artifacts.

The follow-up audit corrected the stale approval display observed in that expired
run. The coordinator now publishes its remaining monotonic approval lifetime and
an explicit `EXPIRED` state. Opening or polling the dialog does not renew that
lifetime; the dialog disables approval and clears its PIN buffer when it expires.
Tests advance a controlled clock to verify late previews, the exact five-minute
boundary and direct approval after expiration without polling. The rebuilt agent
passed **12 foundation, 22 session and 9 controlled-workflow checks**, with zero
real-token login attempts. Prisma deploy found no pending migrations and client
generation passed before this fix. At that point, real-token acceptance was still open.

### Phase 6 completed — controlled real-token acceptance, September 21, 2026

The user reviewed and authorized a fresh two-document test batch through the
local tray dialog, entering the PIN only there. The agent completed both
`PHASE6-CONTROLLED-1` and `PHASE6-CONTROLLED-2` as PAdES-LT with the selected
E-Cert certificate. The worker reported **one native token login and two native
signature operations**, with no retry or error. No production document was
signed or promoted.

Authoritative evidence is in
`agents/windows/artifacts/phase6/controlled-fc9bf40a3b924cc2bc68fe8e96479480/`:

- `latest-status.json`: completed batch, exact document IDs, LT profile, output
  hashes, one login and two signatures.
- `independent-validation.json`: both PDFs passed offline pyHanko 0.37 signature,
  timestamp, chain and required revocation validation using explicit test roots.
  Both document and timestamp imprints use SHA-256; the signer fingerprint is
  `67887678fae15909edc535e064368b78d0d65c0eeb70b314d4e9baccd16b1a01`.
  Each PDF embeds five certificates and three CRLs. The DSS bridge separately
  requires `TOTAL_PASSED` and exact `PAdES_BASELINE_LT` before publishing output.
- `acceptance-cleanup.json`: original inputs unchanged, output hashes checked,
  consumed approval rejected before another PIN transfer, test tray/worker
  stopped, temporary CNG identity removed, and no remaining signing worker.
  Runtime stdout/stderr files were empty; no crash dumps were found in the test
  directory or newly created agent dumps in the user's CrashDumps directory.
- `post-signing-preflight.json`: a fresh public token session opened successfully
  after signing, without a login; the adapter rejects authenticated initial
  sessions. Signed PDFs and public acceptance evidence were preserved.

Requirement audit:

| Phase 6 requirement | Evidence |
| --- | --- |
| Replaceable signer and configurable PKCS#11 | `IPdfSignerAdapter`, `DssSignerAdapter`, and local `Configuration.Pkcs11Library`; real run used the configured SafeNet provider. |
| Local approval with requester, office, signer, count and IDs | Native dialog inspected and used by the user for this two-document batch; immutable metadata/digest and one-use approval tested. |
| Local PIN entry, secured channel, child stdin, memory clearing | `SecurePinEntry`, SID/server-verified `LocalPipe`, bounded binary `PinTransfer`, owned worker stdin, `PinBuffer` zeroing and process privacy controls; clearing/error-path tests pass. PIN is absent from public metadata and process arguments and is never assigned to an environment variable or sent to a database. |
| One batch and bounded session | Actual one-login/two-signature result, rejected replay, five-minute monotonic approval and worker deadlines, process-job termination regression. |
| LT, SHA-256, TSA and embedded revocation | Exact-profile DSS validation plus independent offline validation of both real-token outputs, including SHA-256 timestamp imprints and embedded CRLs. |
| Fail closed and no incorrect-PIN retry | Missing-TSA, changed-input and downgraded-profile rejection tests; simulated incorrect/locked/expired PINs stop after one login call. No deliberately incorrect PIN was entered on real hardware. |
| Optional DPAPI provider | Not implemented; persistent PIN storage remains outside the selected session-only approach. |

**User-reported typing issue resolved.** The user successfully submitted the batch
but reported the PIN box repeatedly losing its active state. Public status
polling had shared the submission flag, briefly disabling the PIN control on each
poll. Polling now has independent state, preserves typing/focus, and discards stale
responses if submission begins. Repeated dialog disposal is also safe.

The new real-WinForms `--signing-dialog-self-test` uses a synthetic character and
a deliberately missing provider. Four secured-pipe polls retained input and
focus with **zero disabled transitions and zero focus-loss events**; explicit
clearing and required consent passed. Its initial hidden-window focus setup was
corrected before the passing run. No real PIN or token login is used by this test.
The UI fixes were verified separately after the hardware run; the signing engine
and token implementation were unchanged. Final published build passed, followed
by **12 foundation, 22 session, 9 controlled-workflow and 3 dialog checks**.

**Exit criterion met:** the agent safely signed controlled inputs during one
authorized local session. Phase 6 is complete within its documented scope.
FreeTSA remains the controlled test TSA. Production artifact transfer, independent
server validation and document version promotion are Phase 7; bulk web controls
and distribution remain later phases.

## Phase 7 — Secure artifact transfer, server validation and document versioning

Implemented September 21, 2026 (the acceptance timestamps below are September 22
UTC). This section supersedes the earlier `transferAvailable: false` and disabled
result-endpoint descriptions for a configured Phase 7 deployment. The original
office isolation, lease fences, source immutability, session-only PIN policy and
configurable B/LT/LTA contracts remain in force. No production office was enabled.

### Transfer and transaction contracts

- Required Prisma status, deploy and generate ran in order. Forward migration
  `20260922010000_signing_artifact_transfer` is deployed: **44 applied migrations**.
  `SigningArtifact` records the server-generated output key, exact item/device/
  office/lease, checksum, length, expiry and validation report. Composite foreign
  keys enforce tenancy. RLS is enabled and grants are revoked from PUBLIC, anon,
  authenticated and service_role. SQL triggers protect immutable locators,
  committed reports and the allowed cleanup state transitions.
- `lib/signing/artifacts.ts` provides metadata, authenticated PDF download,
  binary result submission and cleanup. Each access checks the active device,
  signer role, same-office item, fresh lease UUID, expiry and exact current source.
  Download verifies private-bucket status, length and SHA-256, then rechecks access
  after storage I/O. The agent receives no bucket key, storage URL or service key.
- The Windows agent writes a unique `.part` file, verifies length and SHA-256,
  flushes it and renames without replacing another file. Corrupt/truncated bytes
  cannot reach approval/token execution. The engine additionally verifies the
  immutable approved source before token use. Partial-file cleanup deletes only
  a file created by that operation, preserving existing collision files.
- The device API adds `download` and `start`. `result` accepts `application/pdf`
  with `X-Signing-Item` and `X-Signing-Lease`, authorizes before reading the body,
  and applies body/time bounds. Legacy JSON success assertions return
  `PDF_BODY_REQUIRED`; client-supplied validation is never accepted.
- The backend computes the signed SHA-256, independently validates the PDF and
  binds the report to its source/output hashes and selected certificate. After
  rechecking access it reserves a unique output key, uploads with `upsert: false`,
  and rereads the stored bytes to check length/hash. The unsigned object is never
  overwritten. Failed or uncertain uploads remain durably tracked.
- Under the existing office transaction lock, `complete()` rechecks authorization,
  the live lease and source eligibility; creates the next `DocumentoVersion`;
  records `DocumentSignature` and the successful `SigningAttempt`; updates job,
  item and canonical audit; promotes the current pointer only if it still refers
  to the exact source; and marks the artifact `COMMITTED` with its validation
  report. All database changes commit together. Validation or audit failure cannot
  leave a promoted version or partial success evidence.
- An identical committed replay returns the original result only for its original
  successful device/lease and backend-computed output checksum. Changed bytes or
  another lease are rejected. Concurrent callbacks cannot create duplicate signed
  versions; unused reservations remain cleanup candidates.
- Pending reservations expire after two hours. Signer claims sweep at most 20
  expired/uncommitted uploads, mark them `CLEANING`, exclude any object referenced
  by a document version, remove the exact key, then mark `DELETED`. Interrupted
  cleanup resumes on a subsequent claim. `COMMITTED` rows cannot enter cleanup.
  A maintenance runner can invoke the same internal cleanup operation when there
  are no active signers; scheduling/alerts are Phase 10.

### Independent validation and deployment configuration

`scripts/signing/validate_pdf.py` pins **pyHanko 0.37.0** independently of the
Windows DSS 6.5 engine. Every request runs in a separate constrained process with
explicit trust roots, no network fetching and no inherited infrastructure secrets.
The parent applies a 90-second deadline and bounded output; the child applies CPU
and memory limits. Trust cannot be supplied by the signing device.

Validation checks the expected certificate DER SHA-256, RSA/SHA-256 signature,
key usage, certificate chain, mandatory revocation, PAdES signature attributes,
coverage and requested profile. LT/LTA require embedded validation evidence and a
valid SHA-256 signature timestamp. LTA additionally checks document timestamps
and final whole-file coverage of the validation store. B requires current
operator-provisioned revocation evidence, without fabricating a timestamp.

Exact source-prefix equality is checked, followed by a PDF revision comparison.
This rejects a cryptographically valid signature over an appended alteration to
the original page. Only signing and permitted validation-maintenance changes are
allowed. DSS's absent-to-direct-AcroForm behavior is normalized in the historical
in-memory comparison; no source bytes are rewritten.

The validation report proves the profile/current-time checks performed. It does
not claim archival proof of existence after future certificate/evidence expiry.
The timestamp message imprint is checked separately from the TSA's internal CMS
digest: FreeTSA's internal SHA-512 does not invalidate its SHA-256 imprint.

Two server-only runtime options are supported:

1. `SIGNING_VALIDATOR_CONFIG`: absolute local Python/trust/evidence config for a
   Node host with Python installed (tested Windows runtime: Python 3.12.14).
2. `SIGNING_VALIDATOR_URL` and `SIGNING_VALIDATOR_TOKEN`: authenticated HTTPS to
   `validator_service.py`, suitable for the web project's Vercel deployment. The
   loopback Python listener belongs behind an HTTPS proxy; it authenticates before
   reading bytes, accepts no client paths/URLs, and limits concurrent validators.
   The Next.js adapter refuses HTTP, embedded URL credentials and redirects, and
   bounds the returned report. The agent never receives this server credential.

With no configured validator, metadata reports transfer unavailable and `start`
fails closed. Production validator hosting/secret provisioning remains rollout
work. `.env.example` and `scripts/signing/README.md` document configuration; the
actual `.env` remains unchanged. The authenticated web transport limits each PDF
to **4 MiB**, below Vercel's function payload limit; larger PDFs fail explicitly.
The Windows engine retains its separate 32 MiB parser bound. See the linked
official deployment limit and configuration details in the validator README.

### Windows integration and recovery

The enrolled-agent path introduced in 0.7.0 uses an explicit `signingEngine`
configuration, separate from controlled-test mode. In 0.12.0 it claims one
document at a time while the office token session is enabled. Local PIN entry
enables that bounded session once; web authorization supplies the requester,
certificate, profile and exact document version. Receiver-only agents cannot use
the signing path. Lease renewal continues during signing, and `start` establishes the backend
irreversible-operation fence before the token operation.

The protected `signing-work.json` journal records uncertainty before starting and
records the exact signed file/hash before upload. A lost response or restart
reuploads that same artifact without another token operation. Uncertain token
outcomes remain for operator review; incorrect PINs never automatically retry.
Files remain available for recovery. An operator-wait journal is retained without
repeated failure submissions. Transfer deadlines also cover response-body reads.
The control-center recovery workflow and multi-document web selection remain
Phase 8; receiver delivery remains Phase 9.

### Real estampo acceptance

Authoritative evidence:
`agents/windows/artifacts/phase7/live-defddef9-b27c-4eed-8395-baa175e23148/acceptance.json`.
The run began **2026-09-22 00:49:36 UTC** and completed cleanup at **00:51:23 UTC**.

- Generated a clearly marked synthetic estampo with the application's actual
  `buildEstampoPdf`, stored it in the real private `documents` bucket, and queued
  its exact immutable version in a disposable database schema.
- The real compiled Windows agent enrolled/authenticated over loopback HTTPS,
  downloaded and hash-checked that source, and used the user's local approval/PIN.
  The worker reported **one token login and one signature operation**.
- The independent server validator accepted **PADES_LT**, offline, with the
  expected E-Cert identity, preserved source, trusted timestamp and revocation.
  A new signed version became current with exactly **one signature and one
  successful attempt**. The unchanged unsigned object was reread and checked.
- A second real storage upload to an existing source key was rejected, proving
  collision protection without replacing the original bytes.
- The harness deliberately discarded the successful commit response, stopped
  and restarted the agent, and observed committed replay of the retained output.
  Recovery did not perform another signature or create another signed version.
- `estampo-source.pdf` and `estampo-signed.pdf` are retained with public evidence.
  Source SHA-256: `e7574c1305231a2904000328225dc0d49c0d4b5d76bf10f6b82dc9fa0bc4396e`.
  Signed SHA-256: `6266cd0bb948e058cb84135e580c6fa4937c2da2bb632092698a17c67ac7c61e`.
  The harness removed its cloud objects, disposable schema, CNG identity, TLS
  private material and credential/journal files; `cleanupCompleted` is true.

This exercised the real estampo generator, actual private storage, backend device
handler/transactions, compiled Windows agent, USB token and independent Python
validator. Database orchestration tests use fake storage/validation only for
deterministic failure injection; they do not substitute for this acceptance run.

### Verification and requirement audit

| Phase 7 requirement | Evidence |
| --- | --- |
| Private download requires valid claim/lease/role/office | Actual HTTPS acceptance plus database tests for same-office access, receiver denial, stale leases, source checksum and post-I/O rechecks. |
| Tampered input is rejected before signing | Native transfer checks reject wrong hash, truncated/oversized data and collisions; Phase 6 pre-login immutable-source checks remain enforced. |
| Tampered/invalid output is rejected independently | Real pyHanko tests reject corrupted output, wrong certificate/hash, untrusted root, revoked signer, missing revocation/timestamp and a valid signature over altered source content. |
| Upload cannot overwrite source/existing object | Production storage uses unique reservations and `upsert: false`; actual Supabase collision rejection and source reread passed. |
| Failure leaves current version unchanged | Database validation, storage corruption, expired lease/revocation and late audit-failure tests assert no promotion or success evidence. |
| One signed version/evidence/attempt on success | Real estampo acceptance and concurrent duplicate-callback database assertions. |
| Committed retries are idempotent | Real lost-response/process-restart acceptance and wrong-hash/wrong-lease replay rejection tests. |
| Unsigned source and authoritative output survive cleanup | Source hash checks, committed-upload immutability, and expired-reservation-only cleanup tests. |
| No receiver distribution or control-center implementation | Success test asserts no `DocumentDelivery` rows; existing Firmados UI remains Phase 8. |

Final verification:

- **289 standard integration tests passed**. The 52 opt-in cases skipped by that
  command comprise the separately exercised database, Windows and real-token tests.
- **49 live PostgreSQL cases passed**: 39 existing foundation/device cases and
  10 new artifact cases. Fixtures ran in disposable schemas or rollback-only
  transactions. **Two real compiled-agent HTTPS regression cases passed** after
  the final Windows changes, including selected-token heartbeat, persisted device
  identity/restart and revocation. No PIN/login is used in those two cases.
- **13 independent cryptographic checks passed**, including real-token LT and
  software B/LT/LTA plus hostile inputs. Evidence:
  `agents/windows/artifacts/phase7/validator-tests-8a985d0b7bda42e5aa34d693fff78760/results.json`.
- **Four real private validation-worker HTTP checks passed**: absent/wrong bearer,
  valid PDF and tampered PDF. Evidence: `phase7/validator-service-results.json`.
  Three HTTPS-adapter protocol tests are included in the 289 standard tests.
- Windows publish passed. The final binary passed **12 foundation, 22 session,
  9 controlled-workflow and 8 transfer checks**. JSON results are in
  `agents/windows/artifacts/phase7/`. The final deadline/operator-wait refinements
  were made after real-token acceptance; the signing engine and cryptographic
  implementation were unchanged and no further hardware signature was required.
- Next.js production build, including TypeScript/lint, passed. Auth/audit static
  verification passed for **349 files**; UTF-8 and diff whitespace checks passed.
  Live infrastructure connectivity passed with **zero warnings**, preserving
  transaction-pooler runtime and session-pooler migration configuration.
- Initial restricted-process database/infrastructure checks could not reach
  Supabase; the network-enabled runs above passed. Earlier validation iterations
  corrected the timestamp-imprint/CMS-digest distinction and Windows child
  `SystemRoot` propagation. Failed attempts are not counted as successful checks.
- Final read-only cleanup audit at **2026-09-22 01:21:29 UTC** found **zero**
  disposable signing schemas, synthetic signing offices or production signing
  devices; **44 migrations** remain applied. Both retained PDF hashes match the
  acceptance record and its private test material is absent. No temporary agent
  process or installed test service remains. Evidence: `phase7/cleanup-results.json`.

**Phase 7 exit criterion met:** one real NOTIFICA IA-generated test estampo traveled
from its queued immutable source to an independently validated signed current
version, with preserved source and idempotent restart recovery. The actual
environment still has automatic enqueue and proxy trust disabled and no production
validator configured. Production hosting/TLS/TSA agreements and activation remain
rollout work; the control center and receiver distribution remain later phases.

## Phase 8 — Firmados control center and manual recovery

Implemented September 22, 2026. `/firmados` now contains the office's operational
signing center instead of an empty shell. This phase adds browser controls and
reviewed recovery over the existing Phase 1–7 pipeline. It does not change the
local PIN policy, install an agent, enable automatic signing, or implement the
receiver filesystem mirror. No schema migration was needed; the required Prisma
status/deploy/generate sequence passed with **44 migrations applied**.

### Interface and office authorization

- `FirmadosCenter.tsx` shows office queue totals, eligible estampos, active work,
  failures/operator waits, validated signatures, device/token health, certificate
  expiry, last contact and existing delivery progress. Missing delivery rows are
  displayed as no distribution scheduled, never as a successful delivery.
- Active office members can select individual estampos, every eligible row on a page,
  or all eligible results within the execution-date range. The all-results action
  rejects more than 500 matches and asks for a narrower range; it never silently
  truncates a batch. Selection stores exact version IDs and checksums. Changing
  filters clears the selection; paging can retain it.
- A native modal dialog presents the frozen document list, certificate and
  B/LT/LTA profile and requires explicit web authorization. It explains that the
  token must have a locally enabled session and that no further local approval is
  needed per document. No PIN input exists in the web UI.
  The selected profile is preserved exactly, with no silent downgrade.
- Automatic and manual requests share the same table and statuses. Rows show
  origin, requester, profile, attempts, original version/checksum and job ID.
  A role-workspace link opens the associated documents. Fixed Spanish business
  messages explain failures; the separate diagnostic code is returned/displayed
  only for office administrators. Raw stored exception text is never serialized.
- Active office members can read the center and queue signatures. Only an active
  office administrator can retry or cancel. `GET/POST /api/signing/center` obtains office/user
  identity from `withApiUser`; request-supplied office IDs are rejected. Service
  methods recheck membership/permissions against the database. Mutation requests
  require matching browser Origin/Host and bounded JSON input. The Host comparison
  accounts for NextURL's loopback canonicalization and never trusts
  `X-Forwarded-Host`. Responses are private/no-store.
- The responsive table becomes stacked document rows on narrow screens. The
  confirmation dialog uses native focus containment and Escape dismissal. Reads
  refresh every 15 seconds when visible and no confirmation/mutation is active;
  stale responses are fenced. The browser only observes and requests work; it
  never processes the signing queue itself.

### Execution-date contract

`centerContracts.ts` defines the business-date precedence: notification
`ejecucion.fecha`, notification `fechaEjecucion`, diligence `ejecucion.fecha`,
diligence `fechaEjecucion`, then diligence `fecha`. For notification-only documents,
the linked notification's diligence supplies the fallback. `Documento.createdAt`
is never used as the execution date. Documents with no valid date remain visible
without a date range and are excluded when a range is supplied.

Date-only values remain calendar dates. Legacy midnight-UTC values follow the
application's existing date-input convention and retain their date. Actual offset
timestamps are converted through `America/Santiago`, including winter/summer and
the September daylight-saving boundary. Invalid dates and reversed ranges fail
validation. Both range ends are inclusive calendar dates.

The query reads office-scoped metadata only, including legacy execution JSON,
normalizes dates, then filters and paginates. It does not load legacy base64 PDFs
or storage bytes. Responses are limited to 500 rows (25 in the normal table).
Summary counts cover the entire office; the table reports its filtered count.
For very large office histories, a future indexed execution-date projection can
replace the metadata scan while preserving these tested semantics. Malformed
cross-office notification links cannot expose their execution metadata.

### Manual queue and safe recovery

- `center.ts` creates manual jobs under the existing office advisory lock. It
  requires a non-revoked same-office signer with the selected valid certificate;
  a temporarily offline signer can receive pending work. The server locks and
  rereads selected document pointers and verifies exact source hashes, current
  versions, tenancy, notification links, non-voided state and PDF eligibility.
- A deterministic `manual_` key hashes office, certificate, profile and sorted
  version/checksum snapshots. Concurrent submissions and uncertain-response
  replays return the original job. A different profile or key cannot bypass an
  existing item's recovery/attempt limits. Existing signatures are excluded.
  The job/items and canonical requester audit commit atomically.
- Retry requires the administrator to confirm that previous work has stopped and
  its result/local files have been inspected. The server binds the review to the
  exact attempt number, enforces the existing attempt limit and source eligibility,
  and rejects completed signatures. Expired signing leases first enter the existing
  operator-review state. A repeated reviewed retry before another claim is harmless;
  a review becomes stale when a new claim increments the attempt number.
- Browser cancellation is allowed only before irreversible work. It rechecks the
  attempt number and rejects any item with a canonical `signing.started` event,
  including a currently failed/waiting item. Claim/start/cancel share the same
  office lock. This prevents a race from cancelling an operation that already
  crossed the start fence.
- Reviewed retries record `reviewed: true` on the canonical `signing.retried`
  event. Agent **0.8.0** uses the authenticated `recovery` endpoint with its
  original device/attempt/lease identity. Started work remains retained unless
  that exact attempt has an explicitly reviewed retry; a pre-signing terminated
  assignment may be released safely. Revoked/foreign devices cannot resolve it.
- Once resolved, the agent clears only its active journal, preserves source/output
  files and requests a fresh lease. Another signature requires a reviewed retry
  and an enabled token session; a closed session requires local reactivation.
  The PIN is never retained or retried automatically. Committed output continues using
  Phase 7's same-byte replay path instead of re-signing.

### Verification and acceptance evidence

Final results, including the production-browser acceptance pass:

- **293 standard tests passed**, including four new business-date/input-contract
  cases. TypeScript, UTF-8 and auth/audit verification passed (353 checked files).
- **59 live PostgreSQL cases passed**, including **10 Phase 8 cases**: execution
  filtering/pagination, member/admin isolation and diagnostic redaction, concurrent
  manual idempotency, changed/voided sources and revoked signer rejection,
  post-start cancellation denial, pre-start cancellation/stale attempt fences,
  reviewed retry/agent resolution, completed-item protection, late audit rollback,
  and malformed cross-office notification isolation. All mutable fixtures used
  disposable schemas; existing production documents were not changed.
- Windows publish passed. The new actual-coordinator/owned-worker recovery test
  passed **five checks** with a synthetic PIN and deliberately missing provider:
  retained failed journal, reviewed resolution, fresh lease/approval, no automatic
  second operation and preserved original source. Evidence:
  `agents/windows/artifacts/phase8/recovery-self-test.json`. No USB login was possible.
- Final agent foundation/session/transfer regressions passed **12 / 22 / 8** checks;
  outputs are retained in `agents/windows/artifacts/phase8/`. The token signing
  engine is unchanged; no additional real-token signature was requested for Phase 8.
- **Six Chromium cases passed against the final production build**: desktop
  selection/select-all/consent/date filters; mobile layout and confirmation;
  read-only controls/diagnostic hiding; actual authenticated endpoint
  read/origin/invalid-input/anonymous checks; reviewed retry and pre-signing
  cancellation; and identical replay after a lost response. Browser fixture
  mutations are intercepted; the 59 database cases prove real transactions.
  The last case exposed a refresh that cleared the mutation error. Reads now
  pause while confirmation or a mutation is active, and connection failures show
  a fixed Spanish recovery message. The passing regression advances beyond the
  15-second polling interval, verifies the error remains, and submits exactly the
  same reviewed payload. No new database or signing-engine change was needed.
  Desktop and 390-pixel mobile screenshots were visually inspected:
  `test-results/firmados-desktop.png`, `firmados-mobile.png`, and
  `firmados-mobile-confirmation.png`. The modal screenshot uses the actual
  viewport; its confirmation controls fit without horizontal overflow.
- Live infrastructure connectivity passed with zero warnings. An initial browser
  launch was sandbox-blocked; a permitted rerun succeeded. The application's
  service worker initially bypassed route fixtures, so those fixture contexts now
  block service workers. The accidental synthetic request was rejected (403) and
  created no job. A real endpoint check proves the corrected Origin/Host boundary.

- The final Next.js production build passed, including TypeScript and lint.
  Auth/audit verification (353 files) and UTF-8 checks passed again after the
  refresh correction. Prisma status/deploy/generate also passed again, with
  44 migrations and none pending. The prior standard/database/native results
  cover the unchanged backend and Windows code; the final browser run covers
  the changed React behavior.
- Read-only cleanup verification at **2026-09-22 14:43:19 UTC** found zero
  disposable signing schemas, synthetic signing offices and production signing
  devices. There are 44 applied migrations. Both retained Phase 7 PDF hashes
  still match acceptance, and its private test material is absent. Evidence:
  `agents/windows/artifacts/phase8/cleanup-results.json`. No temporary native
  agent or test service remains. Automatic enqueue and proxy trust are disabled;
  no production validator is configured. The local browser verification server
  was stopped after acceptance. Playwright's cleanup of older tracked evidence
  was reversed; the final run uses a separate artifact output directory.

### Phase 8 requirement and exit-criterion audit

| Requirement | Authoritative evidence |
| --- | --- |
| Implement the existing Firmados route | `app/(protected)/firmados/page.tsx` renders `FirmadosCenter`; production-build Chromium navigation and screenshots. |
| Device/token health, expiry, queue totals, failures and delivery | Office-scoped `center.ts` metadata and health derivation; UI cards and row states inspected on desktop/mobile. Existing delivery statuses are summarized; absent rows never imply delivery. |
| Legal/business execution date and Chile timezone | `centerContracts.ts` precedence and calendar normalization; four contract tests cover legacy dates, winter/summer/DST, invalid/reversed dates and bounds; live database case distinguishes execution date from document creation. |
| Eligible selection and select-all | Exact source/version/hash snapshots, per-page selection, all eligible filtered results with a 500-item limit; desktop/mobile browser cases and strict input tests. |
| Confirmed, idempotent manual bulk creation | Native modal requires consent; exact payload browser assertions; concurrent/lost-response database replay produces one job; changed/voided sources fail and late audit failure rolls back the batch. |
| Consistent automatic/manual visibility | Shared row contract and table; live database assertions for both origins and statuses. |
| Retry only eligible failures; never duplicate completion | Guarded service retry binds review to attempt number, preserves attempt limits and source checks; database cases reject stale reviews and completed signatures. |
| Cancel only before irreversible signing | Canonical start-event and attempt guards share the office mutation lock; database cases reject post-start/waiting cancellation and old-lease start after cancellation; browser submits exact attempt snapshot. |
| Sanitized business errors and admin-only diagnostics | Fixed message/code mapping and no raw stored errors in DTO. Active members can request signatures; recovery and diagnostic codes remain administrator-only. Network uncertainty remains visible in Spanish through a polling interval. |
| Polling without browser processing | Visible-page reads every 15 seconds, aborted/stale-response fencing, suspension during confirmation/mutation; lost-response browser regression proves retained confirmation and identical replay. |
| Server-side office isolation | Active membership/admin rechecks, office-scoped queries and existing tenant constraints; live foreign-source/context and malformed-link tests, plus actual endpoint authentication/origin checks. |
| Responsive end-to-end behavior | Passing desktop and 390-pixel mobile Chromium cases, viewport bounds and overflow assertions, inspected screenshots. |
| Administrator recovery without server access | Firmados retry/cancel actions retain the reviewed-attempt requirement. Resolution preserves files and obtains a fresh lease; signing then requires an enabled token session. Committed output follows same-byte recovery. Operator instructions are in `agents/windows/README.md`. |
| Preserve phase boundaries | No PIN-policy change, agent installation, production activation or receiver mirror; cleanup/environment audit and native test's zero hardware-login evidence. |

Reproduce browser acceptance against a running production build with
`NEXT_PUBLIC_BASE_URL` set to its origin:
`npx playwright test e2e/firmados.spec.ts --project=chromium --workers=1 --output=agents/windows/artifacts/phase8/browser-run`.
The output directory retains `.last-run.json` with `status: passed`. The test uses
the existing authenticated QA storage state; mutations in UI fixtures remain
intercepted, and the real endpoint checks use invalid inputs only.

**Phase 8 exit criterion met:** office administrators can inspect the signing
pipeline, request eligible historical work, and perform guarded manual recovery
through Firmados, with local signer approval retained. Receiver delivery is
Phase 9; broader failure monitoring and installer/pilot rollout remain Phases
10–11. Production signing has not been activated.

## Phase 9 — Receiver role and local signed-document mirror

**Historical implementation:** this section records the September 22 receiver
delivery design and its tests. Agent 0.13.0 and the October 1 backend replace its
automatic per-device delivery queues with the
[shared office folder](#shared-office-storage-update-october-1-2026). In the new
design, signer-only devices also have folder access. Do not use the scheduling,
signer-denial or local-mirror instructions below as the current storage policy.

Implemented September 22, 2026. Agent 0.9.0 adds the outbound HTTPS receiver
processor for `RECEIVER` and `SIGNER_RECEIVER`. It reuses the existing device
identity, short-lived sessions, private storage, delivery table and office locks.
Prisma status/deploy/generate passed in the required order: 44 applied migrations,
none pending. No new schema migration or production activation was needed.

### Delivery creation and server authorization

`lib/signing/deliveries.ts` schedules one delivery per active, non-revoked receiver
when `service.complete()` commits a server-validated artifact and promotes the
signed version. Delivery insertion, signature evidence, current-pointer promotion
and existing canonical audit share one transaction. A failure rolls all of them
back. Internal fake-worker success without a committed artifact does not schedule
delivery. The existing `(signatureId, deviceId)` uniqueness prevents duplicates.

New receiver enrollment also schedules the office's existing committed signed
artifacts. Enrollment and signing completion use the same office lock, preventing
a signature from falling between historical enrollment and future scheduling.
The existing default-deny Data API/RLS policy and office foreign keys remain.

The device handler adds `deliveries`, `delivery-begin`, `delivery-download` and
`delivery-fail`, alongside the existing `ack`. Each action uses stored device
office/role, authenticated sessions, revocation checks, strict bounded input and
database rate limits. Signer-only devices cannot receive; receiver-only devices
cannot claim signing work or approve a token operation. HTTPS remains mandatory.
Neither storage locators/URLs nor unrestricted credentials are sent to receivers.

The list returns at most 20 pending metadata rows and an ID cursor. The Windows
agent persists that cursor with its pending page and bound office/device/folder.
When the scan is exhausted it wraps to null, so delayed failures or inserts before
the cursor remain discoverable. Failed copies use bounded backoff up to one hour.
The begin/download pair counts one attempt; acknowledgements clear resolved errors.

Download verifies assignment, expected signed checksum, committed artifact/version,
private bucket, length and SHA-256. It rechecks session/revocation after storage
I/O before returning bytes. The 4 MiB authenticated transfer limit is preserved.
Delivery failures store fixed business messages and emit canonical audit events.
The center shows delivery totals/failures; an online receiver is labeled
`Receptor conectado`, with no misleading missing-token or certificate-expiry prompt.

Current Supabase changelog and storage documentation were checked. The relevant
contract remains private authenticated access; no Data API grants were added.
See [private downloads](https://supabase.com/docs/guides/storage/serving/downloads)
and [storage access control](https://supabase.com/docs/guides/storage/security/access-control).

### Windows mirror and local recovery

The enrollment dialog includes a local destination folder picker. The secured
pipe conveys it only to the service; the service checks local-path and write
access before consuming the enrollment code and persists it in protected state.
An installed service requires pre-provisioned folder permissions for its virtual
service account and the intended user. Selecting a folder does not elevate access.
Configuration can supply `receiverDirectory`; the documented fallback is a
`Firmados` subfolder in agent state. The runbook explains its installed-user
visibility limitation and how to choose an accessible folder during enrollment.

`ReceiverMirror.cs` runs independently of the signer and heartbeat loops. It
never calls the token or sends a PIN. Metadata identifiers and hashes are bounded;
UNC, alternate-stream and reparse-point paths are rejected. Protected staging uses
`.part` files and verifies expected length and SHA-256. Publication copies to a
temporary file on the destination volume, flushes it and performs an atomic rename.
Existing different PDFs are preserved: deterministic document/version names gain
a checksum suffix and, if necessary, a bounded numeric collision suffix.

Acknowledgement occurs after the final PDF exists and is verified while held open
against local modification. A lost acknowledgement retains the journal and exact
local file for replay; it cannot be converted into a failed-copy path that loses
manifest creation. Restart validates an existing output before re-acknowledging it.
The manifest records document ID, signed-version ID, checksum, filename and delivery
time without PINs or private signing data. The cursor and pending page are durable.

Interrupted protected staging restarts safely. An abrupt process crash during the
destination copy can leave an unreferenced `.part`, but it is never published or
acknowledged as a PDF. Local edits and deletions have no upload/delete-back path.
This phase does not continuously reconcile already acknowledged local deletions;
they remain local mirror issues recoverable from the authoritative document.
The original archive and unsigned source remain untouched.

### Acceptance and verification

- **293 standard tests passed**, with 69 explicitly opt-in cases skipped in that
  command. Auth/audit verification passed for 354 files and UTF-8 checks passed.
- **65 live PostgreSQL tests passed** across seven files, including six Phase 9
  cases. They cover atomic scheduling, two assigned receivers, idempotent ack,
  foreign/unassigned/unauthenticated/revoked access, signer/receiver role separation,
  corrupted storage, revocation during download, delayed cursor recovery,
  historical enrollment and rollback on delivery insertion failure. The final
  targeted six cases passed again after attempt/error-state refinements.
- Windows publish passed. The final native regressions passed **12 foundation,
  22 session, 8 transfer and 10 receiver checks**. The receiver checks exercise
  actual files, interrupted staging, corruption rejection, collision preservation,
  lost-acknowledgement restart, manifest persistence, role/path rejection and local
  edits without propagation. Evidence: `agents/windows/artifacts/phase9/`.
- **Real two-receiver HTTPS acceptance passed** using two separate compiled agent
  processes, CNG identities, state directories and destination folders on this
  Windows host. The backend/device handler and disposable PostgreSQL schema were
  real, as were upload and download through the private `documents` bucket.
  It reused the exact Phase 7 accepted synthetic estampo; no new signature or
  token login was performed. The transport fixture injects its existing validation
  report and does not claim a fresh cryptographic assessment. The signing engine
  and independent validator remain the Phase 7 implementation.
- Both received PDFs matched SHA-256
  `6266cd0bb948e058cb84135e580c6fa4937c2da2bb632092698a17c67ac7c61e`.
  The run deliberately truncated a response, discarded a successful acknowledgement,
  preserved an existing different local PDF, stopped/restarted a receiver and
  observed rejection after revocation. Public copies are retained as
  `phase9/receiver-1-signed.pdf` and `receiver-2-signed.pdf`; machine-readable
  results are in `phase9/receiver-https-results.json`.
- The initial database fixture used an unsupported validator-provider literal;
  it was corrected before passing. Restricted NuGet/CNG attempts failed on
  environment access, and permitted runs passed. The native manifest audit found
  and corrected lost-ack journal retention; its native regression passed and
  the final HTTPS rerun additionally requires both manifests to persist.

- The final HTTPS rerun passed with **both local manifests persisted**, in
  addition to identical files and all interruption/revocation assertions.
  The final native receiver self-test also passed all ten checks. The final
  Next.js production build passed with TypeScript/lint, and **six Chromium
  browser cases passed**, including the receiver-only connected label and all
  existing selection, consent, recovery and authorization regressions. The final
  desktop screenshot was inspected. Browser output is under
  `agents/windows/artifacts/phase9/browser-run`.
- Live infrastructure verification passed with zero warnings. Final cleanup at
  **2026-09-22 15:35:05 UTC** found **zero** disposable signing schemas, synthetic
  signing offices and production signing devices, with 44 migrations applied.
  Both received-file hashes match acceptance and both manifests were confirmed.
  No temporary native agent or installed test service remains. The test HTTPS
  listener, cloud objects, CNG identities and credential directories were removed;
  the local browser verification server was stopped. Evidence:
  `phase9/cleanup-results.json` and `phase9/final-local-audit.json`.

### Phase 9 requirement and exit-criterion audit

| Requirement | Authoritative evidence |
| --- | --- |
| Receiver role has no signing/PIN access | Stored-role device authorization; six delivery DB cases and the 22 native session checks reject receiver signing; receiver-only loop invokes no token. |
| Destination configured during enrollment | Tray picker, restricted pipe and pre-enrollment write/path validation; both live agents enrolled with their separately selected folders. |
| Deliveries only for committed signed output | `scheduleSignatureDeliveries` in the artifact commit transaction; DB tests prove none before commit, uniqueness on replay, and complete rollback on delivery insertion failure. |
| Durable cursor | Protected `MirrorState` binds device/office/folder and persists pending page/cursor before processing; DB delayed-failure/wrap test and native/live restart tests. |
| HTTPS and short-lived authorization | Actual TLS transfer using five-minute device sessions; receiver/office/assignment/revocation checks, including recheck after storage I/O. No storage keys or URLs returned. |
| Temporary writes, length/hash checks and atomic publication | Real `DeviceApi.Download` plus `ReceiverMirror.Materialize`; ten native cases and deliberately interrupted live HTTPS response; no corrupt final PDF. |
| Deterministic collision handling | Native original and subsequent collision checks; live acceptance preserves a different existing PDF and writes the verified copy under its checksum suffix. |
| Ack only after final verified file | File is held open through acknowledgement; live dropped-success response and native restart replay; final HTTPS test requires both manifests. |
| Resume after interruption/restart | Durable pending assignment, owned staging restart, same-byte ack replay, offline receiver process restart; native and actual HTTPS evidence. |
| Local manifest without private data | Per-delivery document/version/hash/filename/time record; final native and HTTPS assertions confirm persistence, with no PIN or private key in the record. |
| Local edits/deletions cannot affect archive | Mirror has no upload/delete-back API path; native local-change/collision assertions and real private-storage source reread. Already acknowledged local deletion is a local recovery issue. |
| Two enrolled receivers obtain identical PDF | Two compiled processes with separate CNG identities/directories download from real private storage; both retained PDFs match the accepted Phase 7 hash. |
| Third unregistered device cannot download | Live DB rejects an unknown session before assignment/storage access; foreign/unassigned receiver and signer-only denial cases also pass. |
| Revoked receiver cannot receive new files | Database tests reject pending/download/ack after revocation and revoke during I/O; real agent observes authentication rejection; scheduling excludes revoked devices. |
| Evidence, checks and phase boundaries | 293 standard, 65 DB, six browser, 12/22/8 native regressions and ten receiver checks; real HTTPS acceptance, production build, infrastructure and cleanup passed. No new token signing, production activation or signed installer rollout. |

**Phase 9 exit criterion met:** enrolled authorized receivers automatically obtain
the committed signed estampo as identical verified local PDFs, with safe recovery
and preserved authoritative storage. Acceptance used two isolated receiver
instances on one Windows host; the multi-computer office pilot, signed installer,
broader monitoring and production activation remain Phases 10–11. Automatic
enqueue and proxy trust remain disabled and no production validator is configured.


## Phase 10 — Failure policy, retries, monitoring and audit completeness

Implemented September 23, 2026. This phase preserves immutable source/output
versions, server-owned validation, office isolation, B/LT/LTA selection and the
session-only PIN policy. The three phase reports were read before implementation.
Prisma status, deploy and generate passed in order: **44 applied migrations**, no
pending migration and no new schema migration required. No production office,
agent installation, automatic enqueue setting or validator deployment was enabled.

### Failure policy and recovery

| Failure class | Behavior |
| --- | --- |
| Network, storage, validator unavailable/busy | Signing queue uses its existing per-item attempt budget (default four), exponential delay from 5 seconds capped at 5 minutes. Transfer retries reuse retained signed bytes. |
| TSA or OCSP/CRL evidence unavailable | Explicit fixed codes, bounded pending retry, unchanged requested profile. A known failed engine attempt may be released for a fresh claim; the engine failure closes the token session, so local reactivation is required before another token operation. |
| Missing token, missing/failed driver, disk permissions/space | Operator attention; no automatic token/PIN operation. |
| PIN incorrect, locked or expired | Distinct fixed codes, operator attention, no automatic PIN retry. |
| Expired/revoked certificate, invalid signature, checksum mismatch | Fail closed. No promotion and no weaker-profile fallback. Server pyHanko revocation status now produces CERT_REVOKED through both local and HTTPS validator transports. |
| Unknown/interrupted token outcome | Preserve journal/output and require reviewed recovery. Expired SIGNING leases become WAITING_FOR_OPERATOR. |
| Receiver network/storage | Six attempts per reviewed cycle; exponential delay from 30 seconds capped at one hour. Failed responses are idempotent and cannot extend the delay repeatedly. |
| Receiver disk/checksum/collision/unknown | Pause immediately for operator action. Same-office admins can reactivate delivery after explicit review; stale attempt snapshots, revoked devices and foreign offices are rejected. |

Agent **0.10.0** persists its signed-upload failure count and next retry time.
Six failed transport cycles or a permanent rejection stop upload attempts while
preserving the journal and exact signed file. Even an exhausted journal reconciles
an already-committed result through the original device/attempt and checksum;
it does not upload or sign again. Connectivity/acknowledgement polling uses capped
backoff and continues so restored connectivity can be detected. Receiver begin
replays do not consume another attempt while the same download is in progress.

Batch aggregation retains the existing semantics: remaining runnable work can
complete despite other failed items; operator waits remain explicit; all-success
is COMPLETED, mixed terminal outcomes are PARTIAL, and all-failed is FAILED.
Exhausted signing budgets remain a deliberate stop; reviewed recovery cannot
bypass the signing attempt limit.

### Central monitoring and maintenance

Firmados now includes an office-wide alert panel independent of execution-date
filters/pagination. It derives alerts directly from durable device, item, attempt,
validation-event, artifact and delivery records, so monitoring does not depend on
an agent or browser processing the queue. It detects:

- Missing/stale heartbeat after 90 seconds; token missing and driver/certificate
  selection problems; certificate expiry within 30 days and already-expired or
  reported/validated revoked certificates.
- Queue age and delivery lag beyond 15 minutes, operator-required/failed work,
  expired assignments and uncommitted uploads awaiting cleanup.
- Repeated TSA and revocation failures (two in 24 hours), individual validation
  rejection and repeated validation failure (two in 24 hours).
- Receiver disk errors/low space (below 64 MiB), local processing errors, failed
  deliveries, and maintenance missing/stale for 10 minutes.

Diagnostic codes are returned only to office administrators; members receive
fixed business messages. Each signed row exposes its certificate SHA-256, signed
version/checksum, validating time and signer device, alongside each receiver's
status, delivered time, retry time and reviewed recovery action. Local worker
failures are included in strict, fixed-code heartbeats. Disk reporting uses the
receiver destination volume. Heartbeats continue through signing using the last
public certificate observation without opening another PKCS#11 session.

The protected GET endpoint at /api/internal/signing/maintenance runs lease
recovery and safe Phase 7 orphan cleanup even when no signer is online. It services
up to 100 offices oldest-success-first, retains the existing 100-lease/20-artifact
per-office bounds, and stops starting additional offices after four minutes.
Each successful office pass records a canonical maintenance marker; failures
return 503 and the dashboard independently detects missing success. Committed
artifacts and objects referenced by document versions remain protected.

Deployment must provision **CRON_SECRET** (random, at least 32 characters) on the
server and scheduler. Missing/wrong secrets fail closed before database work.
Use **SIGNING_MAINTENANCE_URL** pointing to that HTTPS endpoint and run
**node scripts/signing/maintenance-runner.mjs** under a supervisor; it dispatches
one bounded request per five-minute cycle, rejects redirects/credential-bearing
URLs and emits fixed diagnostics. **--once** exits with success/failure for an
external scheduler. The scheduler is implemented, but has not been installed or
activated against production in this phase.

An existing managed scheduler can call the same endpoint every five minutes.
Vercel Pro/Enterprise can use a five-minute cron; Hobby supports daily schedules
only, so vercel.json was left unchanged rather than adding a plan-dependent
deployment failure. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
and [cron authorization](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
The maintenance credential is never sent to a signing/receiving agent.

### Audit, correlation and retention

Canonical events include assignment, web-requester remote authorization, signing
start, automatic retry scheduling, successful independent validation, failed
validation and delivery start/reviewed retry, in addition to the existing request,
claim, attempt, commit, cancellation, delivery failure/acknowledgement and device
enrollment/revocation events. `signing.remote_authorized` records the requesting
account, device, attempt, exact source version/hash, certificate, batch and enabled
remote-session ID. Session identity is attested by the authorized agent; it is not
an independently verified Windows-user identity. Historical `signing.local_approved`
events are retained without relabeling them as remote authorization.

Validation failures persist separately without promoting a document. Successful
validation, commit, signature evidence, item/attempt completion, version promotion
and delivery creation remain atomic. Critical audit persistence failure rolls back
the associated mutation. Commit metadata includes source/output versions and
hashes plus certificate identity. Historical delivery failures retain fixed error
codes and attempt counts even when an operator reactivates a delivery.

Device requests generate correlation IDs; structured logs project only fixed
fields and allowlisted error codes. The correlation ID is returned in
X-Signing-Correlation-Id and propagated into signing/validation audit events.
The local batch ID links native diagnostics with device-attested approval.
Arbitrary exception text, request bodies, authorization, PINs, URLs and storage
credentials are never included in these new diagnostics.

Retention rules:

- Native technical diagnostics: one 1 MiB operations.jsonl plus one previous
  file, maximum 30-day age enforced on the next write, under existing protected
  state-directory ACLs. An offline machine cannot perform timed deletion until
  the process runs again.
- Server stdout/request diagnostics: deployment log destination must enforce a
  maximum 30-day retention and restricted operations access. This is an explicit
  deployment requirement; no external log-provider setting was changed.
- Expired device sessions/challenges: maintenance removes them after 24 hours.
- Canonical audit, attempts, signature/validation evidence, referenced source and
  signed PDFs, delivery records and manifests: retained indefinitely by this
  implementation. No technical-log cleanup can delete them. Any future legal
  retention or archival/LTA policy needs its own approved implementation.
- Active/unresolved local journals and PDFs remain available for reviewed recovery;
  only uncommitted, unreferenced server uploads follow the existing two-hour
  reservation expiry and safe cleanup protocol.

Current Supabase changelog, RLS and storage access-control documentation were
reviewed. The project remains Prisma-only/default-deny for signing tables; no
Data API grant or storage exposure was added. References:
[Supabase changelog](https://supabase.com/changelog),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[storage access control](https://supabase.com/docs/guides/storage/security/access-control).

### Verification

| Check | Result |
| --- | --- |
| Standard integration suite | **320 passed**, 77 opt-in checks skipped in this invocation. |
| Opt-in database suite | **73 passed**, across eight isolated schemas cloned from deployed constraints/triggers. All temporary schemas removed. |
| Production build | Next.js production compilation, TypeScript and lint passed. |
| Repository guards | Authentication/audit scan (360 files), UTF-8 and infrastructure verification passed; live database connectivity passed with zero infrastructure warnings. |
| Browser | **Seven Chromium cases passed** against the local production build, including mobile alerts/evidence/reviewed delivery retry, read-only views, exact retry payloads and actual endpoint authorization. UI mutations use intercepted synthetic fixtures. |
| Windows publish | Self-contained win-x64 agent 0.10.0 published successfully, zero warnings. |
| Native regression | Foundation **12**, session **22**, transfer **8**, receiver **10**, reviewed recovery **5**, failure/retention/reconciliation **17** checks passed. No token login. |
| Actual compiled agent over HTTPS | **Two integration cases passed**, including identity/session, heartbeat, restart and revocation. The connected USB token was probed for public certificate information only. |
| Fresh cryptographic fixtures | **Four cases passed**: current revocation evidence, missing evidence rejection, revoked signer rejection with CERT_REVOKED, and altered-source rejection. |
| Private validator HTTP | **Four valid-signer checks and four revoked-signer checks passed**, including bearer enforcement and fixed error propagation. |
| Deployment safety | Scheduler fails closed without configuration. No production agent enrollment, validator, maintenance scheduler or automatic enqueue was activated. |

The initial run against retained historical LT fixtures rejected the dated real-token
fixture under current-time validation. That run is **not counted as passing** and
does not establish a new hardware LT signing result. Fresh software certificates
and CRLs were generated for this phase's failure-policy checks. No PIN was requested,
no C_Login was performed, and no new token signature was produced. The earlier
phase reports remain the source of the hardware signing evidence.

Local evidence (gitignored generated artifacts):

- `agents/windows/artifacts/phase10/`: the six native self-test JSON reports,
  `monitoring-mobile.png`, `validator-http.json`, `validator-http-revoked.json`
  and `cleanup-results.json`.
- `agents/windows/artifacts/phase10/validator-tests-593b2729ec2444d382c0d129b2e35631/`:
  fresh cryptographic fixtures and validation results.
- `agents/windows/artifacts/integration-results.json`: compiled-agent HTTPS evidence.

Repeat the main checks with `npm run test:integration`,
`npm run test:signing:database`, `npm run build`, `npm run check:auth-audit`,
`npm run check:utf8` and `npm run verify:infrastructure`.
Run `npx playwright test e2e/firmados.spec.ts --project=chromium` with the existing
QA authentication and a local test server. Native executable flags are documented
in `agents/windows/README.md`, including `--failure-policy-self-test`.
`scripts/signing/test_validator.py --fresh-only` selects newly generated fixtures;
the test still requires the validator dependencies/configuration described in the
earlier phases. Do not interpret opt-in skips as executed acceptance checks.

Final cleanup verified **zero temporary signing schemas, zero synthetic public
offices, zero public signing devices and 44 applied migrations**. Automatic enqueue
and trusted proxy remain disabled; validator and maintenance configuration remain
absent. Temporary HTTP servers and agent processes were stopped. No Windows
service was installed. Generated changes to the older tracked screenshots and the
unchanged Vercel deployment file were restored; the Phase 10 screenshot is retained
under the evidence directory.

### Phase 10 requirement and exit-criterion audit

| Requirement | Evidence |
| --- | --- |
| Explicit failure policy and bounded retry | Fixed error map, queue/delivery budgets, persisted native upload budget, unit/native tests and 16 actual database failure injections. |
| No automatic PIN retry or PAdES downgrade | PIN errors require an operator; requested LT survives injected failures; a failed engine session must be locally enabled again before retry. |
| Partial batches finish remaining work | Actual database mixed-outcome batch completes its remaining item, preserves one signature on commit replay, and aggregates PARTIAL. |
| Central visibility independent of active signer | All-office monitoring ignores date filters; stale heartbeat/maintenance and expired-lease/orphan alerts expose interrupted/offline work. Database maintenance test runs without an online device. |
| Distinguishable automatic retry and operator intervention | Retry times, fixed business messages and per-receiver status in Firmados; tested mobile review workflow and admin/member separation. |
| Recoverable delivery and lost commit response | Bounded delivery retries with audited admin review; native exhausted-journal reconciliation verifies the already-committed checksum without upload or token use. |
| Reconstruct request, signer, source, validation and delivery | Canonical related events plus immutable version/hash/certificate evidence; database assertions cover local approval, validation failure/success, commit, retries and delivery history. |
| Critical audit must persist | Injected audit persistence failure rolls back signing start; existing atomic completion/delivery rollback checks also pass. |
| Safe diagnostics and retention | Generated correlations on JSON/PDF responses, allowlisted logging/heartbeat payloads, strict audit metadata, native redaction/rotation/age tests and preservation of audit/attempt evidence during maintenance. |

**Phase 10 exit criterion met in the implemented and tested workflow:** signing
and delivery failure classes are represented by durable state, visible central
alerts, explicit retry scheduling or operator action. Offline agents and absent
maintenance are themselves visible. This is dashboard monitoring; it does not
send email/SMS alerts. Runtime maintenance and server-log retention must be
provisioned during deployment as described above. The installer, multi-computer
office pilot, operator acceptance and production activation remain **Phase 11**.

## Phase 11 — Release tooling and local verification; pilot still pending

Started September 23, 2026. **Phase 11 is not complete and production is not
approved.** The user confirmed that two receiver computers are not currently
available and delegated the technical release choices. No code-signing certificate
with a private key was found in the Windows user/machine certificate stores.
The current process is not Windows-administrator elevated. These limits are not
replaced by local test processes or an unsigned build.

Before implementation, Prisma status, deploy and generate passed in that order:
44 migrations applied, none pending, no new schema migration. All Phase 10 changes
remain in place. The implementation adds the following:

- **Agent 0.11.0 and release compatibility policy.** Server-only
  `SIGNING_MIN_AGENT_VERSION` prevents older/unknown versions from claiming or
  starting new signing work and beginning new receiver transfers. Heartbeats,
  existing transfer completion, recovery, acknowledgements and retirement remain
  available. Malformed policy fails closed. Firmados shows an update alert.
  An unset floor preserves pre-rollout behavior; the current remote-session
  deployment requires `0.12.0`, documented in `.env.example`. No active environment was changed.
  The agent reports its assembly version; this is compatibility control, not
  remote binary attestation.
- **Authenticated retirement.** A purpose-bound proof of the software device key
  can revoke only that same device. The transaction invalidates all sessions and
  challenges and records canonical revocation once. Replay after a lost response
  returns the confirmed result, including for an already-revoked device. The native
  administrative retirement command requires the service stopped, refuses active
  signing journals, retains a receipt, and deletes the software key only after
  confirmation. It never operates the USB private key.
- **Installer source and signed-release builder.** `Notifica.Setup` builds an x64
  bootstrapper using the Windows .NET Framework 4.8 prerequisite. Embedded scripts
  are extracted under administrator/SYSTEM-only ACLs. Child PowerShell uses the
  system executable and module directory; SCM operations use the absolute Windows
  binary path. The bootstrapper and agent executables/assembly must have the same
  pinned publisher as the trusted, timestamped Authenticode manifest. SHA-256 binds
  the entire payload. Manifest/archive locks span verification and consumption.
  There is no release-mode option to skip signature checks.
- **Pinned packaged dependencies.** .NET agent runtime 10.0.12, build SDK 10.0.401
  without roll-forward, Microsoft OpenJDK 21.0.12.1+1, and DSS 6.5. The Java/DSS
  archives are checked against the existing known SHA-256 values; upstream
  redistribution materials are retained. Drivers remain separately installed.
- **Protected service and tray installation.** A virtual service account, local
  non-exportable machine CNG identity, delayed startup, 10/30/60-second service
  recovery, per-user tray task, protected version/configuration/state directories,
  explicit certificate/trust/TSA setup, a newly provisioned receiver directory,
  readiness tied to the current SCM process/version, and an Add/Remove Programs
  entry. Enrollment still authorizes SIGNER, RECEIVER or SIGNER_RECEIVER centrally.
- **Staged upgrades and rollback.** Signed manifests constrain pilot computer names,
  source versions, minimum version, upgrade/rollback intent and authorization expiry.
  New versions use separate protected directories. The switch journals its previous
  installation/configuration, restores it on activation failure, and keeps a durable
  recovery journal if rollback also fails. Explicit `repair` restores an interrupted
  upgrade. Active signing journals block upgrade/removal. A signed rollback cannot
  go below the installed minimum. First installation now records its validated
  configuration/key identity before service/key provisioning. `repair` resumes
  that checkpoint, preserves an existing key and refuses to replace a missing
  enrolled identity. Failures before checkpoint creation still require inspection.
  Setup serializes operations, validates public configuration before directory
  creation, and checks recorded service/tray ownership before stopping them.
  These recovery paths have not passed the elevated signed-install acceptance
  scenario.
- **Removal preserves evidence.** After confirmed retirement it removes the service,
  tray task and installed-program entry while retaining configuration, binaries,
  source/output PDFs, receiver copies and manifests. If retirement cannot be
  confirmed, removal stops with the installation retained. It performs no recursive
  document-directory deletion.
- **Runbook and acceptance gate.** The new
  [Phase 11 runbook](signing/PHASE-11-RUNBOOK.md) covers release preparation,
  installation/enrollment, upgrades, rollback, removal, certificate renewal, token
  replacement, PIN reset, device revocation, partial batches, TSA/OCSP outages and
  recovery. The [pilot record](signing/phase11-pilot.template.json) contains every
  mandatory scenario. The verifier requires operator acceptance, two distinct
  receiver computer/device identities, matching PDF hashes, complete scenarios and
  gates, and existing hash-matched evidence files. Broad release metadata binds the
  accepted record's hash. This checks completeness, not the truth of an operator's
  attestation; release owners must review the evidence itself.

### Verified locally

| Check | Observed result |
| --- | --- |
| Standard integration | **331 passed**, 80 opt-in checks skipped in that invocation. |
| Full signing database suite | **76 passed**, including purpose-bound retirement/replay, foreign-device proof rejection, session invalidation, version gating and in-progress delivery completion. Disposable schemas only. |
| Production build and guards | Next.js compilation/type checking/build passed; standalone lint had no warnings/errors; auth/audit scan passed (361 files); UTF-8 passed; infrastructure/live DB checks passed with zero warnings. |
| Signing-center browser suite | **Seven Chromium cases passed** against the production build, including actual endpoint authorization and synthetic UI mutation fixtures. This is the signing-center suite, not a claim that every unrelated deployed-QA workflow was executed. |
| Native agent checks | Foundation **14**, signing session **22**, transfer **8**, receiver **11**, reviewed recovery **5**, failure policy **18** passed. Foundation checks include guards against provisioning/repair with a user-key configuration. The new receiver check proves update-required preserves pending work without falsely reporting a failed transfer. |
| Packaged Java/DSS | **Five software-certificate checks passed** using the candidate's actual bundled runtime/library paths, including B/LT/LTA engine paths. No USB login or operating-system trust change. |
| Actual agent HTTPS | **Three cases passed** across signer foundation and two receiver processes: CNG identity, public token heartbeat, restart/revocation, interrupted download, lost acknowledgement, collision preservation, same-byte private-storage delivery and source preservation. Both receivers ran on this one PC. |
| Release integrity/fault recovery | **34 checks passed** under both PowerShell 7 and Windows PowerShell 5.1. Covers checksum tampering, archive traversal/device names, target/source version restrictions, rollback floor, unsigned/wrong-publisher rejection, atomic configuration replacement, injected activation failure, successful rollback, failed rollback with retained journal, document preservation, side-effect-free preflight, receiver-directory separation, initial activation checkpoints and service ownership. |
| Pilot verifier | **Six checks passed** using explicitly fictional records; missing acceptance, a single computer, incomplete scenarios/gates and modified evidence are rejected. No actual pilot acceptance was recorded. |
| Candidate packaging | Checksum-pinned dependency assembly and native/bootstrapper compilation passed. The candidate is explicitly **unsigned and non-installable**, with `distributable=false` and no signed release manifest. |

Evidence is retained in `agents/windows/artifacts/phase11/`, including native JSON
reports, `bundled-engine-self-test.json`, `package-tests/results.json`,
`package-tests-ps51/results.json`, `pilot-verifier-tests/results.json` and
`candidate-final/candidate.json`. The final candidate payload hash is recorded in
that JSON. Existing HTTPS harness outputs are
`agents/windows/artifacts/integration-results.json` and
`agents/windows/artifacts/phase9/receiver-https-results.json`; their timestamps
identify this 0.11.0 regression run. Generated candidates/evidence remain gitignored.

### Acceptance still required — do not mark Phase 11 complete

| Requirement | Missing authoritative evidence |
| --- | --- |
| Signed installer and signed update packages | A provisioned organization-owned code-signing certificate/signing service, successful trusted publisher/timestamp verification and actual signed release artifacts. The USB FEA certificate is not a substitute. |
| Installed Windows lifecycle | Elevated installation, actual SCM recovery, tray access as the intended ordinary user, upgrade/rollback/repair/uninstall on the signed package, confirmation of credential revocation and preserved PDFs. Source/unit tests alone do not prove this. |
| Pilot topology | One pilot office, one actual signer token and **two separate receiver computers**. The user explicitly reports these receivers are unavailable. |
| Complete automatic chain and fault scenarios | Real workflow/manual selection from another computer, a locally enabled token session reused across hardware LT signatures, independent validation, authoritative storage and matching automatic delivery on both receiver computers; all scenarios in the pilot template observed and reviewed. |
| Renewal and operational acceptance | Actual certificate renewal/retirement exercise, local PIN/token/provider recovery checks, operator sign-off and review of the complete evidence pack. |
| Production rollout | Accepted signed pilot, release security review and required QA suites, verified TLS/private validator/TSA settings, minimum version, maintenance schedule and log retention, then controlled office activation. |

Automatic enqueue, trusted proxy, validator and maintenance production configuration
remain disabled/unconfigured. No public signing devices were enrolled, no Windows
service was installed by this phase, no code-signing certificate was procured, and
no trusted roots were installed. The connected token was used only for public
certificate probing, not a new private-key signing operation. **Phase 11 remains
open until the signed installed pilot and operator acceptance are actually proven.**

Final cleanup confirmed zero temporary signing schemas, zero synthetic public
offices, zero public signing devices and 44 applied migrations. Temporary agent
processes and the local browser-test server were stopped. The two historical
tracked screenshots regenerated by the browser checks were restored. The latest
unsigned candidate has payload SHA-256
`20d7afe136514e1f0b96b685cd24c3aafc044c998d1d652881248e623dd9a13a`;
this checksum records the candidate, not a publisher signature or pilot acceptance.

Follow-up recovery hardening was rebuilt on September 23: both native projects
compiled successfully, release scripts parsed successfully, and the refreshed
foundation regression passed all 14 checks. Its first sandboxed attempt could
not use Windows CNG; the unrestricted run passed and removed its temporary
software key. The 34 release checks passed on both PowerShell versions. No service
or operating-system trust was installed, and no USB login was attempted. The
checkpoint and ownership changes above remain subject to the signed installed
lifecycle acceptance gate; they are not evidence of a completed office pilot.

## Remote signing from the receptor account — September 23, 2026

**Implemented in agent 0.12.0.** The owner explicitly selected one local token
activation followed by remote signatures while that session stays active.
The earlier phase instructions above were revised where they required an
administrator to request signatures or local approval/PIN entry for every document.
Dated hardware and controlled-test evidence remains identified as historical.

### Operational behavior

1. On the token computer, the configured Windows operator opens **Sesión de firma
   remota…**, verifies the office and certificate, accepts the office-request
   consent and enters the PIN once. The local SID and service identity checks
   still protect that channel; enrollment and PIN transfer remain separate.
2. Any authenticated, active account member of that same office can select and
   authorize eligible documents in **Firmados** from another computer. That
   browser does not need a Windows agent, the USB token or its PIN. There is no
   additional local approval per document. A RECEIVER agent still only downloads;
   the user on that computer authorizes signatures through the web.
3. A private, owned worker keeps the actual authenticated PKCS#11 session open
   for at most eight hours. It receives the PIN once, clears it after login and
   processes one immutable document per claim. It does not store a PIN for later
   logins. Per-document execution remains bounded to five minutes. Public health
   probes are suppressed while the session owns the provider.
4. **Cerrar sesión de firma**, expiry, service restart or token/engine failure
   closes the session. Removing the token closes it when the failure is detected;
   reconnecting it does not reactivate signing. Closing just the tray window
   leaves the session enabled. Pending requests can execute after activation.
5. Without an enabled session, the agent does not claim new work and reports
   `PIN_REQUIRED`; Firmados can show the session-required operational alert.
   Incorrect, locked and expired PINs are distinguished without an automatic retry.
6. Administrators retain recovery, cancellation, delivery retry and device
   management. A failed/uncertain attempt retains its journal for reviewed recovery.
   An already signed PDF follows the existing same-byte upload/reconciliation path;
   a lost network response is not permission to invoke the token again.

### Authorization and evidence

- Server queries recheck active office membership when accepting a web request,
  selecting work and starting the signing operation. Foreign/inactive accounts
  cannot authorize work for that office. Source version/hash, certificate, role,
  lease, requested profile and independent PDF validation remain enforced.
- `signing.remote_authorized` records the actual requesting account, device,
  attempt, immutable source version/hash, certificate, batch and remote-session ID.
  Persistence is critical: an audit failure rolls back the start fence. Historical
  local-approval events keep their original meaning. A shared account identifies
  the account used, not which human was physically at a remote keyboard.
- The remote-session ID is public correlation metadata attested by the agent,
  not a PIN or bearer credential. The device contract rejects PIN fields and
  conflicting local/remote approval modes. A queued operation cannot silently
  switch to a replacement token session after its session ID was captured.
- Agent and setup source versions are 0.12.0. The example minimum-version floor,
  installation example and Phase 11 runbook were updated. Existing unsigned
  0.11.0 candidates are historical artifacts and must be rebuilt before rollout.
- The Spanish manual was revised throughout and regenerated as a 27-page
  edition 1.1: `output/pdf/NOTIFICA_IA_Manual_de_Firma_Digital.pdf`. Instructions
  now distinguish web users, the token host, receivers and administrative recovery.

### Verification

| Check | Result |
| --- | --- |
| Required Prisma startup | Status, deploy and generate succeeded in order; 44 applied migrations, none pending; no new schema migration required. |
| Application | Production build, TypeScript and ESLint passed; 331 standard tests passed. |
| Signing database suite | 78 passed across eight suites using disposable schemas. Follow-up checks passed for requesting-account attribution, audit rollback and the strict remote-start device contract. |
| Chromium | Seven cases passed against the production build, including ordinary-member selection/authorization, no web PIN, exact retry payloads, mobile layout and actual endpoint authentication/origin checks. Mutations used synthetic intercepted fixtures. |
| Native signing session | 28 checks passed, including two separate requests with one simulated login, explicit close, eight-hour expiry, office/certificate binding, token-removal failure, no PIN retry and no profile downgrade. |
| Native coordinator recovery | Seven checks passed: no claim while locked, automatic processing after activation without local per-document approval, retained failure, no unreviewed second operation, fresh reviewed lease/batch and preserved source. |
| Worker / secured pipe / native window | Six checks passed with process exit 0. A deliberately missing provider proves failed activation clears the PIN and leaves no enabled session; the actual form requires consent and preserves typed input through secured-pipe polling. Its rendered layout was inspected. |
| Manual | All 27 pages rendered and visually reviewed; pagination, titles and extracted text checks passed. |

These native tests use synthetic token implementations or a deliberately missing
provider. **No real token PIN or private-key operation was used to test the new
remote-session workflow, and no agent was installed or deployed.** The real
multi-computer, signed-installer pilot remains part of the open Phase 11 gate.
Historical successful USB signatures do not establish that this new end-to-end
remote workflow has already passed that pilot.

## Operator-managed unsigned GitHub distribution — September 24, 2026

The owner explicitly declined purchasing a code-signing certificate and selected
personal installation by remote control. A separate Windows distribution folder
was requested, rather than publication of the whole web application repository.

Implemented `agents/windows/release/build-managed-distribution.ps1` and the
`release/managed/` installer, manifest verifier, tests and Spanish guides. This is
an explicit unsigned installation path; the Authenticode bootstrapper remains
unchanged and optional. The package makes no claim of a verified Windows publisher.

The installer supports new installations and resuming its own incomplete install
with the same package/request hashes and device key. It rejects existing completed
installations rather than overwriting their identity or documents. It verifies an
operator-supplied manifest hash, package files and payload; preserves protected
ACLs, virtual service identity, local SID checks, configuration validation, token
driver signature checking and service readiness checks. It does not disable Windows
protections. Updates, rollback and removal of these manual installations require
a separately reviewed procedure; the old signed bootstrapper is not that procedure.

Prepared output:

- `output/github/notifica-windows/repository`: eight small files (Spanish guides,
  installer tools, sanitized receiver template and `.gitignore`) for a new private
  GitHub repository, suggested name `notifica-windows`.
- `output/github/notifica-windows/release-assets`: the approximately 406 MiB
  `NOTIFICA-Windows-0.12.0-managed.zip`, SHA-256 list and ready-to-copy release notes.
  The ZIP belongs in **GitHub Releases**, not ordinary repository commits.
- ZIP SHA-256: `5f429a0002b5efbf38f1a0dd685462115dabb6106a669c5838ca9b3c1ee12802`.
- Manifest SHA-256: `030e1d7638791d761a3318d0e373da36f1d483e5fdfee4a475c248e984cb53ce`.

The builder uses a hash-pinned previously verified runtime archive and rebuilds
the current .NET agent and Java bridge. It retains dependency notices while
omitting the upstream public demonstration P12 key. The final payload scan found
no PFX/P12/private-key filenames, environment files, device identity, customer
configuration or signing journals. No project `.env`, database or client PDF was
copied. Generated GitHub output is ignored by the application repository.

Verification: 12 managed distribution checks passed under PowerShell 7 and 5.1;
34 existing release integrity checks passed. The packaged agent passed 14
foundation, 28 signing-session and eight transfer checks. Final packaged Java/DSS
passed three synthetic PDF checks, including source mismatch and missing-TSA
rejection. The final outer ZIP was re-extracted, its manifest/files/payload hashes
verified, and its PowerShell 5.1 preflight passed without creating an installation
or receiver directory. Required Prisma status/deploy/generate completed; the
verified local Next.js development server was restarted to release a DLL lock and
returned on port 3000. No migrations were pending.

During the September 24 preparation session, no GitHub repository or release was
created or published, no Windows service was installed and no real token login
was used. At that point, actual elevated installation, Windows policy compatibility
on target PCs and the multi-computer pilot remained pending; see the September 28
results below for subsequent installed testing.
The GitHub guide recommends a pre-release until those checks are accepted. SHA-256
provides comparison with the operator's trusted reference; it is not publisher
authentication. The guides explain that closing a Windows warning is insufficient
and some application-control policies can prevent unsigned execution entirely.

## Phase 11 — Installed managed pilot results — September 28, 2026

**Partial pilot passed; Phase 11 remains open and production is not approved.**
This entry consolidates the observations recorded in the
[Phase 11 runbook](signing/PHASE-11-RUNBOOK.md). It records previously performed
tests; this documentation update did not rerun the pilot or independently audit
the GitHub release. The owner reported creating the repository and downloading
`NOTIFICA-Windows-0.12.0-managed.zip` onto the separate testing laptop.

### Installed environment and enrollment

The package reference hashes are those recorded in the September 24 distribution
entry above. Both computers were new installations. Preflight returned
`PREFLIGHT_PASSED_NO_INSTALLATION_PERFORMED`; elevated installation ultimately
returned `INSTALLED_ENROLLMENT_REQUIRED` on each computer. Separate ten-minute
enrollment codes from the same office administrator enrolled both devices, and
the operator confirmed both connected in Firmados.

| Computer / enrolled device | Role | Observed setup |
| --- | --- | --- |
| `GONZA - Signer` | `SIGNER` | USB token with signed x64 `C:\Windows\System32\eTPKCS11.dll`; remote signing session enabled locally with consent and PIN. Signer installation used PowerShell 7. |
| `JARVIS - Receiver` | `RECEIVER` | Separate computer without a token; received PDFs automatically into `C:\NotificaFirmados`. Installation required the service-creation recovery described below. |

The public token probe returned `READY`, with certificate SHA-256
`67887678fae15909edc535e064368b78d0d65c0eeb70b314d4e9baccd16b1a01`
and expiry September 14, 2027. The probe itself did not log in or sign.
The backend used a temporary HTTPS tunnel to the local application. This is a
test environment, not a permanent production address. Replacing the origin
requires updating the server public-origin setting and protected agent
configuration. The signer used public CA/TSA certificates and the prior
controlled-test FreeTSA configuration; production provider approval is pending.

### Problems encountered and resolutions recorded

| Observation | Resolution and limitation |
| --- | --- |
| `LOCAL_PATH_REQUIRED` | Used absolute installer/request paths instead of a relative request path; integrity checks remained enabled. |
| `MANAGED_INSTALLATION_FAILED` / SID translation failure | Corrected the transcribed receiver SID using `whoami /user` under the intended interactive account. |
| `ADMINISTRATOR_REQUIRED` | Reran installation in an elevated PowerShell window. |
| `SERVICE_CONFIGURATION_FAILED` on JARVIS | Verified the incomplete installation had no service, created the service with `sc.exe --%` to preserve quoted paths, verified executable/account/delayed startup, then used the original package/request with `-Resume`. Identity and state were preserved. This proves recovery with operator intervention, not a clean original PowerShell 5.1 installation. The distributed installer was not patched or republished. |
| Enrollment `403 / ORIGIN_REQUIRED` | Configured the exact public HTTPS origin using server-only `SIGNING_BROWSER_ORIGIN`, with `SIGNING_TRUST_PROXY=true` on the loopback test backend. HTTPS, exact-origin and authenticated-office checks remained enforced; arbitrary forwarded host headers were not trusted. Fourteen relevant tests passed and an unauthenticated live request returned 401. |
| Validator-not-enabled warning | Enabled local `SIGNING_VALIDATOR_CONFIG` with the controlled-test runtime and public trust configuration. Four fresh cryptographic checks and four worker HTTP checks passed, including rejection of revoked certificates, missing revocation evidence, altered documents and unauthorized worker requests. An older token-signed sample still failed current trust validation; requirements were not relaxed. |
| Signing-center origin `403` | Updated its separate comparison to the same pinned public-origin policy while preserving direct local testing. Twenty-two targeted tests passed; login returned 200 and an unauthenticated center mutation returned 401. The rejected request had not entered the queue and was resubmitted by the operator. |

The targeted test counts above describe their respective recorded runs and must
not be added together as a count of distinct tests. The validator checks used
synthetic cases; they are separate from the real hardware observations below.

### Real signing and automatic delivery observed

With GONZA's token session active, the operator authorized requests from Firmados
on JARVIS, selecting `GONZA - Signer` and the guided PAdES-LT profile:

- **One estampo:** completed and appeared automatically in `C:\NotificaFirmados`;
  the operator located and opened the PDF.
- **Two-estampo batch:** the operator reported both additional documents completed
  during the ongoing remote signing session.

Server logs corroborated two successful center requests and three successful
`start`, `result`, `delivery-begin`, `delivery-download` and `ack` sequences.
Together with operator observations, this establishes real hardware-token
signing, server acceptance/independent validation and automatic delivery to a
separate computer for three documents.

The exact token-login count was not independently instrumented. A separate
authoritative-versus-local SHA-256 comparison and a complete immutable evidence
pack were not collected. The successful batch does not establish recovery from
a partially failed batch, and manual selection does not establish automatic
workflow enqueue or date-range filtering acceptance.

### Supporting records

- `.tools/temporary-test/app-enrollment.stdout.log`: enrollment and origin-fix observations.
- `.tools/temporary-test/app-signing.stdout.log`: successful signing/delivery sequences.
- `.tools/temporary-test/validator-tests-1cc51469fa2b47febad613b207058e8f/results.json`
  and `.tools/temporary-test/validator-service-fresh-readiness.json`: synthetic validator checks.
- `output/windows-signer-installer/token-probe-result.json`: public token readiness.

These are local working records, not a completed pilot acceptance record. Do not
include personalized installation requests, enrollment codes, device credentials
or PINs in an exported evidence pack.

### Remaining Phase 11 acceptance

The following list records the remaining September 28 pilot work. For the current
0.13.0 release, replace automatic-delivery acceptance with the shared-folder,
archive and upgrade checks in the
[October 1 update](#shared-office-storage-update-october-1-2026). The historical
0.12.0 pilot does not establish installed-PC acceptance of the new folder.

- Explicit session closure was deferred by the operator. Verify requests wait
  after closure and complete only after local reactivation; also verify service/PC
  restart, session expiry, token removal/reconnection, one-login reuse and account
  authorization boundaries on the installed workflow.
- Exercise interrupted upload/download and uncertain-result recovery, duplicate
  completion, partial-batch failure, offline/disk-full receivers, local PDF changes,
  timestamp/revocation-service failures and the remaining pilot-template scenarios.
- Verify device revocation and certificate expiry/revocation/renewal/retirement
  through controlled lifecycle exercises. Synthetic validator results alone do
  not complete those acceptance scenarios.
- Correct and republish the managed installer service-creation path and verify a
  clean Windows PowerShell 5.1 installation. Provide and exercise managed-package
  upgrade, rollback and removal procedures; the optional signed bootstrapper's
  tests do not prove these operations for the selected unsigned package.
- Add the second separate receiver required by the current pilot plan; only one
  receiver was installed in this session. Verify automatic workflow enqueue,
  manual date-range selection and identical authoritative/local PDF hashes on both.
- Complete and review `signing/phase11-pilot.template.json`, retain validation and
  delivery evidence, and obtain explicit operator acceptance.
- Before production activation, establish stable HTTPS, approved validator/trust/TSA
  policy, minimum agent version, scheduled maintenance, technical-log retention,
  security review and full release checks, then activate the accepted office in
  a controlled rollout.

No purchased code-signing certificate is required for the owner's selected
operator-managed path. **These successful installed tests advance Phase 11 but
do not close its remaining acceptance or production gates.**

## Shared office storage update (October 1, 2026)

**Status:** implemented and verified locally; Windows agent **0.13.0** and its
managed release ZIP are prepared. Publication, installation on the office PCs,
permanent hosting and production activation have not been performed by this work.
This entry supersedes the automatic-delivery behavior in Phase 9 and the
delivery-specific UI, monitoring and pilot instructions in later historical
sections. The remote signing-session/PIN policy above is unchanged.

### User-visible behavior and document lifetime

| Area | Current behavior |
| --- | --- |
| Office archive | One authoritative logical archive per office, currently backed by private Supabase object storage. Devices query the office catalog rather than receiving independently scheduled copies. |
| Authorized devices | Enrolled, non-revoked `SIGNER`, `RECEIVER` and `SIGNER_RECEIVER` devices have access to their own office. The signing laptop requires no receiver role, connected token or open signing session to read documents. |
| Windows location | The tray action **Abrir firmados de la oficina** opens `<configured Firmados directory>\Oficina-<officeId>`. The existing directory setting is retained. |
| Recent documents | The folder lists eligible, independently validated and committed FEA-signed PDF versions from the last **50 elapsed days**, across document types and originating PCs. It is not limited to the document's current version. |
| File transfer | Native Windows Cloud Files placeholders show the document catalog. Listing transfers metadata; opening or copying a PDF fetches and verifies its bytes. Windows previews or scanners may also request file content. There is no automatic full-PDF delivery to every PC. |
| Documents older than 50 days | They leave the managed Windows view but remain in the authoritative archive, database and signature evidence. **Firmados → Archivo de la oficina** searches and downloads the complete retained signed history. The 50-day window is a display/cache rule, not an archive retention limit. |
| Historical search | Search by document name, ROL, document ID or signed-version ID; download the exact signed version even after another version becomes current. |
| Existing local PDFs | Flat copies from the old receiver system remain outside the new office subfolder. The upgrade does not delete, overwrite or upload them. |

The cutoff uses `DocumentSignature.createdAt` in server UTC, with the lower
50-day boundary included and future dates excluded. It does not use the source
document date, notification execution date or the user's Windows clock as the
catalog authority. The service applies committed-artifact/version/checksum
eligibility checks; unvalidated uploads and failed signing attempts are not
published as office documents. Historical downloads are bounded to 32 MiB; the
existing 4 MiB new-signing transfer limit is unchanged.

Normal catalog polling is every 15 seconds with failure backoff. The agent must
fetch a complete authenticated, paginated snapshot before removing missing
entries. An interrupted refresh preserves the last complete view. An offline PC
can retain its previous catalog and cached content; uncached files require the
running agent and HTTPS access. Thus connected, refreshed devices see the same
office catalog, while an offline device can temporarily show an older snapshot.

When an entry ages out, only the owned placeholder/local cache is removed. An open
file can delay cleanup until Windows releases it. The folder is read-only to the
configured Windows user; rename/delete requests are denied and there is no
upload/delete-back operation. Unrelated files and conflicting filenames are not
overwritten. Exported copies are ordinary local files outside the managed view.

### Backend, Windows integration and authorization

- `lib/signing/officeFolder.ts` implements the recent device catalog, exact signed
  downloads and all-history browser archive. Device actions `office-folder` and
  `office-folder-download` use the existing challenge/session authentication and
  derive the office from the enrolled device, never a client-supplied office ID.
- Browser routes `GET /api/signing/archive` and `GET /api/signing/archive/[id]`
  require active office membership. They do not apply the 50-day restriction;
  downloads are audited and responses use private/no-store caching semantics.
- Downloads bind the immutable signed version to its committed artifact and
  checksum, check PDF header/length/SHA-256 and recheck authorization after storage
  I/O. Devices and browsers receive document/signature identifiers, not provider
  credentials or physical storage paths/URLs.
- `OfficeFolder.cs` and `CloudFiles.cs` replace the agent's active receiver-mirror
  loop. The managed distribution requires Windows 11 x64, local NTFS storage and
  the Windows Cloud Files platform. The service maintains the folder; the
  configured Windows user receives read/execute access.
- Revocation denies new downloads and clears owned cached entries when observed,
  including after an agent restart. Offline PCs, already open files and exported
  copies cannot be recalled immediately. Unrelated files are preserved.
- Signing completion and enrollment no longer create delivery fan-out/backfill
  rows. Legacy pending/failed deliveries remain historical and cannot start new
  copies; a transfer already `DOWNLOADING` may finish and acknowledge. Retired
  delivery operations return `DELIVERY_RETIRED` where applicable.
- Firmados now reports availability in the office folder or archive instead of
  per-PC delivery totals/retries. Obsolete pending-delivery alerts are removed;
  folder/disk monitoring also applies to signer-only devices.

No new schema migration or Supabase Data API grant/policy was required. Existing
office constraints, immutable version locators and append-only signing evidence
remain intact. Prisma's required status → deploy → generate sequence was run for
implementation and release preparation; 44 migrations were applied with none
pending. A repository development-server DLL lock was cleared for generation and
the server was restarted. `prisma migrate dev` was not used.

### Storage boundary and later dedicated archive server

`lib/documents/objectStore.ts` defines the server-only `DocumentObjectStore`
contract: `assertPrivate`, `download`, immutable `upload` and idempotent `remove`.
Both ordinary document storage (`lib/documents/storage.ts`) and signing artifacts
(`lib/signing/artifacts.ts`) use this boundary. Logical bucket/key identities stay
in the existing version/artifact records. Folder and application retrieval use
stable document/signature identities independently of the physical storage host.

| Server configuration | Meaning |
| --- | --- |
| `DOCUMENT_STORAGE_PROVIDER=supabase` | Default provider; private Supabase storage and server-only credentials. |
| `DOCUMENT_STORAGE_PROVIDER=archive-http` | Use the implemented HTTPS archive adapter. |
| `DOCUMENT_ARCHIVE_ORIGIN` | HTTPS origin of the future dedicated archive service. |
| `DOCUMENT_ARCHIVE_TOKEN` | Server-only archive-service credential, never sent to the Windows agents or browser. |

The adapter is implemented; a dedicated archive server has **not** been provisioned
or populated. That service must implement authenticated private-bucket metadata
and immutable object GET/PUT/DELETE operations, including `If-None-Match: *` on
creation. It must provide durable storage and backups. Plain HTTP, redirects,
unsafe paths and unauthenticated shares are not the supported archive interface.
The complete protocol is documented in the
[office-folder/storage runbook](signing/OFFICE-SHARED-FOLDER.md).

Migration is an explicit whole-store cutover, not automatic tiering after 50 days:

1. Inventory all referenced objects, including old signatures, source versions
   and pending signing artifacts.
2. Copy exact bytes under the same logical bucket/key; verify each object's length
   and SHA-256 against the database. Do not rewrite append-only signing evidence.
3. Pause document/signature writes briefly, copy and verify the final delta, and
   configure the application server to use `archive-http`.
4. Verify recent-folder reads, historical retrieval, new writes and private access
   before resuming normal operation. Preserve the prior provider for rollback;
   copy any new writes back before switching to it again.

The Windows folder location, Firmados search/download flow and agent-facing APIs
stay the same. This changes PDF object storage only; it does not by itself move
the application's database or authentication service away from Supabase.

### Release package and installed-PC rollout

Prepared output: `output/github/notifica-windows-0.13.0-release/`.
Its `START-HERE.md` has the GitHub release-page steps and exact PC commands.
The release assets are `NOTIFICA-Windows-0.13.0-managed.zip` (426,090,455 bytes),
`SHA256SUMS.txt` and `ACTUALIZACION.md`, with `RELEASE-NOTES.md` to paste into the
GitHub description. Suggested tag: `v0.13.0-managed.1`, initially a pre-release.

- ZIP SHA-256: `ade4e20898d2ac6bd2d85b01cb087af51ecf102cb43b61637df4fc8bfcacb65a`.
- Manifest SHA-256: `d701e09880aa3519a652e7e5c21909ee6fdd5e464ffdb0ea105af4068dac715f`.

The ZIP contains the agent, .NET/Java/DSS runtimes, new-install tools and a separate
`Update-Notifica.ps1` for managed **0.12.0 → 0.13.0** upgrades. Run its read-only
`-Preflight` from administrator PowerShell, then run the update. It preserves
enrollment, device key, office, role, configuration and documents; stages a new
program directory; verifies service startup; and retains the previous payload
for recovery. `-Recover` restores an interrupted update using its journal.
Unresolved signing work blocks replacement; journals must not be deleted to
force an upgrade. Existing PCs must not be uninstalled or re-enrolled. Other
installation types/versions require their own migration path. New PCs continue
to use `Install-Notifica.ps1`.

Deploy the updated web application/backend before the coordinated agent rollout.
During local testing, the temporary HTTPS site is sufficient only while the
updated application and validator are reachable at the agents' configured origin.
A stable hosted test environment is the recommended next deployment step; it
must include the separate PDF-validation service and its configuration. The
Windows updater preserves the existing server URL, so a changed origin must be
configured separately. Publishing a GitHub Release does not deploy the web app
or automatically install the package on PCs. Signing still requires the token
laptop online with a locally enabled remote signing session.

The selected distribution remains operator-managed and unsigned; a purchased
publisher certificate is not required for that path. Detailed upgrade/recovery
steps are in [ACTUALIZACION.md](../agents/windows/release/managed/ACTUALIZACION.md).

### Verification evidence and remaining acceptance

These are the recorded October 1 implementation/package results; this
documentation-only update does not claim to rerun those tests or deploy anything.

| Verification | Recorded result |
| --- | --- |
| Application regressions | 345 ordinary tests passed; gated suites remained explicitly skipped in that run. |
| Database behavior | 39 cases passed across folder, retired-delivery, artifact, center and operations suites using disposable schemas. |
| Native Windows folder | 12 checks passed on the newly packaged agent: metadata-only listing, hydration, corruption rejection, refresh/restart, expiration, revocation cleanup and preservation of unrelated files. |
| Two-agent HTTPS/private-storage test | Real SIGNER and RECEIVER processes listed the same office with zero listing downloads, opened identical signed bytes, retried interruption, handled restart/revocation and preserved the legacy copy/cloud source. It reused a previously accepted signed-PDF fixture, with no new USB-token login. |
| Browser | Six cases passed, including archive/mobile behavior. One real-center case returned 503 because the separate QA database lacked signing tables; that QA schema prerequisite remains unresolved. |
| Build/static checks | Optimized Next.js build, TypeScript, targeted ESLint, auth/audit verification and UTF-8 checks passed. |
| Release/updater | 15 distribution checks, 18 transaction/preservation checks and 10 full updater-entry scenarios passed. The entry scenarios simulated Windows service/task operations; they are not an installed-PC upgrade pilot. Final ZIP, payload and eight pinned distribution files verified; no excluded private-key/configuration/state files found. |

Evidence includes `output/office-folder-agent-0.13.0/two-agent-verification.json`,
the new release's `verification/` directory, database/integration test sources and
the detailed [office-folder runbook](signing/OFFICE-SHARED-FOLDER.md). The local
installed agent was observed as managed 0.12.0 and left running unchanged. Its
administrator-only updater preflight could not run without an elevated Windows
session; package preparation does not establish that installed upgrade result.

The new installed-PC pilot must verify the 0.12.0 upgrade on a receiver and the
signing laptop, preserved enrollment/configuration, matching folder contents and
PDF hashes, a real authorized token signature appearing on both, retrieval beyond
50 days, and service restart/recovery/revocation behavior. Finish the remaining
Phase 11 hardware/lifecycle/operational checks and operator acceptance before
production activation. The September 28 automatic-delivery pilot remains valid
historical evidence but does not close these new acceptance items.
