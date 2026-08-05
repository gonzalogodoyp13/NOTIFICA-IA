# Infrastructure Co-location Change Report

**Project:** NOTIFICA IA  
**Audit item:** 9 - Co-locate infrastructure  
**Report date:** 2026-08-03  
**Status:** Discovery and change inventory complete; no infrastructure or application implementation has been performed

## 1. Purpose

This report defines the changes and decisions required to complete audit item 9 before an implementation plan is generated.

The audit recommendation is:

> Confirm the application, PostgreSQL, and Supabase project are in geographically close regions. Cross-region round trips multiplied by the workflow query count can dominate latency. If deployed serverlessly, use a database pooler and avoid maintaining two independent Prisma connection pools.

This report separates:

- facts verified in the repository or configured local environment;
- facts that can only be confirmed in the Vercel and Supabase dashboards;
- required changes for the recommended target architecture;
- conditional changes that depend on the answers in Section 10;
- verification and rollback requirements.

It is a change inventory and decision brief, not the implementation plan.

## 2. Sources reviewed

The following sources were read completely for this assessment:

- `C:\Users\gonza\Desktop\optimizations - NOTIFICA IA.docx`
- `docs/AUTHENTICATION_AUDIT_IMPLEMENTATION_REPORT.md`
- `docs/RECEIPT_WORKFLOW_OPTIMIZATION_IMPLEMENTATION_REPORT.md`
- `docs/WORKFLOW_INDEX_VERIFICATION_IMPLEMENTATION_REPORT.md`
- `docs/CACHE_AND_WAIT_OPTIMIZATION_IMPLEMENTATION_REPORT.md`
- Current repository configuration, Prisma construction, environment-variable contract, deployment notes, health route, and latency helper
- Current official Vercel, Supabase, and Prisma documentation cited in Section 13

The Word source contains 55 paragraphs and no tables or embedded images. Its full text was extracted structurally. Visual rendering was unavailable because LibreOffice is not installed in this environment; this did not prevent complete extraction of the item 9 requirement.

## 3. Executive conclusion

The application is not ready to declare audit item 9 complete.

The repository and configured local environment reveal four material gaps:

1. **The production topology is not recorded reliably.** Repository documentation describes Vercel plus Railway/Supabase-compatible PostgreSQL, while the configured local `DATABASE_URL` points directly to the same Supabase project used for Auth and Storage. It is not yet proven whether that local configuration is QA, production, or both.
2. **The compute region is not version-controlled.** There is no `vercel.json`, no route-level `preferredRegion`, and no other repository setting that fixes Vercel Functions to the data region. The effective region may exist only in the Vercel dashboard or may still be Vercel's default `iad1`.
3. **The configured database connection is not serverless-safe.** The current URL uses Supabase's direct database endpoint on port 5432. It has no transaction-pooler hostname, `pgbouncer=true`, or explicit Prisma `connection_limit`.
4. **The application cannot currently prove the improvement in production.** The existing `_latency-middleware.ts` measures only the time required to construct `NextResponse.next()`, before the route handler runs, and it is not a valid end-to-end handler measurement.

The lowest-risk target is:

- keep Vercel as the application host;
- keep Auth, Storage, and PostgreSQL in the existing Supabase project;
- run all database-backed Node.js functions in one Vercel region matching, or as close as possible to, the Supabase project's primary AWS region;
- use a Supabase transaction pooler for application runtime traffic;
- use a separate direct or session-mode connection only for Prisma migrations and administrative tools;
- retain one Prisma Client construction site and add a static guard so another application client cannot be introduced;
- measure real handler, Auth, workflow, PDF, Storage, and connection behavior before and after deployment.

Moving the entire Supabase project to another region is not recommended for the first implementation. Supabase projects are region-bound; changing region requires creating and migrating to a new project, including Auth and Storage work. That should occur only if the current Supabase region is unacceptable for Chilean users, legal/data-residency requirements require another region, or production evidence shows that moving Vercel compute to the existing data region is insufficient.

## 4. Verified current state

### 4.1 Hosting and provider evidence

| Area | Verified evidence | Assessment |
| --- | --- | --- |
| Web application | `README.md` and the cache implementation report identify Vercel | Vercel is the intended host, but the linked project and effective region are absent from the repository |
| Auth | Supabase SSR clients use `NEXT_PUBLIC_SUPABASE_URL` | Active and already consolidated to one request-scoped authentication resolution |
| Storage | Server-side document, report, receipt, and PDF asset code uses the same Supabase project configuration | Co-locating Vercel with this Supabase project will improve both Auth and Storage calls |
| PostgreSQL | Configured local `DATABASE_URL` host is `db.<same-project-ref>.supabase.co:5432` | The observed database is Supabase Postgres, not Railway, and uses a direct connection |
| Database capacity snapshot | PostgreSQL 17.6, SSL on, `max_connections = 60`; snapshot showed 12 total sessions, 1 active and 3 idle | The database has limited direct-connection headroom; serverless pool multiplication is a real risk even at low business volume |
| Region | PostgreSQL did not expose a cloud-region setting; no Vercel region configuration exists in the repository | Supabase and Vercel dashboard inspection is required before implementation |

No secret values were printed or recorded during this review.

### 4.2 Prisma client and pool behavior

The application has one Prisma Client construction site: `lib/prisma.ts`. All inspected application modules import that singleton. The old second client and audit middleware were already removed during authentication/audit remediation.

That satisfies the code-level part of “avoid two independent Prisma connection pools,” but it does not create one global pool across Vercel. In a serverless or Fluid Compute deployment, each warm function instance or separately bundled function can still have its own Prisma Client and its own local pool. An external transaction pooler and a small per-instance Prisma limit remain required.

The current production branch must keep these invariants:

- one `new PrismaClient()` in application code;
- Prisma Client instantiated outside request handlers;
- no `$disconnect()` after ordinary requests;
- no per-route or per-service Prisma Client;
- no return of the removed `prismaNoMiddleware` or audit-middleware client.

### 4.3 Performance evidence from completed work

The previous phases reduced the steady workflow endpoint to a 406.1 ms p95 in the final guarded QA run. The same run recorded a 1,573.6 ms cold read. Earlier testing also experienced remote connection-pool exhaustion from multiple local processes.

These results show:

- query shape and indexes are no longer the dominant steady-state bottleneck;
- cross-region network, connection establishment, Auth, Storage, and cold instance behavior are now proportionally more important;
- the co-location work must preserve the existing warm p95 and should materially improve cold and artifact-generation behavior.

### 4.4 Documentation drift

The following statements are inconsistent and must be reconciled:

- `.env.example` labels `DATABASE_URL` as Railway PostgreSQL.
- `README.md` says Vercel plus Railway/Supabase-compatible PostgreSQL and says application data remains in PostgreSQL separately from Supabase Auth.
- The configured local URL points directly to the same Supabase project used by Auth and Storage.
- The cache report explicitly describes behavior across Vercel instances.

Infrastructure changes must not proceed until the production database target is confirmed. A local or QA `.env` must not be assumed to describe production.

## 5. Recommended target architecture

```text
Browser in Chile
  -> Vercel global CDN / TLS edge
  -> one Vercel Node.js function region near the data
       -> Supabase Auth in the project region
       -> Supabase Storage in the project region
       -> Supabase transaction pooler on port 6543
            -> Supabase PostgreSQL primary

Release/administration runner
  -> DIRECT_URL on port 5432, or Supavisor session mode when direct IPv6 is unavailable
       -> Prisma migrate status/deploy and administrative tools only
```

Key principles:

- Place server compute next to the data source, not independently in multiple user-adjacent regions.
- Keep static files global through Vercel's CDN.
- Use one primary Vercel function region while PostgreSQL has one writable primary.
- Do not configure active multi-region Node.js functions against a single-primary database; that would recreate cross-region latency and multiply Prisma pools.
- Keep Prisma routes on the Node.js runtime. Do not move database code to the Edge runtime as part of this change.
- Use the pooler only for runtime traffic and a non-transaction-pooled connection for Prisma schema and migration commands.

Typical exact region mappings include:

| Supabase AWS region | Recommended Vercel function region |
| --- | --- |
| `sa-east-1` (São Paulo) | `gru1` |
| `us-east-1` (North Virginia) | `iad1` |
| `us-east-2` (Ohio) | `cle1` |
| `us-west-1` (North California) | `sfo1` |
| `us-west-2` (Oregon) | `pdx1` |
| `ca-central-1` | `yul1` |
| `eu-central-1` | `fra1` |
| `eu-west-1` | `dub1` |
| `eu-west-2` | `lhr1` |
| `ap-southeast-1` | `sin1` |
| `ap-southeast-2` | `syd1` |
| `ap-northeast-1` | `hnd1` |
| `ap-northeast-2` | `icn1` |

The exact row must be selected only after confirming the Supabase project region and Vercel plan support.

## 6. Required change inventory

### 6.1 Confirm and record the real topology

Before code changes:

1. Identify the Vercel team, project, production deployment, plan, Fluid Compute state, and current function region.
2. Identify the Supabase organization, project, exact AWS region, plan, database compute tier, pooler type, pool size, maximum pooler clients, and current connection utilization.
3. Confirm whether Auth, Storage, and application PostgreSQL are all in the same Supabase project in production.
4. Confirm whether Railway is still used in any production, preview, worker, cron, or legacy environment.
5. Inventory Production, Preview, QA, and Development environment variables by hostname and connection mode without copying secrets into the repository or report.
6. Confirm where Prisma migrations are executed and ensure they run exactly once per release, not once per Vercel function instance.
7. Record the approved region and connection-mode decisions in a deployment runbook.

### 6.2 Pin Vercel compute to the data region

Add a root `vercel.json` as the version-controlled source of truth, containing at minimum:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["<approved-region>"]
}
```

The implementation must also:

- verify the deployment summary reports the expected function region;
- verify `VERCEL_REGION` at runtime in a safe internal log or deployment verification command;
- ensure no route-level region declaration overrides the project setting;
- keep the database-backed App Router routes on Node.js;
- decide explicitly whether Fluid Compute is enabled, because it affects concurrency and how many requests can share a warm instance;
- avoid multi-region primary functions unless a future database replication and write-routing design supports them.

Repository configuration is recommended over dashboard-only configuration because it is reviewable, repeatable, and prevents environment drift. The dashboard must still be checked after deployment because account-plan restrictions can affect region availability.

### 6.3 Split runtime and migration database connections

Introduce two environment variables with distinct purposes:

```text
DATABASE_URL = pooled runtime connection
DIRECT_URL   = direct or session-mode migration/admin connection
```

For a Vercel serverless or Fluid Compute runtime, the recommended initial `DATABASE_URL` is the Supabase transaction-mode pooler on port 6543 with:

- SSL required;
- `pgbouncer=true` for the current Prisma 5.22/Supavisor compatibility path;
- `connection_limit=1` initially because traffic is low and the database exposes only 60 direct slots;
- an explicit connection timeout;
- an explicit pool timeout chosen to fail predictably rather than wait indefinitely.

The final URL must be copied from the Supabase Connect dialog. It must not be constructed by editing only the port of the current direct URL, because the shared pooler hostname and username format differ.

`DIRECT_URL` should use:

- the direct Supabase database connection on port 5432 when the release runner supports IPv6 or the project has the IPv4 add-on; or
- Supavisor session mode on port 5432 when a persistent IPv4-compatible path is required.

The transaction-mode URL must not be used for Prisma migration commands.

Update `prisma/schema.prisma` for the current Prisma 5.x line:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

The implementation must validate all existing database behaviors through the pooler, especially:

- interactive transactions;
- `pg_advisory_xact_lock` used by receipt finalization;
- `FOR UPDATE SKIP LOCKED` used by the audit outbox;
- receipt idempotency, regeneration, and correction;
- transaction rollback and critical audit atomicity;
- raw SQL used by workflow index verification;
- document and receipt queries using Prisma's join relation strategy.

If one pooled client connection causes measurable queueing inside a Fluid Compute instance, raise the limit to 2 only after measuring database headroom and total instance concurrency. Do not guess a larger value.

### 6.4 Preserve one application Prisma Client and enforce it

`lib/prisma.ts` already provides the correct construction pattern and should remain the only application constructor.

Add or extend a static architecture check that fails when:

- `new PrismaClient()` appears outside the approved application file;
- an application module imports a second Prisma wrapper;
- request handlers call `$disconnect()`;
- an Edge-runtime route imports Prisma;
- production lacks `DATABASE_URL` or `DIRECT_URL`;
- production `DATABASE_URL` is still the direct Supabase host when Vercel is the runtime;
- production runtime configuration points at a session or direct endpoint instead of the approved transaction pooler.

Scripts and isolated tests may create their own client only when they terminate it explicitly and are excluded deliberately by the check.

### 6.5 Replace invalid latency instrumentation

`app/api/_latency-middleware.ts` must be deleted or replaced. Its current value is misleading because it stops the timer before handler execution.

Add real timing at the established request boundary, preferably in `withApiUser` and the internal-route wrappers, so measurements include:

- total handler time;
- authentication resolution time;
- business-handler time;
- request ID;
- route template or safe pathname;
- HTTP result;
- Vercel function region;
- cold/warm indicator when safely available.

Do not log credentials, database URLs, storage keys, document content, personal data, or audit-prohibited metadata.

Use structured server logs for operational timing. A public health endpoint should not expose provider IDs, project references, connection strings, or database details. If a diagnostic endpoint is added, it must be internal-secret protected and return only coarse status and region codes.

### 6.6 Add reproducible infrastructure verification

Add a guarded command such as:

```text
npm run verify:infrastructure
```

It should support a local/static mode and an approved deployment mode. It should verify:

- required configuration files and environment-variable names;
- approved Vercel region in repository configuration;
- runtime-reported Vercel region;
- expected database connection mode without printing the URL;
- exactly one application Prisma Client constructor;
- database reachability and SSL;
- database maximum and current connection counts;
- no direct-connection growth during a controlled concurrency sample;
- Auth reachability;
- Storage upload/download/delete using a disposable QA object;
- consolidated workflow warmup plus 20 steady reads;
- receipt and estampo generation using disposable QA fixtures;
- audit outbox materialization;
- cleanup and restoration of all disposable objects and rows.

The production mode must be opt-in, identify the exact deployment target, and default to read-only. Mutating receipt/storage checks belong in QA or an explicitly approved production canary with guaranteed cleanup.

### 6.7 Update environment and deployment documentation

Update at least:

- `.env.example`
- `README.md`
- deployment/runbook documentation
- any implementation report or comment that still identifies Railway as the active production database if that is no longer true

Documentation must explain:

- the authoritative topology for each environment;
- the approved Vercel and Supabase regions;
- pooled runtime URL versus direct/session migration URL;
- who owns and rotates each secret;
- where migrations run;
- how Preview and QA are isolated from Production;
- how to verify `VERCEL_REGION` and pooler usage;
- connection-limit and timeout defaults;
- monitoring and rollback steps;
- the repository's mandatory Prisma startup order and prohibition on `prisma migrate dev`.

No real hostname, password, project secret, connection string, or service-role key should be committed.

### 6.8 Configure provider dashboards

Repository changes alone are insufficient. The deployment operator must:

1. Set the Vercel function region to the approved region or confirm the repository setting overrides it.
2. Confirm Fluid Compute and concurrency settings.
3. Add `DATABASE_URL` and `DIRECT_URL` to the correct Vercel environments.
4. Redeploy because Vercel environment-variable changes do not affect earlier deployments.
5. Obtain the correct pooler URL from Supabase's Connect dialog.
6. Review Supabase pool size, maximum clients, direct connections, compute utilization, and alerts.
7. Ensure the release/migration runner can reach `DIRECT_URL`.
8. Ensure schedulers call the canonical production deployment and do not start their own Prisma processes.
9. Confirm Preview deployments do not use Production Auth, Storage, or PostgreSQL unless explicitly approved.

### 6.9 Add connection and latency monitoring

Monitor at minimum:

- Vercel handler p50/p95/p99 by route and region;
- cold versus warm workflow latency;
- authentication duration and 401/403/503 rates;
- Prisma P1001/P2024 and pool timeout errors;
- Supavisor client connections and backend connection usage;
- PostgreSQL active, idle, and total connections against the 60-connection ceiling;
- transaction duration and lock waits;
- Supabase Storage upload/download failure and duration;
- receipt and estampo generation p95;
- audit outbox pending age and `DEAD` rows;
- deployment region drift.

Alert thresholds must be defined before rollout. At minimum, alert on any repeated connection exhaustion, any audit outbox `DEAD` row, and any sustained workflow p95 regression above the existing 500 ms gate.

## 7. Conditional change: migrate the Supabase project region

This is a separate, high-risk migration and should not be included in the first co-location implementation unless explicitly approved.

It becomes relevant only if:

- the current Supabase region is materially distant from both Vercel and Chilean operators;
- Vercel cannot run in or near the current data region at an acceptable plan/cost;
- data-residency or contractual requirements select another region; or
- measured latency remains unacceptable after Vercel region alignment and pooling.

If approved, the change requires:

1. Create a new Supabase project in the chosen region, likely `sa-east-1` for São Paulo if South America is selected.
2. Reproduce database extensions, roles, privileges, settings, network restrictions, buckets, Storage policies, Auth configuration, redirect URLs, mail configuration, and service integrations.
3. Migrate the complete PostgreSQL database, including application data and the Supabase Auth schema, while preserving user UUIDs required by `User.authUserId`.
4. Migrate every Storage object and validate every persisted bucket/key reference.
5. Decide whether to preserve the JWT secret so existing sessions remain valid; otherwise plan forced reauthentication.
6. Recreate API keys and rotate all Vercel environment variables.
7. Re-run the mandatory Prisma sequence and all migrations against the new target.
8. Run full authenticated QA, receipt/estampo generation, downloads, email/report flows, audit append-only checks, outbox processing, and cache invalidation.
9. Freeze writes or implement a controlled delta/cutover mechanism.
10. Define DNS/environment cutover, downtime, reconciliation, rollback, and old-project retention.

Supabase documents that a project cannot be moved in place; a new project and migration are required. This is why moving Vercel compute to the existing data project is the recommended first action.

## 8. Expected repository file impact

The eventual implementation is expected to add or modify the following areas. This list is not a commitment to exact filenames until the plan is approved.

| File or area | Expected change |
| --- | --- |
| `vercel.json` | Add single approved function region and any approved Fluid Compute setting |
| `prisma/schema.prisma` | Add `directUrl = env("DIRECT_URL")` |
| `.env.example` | Replace stale Railway description; document pooled `DATABASE_URL` and `DIRECT_URL` without values |
| `README.md` | Correct provider topology and deployment instructions |
| `lib/prisma.ts` | Preserve singleton; optionally add safe client metadata/logging hooks, not another client |
| `lib/api/server.ts` | Add real request/auth/handler timing at the canonical boundary |
| `app/api/_latency-middleware.ts` | Delete or retire the misleading helper |
| `scripts/verify-infrastructure-config.mjs` or equivalent | Add static provider, region, URL-mode, and Prisma-constructor enforcement |
| `scripts/verify-infrastructure.ts` or equivalent | Add guarded runtime/deployment verification |
| `package.json` | Add infrastructure verification commands |
| `tests/integration/*` | Add configuration parsing, guard, timing-sanitization, and pooling contract coverage |
| `e2e/workflows.spec.ts` or a deployment-specific suite | Reuse workflow/receipt/estampo assertions under pooled deployment |
| `docs/*` | Add implementation report and deployment/rollback runbook; correct stale Railway references |

No database migration is expected merely to change region configuration or connection URLs. A migration would be required only for unrelated schema work or for a full project-region migration procedure.

## 9. Proposed acceptance criteria

The implementation plan should use explicit gates. Recommended gates are:

### Configuration

- The effective Vercel function region maps to the confirmed Supabase project region.
- The deployment summary and runtime region agree.
- Production runtime uses the approved transaction pooler.
- Prisma CLI uses `DIRECT_URL` or the approved session-mode administrative URL.
- Production has exactly one application Prisma Client constructor.
- Preview/QA/Production provider boundaries are documented and enforced.

### Correctness and safety

- Mandatory Prisma status/deploy/generate sequence passes in order.
- `prisma validate`, UTF-8 check, lint, TypeScript, integration, build, auth/audit guard, and full guarded QA pass.
- Receipt generate/regenerate/correct and estampo generation work through the pooler.
- Advisory locks, outbox `SKIP LOCKED`, idempotency, rollback, and append-only audit guarantees remain intact.
- Storage and Auth continue to use the intended Supabase project.
- QA cleanup leaves no disposable business rows, documents, Storage objects, Auth state, or audit outbox backlog.

### Performance and operations

- Existing steady workflow gate remains below 500 ms p95 after five warmups and 20 measured reads.
- Three separate clean deployment samples pass, not only one warm local process.
- Cold workflow latency improves materially from the recorded 1,573.6 ms baseline; recommended target is at least a 25% reduction, with a stretch target below 1 second.
- Synchronous receipt and estampo generation remain below the audit's 2-second p95 target where provider upload latency permits.
- No P1001, P2024, prepared-statement, max-client, or connection-exhaustion errors occur during the controlled concurrency test.
- Direct PostgreSQL connection count does not scale linearly with Vercel invocation concurrency.
- No sustained workflow p95 regression or connection-exhaustion alert occurs during a seven-day observation window.

Thresholds should be approved by the user before plan generation; cold and artifact targets may require calibration against real production distance and Vercel plan behavior.

## 10. Questions requiring user or platform-owner answers

These questions should be answered before the implementation plan is finalized. Each includes the recommended default.

### Q1. What environment does the current local `.env` represent?

**Why it matters:** It points to a Supabase database, but it does not declare `NEXT_PUBLIC_ENVIRONMENT`. It may be QA, production, or a shared environment.  
**Recommendation:** Treat it as QA/unknown until the Vercel Production variables and Supabase project are verified. Do not infer production topology from it.

### Q2. Is Vercel the actual production application host?

**Why it matters:** The repository says Vercel, but no linked-project metadata is present.  
**Recommendation:** Keep Vercel if it is already production; changing hosts is unnecessary unless the needed region is unavailable or cost-prohibitive.

### Q3. Is the production PostgreSQL database Supabase or Railway?

**Why it matters:** Documentation says Railway/Supabase-compatible PostgreSQL, while the configured local database is Supabase. The region and pooler design depend on the real production provider.  
**Recommendation:** If production already uses the same Supabase project as Auth/Storage, standardize documentation on Supabase and remove stale Railway references. If Railway is production, stop and design against Railway's actual region and pooling options instead.

### Q4. Are production Auth, Storage, and PostgreSQL all in the same Supabase project?

**Why it matters:** The local configuration suggests they are, but production is unverified.  
**Recommendation:** Use one Supabase project per environment so Auth, Storage, and PostgreSQL share a region and lifecycle, while keeping Production isolated from QA/Preview.

### Q5. What is the exact Supabase production project region?

**Why it matters:** This determines the correct Vercel region and pooler hostname. PostgreSQL did not expose it through SQL.  
**Recommendation:** Read it from Supabase Dashboard > Project Settings/Infrastructure and use it as the anchor region.

### Q6. What is the current Vercel Functions region?

**Why it matters:** Without repository configuration, it may be a dashboard value or Vercel's `iad1` default.  
**Recommendation:** Confirm it in the deployment summary and runtime logs, then pin the matching value in `vercel.json`.

### Q7. What Vercel plan is used, and is the required region available at an acceptable price?

**Why it matters:** Region availability, multi-region options, Fluid Compute, and regional pricing vary by plan.  
**Recommendation:** Use one region matching Supabase. Do not pay for multi-region functions for this single-primary database. If Supabase is in São Paulo, prefer `gru1` if the plan permits it.

### Q8. Is Fluid Compute enabled for the production project?

**Why it matters:** Fluid Compute can serve concurrent requests from one warm instance, changing the practical effect of `connection_limit=1`.  
**Recommendation:** Keep Fluid Compute enabled if already available, start with one Prisma connection per instance through Supavisor, and raise to two only if measured queueing justifies it.

### Q9. Which Supabase pooler is available: shared Supavisor or paid dedicated PgBouncer?

**Why it matters:** Both support transaction-mode runtime traffic, but cost, latency, IP support, and client limits differ.  
**Recommendation:** Start with shared Supavisor transaction mode because workload volume is small. Consider the dedicated pooler only if measured latency/client limits justify the paid option.

### Q10. Where should Prisma migrations run?

**Why it matters:** Transaction pooling is inappropriate for Prisma migration commands, and migrations must execute once per release.  
**Recommendation:** Use a dedicated CI/release job with `DIRECT_URL`, following `migrate status`, `migrate deploy`, and `generate` in the repository-mandated order. Do not run migrations per function invocation or use `prisma migrate dev`.

### Q11. Can the migration runner reach Supabase's direct IPv6 endpoint?

**Why it matters:** Direct Supabase connections are IPv6 by default unless the IPv4 add-on is enabled.  
**Recommendation:** Use the direct endpoint when reachable; otherwise use Supavisor session mode for migration/admin traffic. Never use transaction mode for migrations.

### Q12. May Preview deployments access Production data?

**Why it matters:** Vercel Preview deployments can multiply pools and accidentally mutate production data.  
**Recommendation:** No. Give Preview/QA an isolated Supabase project or database and separate Auth/Storage credentials.

### Q13. Should region configuration live in the repository or only in Vercel?

**Why it matters:** Dashboard-only configuration is easy to drift and hard to review.  
**Recommendation:** Commit `vercel.json` as the source of truth and verify the resulting deployment summary.

### Q14. Is moving the Supabase project itself to São Paulo or another region in scope?

**Why it matters:** This is a new-project migration affecting database, Auth, Storage, keys, sessions, and cutover.  
**Recommendation:** No for the first implementation. First move Vercel compute to the existing Supabase region and measure. Reconsider only if latency or residency requirements remain unmet.

### Q15. If a Supabase region migration is eventually approved, what downtime is acceptable?

**Why it matters:** Cutover strategy changes substantially between a maintenance window and near-zero downtime.  
**Recommendation:** Prefer a controlled maintenance window for this low-volume system unless the business explicitly requires near-zero downtime.

### Q16. Should real latency instrumentation be included in audit item 9?

**Why it matters:** The current helper does not measure handler work, so co-location cannot be proven reliably.  
**Recommendation:** Yes. Replace it within this scope with structured timing at the canonical API boundary.

### Q17. May we run a controlled QA deployment benchmark and one disposable full receipt/estampo workflow after the infrastructure change?

**Why it matters:** Read-only timings cannot validate transactions, Storage, audit outbox, or artifact paths through the pooler.  
**Recommendation:** Yes, in guarded QA with automatic reset. Keep production verification read-only unless a separate canary is explicitly approved.

### Q18. What performance targets should define completion?

**Why it matters:** “Geographically close” is a configuration fact, but the business objective is lower waiting time.  
**Recommendation:** Preserve workflow warm p95 under 500 ms, reduce cold latency by at least 25% with a stretch target under 1 second, keep receipt/estampo p95 under 2 seconds, and require zero pool-exhaustion errors during test and the first seven production days.

### Q19. What monitoring platform should receive Vercel, Prisma, Supabase, and audit-outbox alerts?

**Why it matters:** Previous reports left external monitoring unconfigured. Without an owner/destination, connection regressions may go unnoticed.  
**Recommendation:** Use the existing operational platform if one exists; otherwise start with Vercel logs/alerts plus Supabase Observability and a single owned notification channel before adding another vendor.

### Q20. Who owns the deployment dashboards and final environment-variable cutover?

**Why it matters:** The repository change cannot set or verify private production values by itself.  
**Recommendation:** Name one deployment owner with access to both Vercel and Supabase, and require a second reviewer for the production URL switch.

## 11. Risks and rollback requirements

### Main risks

- Selecting a Vercel region based on users instead of the data can worsen every server-to-data call.
- Enabling multiple function regions against one database can multiply pools and reintroduce cross-region latency.
- Using the transaction pooler for migrations can produce prepared-statement or schema-engine failures.
- Setting `connection_limit` too high can exhaust the 60-connection database; setting it too low can serialize concurrent work in a Fluid instance.
- Updating only Vercel Production and not Preview/QA can create inconsistent or unsafe environments.
- Assuming the local Supabase target is production can redirect the wrong deployment.
- A full Supabase region move can break Auth sessions, user linkage, Storage objects, bucket references, redirects, and service keys.

### Required rollback

For the recommended first implementation, rollback should be configuration-only:

1. Preserve the previous Vercel region and environment-variable metadata securely.
2. Keep the previous direct runtime URL available as an emergency rollback value, without committing it.
3. Deploy the region and pooled URL together to QA first.
4. If pooled production traffic fails, restore the previous `DATABASE_URL`, redeploy, and retain `DIRECT_URL` for migrations.
5. If the chosen Vercel region regresses user-visible latency, restore the former region and redeploy.
6. Do not roll back database migrations with destructive commands; this first implementation should not require a schema migration.
7. Confirm audit outbox, receipts, documents, and Storage state after rollback.

## 12. Recommended decision package before plan generation

The minimum answers needed to generate a precise implementation plan are:

1. Production host and Vercel project/plan/Fluid status.
2. Production database provider.
3. Supabase production region.
4. Vercel current and approved target region.
5. Shared versus dedicated pooler choice.
6. Migration runner and direct/session connectivity choice.
7. Preview/QA isolation policy.
8. Approval to replace latency instrumentation.
9. Approval for guarded QA workflow verification.
10. Accepted performance thresholds and monitoring owner.

If the user accepts the recommendations without further changes, the default plan should assume:

- Vercel remains the host;
- the current Supabase project remains the data/Auth/Storage home;
- one Vercel region matching Supabase;
- shared Supavisor transaction mode for runtime;
- `connection_limit=1` initially;
- direct or session-mode `DIRECT_URL` for a single release runner;
- repository-owned `vercel.json`;
- isolated QA/Preview;
- real structured timing and guarded QA verification;
- no Supabase project-region migration in this phase.

## 13. Current provider references

- Vercel recommends running functions close to the data source, documents `iad1` as the default for new projects, and supports repository region configuration through `vercel.json`: https://vercel.com/docs/functions/configuring-functions/region
- Vercel region mapping, including `gru1` to AWS `sa-east-1`, is documented at: https://vercel.com/docs/regions
- Supabase recommends direct connections for migrations/long-lived backends, session mode for persistent IPv4 clients, and transaction mode on port 6543 for serverless/edge functions: https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase's Prisma troubleshooting explicitly recommends transaction mode for Vercel/serverless and `pgbouncer=true` where required: https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting
- Prisma documents that serverless instances each create a pool and recommends small pool sizes plus an external pooler: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections
- Prisma documents direct migration connections when runtime traffic uses PgBouncer/Supavisor: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer
- Supabase documents available primary regions, including São Paulo `sa-east-1`: https://supabase.com/docs/guides/platform/regions
- Supabase documents that changing project region requires creating and migrating to a new project: https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z

## 14. Final assessment

Audit item 9 should be treated as an infrastructure configuration, connection-management, observability, and verification change - not as a database-schema optimization.

Most application-level prerequisites are already in good condition because earlier phases removed the second Prisma client, reduced workflow queries, shortened receipt transactions, added indexes, cached static configuration, and removed UI waits. The remaining work is to make the physical topology explicit, put compute next to the data, route transient runtime connections through the correct pooler, measure the real handler path, and prove that all legal/audit workflows remain correct.

No application, database, Vercel, Supabase, or Railway settings were changed while preparing this report.
