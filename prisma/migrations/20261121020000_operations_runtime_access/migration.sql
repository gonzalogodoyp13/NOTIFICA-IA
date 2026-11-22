BEGIN;
-- Preserve data and browser isolation. Match the established backend role;
-- never grant BYPASSRLS or ownership to the application login.
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY[
    'diagnostic_incidents', 'diagnostic_events', 'platform_grants', 'platform_audit',
    'owner_email_sessions', 'operations_pulses', 'operations_observations',
    'operations_policies', 'operations_maintenance', 'operations_alerts',
    'operations_notifications', 'operations_recoveries'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO notifica_runtime', name);
    EXECUTE format('CREATE POLICY notifica_backend_access ON public.%I TO notifica_runtime USING (true) WITH CHECK (true)', name);
  END LOOP;
END $$;
COMMIT;
