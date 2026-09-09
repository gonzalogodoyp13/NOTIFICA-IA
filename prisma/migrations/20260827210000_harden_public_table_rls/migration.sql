-- This application uses direct Prisma connections for application data.
-- Supabase browser clients are used for Auth only, so public-schema tables
-- must not be reachable through the anon or authenticated Data API roles.

-- Opt future Prisma migrations out of Supabase's legacy automatic Data API
-- exposure. Access for service_role must be granted explicitly when a future
-- server-side integration genuinely needs it.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Enable RLS on every existing ordinary or partitioned table in the exposed
-- public schema. No allow policies are intentionally created: direct Data API
-- access is denied, while the existing table-owning Prisma connection remains
-- unaffected because FORCE ROW LEVEL SECURITY is deliberately not enabled.
DO $rls$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT c.relname
    FROM pg_class AS c
    INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      table_record.relname
    );

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated',
      table_record.relname
    );
  END LOOP;
END
$rls$;

-- Identity/serial sequences are not protected by table RLS and therefore need
-- their own Data API privilege boundary.
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- The append-only trigger function needs no Data API execution privilege.
-- Pinning an empty search_path also removes the mutable-search-path warning.
ALTER FUNCTION public.prevent_activity_history_mutation() SET search_path = '';
REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_activity_history_mutation()
  FROM PUBLIC, anon, authenticated;
