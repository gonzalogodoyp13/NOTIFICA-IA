BEGIN;

ALTER FUNCTION public.protect_signing_upload() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.protect_signing_upload() FROM PUBLIC, anon, authenticated;

-- Backend-only role: no ownership, DDL, role creation or RLS bypass. It is
-- intentionally NOLOGIN until an operator provisions a unique runtime secret.
-- Office authorization remains in the application, as with the previous
-- owner connection. These policies never grant access to browser roles.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'notifica_runtime') THEN
    CREATE ROLE notifica_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
GRANT notifica_runtime TO postgres;
GRANT USAGE ON SCHEMA public TO notifica_runtime;

DO $$ DECLARE tab record; BEGIN
  FOR tab IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
      AND c.relname NOT IN ('_prisma_migrations', 'user_office_backfill_issues')
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO notifica_runtime', tab.relname);
    EXECUTE format('CREATE POLICY notifica_backend_access ON public.%I TO notifica_runtime USING (true) WITH CHECK (true)', tab.relname);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO notifica_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO notifica_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO notifica_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO notifica_runtime;
-- New RLS-enabled tables need an explicit backend policy in their migration.

COMMIT;
