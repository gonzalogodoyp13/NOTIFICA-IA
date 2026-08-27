# Legacy AuditLog retention policy

**Policy ID:** `AUDITLOG-DEV-ZERO-RETENTION-V1`  
**Approved:** 2026-08-26  
**Scope:** Legacy rows in `public.audit_logs` only

## Decision

The software is still in development and the legacy `AuditLog` data has no legal, contractual, operational, or product requirement for continued retention. Existing rows have a zero-day retention period from Phase 5 approval.

- No row is subject to legal hold.
- No row-level archive will be created.
- No legacy row will be copied or transformed into `ActivityEvent`.
- Existing rows will be permanently deleted in isolated QA first.
- Production execution requires separate explicit authorization.

`ActivityEvent` remains the canonical audit source. Its catalog, sanitization, outbox, append-only protection, office isolation, and report lifecycle events are outside this policy and must not be deleted or weakened.

## Deletion evidence

Before deletion, the retirement migration records one `audit.legacy_retired` ActivityEvent for each office that owns legacy rows. The event stores only:

- this policy identifier;
- the `PURGE_NO_ARCHIVE` strategy;
- the number of deleted rows;
- the oldest and newest legacy timestamps.

It must not store legacy diffs, actor identifiers, emails, names, record identifiers, table/action breakdowns, or other legacy contents. A deduplication key makes the evidence idempotent.

After deletion, the empty table is guarded against all mutations through the Release 5B observation cycle. The table and Prisma model are removed only in the separate Release 5C migration after the isolated-QA gate passes.

## Historical report behavior

Daily, monthly, and custom reports already use `ActivityEvent`. Generated report versions are immutable XLSX files with retained checksums, so their verified downloads remain reproducible without `AuditLog`.
