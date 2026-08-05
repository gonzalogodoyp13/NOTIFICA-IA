# Infrastructure Co-location Runbook

## Approved target

The target is one Vercel Node.js compute region co-located with one Supabase project per environment. The Supabase project supplies PostgreSQL, Auth, and Storage. Fluid Compute is enabled, application traffic uses shared Supavisor transaction mode, and migrations use a direct or session-mode connection.

The production Supabase AWS region was confirmed as `sa-east-1`; the corresponding Vercel compute region is `gru1`. The committed `vercel.json` contains exactly that one region, enables Fluid Compute with `"fluid": true`, and disables automatic Git deployment from `main` while leaving other preview branches enabled.

Railway remains an unverified legacy possibility until the deployment owner confirms no Production, Preview, QA, worker, or scheduler still references it. Do not remove legacy provider configuration solely because a local environment points to Supabase.

## Environment contract

Each environment must have its own Supabase project and all related credentials must refer to that same project.

| Setting | Required behavior |
|---|---|
| `DATABASE_URL` | Supabase Connect transaction-mode URL, port 6543; runtime only |
| `DIRECT_URL` | Direct IPv6 URL or Supavisor session-mode URL, port 5432; release migrations only |
| Runtime query parameters | `pgbouncer=true&connection_limit=1&pool_timeout=10&connect_timeout=10&sslmode=require` |
| `NEXT_PUBLIC_SUPABASE_URL` | Same project reference as both database URLs |
| `NEXT_PUBLIC_ENVIRONMENT` | `production`, `preview`, or `qa` as appropriate |
| `QA_ALLOW_MUTATIONS` | `true` only in controlled isolated QA; `false` elsewhere |

Copy database URLs from Supabase Connect. Do not construct a pooler URL from the direct endpoint. Store credentials only in Vercel and GitHub environment secrets, never in source, logs, workflow summaries, or chat.

The Prisma datasource uses `DATABASE_URL` for normal application queries and `DIRECT_URL` for Prisma schema/migration operations. `lib/prisma.ts` is the sole application Prisma constructor. Transaction pooling is incompatible with migration ownership and is never used for `migrate deploy`.

## Provider setup gate

Before the first QA deployment, record without secrets:

1. Vercel team/project, plan, production branch/URL, Fluid Compute state, current region, and permitted target region/cost.
2. Supabase project reference, AWS region, plan, compute tier, pooler availability/size, client limits, and current connection utilization.
3. Proof that PostgreSQL, Auth, and Storage use the same project in each environment.
4. Proof that QA and Preview cannot access production resources.
5. Whether Railway remains connected anywhere.

If the production topology is not Vercel plus one Supabase project for PostgreSQL/Auth/Storage, stop. A provider or project migration is a separate project. If the matching Vercel region is unavailable or unacceptable in cost, stop and compare supported nearby regions before editing configuration.

## Release procedure

The manually dispatched `Controlled release` GitHub workflow accepts an exact commit SHA.

The `qa` environment job installs dependencies; runs Prisma `migrate status`, `migrate deploy`, and `generate` against QA in that order; validates code and architecture; builds the production bundle; deploys an isolated Vercel Preview/QA build; refreshes QA authentication; runs integration and browser workflows; verifies infrastructure; and resets QA in an unconditional cleanup step.

The production job can start only after QA succeeds and a reviewer approves the protected GitHub `production` environment. It checks out the same SHA, runs the mandated Prisma sequence through production `DIRECT_URL`, builds and deploys that commit, and performs read-only checks. Migration-history, drift, failed-migration, or connectivity errors abort the release and must not be repaired automatically.

Vercel Git integration may create isolated previews but must not promote `main` automatically. The controlled workflow is the sole production promotion owner.

Required GitHub environment secrets:

- QA: `QA_DATABASE_URL`, `QA_DIRECT_URL`, `QA_SUPABASE_URL`, `QA_SUPABASE_ANON_KEY`, and `QA_SUPABASE_SERVICE_ROLE_KEY`.
- Production: `PRODUCTION_DATABASE_URL`, `PRODUCTION_DIRECT_URL`, `PRODUCTION_SUPABASE_URL`, `PRODUCTION_SUPABASE_ANON_KEY`, and `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`.
- Vercel: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_QA_PROJECT_ID`, and `VERCEL_PRODUCTION_PROJECT_ID`.

## Verification commands

Local/static checks:

```powershell
npm run check:infrastructure
npm run verify:infrastructure
```

Isolated QA only, with the mutation guard explicitly configured:

```powershell
npm run verify:infrastructure -- --mode=qa --allow-mutations
```

Production is read-only and requires explicit confirmation:

```powershell
npm run verify:infrastructure -- --mode=production-read-only --confirm-production
```

The verifier never prints complete URLs or credentials. It validates connection modes, project-reference agreement, one Prisma constructor, no request-path disconnect, no Edge Prisma route, exactly one configured region, Fluid Compute, runtime region agreement, connectivity, and timing headers.

## Observability and acceptance

Every API response receives `Server-Timing` entries for authentication, handler, and total duration plus `x-request-id`. Structured `[API_TIMING]` logs include only the operation, method, sanitized path, status, request ID, region, and durations. They exclude credentials, URLs, PII, document content, Storage keys, and business variables.

For QA, run five workflow warmups followed by 20 measured reads. Accept warm p95 only below 500 ms across three clean deployments. Require at least 25% improvement from the recorded 1,573.6 ms cold baseline, with a stretch target below one second. Receipt and estampo generation p95 should remain below two seconds where Storage upload latency permits.

During concurrency checks, monitor `pg_stat_activity` and Supabase Observability before, during, and after load. Connections must remain bounded and there must be no prepared-statement, P1001, P2024, max-client, advisory-lock, transaction, audit atomicity, Auth, or Storage regression.

For seven days after production release, monitor:

- workflow p50/p95/p99 and cold latency by region;
- Supavisor clients, PostgreSQL backend connections, utilization, and pool errors;
- Auth and Storage error/duration trends;
- audit outbox backlog, retries, and any `DEAD` rows;
- receipt/document correctness and generation duration;
- deployment-region drift.

The deployment owner must configure Vercel/Supabase alerts and one owned notification channel. Secrets and provider tokens are rotated by that owner; the required reviewer confirms rotation and rollback access before production approval.

## Rollback

Preserve the former Vercel region and environment metadata securely before cutover.

If transaction pooling fails, restore the former runtime `DATABASE_URL` in Vercel and redeploy the last known-good commit. Keep `DIRECT_URL` reserved for migrations. If region placement worsens latency, restore the former region and redeploy. Do not run destructive database rollback commands.

After rollback, verify Auth login, Storage reads, workflow reads, audit outbox state, receipt/document consistency, timing logs, and connection health. Production smoke checks remain read-only; do not create production receipts or documents.
