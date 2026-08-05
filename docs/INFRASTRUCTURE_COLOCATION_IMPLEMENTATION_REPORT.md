# Infrastructure Co-location Implementation Report

Date: 2026-08-03

## Outcome

The repository-side implementation for audit item 9 is complete except for the provider-owned environment cutover. No database model or SQL migration was created.

The application now has a deterministic pooled-runtime versus controlled-migration connection contract, real end-to-end API timing, static architecture enforcement, guarded deployment verification, a manually dispatched QA-to-production release workflow, focused tests, and an operations runbook.

The production Supabase AWS region was subsequently confirmed as `sa-east-1`. `vercel.json` pins compute to Vercel `gru1`, enables Fluid Compute, and disables automatic Git deployment from `main` while allowing preview branches to continue.

## Implemented changes

### Database connection contract

- Prisma now uses `DATABASE_URL` for normal application traffic and `DIRECT_URL` for migration/schema commands.
- `.env.example` documents Supavisor transaction mode on 6543 with `pgbouncer=true`, `connection_limit=1`, `pool_timeout=10`, `connect_timeout=10`, and `sslmode=require`.
- Direct IPv6 or Supavisor session mode on 5432 is reserved for controlled migrations.
- `lib/infrastructure/databaseConfig.ts` classifies URLs without returning passwords or full URLs. It rejects direct production runtime traffic, transaction-mode migration traffic, malformed/missing values, required-parameter drift, Supabase project-reference disagreement, and runtime-region disagreement.
- The existing singleton in `lib/prisma.ts` remains the only application `PrismaClient` constructor.

### Real request timing

- The ineffective `app/api/_latency-middleware.ts` was removed.
- The authenticated API wrapper now measures authentication, business-handler, and total duration on success and failure.
- Internal-secret routes, `/api/ping`, and the deprecated `/api/log` route use the same timing wrapper.
- Every API response now receives `Server-Timing` and `x-request-id`.
- Every API request emits one structured `[API_TIMING]` record containing only operation, method, sanitized pathname, status, request ID, Vercel region/local fallback, and durations.
- Dynamic numeric, UUID, and long identifier path segments are redacted. Credentials, connection strings, PII, document content, Storage keys, and receipt variables are not accepted by the timing logger.

### Architecture and deployment controls

- `npm run check:infrastructure` validates the static connection, Prisma, API timing, Edge/runtime, region override, environment-example, and documentation architecture.
- `npm run verify:infrastructure` supports local, explicitly mutating isolated QA, and explicitly confirmed read-only production modes.
- QA requires `--allow-mutations`, `NEXT_PUBLIC_ENVIRONMENT=qa|test`, and `QA_ALLOW_MUTATIONS=true`.
- Production requires `--confirm-production`; it performs read-only database and response-header checks.
- Deployed modes require the committed `gru1` Vercel region and strict pooled URL configuration.
- `.github/workflows/release.yml` accepts an exact commit, validates and deploys isolated QA, runs guarded tests and cleanup, then waits for a protected production approval before migrations and deployment of the same commit.
- Vercel Git integration behavior remains a dashboard-owned manual configuration; the runbook requires automatic production promotion to be disabled.

### Tests and documentation

- Added focused integration tests for URL modes, malformed/missing values, project/region disagreement, runtime/migration misuse, required pool parameters, accurate success/failure timing, response headers, sanitization, and local region fallback.
- The existing workflow performance test now requires real timing headers on all 25 requests and requires the first request to improve at least 25% from the 1,573.6 ms baseline, in addition to the warm p95 under 500 ms.
- Authentication-failed and validation-failed E2E paths now assert `Server-Timing` and `x-request-id`.
- README and `.env.example` document the target connection and release contract.
- `docs/INFRASTRUCTURE_COLOCATION_RUNBOOK.md` documents isolation, deployment ownership, monitoring, rollback, secrets, and manual provider gates.
- Stale Railway references were not broadly deleted because the deployment dashboards have not yet proved Railway is inactive in every environment.

## Verification results

Passed:

- Initial repository-required `prisma migrate status`: 34 migrations, database up to date.
- Initial repository-required `prisma migrate deploy`: no pending migrations.
- Initial repository-required `prisma generate`: Prisma Client 5.22 generated.
- `npm run check:infrastructure`: passed with the verified `gru1` region and Fluid Compute configuration.
- `npx tsc --noEmit`: passed.
- `npm run test:integration`: 23 files, 103 tests passed.
- `npm run check:utf8`: passed.
- `npm run lint`: passed with no warnings/errors.
- `npm run check:auth-audit`: passed across 288 files.
- `npm run build`: production build compiled, type-checked, and generated all routes successfully.
- `git diff --check`: passed.
- Browser smoke: authenticated dashboard, seeded `QA-P9-CUSTOM` ROL, consolidated diligence/receipt workflow, and estampo choices rendered; the browser was returned to the dashboard.
- Browser/API response check: `/api/ping` returned HTTP 200 with `Server-Timing` and `x-request-id`.

Blocked by external configuration/connectivity:

- The post-change Prisma status/deploy/generate retry could not reach the configured direct Supabase endpoint on port 5432. This machine's TCP probe failed at the same endpoint after the earlier successful mandatory sequence.
- The guarded QA suite reached its seed gate and failed before mutation for the same P1001-style connectivity condition. Its unconditional cleanup also attempted to run and failed because the database remained unreachable. No QA fixture was created by that run.
- A deployed pooled QA benchmark could not run because an isolated pooled QA deployment and its Vercel/Supabase credentials are not configured in this workspace.
- The Supabase and Vercel dashboards were not authenticated, so deployed Fluid Compute state, plan/cost, pool size/client limits, Railway inactivity, and environment isolation could not be confirmed.

## Manual deployment-owner actions

1. Sign in to the production Supabase and Vercel dashboards and record the provider facts listed in the runbook without exposing secrets.
2. Confirm PostgreSQL, Auth, and Storage use the same production Supabase project; confirm Railway is inactive before removing its remaining legacy references.
3. Confirm the Vercel plan supports committed region `gru1` at an acceptable price and verify the deployed function region after release.
4. Create/confirm an isolated Supabase QA/Preview project and copy its transaction and direct/session URLs from Supabase Connect.
5. Configure environment-scoped Vercel values for Production, Preview, and QA; never send passwords through chat.
6. Add the documented GitHub QA/Production environment secrets and configure a required reviewer on `production`.
7. Confirm Vercel honors the committed automatic-`main` deployment block while preview branches continue deploying.
8. Configure Vercel/Supabase alerts and choose an owned notification channel.
9. Restore direct/session database reachability from the release runner, then rerun the mandatory Prisma sequence and the full guarded QA workflow.
10. Dispatch the controlled release for an exact commit, approve production only after QA evidence passes, perform the documented read-only production smoke, and monitor for seven days.

## Residual risk

Repository controls prevent an unverified deployment from passing, but they cannot create provider projects, install secrets, or prove the deployed dashboard state before the deployment owner completes the provider gate. Until the pooled URLs are configured and a `gru1` deployment is verified, the current environment remains transition-state infrastructure and does not receive the expected connection-scaling or cross-region latency benefit.
