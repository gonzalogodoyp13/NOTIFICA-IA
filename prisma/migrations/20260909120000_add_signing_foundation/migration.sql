-- Prisma owns migration history in this repository. Phase 0 sequencing exception
-- authorized by the owner: generic backend phases 1 and 2 may proceed first.
BEGIN;

-- CreateEnum
CREATE TYPE "SigningDeviceRole" AS ENUM ('SIGNER', 'RECEIVER', 'SIGNER_RECEIVER');

-- CreateEnum
CREATE TYPE "SigningDeviceHealth" AS ENUM ('OFFLINE', 'AGENT_ONLINE_TOKEN_MISSING', 'TOKEN_READY', 'CERT_EXPIRING', 'CERT_EXPIRED', 'DRIVER_ERROR');

-- CreateEnum
CREATE TYPE "SigningJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_FOR_OPERATOR', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SigningItemStatus" AS ENUM ('QUEUED', 'CLAIMED', 'SIGNING', 'RETRY_PENDING', 'WAITING_FOR_OPERATOR', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SignatureLevel" AS ENUM ('PADES_B', 'PADES_T', 'PADES_LT', 'PADES_LTA');

-- CreateEnum
CREATE TYPE "SigningAttemptResult" AS ENUM ('RUNNING', 'SUCCEEDED', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE', 'OPERATOR_REQUIRED', 'LEASE_EXPIRED', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentDeliveryStatus" AS ENUM ('PENDING', 'DOWNLOADING', 'DELIVERED', 'RETRY_PENDING', 'FAILED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "Documento" DROP CONSTRAINT "Documento_rolId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentoVersion" DROP CONSTRAINT "DocumentoVersion_documentoId_fkey";

-- AlterTable
ALTER TABLE "Documento" ADD COLUMN "officeId" INTEGER;
UPDATE "Documento" d SET "officeId" = r."officeId" FROM "RolCausa" r WHERE r.id = d."rolId";
ALTER TABLE "Documento" ALTER COLUMN "officeId" SET NOT NULL;

-- AlterTable
ALTER TABLE "DocumentoVersion" ADD COLUMN "officeId" INTEGER;
UPDATE "DocumentoVersion" v SET "officeId" = d."officeId" FROM "Documento" d WHERE d.id = v."documentoId";
ALTER TABLE "DocumentoVersion" ALTER COLUMN "officeId" SET NOT NULL;

-- CreateTable
CREATE TABLE "signing_devices" (
    "id" TEXT NOT NULL,
    "officeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "role" "SigningDeviceRole" NOT NULL,
    "health" "SigningDeviceHealth" NOT NULL DEFAULT 'OFFLINE',
    "publicKey" TEXT,
    "certificateThumbprint" TEXT,
    "certificateIssuer" TEXT,
    "certificateSubject" TEXT,
    "certificateExpiresAt" TIMESTAMP(3),
    "providerType" TEXT,
    "agentVersion" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signing_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_enrollments" (
    "id" TEXT NOT NULL,
    "officeId" INTEGER NOT NULL,
    "role" "SigningDeviceRole" NOT NULL,
    "secretHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "deviceId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signing_jobs" (
    "id" TEXT NOT NULL,
    "officeId" INTEGER NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "signerFingerprint" TEXT NOT NULL,
    "requestedLevel" "SignatureLevel" NOT NULL DEFAULT 'PADES_LT',
    "status" "SigningJobStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "signing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signing_items" (
    "id" TEXT NOT NULL,
    "officeId" INTEGER NOT NULL,
    "jobId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "sourceVersionId" TEXT NOT NULL,
    "sourceChecksum" TEXT NOT NULL,
    "signerFingerprint" TEXT NOT NULL,
    "status" "SigningItemStatus" NOT NULL DEFAULT 'QUEUED',
    "leaseOwner" TEXT,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 4,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorCode" TEXT,
    "safeError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "signing_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signing_attempts" (
    "id" TEXT NOT NULL,
    "officeId" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "leaseToken" TEXT NOT NULL,
    "result" "SigningAttemptResult" NOT NULL DEFAULT 'RUNNING',
    "errorCode" TEXT,
    "safeError" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "signing_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_signatures" (
    "id" TEXT NOT NULL,
    "officeId" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "sourceVersionId" TEXT NOT NULL,
    "signedVersionId" TEXT NOT NULL,
    "signerFingerprint" TEXT NOT NULL,
    "certificateIssuer" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "level" "SignatureLevel" NOT NULL,
    "digestAlgorithm" TEXT NOT NULL DEFAULT 'SHA256',
    "sourceChecksum" TEXT NOT NULL,
    "signedChecksum" TEXT NOT NULL,
    "timestampAt" TIMESTAMP(3) NOT NULL,
    "revocationCheckedAt" TIMESTAMP(3) NOT NULL,
    "validatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_deliveries" (
    "id" TEXT NOT NULL,
    "officeId" INTEGER NOT NULL,
    "signatureId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" "DocumentDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "safeError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signing_devices_publicKey_key" ON "signing_devices"("publicKey");

-- CreateIndex
CREATE INDEX "signing_devices_officeId_health_createdAt_idx" ON "signing_devices"("officeId", "health", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "signing_devices_id_officeId_key" ON "signing_devices"("id", "officeId");

-- CreateIndex
CREATE UNIQUE INDEX "device_enrollments_secretHash_key" ON "device_enrollments"("secretHash");

-- CreateIndex
CREATE INDEX "device_enrollments_officeId_expiresAt_idx" ON "device_enrollments"("officeId", "expiresAt");

-- CreateIndex
CREATE INDEX "device_enrollments_deviceId_officeId_idx" ON "device_enrollments"("deviceId", "officeId");

-- CreateIndex
CREATE INDEX "device_enrollments_createdByUserId_officeId_idx" ON "device_enrollments"("createdByUserId", "officeId");

-- CreateIndex
CREATE UNIQUE INDEX "device_enrollments_id_officeId_key" ON "device_enrollments"("id", "officeId");

-- CreateIndex
CREATE INDEX "signing_jobs_officeId_status_createdAt_idx" ON "signing_jobs"("officeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "signing_jobs_requestedByUserId_officeId_idx" ON "signing_jobs"("requestedByUserId", "officeId");

-- CreateIndex
CREATE UNIQUE INDEX "signing_jobs_id_officeId_signerFingerprint_key" ON "signing_jobs"("id", "officeId", "signerFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "signing_jobs_officeId_idempotencyKey_key" ON "signing_jobs"("officeId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "signing_items_officeId_status_availableAt_createdAt_idx" ON "signing_items"("officeId", "status", "availableAt", "createdAt");

-- CreateIndex
CREATE INDEX "signing_items_leaseOwner_leaseExpiresAt_idx" ON "signing_items"("leaseOwner", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "signing_items_sourceVersionId_officeId_documentoId_idx" ON "signing_items"("sourceVersionId", "officeId", "documentoId");

-- CreateIndex
CREATE UNIQUE INDEX "signing_items_id_officeId_key" ON "signing_items"("id", "officeId");

-- CreateIndex
CREATE UNIQUE INDEX "signing_items_signature_identity_key" ON "signing_items"("id", "officeId", "sourceVersionId", "documentoId", "signerFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "signing_items_jobId_sourceVersionId_key" ON "signing_items"("jobId", "sourceVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "signing_attempts_leaseToken_key" ON "signing_attempts"("leaseToken");

-- CreateIndex
CREATE INDEX "signing_attempts_officeId_result_startedAt_idx" ON "signing_attempts"("officeId", "result", "startedAt");

-- CreateIndex
CREATE INDEX "signing_attempts_deviceId_officeId_idx" ON "signing_attempts"("deviceId", "officeId");

-- CreateIndex
CREATE UNIQUE INDEX "signing_attempts_itemId_attemptNumber_key" ON "signing_attempts"("itemId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "document_signatures_itemId_key" ON "document_signatures"("itemId");

-- CreateIndex
CREATE INDEX "document_signatures_officeId_documentoId_createdAt_idx" ON "document_signatures"("officeId", "documentoId", "createdAt");

-- CreateIndex
CREATE INDEX "document_signatures_deviceId_officeId_idx" ON "document_signatures"("deviceId", "officeId");

-- CreateIndex
CREATE UNIQUE INDEX "document_signatures_id_officeId_key" ON "document_signatures"("id", "officeId");

-- CreateIndex
CREATE UNIQUE INDEX "document_signatures_source_signer_key" ON "document_signatures"("officeId", "sourceVersionId", "signerFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "document_signatures_signedVersionId_key" ON "document_signatures"("signedVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "document_signatures_item_identity_key" ON "document_signatures"("itemId", "officeId", "sourceVersionId", "documentoId", "signerFingerprint");

-- CreateIndex
CREATE INDEX "document_deliveries_officeId_status_createdAt_idx" ON "document_deliveries"("officeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "document_deliveries_deviceId_status_availableAt_id_idx" ON "document_deliveries"("deviceId", "status", "availableAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "document_deliveries_signatureId_deviceId_key" ON "document_deliveries"("signatureId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_officeId_key" ON "users"("id", "officeId");

-- CreateIndex
CREATE UNIQUE INDEX "RolCausa_id_officeId_key" ON "RolCausa"("id", "officeId");

-- CreateIndex
CREATE UNIQUE INDEX "Documento_id_officeId_key" ON "Documento"("id", "officeId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoVersion_id_officeId_documentoId_key" ON "DocumentoVersion"("id", "officeId", "documentoId");

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_rolId_officeId_fkey" FOREIGN KEY ("rolId", "officeId") REFERENCES "RolCausa"("id", "officeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DocumentoVersion" ADD CONSTRAINT "DocumentoVersion_documentoId_officeId_fkey" FOREIGN KEY ("documentoId", "officeId") REFERENCES "Documento"("id", "officeId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "signing_devices" ADD CONSTRAINT "signing_devices_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_enrollments" ADD CONSTRAINT "device_enrollments_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_enrollments" ADD CONSTRAINT "device_enrollments_deviceId_officeId_fkey" FOREIGN KEY ("deviceId", "officeId") REFERENCES "signing_devices"("id", "officeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "device_enrollments" ADD CONSTRAINT "device_enrollments_createdByUserId_officeId_fkey" FOREIGN KEY ("createdByUserId", "officeId") REFERENCES "users"("id", "officeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "signing_jobs" ADD CONSTRAINT "signing_jobs_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_jobs" ADD CONSTRAINT "signing_jobs_requestedByUserId_officeId_fkey" FOREIGN KEY ("requestedByUserId", "officeId") REFERENCES "users"("id", "officeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "signing_items" ADD CONSTRAINT "signing_items_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_items" ADD CONSTRAINT "signing_items_jobId_officeId_signerFingerprint_fkey" FOREIGN KEY ("jobId", "officeId", "signerFingerprint") REFERENCES "signing_jobs"("id", "officeId", "signerFingerprint") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "signing_items" ADD CONSTRAINT "signing_items_sourceVersionId_officeId_documentoId_fkey" FOREIGN KEY ("sourceVersionId", "officeId", "documentoId") REFERENCES "DocumentoVersion"("id", "officeId", "documentoId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "signing_items" ADD CONSTRAINT "signing_items_leaseOwner_officeId_fkey" FOREIGN KEY ("leaseOwner", "officeId") REFERENCES "signing_devices"("id", "officeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "signing_attempts" ADD CONSTRAINT "signing_attempts_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_attempts" ADD CONSTRAINT "signing_attempts_itemId_officeId_fkey" FOREIGN KEY ("itemId", "officeId") REFERENCES "signing_items"("id", "officeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "signing_attempts" ADD CONSTRAINT "signing_attempts_deviceId_officeId_fkey" FOREIGN KEY ("deviceId", "officeId") REFERENCES "signing_devices"("id", "officeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_item_identity_fkey" FOREIGN KEY ("itemId", "officeId", "sourceVersionId", "documentoId", "signerFingerprint") REFERENCES "signing_items"("id", "officeId", "sourceVersionId", "documentoId", "signerFingerprint") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_deviceId_officeId_fkey" FOREIGN KEY ("deviceId", "officeId") REFERENCES "signing_devices"("id", "officeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_sourceVersionId_officeId_documentoId_fkey" FOREIGN KEY ("sourceVersionId", "officeId", "documentoId") REFERENCES "DocumentoVersion"("id", "officeId", "documentoId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_signedVersionId_officeId_documentoId_fkey" FOREIGN KEY ("signedVersionId", "officeId", "documentoId") REFERENCES "DocumentoVersion"("id", "officeId", "documentoId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "document_deliveries" ADD CONSTRAINT "document_deliveries_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_deliveries" ADD CONSTRAINT "document_deliveries_signatureId_officeId_fkey" FOREIGN KEY ("signatureId", "officeId") REFERENCES "document_signatures"("id", "officeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "document_deliveries" ADD CONSTRAINT "document_deliveries_deviceId_officeId_fkey" FOREIGN KEY ("deviceId", "officeId") REFERENCES "signing_devices"("id", "officeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Existing document writers may omit officeId; supplied values are never
-- overwritten, so composite foreign keys reject a forged tenant assignment.
CREATE FUNCTION public.derive_document_office() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW."officeId" IS NULL THEN
    IF TG_TABLE_NAME = 'Documento' THEN
      SELECT "officeId" INTO NEW."officeId" FROM public."RolCausa" WHERE id = NEW."rolId";
    ELSE
      SELECT "officeId" INTO NEW."officeId" FROM public."Documento" WHERE id = NEW."documentoId";
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER documento_derive_office BEFORE INSERT ON public."Documento"
FOR EACH ROW EXECUTE FUNCTION public.derive_document_office();
CREATE TRIGGER documento_version_derive_office BEFORE INSERT ON public."DocumentoVersion"
FOR EACH ROW EXECUTE FUNCTION public.derive_document_office();
REVOKE ALL ON FUNCTION public.derive_document_office() FROM PUBLIC, anon, authenticated, service_role;

-- A source/signer has at most one active reservation across all jobs.
CREATE UNIQUE INDEX signing_items_active_source_signer_key
ON public.signing_items ("officeId", "sourceVersionId", "signerFingerprint")
WHERE status NOT IN ('FAILED', 'CANCELLED');

ALTER TABLE public.signing_devices ADD CONSTRAINT signing_device_fingerprint_check
CHECK ("certificateThumbprint" IS NULL OR "certificateThumbprint" ~ '^[a-f0-9]{64}$');
ALTER TABLE public.device_enrollments ADD CONSTRAINT enrollment_secret_hash_check
CHECK ("secretHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE public.device_enrollments ADD CONSTRAINT enrollment_consumption_check
CHECK (("consumedAt" IS NULL AND "deviceId" IS NULL) OR
       ("consumedAt" IS NOT NULL AND "deviceId" IS NOT NULL AND "consumedAt" <= "expiresAt"));
ALTER TABLE public.signing_jobs ADD CONSTRAINT signing_job_hashes_check
CHECK ("requestHash" ~ '^[a-f0-9]{64}$' AND "signerFingerprint" ~ '^[a-f0-9]{64}$');
ALTER TABLE public.signing_items ADD CONSTRAINT signing_item_hashes_check
CHECK ("sourceChecksum" ~ '^[a-f0-9]{64}$' AND "signerFingerprint" ~ '^[a-f0-9]{64}$');
ALTER TABLE public.signing_items ADD CONSTRAINT signing_item_attempts_check
CHECK ("attemptCount" >= 0 AND "maxAttempts" BETWEEN 1 AND 20 AND "attemptCount" <= "maxAttempts");
ALTER TABLE public.signing_items ADD CONSTRAINT signing_item_lease_check
CHECK ((status IN ('CLAIMED', 'SIGNING') AND "leaseOwner" IS NOT NULL AND "leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
 OR (status NOT IN ('CLAIMED', 'SIGNING') AND "leaseOwner" IS NULL AND "leaseToken" IS NULL AND "leaseExpiresAt" IS NULL));
ALTER TABLE public.signing_attempts ADD CONSTRAINT signing_attempt_completion_check
CHECK ("attemptNumber" > 0 AND ((result = 'RUNNING' AND "completedAt" IS NULL) OR (result <> 'RUNNING' AND "completedAt" IS NOT NULL)));
ALTER TABLE public.document_signatures ADD CONSTRAINT signature_evidence_check
CHECK ("sourceVersionId" <> "signedVersionId" AND "digestAlgorithm" = 'SHA256'
 AND "sourceChecksum" ~ '^[a-f0-9]{64}$' AND "signedChecksum" ~ '^[a-f0-9]{64}$'
 AND "signerFingerprint" ~ '^[a-f0-9]{64}$');
ALTER TABLE public.document_deliveries ADD CONSTRAINT delivery_completion_check
CHECK ("attemptCount" >= 0 AND ((status = 'DELIVERED' AND "deliveredAt" IS NOT NULL) OR (status <> 'DELIVERED' AND "deliveredAt" IS NULL)));

-- Bind checksums to the exact version at insert time. The lock conflicts with
-- version updates; pinned version artifacts become immutable thereafter.
CREATE FUNCTION public.check_signing_artifact() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v public."DocumentoVersion";
BEGIN
  SELECT * INTO v FROM public."DocumentoVersion" WHERE id = NEW."sourceVersionId" FOR SHARE;
  IF NOT FOUND OR v."checksumSha256" <> NEW."sourceChecksum" OR v."deletedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid signing source artifact' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'document_signatures' THEN
    SELECT * INTO v FROM public."DocumentoVersion" WHERE id = NEW."signedVersionId" FOR SHARE;
    IF NOT FOUND OR v."checksumSha256" <> NEW."signedChecksum" OR v."deletedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid signed artifact' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER signing_item_artifact_check BEFORE INSERT OR UPDATE OF "sourceVersionId", "sourceChecksum"
ON public.signing_items FOR EACH ROW EXECUTE FUNCTION public.check_signing_artifact();
CREATE TRIGGER signature_artifact_check BEFORE INSERT ON public.document_signatures
FOR EACH ROW EXECUTE FUNCTION public.check_signing_artifact();
REVOKE ALL ON FUNCTION public.check_signing_artifact() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.protect_signing_artifact() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.signing_items WHERE "sourceVersionId" = OLD.id)
    OR EXISTS (SELECT 1 FROM public.document_signatures WHERE "signedVersionId" = OLD.id) THEN
    IF ROW(NEW."documentoId", NEW."officeId", NEW."storageBucket", NEW."storageKey", NEW."checksumSha256", NEW."sizeBytes", NEW."mimeType", NEW."deletedAt")
      IS DISTINCT FROM ROW(OLD."documentoId", OLD."officeId", OLD."storageBucket", OLD."storageKey", OLD."checksumSha256", OLD."sizeBytes", OLD."mimeType", OLD."deletedAt") THEN
      RAISE EXCEPTION 'Signing artifact is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER signing_artifact_immutable BEFORE UPDATE ON public."DocumentoVersion"
FOR EACH ROW EXECUTE FUNCTION public.protect_signing_artifact();
REVOKE ALL ON FUNCTION public.protect_signing_artifact() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER document_signatures_append_only BEFORE UPDATE OR DELETE ON public.document_signatures
FOR EACH ROW EXECUTE FUNCTION public.prevent_activity_history_mutation();

-- Application data is Prisma-only (20260827210000_harden_public_table_rls).
-- No permissive policies: default-deny RLS plus revoked Data API grants.
-- Office predicates are enforced by the server service and composite FKs.
DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['signing_devices','device_enrollments','signing_jobs','signing_items','signing_attempts','document_signatures','document_deliveries'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', name);
  END LOOP;
END $$;
COMMIT;

