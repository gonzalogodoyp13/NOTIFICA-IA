# Operations Center: prepared rollout

Prepared 2026-11-22. The preparation sections below describe the original paused configuration; see the verified live status here for subsequent activation.

## Verified live status — 2026-11-22

- Production release `f8a5966e81d10ca63ab83f0611bb0ec4d50dc66a` deployed as `dpl_GiJFWSGRC9iE9hRi1GyW3BaDWpZw`; both `www.notificaia.cl` and `notificaia.cl` point to it. Rollback target: `dpl_C4AcBNUDv5cmZhcgCqKxFToPQoBC` (old scheduler credentials).
- User completed real owner login and email verification; audit recorded `owner.email.requested` and `owner.email.verified`. Resend reports the login-code email delivered. No password or code was collected in chat.
- Live unauthenticated private API/export requests returned 401; private page redirected to login; cross-origin verification POST returned 403; scheduler requests without credentials returned 401.
- Owner browser verification passed for overview, token states, office filtering, service health, and alert policy/history. No recovery action was executed.
- `notifica-health`, `notifica-notifications`, and `notifica-cron-retention` are active. App/database/auth/storage observations are healthy and `/api/health` returns 200. Notification tick returned 200; the first daily digest was accepted in one attempt and Resend independently reports delivered.
- Sentry uptime monitor `11034838` and workflow `6388926` are active. At least one successful external check was observed. Production exception ingestion has not been deliberately tested; the earlier local controlled-error test remains the error-ingestion evidence.
- Reports, signing maintenance, reply synchronization, and activity jobs remain paused during verification. Existing data includes seven queued reports, four enabled report schedules, and stale running/cancellation claims. Review that backlog before enabling business processing; do not use it as synthetic test data.
- All 56 migrations are current. Production build succeeded. Pre-release verification: 52 targeted application tests and one restricted-runtime database test, plus UTF-8, auth/audit, and infrastructure checks.

## Configuration

- Existing Vercel project `notifica-staging`, production domain `https://www.notificaia.cl`.
- Explicit owner: `gonzalogodoyp13@gmail.com`; password plus session-bound six-digit email verification. Sender: `NOTIFICA IA <contacto@notificaia.cl>`.
- Both critical alerts and daily digest target the active OWNER grant for that account, not an arbitrary email address. The global policy is saved with an audit entry.
- America/Santiago timezone; daily digest at 08:00 for the previous local calendar day. Office operating hours Monday–Friday 08:00–18:00. Critical alerts honor these hours; persistence 10 minutes, cooldown 60 minutes, escalation 120 minutes. Idle computers without pending work do not page.
- Diagnostic evidence retention 30 days; health observations 7 days; diagnostic capture cap 1,200/minute per process plus concurrency protection.
- Production notification delivery switch enabled in the next-deployment configuration. Scheduled invocations remain paused.
- Six scheduler secrets are sensitive Vercel variables and encrypted Supabase Vault entries named `notifica_<ENV_NAME>`. Existing business scheduler credentials were replaced for the next deployment; the currently running deployment retains its old environment. Do not activate these jobs against the old release.
- Supabase pg_net temporarily holds plaintext HTTP authorization headers in its internal queue, as documented by Supabase. Restrict database login access to trusted operators/backend roles. No credentials are in cron command text, source control, or public URLs.
- Release metadata is derived at build time from APP_RELEASE, VERCEL_GIT_COMMIT_SHA, or local Git HEAD, and shared by server/browser diagnostics. Build an isolated, clean checkout of the intended web commit; exclude unrelated desktop-agent working changes.

## Prepared jobs (all inactive)

| Job | Interval | Route |
| --- | --- | --- |
| notifica-health | 1 minute | POST /api/internal/operations/health |
| notifica-notifications | 5 minutes | POST /api/internal/operations/notifications |
| notifica-reports | 1 minute | POST /api/internal/reports/tick, maxJobs=5 |
| notifica-activity | 1 minute | POST /api/internal/activity-outbox/process |
| notifica-replies | 5 minutes | POST /api/internal/recibos/replies/sync |
| notifica-signing | 5 minutes | GET /api/internal/signing/maintenance |
| notifica-cron-retention | Daily 03:17 UTC | Delete up to 10,000 completed scheduler-history rows older than 7 days, only for these jobs |

Cron enqueue success is not proof of successful HTTP processing. Verify response status plus application process heartbeats. A timeout is not permission to retry uncertain business effects.

## External monitoring

Sentry project `notifica-ia/notifica-ia-web` has verified error ingestion from a controlled local API test; production ingestion still needs release verification.

Uptime monitor `11034838`: GET https://www.notificaia.cl/api/health every 60 seconds, 5-second timeout, two failures to declare downtime, two successes to recover. Response capture and tracing disabled. Monitor is disabled.

Workflow `6388926`: outage/regression/recovery email to verified Sentry user `5205987` (owner email), 60-minute frequency, production only, attached exclusively to uptime detector `11034838`. Workflow is disabled. These external notifications are independent of app email and office operating hours.

No paid trial was started. Confirm the included uptime allowance before activation; disabled monitors do not consume an active monitor seat. No external uptime or notification-delivery success is claimed yet.

## Activation after an explicitly authorized deployment

1. Use a clean checkout of the reviewed web release. Run repository-local `prisma migrate status`, `prisma migrate deploy`, then `prisma generate`; never reset or use migrate dev. Keep production migration credentials outside Vercel runtime.
2. Build/test the selected commit with production configuration. The user chose the current environment because it has no real customers; preview configuration is not a separate test database. Do not assume ordinary preview deployments have all production variables.
3. Deploy only after authorization. Confirm release SHA, owner email-code receipt/login, and rejection of unauthenticated/ordinary-office accounts. Confirm private incident lookup and sanitized export. Do not test recovery on real accounts/devices/documents.
4. Activate `notifica-health` first in Supabase Cron. Wait for recorded app/database/auth/storage observations and HTTP 200 with `{"status":"ok"}` from `/api/health`. Missing telemetry must remain unavailable.
5. Activate the five business/notification jobs and the retention job by their exact names in Supabase Cron. Check bounded work, process heartbeats, HTTP responses, and the authorized recipient. Do not create duplicate schedules in Vercel or another provider.
6. Enable Sentry workflow `6388926`, then uptime monitor `11034838`, after health is stable and the account allowance is confirmed. Verify checks arrive and the recipient rule is attached.
7. Verify an authorized owner-only test notification, the next 08:00 digest, and a controlled production diagnostic event. Record references and provider acceptance separately from confirmed delivery. No customer email or actual signing is needed for verification.

To pause rollout, deactivate these exact cron jobs and disable the Sentry monitor/workflow. Do not undo data-preserving migrations or reset business states. Rotated scheduler credentials must be aligned before rolling back to an older deployment.

## Remaining evidence

Real owner inbox receipt, production Sentry ingestion, healthy scheduled execution, external uptime observations, notification delivery, and a backup restore test cannot be asserted from pre-deployment configuration. Backups/restore evidence remain unavailable unless verified from the hosting provider. Email verification is the explicitly selected custom second step, not Supabase authenticator AAL2.
