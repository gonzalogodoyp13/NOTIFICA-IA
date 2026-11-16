# Twenty-point security audit — 2026-11-15

This report preserves the original audit results. See [the remediation record](SECURITY_REMEDIATION_2026-11-15.md) for subsequent fixes, verification, and remaining release gates.

**Verdict: do not treat this application as cleared for launch.** There are reproduced API failures, vulnerable dependency versions, missing administrator MFA, and incomplete deployment verification. This audit checks the current working tree, including existing uncommitted work. It does not certify a deployed build or prove absence of vulnerabilities.

## Evidence and scope

- Inventoried 130 API route files; searched application/library code for auth, tenant scoping, privileged operations, raw SQL, command execution, HTML sinks, external requests, webhooks, AI, upload handling and abuse controls. Manual review sampled shared boundaries and sensitive routes; this is not exhaustive per-route penetration testing.
- Required Prisma sequence completed successfully after retrying outside the network sandbox: 46 migrations, no pending migrations, client generated. `migrate dev` was not used.
- Existing integration run: **395 passed, 94 skipped, 0 failed**. Skipped tests are not passes.
- Added isolated security acceptance tests: **3 passed, 2 failed**, using real API handlers and the real shared API wrapper with mocked authentication/database services. No real emails or customer mutations are performed by these tests.
- Live Supabase catalog checks on project `gaibmtuyywxsgkvjtysk`: **65 public tables; all RLS enabled; zero tables with anon/authenticated SELECT/INSERT/UPDATE/DELETE grants**. Three private buckets; zero Storage object policies. Server credentials are required for object operations.
- Live authentication aggregate: **2 active office administrators, 0 with verified Supabase MFA factors**. Security advisor reports leaked-password protection disabled.
- npm advisory scans: **31 affected packages overall** (1 critical, 22 high, 7 moderate, 1 low); **16 production packages** (1 critical, 12 high, 3 moderate). These are npm package counts, not distinct exploitable application vulnerabilities.
- Read-only heuristic secret scan: 1,716 tracked text files, 38 existing local browser-build files, 307,749 added Git-history lines across the local history (122 reachable commits). No non-placeholder matches. 59 current binary/large/unreadable files were skipped. Local build age and production equivalence are not established. Remote logs, unreachable Git objects, binary archives and deployed bundles were not comprehensively scanned.
- Separate database-backed suites were run; see the final database-run addendum below. They use synthetic fixtures and disposable schemas or rollback transactions, not real user accounts. No authenticated two-browser production penetration test was performed.

## All 20 requested checks

“Partial” means observed defenses exist but the complete acceptance condition has not been established. “Gap” means a concrete missing control or failure, not necessarily a demonstrated external exploit.

| # | Check | Result | Evidence and remaining requirement |
|---|---|---|---|
| 1 | Cross-customer access | Partial | Canonical office comes from the database, not request fields (`lib/auth-server.ts`). New tests verify unauthenticated denial, list scoping, and spoofed office rejection for comunas. Existing tests cover foreign reply attachments, receipts, signing and report jobs. Still need the complete two-account read/edit/delete/download/export/search/dashboard matrix across all 130 routes on the deployed build. |
| 2 | Server-side administrator permissions | Partial | PDF settings explicitly check `isOfficeAdmin`; reports use `assertReportAdmin`; device administration rechecks active administrator membership in the database. Ordinary catalog editing is also available in the UI, so absence of admin checks there is not automatically a bypass. Full role/action policy and background-job matrix remain to be exercised. |
| 3 | Database privileges | Gap | Live client grants/RLS are hardened. Local runtime DATABASE_URL uses `postgres`, which has BYPASSRLS, so application filtering is the tenant boundary. `public.protect_signing_upload` has no fixed search path and EXECUTE grants to anon/authenticated. It is an invoker trigger function, not a demonstrated public privilege-escalation endpoint. Use a least-privilege runtime role and harden the function; verify deployed credentials independently. |
| 4 | Secret exposure | Partial | No non-placeholder matches in the scoped heuristic scan or existing local browser chunks. Initial database URL matches were literal password placeholders. Committed Codex session backups and debug logs unnecessarily increase disclosure risk. Full scanner coverage, production logs/bundles, remote history and credential rotation history remain unverified. |
| 5 | Authentication/session/recovery | Gap | `getUser()` plus fresh local membership checks deny disabled/unprovisioned users. Outage tests fail closed. Neither active administrator has a verified MFA factor; leaked-password protection is disabled. Enforce privileged MFA and verify real logout/revocation/expiry/recovery and production cookie attributes. |
| 6 | Private document downloads | Partial | Live documents, pdf-assets and reports buckets are private, with no client Storage policies. Document download checks the role's office before retrieving bytes. Signed artifact and report access have dedicated checks/tests. Full logged-out/wrong-office direct-link and signed-link expiry tests on deployment remain. |
| 7 | Production/preview configuration | Partial | Internal jobs authenticate server secrets; ping returns only a health response. Infrastructure checker fails its automatic-main-deployment policy and flags public software update routes for missing timing wrappers. No CSP/security headers are configured in `next.config.js`; hosting headers may differ. Preview data isolation, HTTPS, debug flags, test accounts and deployment access restrictions were not verified. |
| 8 | Dependencies/build supply chain | **Fail** | Installed Next.js 14.2.33 is flagged critical. Production audit also flags mailparser, nodemailer, zod and transitive packages. Lockfile exists. Upgrade and retest deliberately; `npm audit fix --force` was not run. Applicability of each advisory depends on runtime/configuration. |
| 9 | SQL/command injection | Partial, no confirmed defect | Reviewed app/library raw SQL uses Prisma tagged templates/Prisma.sql/Prisma.join. PDF validator uses `execFile` with fixed argument positions and an operator-controlled executable, isolated environment and timeout. No unsafe raw-query API, eval or new Function was found in app/lib search. Input fuzzing and full query-path review remain. |
| 10 | XSS/untrusted rendered content | Partial, no confirmed defect | No `dangerouslySetInnerHTML` or direct innerHTML sink found in searched app/lib. Reply HTML becomes plain text; receipt email body is sent as text. This is not an HTML sanitizer guarantee. Browser payload tests and dependency-related XSS applicability remain. |
| 11 | Client-controlled roles/prices/status | Partial | New test confirms supplied officeId cannot override the canonical office. Receipt workflow uses office scope, state hashes, transactions and concurrency locks; signing requires validated evidence. Database suite results below qualify this assessment. No payment-provider checkout was found; receipt payment is an operator bookkeeping action. Full role/business-policy validation remains. |
| 12 | Unverified webhooks | Not applicable to located routes | No Stripe/provider webhook handler found in app/lib. Mail replies are polled; internal scheduler endpoints require server secrets and jobs use idempotency keys. Any external webhook configured outside this repository remains unverified. |
| 13 | Cost/resource abuse | **Gap** | Shared `withApiUser` has no distributed rate limiting, quota, or body-size enforcement. `sendReceiptTest` creates a new dispatch and sends on each invocation without a cooldown/quota. Public software download proxy makes upstream GitHub calls per request. Device-specific limits and validator concurrency limits exist, but do not protect ordinary email/PDF/export APIs. Hosting/provider limits were not established. No real message flooding was attempted. |
| 14 | Unsafe uploads | Partial | PDF assets require PNG MIME, 5 MB per-file maximum and magic bytes; private buckets restrict MIME/size. Signed-PDF transport caps files at 4 MB and validates server-side. PDF asset `formData()` parsing occurs before file-size checks; no app-level total streamed body bound or image decoded-dimension limit was found. Malware/parser/decompression testing remains. |
| 15 | Responses/caches/logs leaking data | **Fail** | API error sentinel is returned verbatim by `/api/comunas`; other legacy handlers use similar `error.message` responses. Some catches log raw errors. Middleware applies private/no-store for matched routes; service-worker tests exercise caching policy. Full production cache/CDN/analytics/log review remains. |
| 16 | CSRF | **Fail: server acceptance gate** | A simple text/plain POST with a foreign Origin and an authenticated mocked user reaches the real comuna mutation and returns 200, where the acceptance test expects 403. Shared wrapper has no Origin/Referer/token/Fetch-Metadata check. Signing center has separate origin protection. Browser exploitability depends on actual cookie SameSite/domain behavior; this test does not establish that a cross-site browser sends cookies. Same-site hostile origins remain relevant. |
| 17 | SSRF | Partial / hardening gap | Archive/validator URLs are operator-configured, HTTPS-only, redirect-rejecting. Update download allowlists the GitHub redirect host. Graph reply polling sends bearer credentials to checkpoint/nextLink URLs without a destination allowlist or explicit redirect policy (`lib/recibos/reply-providers.ts`). Those URLs originate from stored provider state, not a demonstrated ordinary-user URL input. Pin Graph destinations and reject unsafe redirects; then test malicious pagination/checkpoint values. |
| 18 | Fail-open errors | Partial; disclosure failure | Canonical authentication tests deny auth/database outages, disabled and missing accounts. Shared unknown-error handler is generic. Legacy route-local catches bypass that sanitization and disclose internal messages (reproduced). Fault-injection/partial-commit coverage is not complete. |
| 19 | Detection/recovery | Unverified operational gate | Append-only activity history, outbox and signing alerts exist. No end-to-end delivery of a security alert to an operator or actual backup restore was performed. UI alert rendering and a backup policy alone cannot establish recovery capability. Require a documented restore rehearsal and alert-delivery test. |
| 20 | In-product AI/prompt injection | Not applicable to located product code | No deployed-model SDK/call/tool-execution path found in app/lib or package dependencies. Product name alone does not establish an AI runtime. Reassess if a separate model service or document/email agent is deployed. |

## Reproduced failures and priorities

1. **Update vulnerable production dependencies.** Start with Next.js, then the exposed email/parsing/validation paths. Verify actual production platform and advisory prerequisites; a critical npm classification is not proof that every critical exploit is reachable. Framework major upgrades require compatibility testing.
2. **Enforce CSRF protection at the shared cookie-authenticated mutation boundary.** Use a configured trusted origin and explicit exceptions for separately authenticated machine endpoints. Reject foreign origins before auth-dependent work and before parsing/mutation. Cover missing/null origins, sibling origins, content types and reverse-proxy headers.
3. **Remove raw internal errors from public responses and logs.** Route legacy catches through the central translator; keep diagnostic records sanitized. The new error sentinel test must pass after remediation.
4. **Require administrator MFA and enable leaked-password protection.** MFA factors are absent for both active administrators. Application-level assurance checks must accompany enrollment.
5. **Add distributed quotas/rate limits and bounded request parsing.** Prioritize test-email, sending/retry, PDF generation, exports, uploads and public download proxy. Ensure quotas are keyed to verified account/office and cannot be reset by changing an idempotency key.
6. **Harden database runtime privileges and provider URL handling.** Avoid relying on the database owner connection for normal requests; preserve current server tenant filtering. Lock Graph requests to their expected host and redirect behavior.
7. **Close deployment verification and recovery gates.** Run the two-account end-to-end matrix, inspect production settings/bundle, and perform an isolated restore plus alert-delivery drill.

## Repeatable checks

Saved evidence is in `docs/audit-artifacts/security-2026-11-15/`: npm full/production advisory JSON, original integration JSON, focused API test JSON, secret-scan summary, and live SQL/aggregate results. These artifacts preserve the failed checks as well as the successes.

```powershell
npm run db:status
npm run db:migrate
npm run db:generate
npm run test:integration
node node_modules/vitest/vitest.mjs run --config scripts/security-audit.vitest.config.ts
node scripts/security-secret-scan.mjs
npm audit --json
npm audit --omit=dev --json
npm run check:auth-audit
npm run check:infrastructure
npm run test:receipts:database
npm run test:signing:database
```

The new audit tests intentionally remain red for the two reproduced defects, and are separate from the normal integration-test include pattern. This is an audit delivery, not a claim that those defects were fixed. The secret scan is a heuristic supporting check, not a replacement for a maintained secret scanner. Database suites create synthetic objects and require a suitable database connection.

`check:auth-audit` currently flags two intentionally public software-distribution routes (`update-manifest`, `update-download`). Source review confirms they expose software metadata/bytes, not customer records; this is an outdated allowlist, not a demonstrated authentication bypass. The infrastructure script also flags their absent request-timing wrapper and the main-branch deployment policy. Do not dismiss the entire checker because these exceptions are understood.

## References

- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api): grants and RLS are separate controls.
- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html): evaluate cookie behavior together with server request-origin defenses.
- [Next.js Windows-hosting RCE advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) and [image optimization SVG advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw): deployment prerequisites require assessment.
- [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- [Mutable function search-path advisor](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).

## Final database-run addendum

- Signing database suite: **79 passed, 3 failed out of 82** on the original run. Two failures were 60-second timeouts (device enrollment/ordinary-user denial and document delivery visibility). Rerunning only those two cases serially with their existing timeout limits produced **2 passes**. This resolves the isolated timeout reproductions, not the whole suite's original red result.
- The remaining signing failure is a policy/test mismatch: the failure matrix expects `TOKEN_MISSING` to enter `WAITING_FOR_OPERATOR`, while `lib/signing/service.ts` explicitly schedules `RETRY_PENDING` and preserves the attempt budget for a disconnected token. The test assumes an older behavior. This run did not demonstrate unauthorized signing, but the intended token-disconnect policy and its acceptance test need reconciliation; the failure is retained.
- Receipt database suite: **5 passed, 1 failed out of 6**. The failing export assertion reads receipt ID from column 1 and status from column 12. Current workbook output uses ROL in column 1, status in column 9, receipt number in column 10 and procurador in column 12. Earlier assertions in that test passed for selected-receipt isolation, unpaid lists, reconciliation, monthly rows and dashboard totals. The stale export assertion is not evidence of a cross-customer leak; export acceptance coverage still needs repair.
- The other receipt tests include foreign-office exclusion, stale preview rejection, undo and concurrent updates. Signing tests cover tenant foreign keys, immutable sources, device authorization, stale leases, audit rollback and validated completion. They remain service/database tests, not two real authenticated browser sessions.
- No production application behavior, dependencies, account settings or hosting configuration was changed by this audit. New files are the report, saved evidence, read-only secret scanner, and isolated failing security acceptance tests.
- Post-run catalog verification found **zero remaining disposable signing/receipt test schemas**.
