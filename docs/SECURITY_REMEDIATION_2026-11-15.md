# Security remediation — 15 November 2026

This follows `SECURITY_AUDIT_2026-11-15.md`, which preserves the original findings. This is not certification that all twenty security areas are clear.

## Implemented in the working tree

- Upgraded Next.js to 15.5.29 and React to 19, migrated asynchronous route parameters/cookies, upgraded vulnerable mail and validation packages, and applied scoped transitive dependency overrides. The full dependency audit now reports zero known vulnerabilities, including development dependencies.
- Added trusted-origin checks before cookie-authenticated mutations, including logout. Production rejects missing configuration; forwarded host headers cannot set the trusted origin.
- Added database-backed atomic user/office quotas: test email 5/25 per ten minutes, send operations 10/50 per ten minutes, document operations 30/150 per minute. Ordinary APIs use 240/1200 per minute. Public installer downloads have a shared 30/minute ceiling. Denied attempts remain counted; database outages fail closed.
- Added streamed request-body bounds (1 MiB JSON; 16 MiB for the existing PDF asset multipart endpoint), a 15-second read deadline, and media-type checks. PNG assets additionally require valid IHDR dimensions within 8192 per side and 16 million pixels.
- Required verified `aal2` assurance for administrators in the shared server identity resolver, with guided authenticator enrollment at `/mfa`. Server database roles determine administrator status. Existing administrators must enroll after deployment.
- Sanitized legacy API error responses, added a shared generic server-error boundary, disabled debug logging in production, and added private/no-store and nosniff response headers.
- Restricted Graph polling/attachment URLs to HTTPS `graph.microsoft.com/v1.0/`, rejected redirects, and bounded requests with timeouts.
- Added CSP, frame protection and related headers; fixed the infrastructure checker's intentionally public software-route allowlist and timing instrumentation.
- Fixed stale receipt-export and disconnected-signing-token test expectations to match existing application behavior.

## Applied to connected services

- Applied Prisma migration `20261115182533_security_runtime_hardening`: fixed the search path of `protect_signing_upload()` and revoked direct execution by PUBLIC/anon/authenticated. Catalog verification confirms the two browser roles cannot execute it.
- Enabled Supabase leaked-password protection. The dashboard confirmed the save; the subsequent security advisor no longer reported the password-protection or mutable-function-search-path warnings.
- Set Vercel production `APP_ORIGIN=https://www.notificaia.cl`, using the verified permanent primary domain. This configuration takes effect for new deployments.
- Following explicit user approval, applied `20261115185303_restricted_runtime_role`. Created a NOLOGIN backend role without superuser, database/role creation, replication or RLS-bypass privileges. It has CRUD policies on 63 application tables; browser roles still have zero CRUD grants. No login secret was created and no runtime connection was switched.

## Verification

- Production build, including type checking: passed.
- Integration suite: 395 passed; 94 database-gated cases skipped in the default run.
- Security suite: 27 passed when enabled with `SECURITY_DATABASE_TESTS=1`, including actual concurrent database quota enforcement and cross-user office limits. These tests use a disposable schema with no customer data.
- Auth/audit static verification: passed, 386 files. Infrastructure static verification: passed, zero warnings.
- Receipt database suite: all six tests passed in its disposable schema.
- Signing database suite: all 82 tests passed in a serial run. Six receipt tests were skipped in that signing run, then passed in the separate receipt run above. Catalog verification found zero leftover disposable test schemas.
- Restricted-role verification: actual transaction-local role switching permitted application reads and rolled-back synthetic rate-counter writes; migration-history reads, authentication-record reads, table creation and table alteration were denied. Repeat with `node scripts/verify-runtime-role.mjs`. No customer rows were returned or changed.
- Local production HTTP smoke checks: login 200, logged-out MFA redirects to login, private API 401, foreign-origin mutation 403, CSP and private/no-store headers present. No authenticated MFA browser enrollment was performed.
- Full npm dependency audit: zero known vulnerabilities.
- Heuristic secret scan: no findings in 1,716 tracked text files, 181 browser-build files, and 307,749 added Git-history lines. Binary/large files are skipped; this does not prove absence of secrets in every deployed artifact or log.

## Remaining release and operational gates

1. The application changes have not been committed, pushed or deployed. Run deployment smoke tests before calling the fixes live. Administrators must complete their own authenticator enrollment; no user credentials or MFA secrets were created by this work.
2. The app still uses the existing owner connection. Automatic approval review initially rejected the broad persistent role grants; the user then explicitly approved creating and testing the role. That migration and permission verification are now complete. Provisioning a runtime login credential and switching the deployed connection remain pending. The role's application-wide policies do not provide database-level office isolation; server ownership checks remain essential. Keep migration credentials separate from runtime credentials.
3. Test two real authenticated accounts in different offices against the deployed UI/API, including downloads, search, exports and role revocation. Mocked identity tests and isolated database tests do not replace this check.
4. Verify preview deployments use isolated data and secrets. Setting a production origin does not establish preview isolation.
5. Perform an isolated backup restore and deliver a real security alert to the designated operator. Neither is established by source review or passing tests.
6. Inspect production logs, analytics and built assets after deployment. The scanner covers local artifacts and Git history only.

No real emails were sent, no production records were used as test fixtures, and pre-existing Windows-agent changes were preserved.

The final Supabase security advisor reports only two informational RLS/no-policy notices for deliberately inaccessible migration/backfill tables. Neither browser roles nor the new runtime role were granted access to those tables. See [Supabase's explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
