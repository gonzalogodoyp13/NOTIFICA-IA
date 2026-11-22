# Operations Center Phase 1

Implemented evidence capture only. No owner dashboard, account actions, deployment, or historical reconstruction is included.

## Evidence and access

`lib/diagnostics/core.ts` defines the allowlisted contract. Server errors, caught API errors, legacy 5xx responses, Next server errors, browser exceptions/rejections/render boundaries, report workers, report delivery, receipt artifact/dispatch/resend, reply synchronization, signing maintenance/device service failures and audit outbox failures feed `reportUnexpected`.

The technical index is independent of business audit. `diagnostic_events.reference` is the customer support reference. Search it using a privileged database connection, then join `diagnostic_incidents` on `incidentId`. Use `requestId` to join activity events/outbox; use `jobId` and the evidence record reference for business state. No diagnostic read endpoint is exposed. Both tables have RLS enabled and browser roles have no grants. Future owner access must be server-authorized separately from office administration.

Authenticated API context comes from the existing server resolver. Request IDs are server-generated, stable for a request and returned in `x-request-id`. Report jobs persist their originating correlation ID; worker audit events inherit it. Anonymous browser intake resolves the session itself and rejects identity fields in the body. Device service failures without resolved office context remain unassigned; never infer an office from a device request payload.

Grouping uses environment, source, module, operation, safe code, error type and the first five sanitized source locations. User, office, release and reference do not split groups. Each occurrence has its own event and identity snapshot. Atomic upserts increment counts and reopen resolved groups. Lifetime counts survive event retention. Distinct failures without source locations/code can group together; evidence does not invent a cause.

## Privacy and reliability

Raw error messages, request bodies, headers, cookies, tokens, PINs, keys, SQL, document text and arbitrary metadata are discarded. Only source basenames and line/column numbers survive stack projection. Sentry auto integrations, tracing, replay and default data collection are disabled; its outgoing event is reconstructed from the sanitized contract. Internal user/office identifiers are intentionally retained. Browser evidence is client-reported and is not proof of a server fault.

Validation/permission outcomes below 500 stay outside the incident inbox. Unexpected 5xx API responses display a Spanish safe message with a support reference. Existing business audit writers and outbox semantics remain intact.

Capture uses eight concurrent slots per process and a configurable per-process minute budget. Database writes have bounded connection/transaction waits; callers wait at most two seconds and Vercel `waitUntil` retains pending work. Sentry flush has a 1.5-second budget. Failed monitoring never recursively reports itself. If storage and monitoring are down or capture capacity is exhausted, a reference can exist without a durable event; a sanitized server warning records persistence/capacity loss. This is best-effort reporting, not an independent durable queue during database outages.

Browser intake has a 4 KiB streamed body bound, same-origin validation, a durable global quota of 120/minute and a client cap of ten reports per page lifetime. No browser SDK sends requests directly to Sentry; the same-origin relay supplies trusted identity, durable indexing and Sentry forwarding. Network failures, blocked scripts and tab/process termination can prevent browser reports. Full raw stacks and source-map symbolication are intentionally not provided by this privacy-first projection.

## Remaining setup

Set these values in each runtime/build environment; no credentials were invented:

- `SENTRY_DSN`: private Sentry project DSN for server forwarding. Without it, the local index still works.
- `APP_ENV`: environment identifier (falls back to NODE_ENV).
- `APP_RELEASE`: immutable server release identifier, preferably the git SHA. Set `NEXT_PUBLIC_APP_RELEASE` to the same value at build time for browser bundle attribution; browser reports retain this separately as client-reported `clientRelease`. Missing release is explicitly `unconfigured`.
- `APP_ORIGIN`: canonical HTTPS application origin in production, required by the existing same-origin checks.
- `DIAGNOSTIC_RETENTION_DAYS`: event retention, default 30, clamped to 1–365.
- `DIAGNOSTIC_MAX_PER_MINUTE`: per-process capture limit, default 1200, clamped to 1–10000.
- Optional build-only `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` enable SDK source-map upload. Never expose the auth token publicly.

The existing authorized report automation tick prunes at most 1000 expired diagnostic events per invocation. Ensure that scheduler is configured; increase its frequency if backlog exceeds this rate. Incident aggregates remain for future triage; affected user/office and occurrence references are available only for the configured retained event period. Configure Sentry's own retention and access controls separately. Confirm a controlled failure in staging reaches the intended Sentry project before considering live monitoring connected.

No general historical backfill is attempted. Existing audit and signing attempt records remain usable on their own terms. Errors swallowed before these boundaries may yield only a HANDLER_5XX event without the original exception. Unhandled Next errors outside authenticated API wrappers can lack user/office context. Edge-runtime persistence is not implemented; current diagnostic-backed routes use Node.

## Verification

Run `vitest run tests/integration/diagnostics.test.ts` for controlled API capture, trusted identity, expected outcome exclusion, redaction, grouping, recurrence, concurrent context isolation and sink failure isolation.

Run the database test explicitly with `TEST_DIAGNOSTICS_DATABASE=true` and `vitest run tests/integration/diagnostics-database.test.ts`. It writes uniquely named synthetic diagnostic events, verifies concurrent counts/reopening/RLS and removes those test records. It does not reset business data.

Implementation follows the Next.js 15 instrumentation hook and the installed Sentry 11 SDK configuration:

- https://nextjs.org/docs/15/app/api-reference/file-conventions/instrumentation
- https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
- https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/
