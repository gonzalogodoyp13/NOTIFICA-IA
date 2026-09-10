# Signing phases 1 and 2 implementation record

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
