# Audit Report Phase 1 Rollout

This release uses an expand/backfill/switch migration. It does not drop the legacy report file columns or delivery tables.

## Isolated QA deployment

1. Point `DATABASE_URL`, `DIRECT_URL`, Supabase URL/service-role variables, mail provider variables, and the application URL to the isolated QA environment.
2. Pause external daily/monthly report schedules and avoid manual generation or sending during the migration.
3. Run, in order:

   ```powershell
   npx prisma migrate status
   npx prisma migrate deploy
   npx prisma generate
   ```

4. Run the read-only reconciliation preview, then apply it once:

   ```powershell
   npm run db:reconcile:reports
   npm run db:reconcile:reports -- --apply
   npm run db:reconcile:reports
   ```

   The final preview must report zero missing versions, zero missing legacy attempts, and zero invalid ready objects.

5. Verify the `reports` bucket is private, has a 50 MB limit, and only permits the XLSX MIME type. Verify an unauthenticated public URL cannot retrieve an object.
6. Run:

   ```powershell
   npx prisma validate
   npx tsc --noEmit
   npm run lint
   npm run check:utf8
   npm run check:auth-audit
   npm run test:integration
   npm run check:infrastructure
   npm run build
   npm run qa:auth
   npm run test:qa
   npm run verify:infrastructure
   ```

7. Complete the administrator/non-administrator, version restore, immutable delivery attempt, checksum corruption, scheduled idempotency, and cross-office scenarios from the phase acceptance checklist using QA-only users, Storage objects, and sandbox mail recipients.
8. Resume the report schedules only after all assertions pass.

## Production deployment

Repeat the migration and reconciliation sequence without corruption injection or destructive failure testing. Keep the schedules paused until the final reconciliation preview is clean and an administrator can list and download a verified report. Roll back application code only if needed; do not remove the additive migration or its backfilled history.

Never use `prisma migrate dev` in this repository.
