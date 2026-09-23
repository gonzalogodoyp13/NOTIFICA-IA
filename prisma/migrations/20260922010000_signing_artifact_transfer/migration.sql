CREATE TABLE public.signing_artifacts (
  id TEXT PRIMARY KEY,
  "officeId" INTEGER NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
  "itemId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "leaseToken" TEXT NOT NULL,
  "storageBucket" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL UNIQUE,
  "checksumSha256" TEXT NOT NULL CHECK ("checksumSha256" ~ '^[a-f0-9]{64}$'),
  "sizeBytes" INTEGER NOT NULL CHECK ("sizeBytes" BETWEEN 8 AND 33554432),
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'COMMITTED', 'CLEANING', 'DELETED')),
  validation JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("itemId", "officeId") REFERENCES public.signing_items(id, "officeId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("deviceId", "officeId") REFERENCES public.signing_devices(id, "officeId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (state <> 'COMMITTED' OR validation IS NOT NULL)
);
CREATE INDEX "signing_artifacts_officeId_state_expiresAt_idx" ON public.signing_artifacts("officeId", state, "expiresAt");
CREATE INDEX "signing_artifacts_itemId_officeId_idx" ON public.signing_artifacts("itemId", "officeId");
CREATE INDEX "signing_artifacts_deviceId_officeId_idx" ON public.signing_artifacts("deviceId", "officeId");
ALTER TABLE public.signing_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signing_artifacts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.protect_signing_upload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.state = 'COMMITTED' OR
     (NEW.id, NEW."officeId", NEW."itemId", NEW."deviceId", NEW."leaseToken", NEW."storageBucket", NEW."storageKey", NEW."checksumSha256", NEW."sizeBytes", NEW."createdAt", NEW."expiresAt")
     IS DISTINCT FROM
     (OLD.id, OLD."officeId", OLD."itemId", OLD."deviceId", OLD."leaseToken", OLD."storageBucket", OLD."storageKey", OLD."checksumSha256", OLD."sizeBytes", OLD."createdAt", OLD."expiresAt") THEN
    RAISE EXCEPTION 'IMMUTABLE_SIGNING_UPLOAD';
  END IF;
  IF NOT ((OLD.state = 'PENDING' AND NEW.state IN ('COMMITTED', 'CLEANING')) OR
          (OLD.state = 'CLEANING' AND NEW.state = 'DELETED')) THEN
    RAISE EXCEPTION 'INVALID_SIGNING_UPLOAD_TRANSITION';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_signing_upload BEFORE UPDATE OR DELETE ON public.signing_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.protect_signing_upload();
