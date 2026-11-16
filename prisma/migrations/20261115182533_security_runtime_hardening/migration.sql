BEGIN;
ALTER FUNCTION public.protect_signing_upload() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.protect_signing_upload() FROM PUBLIC, anon, authenticated;
COMMIT;
