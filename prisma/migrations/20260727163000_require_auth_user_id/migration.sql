DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_count FROM "users" WHERE "authUserId" IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Cannot require users.authUserId: % user(s) are not linked to Supabase Auth', missing_count;
  END IF;
END $$;

ALTER TABLE "users" ALTER COLUMN "authUserId" SET NOT NULL;
