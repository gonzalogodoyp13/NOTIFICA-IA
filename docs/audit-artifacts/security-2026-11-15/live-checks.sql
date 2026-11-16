-- Read-only catalog and aggregate checks; no customer record contents.
SELECT count(*) AS total,
  count(*) FILTER (WHERE NOT c.relrowsecurity) AS without_rls,
  count(*) FILTER (WHERE has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')) AS client_grants
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');

SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets;
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
WHERE rolname IN ('postgres', 'anon', 'authenticated', 'service_role');
SELECT p.proname, p.prosecdef, p.proconfig,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('protect_signing_upload', 'prevent_activity_history_mutation');

SELECT
  (SELECT count(*) FROM public.users WHERE "isActive" AND "isOfficeAdmin") AS active_admins,
  (SELECT count(*) FROM public.users u WHERE u."isActive" AND u."isOfficeAdmin"
    AND EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id::text = u."authUserId"
      AND f.status::text = 'verified')) AS admins_with_verified_mfa,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects') AS storage_policy_count;
