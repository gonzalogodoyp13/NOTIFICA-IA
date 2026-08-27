CREATE TYPE "GeneratedReportVersionStatus" AS ENUM (
  'UPLOADING',
  'READY',
  'FAILED',
  'CORRUPT',
  'DELETE_PENDING',
  'DELETE_FAILED',
  'DELETED'
);

CREATE TYPE "ReportDeliveryAttemptMode" AS ENUM ('MANUAL', 'SCHEDULED');
CREATE TYPE "ReportDeliveryTarget" AS ENUM ('ALL_AUTHORIZED', 'FAILED_ONLY');
CREATE TYPE "ReportDeliveryAttemptStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'PARTIAL', 'FAILED', 'NO_RECIPIENTS');
CREATE TYPE "ReportRecipientAuthorization" AS ENUM ('AUTHORIZED', 'REVOKED');
CREATE TYPE "ReportDeliveryRecipientStatus" AS ENUM ('PREPARED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

ALTER TABLE "generated_reports"
ADD COLUMN "currentVersionId" TEXT;

CREATE TABLE "generated_report_versions" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" "GeneratedReportVersionStatus" NOT NULL DEFAULT 'UPLOADING',
  "storageBucket" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER,
  "checksumSha256" TEXT,
  "generatedByUserId" TEXT,
  "generationMode" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB,
  "errorMessage" TEXT,
  "failedAt" TIMESTAMP(3),
  "deleteRequestedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "generated_report_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "generated_report_versions_version_positive" CHECK ("versionNumber" > 0),
  CONSTRAINT "generated_report_versions_size_nonnegative" CHECK ("sizeBytes" IS NULL OR "sizeBytes" >= 0)
);

CREATE UNIQUE INDEX "generated_report_versions_reportId_versionNumber_key"
ON "generated_report_versions"("reportId", "versionNumber");

CREATE UNIQUE INDEX "generated_report_versions_storageBucket_storageKey_key"
ON "generated_report_versions"("storageBucket", "storageKey");

CREATE INDEX "generated_report_versions_reportId_status_versionNumber_idx"
ON "generated_report_versions"("reportId", "status", "versionNumber");

CREATE INDEX "generated_report_versions_status_deleteRequestedAt_idx"
ON "generated_report_versions"("status", "deleteRequestedAt");

CREATE INDEX "generated_report_versions_generatedByUserId_idx"
ON "generated_report_versions"("generatedByUserId");

ALTER TABLE "generated_report_versions"
ADD CONSTRAINT "generated_report_versions_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "generated_reports"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_report_versions"
ADD CONSTRAINT "generated_report_versions_generatedByUserId_fkey"
FOREIGN KEY ("generatedByUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "generated_report_versions" (
  "id",
  "reportId",
  "versionNumber",
  "status",
  "storageBucket",
  "storageKey",
  "fileName",
  "mimeType",
  "sizeBytes",
  "checksumSha256",
  "generatedByUserId",
  "generationMode",
  "generatedAt",
  "metadata",
  "deletedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-version-' || md5(report."id"),
  report."id",
  1,
  CASE WHEN lower(report."status") = 'ready'
    THEN 'READY'::"GeneratedReportVersionStatus"
    ELSE 'DELETED'::"GeneratedReportVersionStatus"
  END,
  report."storageBucket",
  report."storageKey",
  report."fileName",
  report."mimeType",
  report."sizeBytes",
  report."checksumSha256",
  report."createdByUserId",
  report."generationMode",
  report."generatedAt",
  jsonb_build_object('legacyBackfill', true, 'legacyReportStatus', report."status"),
  CASE WHEN lower(report."status") = 'ready' THEN NULL ELSE COALESCE(report."expiresAt", report."updatedAt") END,
  report."createdAt",
  report."updatedAt"
FROM "generated_reports" report
ON CONFLICT ("reportId", "versionNumber") DO NOTHING;

UPDATE "generated_reports" report
SET "currentVersionId" = version."id"
FROM "generated_report_versions" version
WHERE version."reportId" = report."id"
  AND version."versionNumber" = 1
  AND version."status" = 'READY'::"GeneratedReportVersionStatus";

CREATE UNIQUE INDEX "generated_reports_currentVersionId_key"
ON "generated_reports"("currentVersionId");

ALTER TABLE "generated_reports"
ADD CONSTRAINT "generated_reports_currentVersionId_fkey"
FOREIGN KEY ("currentVersionId") REFERENCES "generated_report_versions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "report_delivery_attempts" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "reportId" TEXT,
  "reportVersionId" TEXT,
  "attemptNumber" INTEGER NOT NULL,
  "mode" "ReportDeliveryAttemptMode" NOT NULL,
  "target" "ReportDeliveryTarget" NOT NULL,
  "parentAttemptId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "provider" TEXT NOT NULL,
  "fromAccount" TEXT NOT NULL,
  "intendedRecipientCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "status" "ReportDeliveryAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "legacyBatchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "report_delivery_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_delivery_attempts_number_positive" CHECK ("attemptNumber" > 0),
  CONSTRAINT "report_delivery_attempts_counts_nonnegative" CHECK (
    "intendedRecipientCount" >= 0 AND "sentCount" >= 0 AND "failedCount" >= 0 AND "skippedCount" >= 0
  )
);

CREATE UNIQUE INDEX "report_delivery_attempts_legacyBatchId_key"
ON "report_delivery_attempts"("legacyBatchId");

CREATE UNIQUE INDEX "report_delivery_attempts_reportId_attemptNumber_key"
ON "report_delivery_attempts"("reportId", "attemptNumber");

CREATE UNIQUE INDEX "report_delivery_attempts_officeId_idempotencyKey_key"
ON "report_delivery_attempts"("officeId", "idempotencyKey");

CREATE INDEX "report_delivery_attempts_officeId_createdAt_idx"
ON "report_delivery_attempts"("officeId", "createdAt");

CREATE INDEX "report_delivery_attempts_reportVersionId_idx"
ON "report_delivery_attempts"("reportVersionId");

CREATE INDEX "report_delivery_attempts_parentAttemptId_idx"
ON "report_delivery_attempts"("parentAttemptId");

CREATE INDEX "report_delivery_attempts_requestedByUserId_idx"
ON "report_delivery_attempts"("requestedByUserId");

CREATE INDEX "report_delivery_attempts_status_createdAt_idx"
ON "report_delivery_attempts"("status", "createdAt");

ALTER TABLE "report_delivery_attempts"
ADD CONSTRAINT "report_delivery_attempts_officeId_fkey"
FOREIGN KEY ("officeId") REFERENCES "offices"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "report_delivery_attempts"
ADD CONSTRAINT "report_delivery_attempts_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "generated_reports"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "report_delivery_attempts"
ADD CONSTRAINT "report_delivery_attempts_reportVersionId_fkey"
FOREIGN KEY ("reportVersionId") REFERENCES "generated_report_versions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "report_delivery_attempts"
ADD CONSTRAINT "report_delivery_attempts_requestedByUserId_fkey"
FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "report_delivery_attempts"
ADD CONSTRAINT "report_delivery_attempts_parentAttemptId_fkey"
FOREIGN KEY ("parentAttemptId") REFERENCES "report_delivery_attempts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

WITH ranked_batches AS (
  SELECT
    batch.*,
    ROW_NUMBER() OVER (
      PARTITION BY batch."reportId"
      ORDER BY batch."createdAt", batch."id"
    ) AS "attemptNumber"
  FROM "report_delivery_batches" batch
)
INSERT INTO "report_delivery_attempts" (
  "id",
  "officeId",
  "reportId",
  "reportVersionId",
  "attemptNumber",
  "mode",
  "target",
  "idempotencyKey",
  "provider",
  "fromAccount",
  "intendedRecipientCount",
  "sentCount",
  "failedCount",
  "skippedCount",
  "status",
  "errorMessage",
  "startedAt",
  "completedAt",
  "legacyBatchId",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-attempt-' || md5(batch."id"),
  batch."officeId",
  batch."reportId",
  report."currentVersionId",
  batch."attemptNumber",
  CASE WHEN lower(batch."mode") = 'scheduled'
    THEN 'SCHEDULED'::"ReportDeliveryAttemptMode"
    ELSE 'MANUAL'::"ReportDeliveryAttemptMode"
  END,
  'ALL_AUTHORIZED'::"ReportDeliveryTarget",
  'legacy:' || batch."id",
  batch."provider",
  batch."fromAccount",
  batch."intendedRecipientCount",
  batch."sentCount",
  batch."failedCount",
  batch."skippedCount",
  CASE lower(batch."status")
    WHEN 'sent' THEN 'SENT'::"ReportDeliveryAttemptStatus"
    WHEN 'partial' THEN 'PARTIAL'::"ReportDeliveryAttemptStatus"
    WHEN 'failed' THEN 'FAILED'::"ReportDeliveryAttemptStatus"
    ELSE 'PENDING'::"ReportDeliveryAttemptStatus"
  END,
  batch."errorMessage",
  batch."startedAt",
  batch."completedAt",
  batch."id",
  batch."createdAt",
  batch."updatedAt"
FROM ranked_batches batch
LEFT JOIN "generated_reports" report ON report."id" = batch."reportId"
ON CONFLICT ("legacyBatchId") DO NOTHING;

CREATE TABLE "report_delivery_attempt_recipients" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "authorizationDecision" "ReportRecipientAuthorization" NOT NULL,
  "status" "ReportDeliveryRecipientStatus" NOT NULL DEFAULT 'PREPARED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "providerMessageId" TEXT,
  "providerThreadId" TEXT,
  "providerInternetMessageId" TEXT,
  "attachmentFilename" TEXT,
  "attachmentMimeType" TEXT,
  "attachmentByteSize" INTEGER,
  "attachmentSha256" TEXT,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "legacyRecipientId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "report_delivery_attempt_recipients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_delivery_attempt_recipients_attempt_count_nonnegative" CHECK ("attemptCount" >= 0),
  CONSTRAINT "report_delivery_attempt_recipients_attachment_size_nonnegative" CHECK ("attachmentByteSize" IS NULL OR "attachmentByteSize" >= 0)
);

CREATE UNIQUE INDEX "report_delivery_attempt_recipients_legacyRecipientId_key"
ON "report_delivery_attempt_recipients"("legacyRecipientId");

CREATE UNIQUE INDEX "report_delivery_attempt_recipients_attemptId_userId_key"
ON "report_delivery_attempt_recipients"("attemptId", "userId");

CREATE INDEX "report_delivery_attempt_recipients_attemptId_status_idx"
ON "report_delivery_attempt_recipients"("attemptId", "status");

CREATE INDEX "report_delivery_attempt_recipients_userId_idx"
ON "report_delivery_attempt_recipients"("userId");

CREATE INDEX "report_delivery_attempt_recipients_email_idx"
ON "report_delivery_attempt_recipients"("email");

ALTER TABLE "report_delivery_attempt_recipients"
ADD CONSTRAINT "report_delivery_attempt_recipients_attemptId_fkey"
FOREIGN KEY ("attemptId") REFERENCES "report_delivery_attempts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_delivery_attempt_recipients"
ADD CONSTRAINT "report_delivery_attempt_recipients_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "report_delivery_attempt_recipients" (
  "id",
  "attemptId",
  "userId",
  "email",
  "authorizationDecision",
  "status",
  "attemptCount",
  "providerMessageId",
  "providerThreadId",
  "providerInternetMessageId",
  "attachmentFilename",
  "attachmentMimeType",
  "attachmentByteSize",
  "attachmentSha256",
  "errorMessage",
  "sentAt",
  "completedAt",
  "legacyRecipientId",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-attempt-recipient-' || md5(recipient."id"),
  attempt."id",
  recipient."userId",
  recipient."email",
  'AUTHORIZED'::"ReportRecipientAuthorization",
  CASE lower(recipient."status")
    WHEN 'sent' THEN 'SENT'::"ReportDeliveryRecipientStatus"
    WHEN 'failed' THEN 'FAILED'::"ReportDeliveryRecipientStatus"
    WHEN 'skipped' THEN 'SKIPPED'::"ReportDeliveryRecipientStatus"
    WHEN 'sending' THEN 'SENDING'::"ReportDeliveryRecipientStatus"
    ELSE 'PREPARED'::"ReportDeliveryRecipientStatus"
  END,
  recipient."attemptCount",
  recipient."providerMessageId",
  recipient."providerThreadId",
  recipient."providerInternetMessageId",
  recipient."attachmentFilename",
  recipient."attachmentMimeType",
  recipient."attachmentByteSize",
  recipient."attachmentSha256",
  recipient."errorMessage",
  recipient."sentAt",
  recipient."completedAt",
  recipient."id",
  recipient."createdAt",
  recipient."updatedAt"
FROM "report_delivery_recipients" recipient
JOIN "report_delivery_attempts" attempt ON attempt."legacyBatchId" = recipient."batchId"
ON CONFLICT ("legacyRecipientId") DO NOTHING;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'reports',
  'reports',
  false,
  52428800,
  ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE "generated_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "generated_report_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_delivery_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_delivery_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_delivery_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_delivery_attempt_recipients" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "generated_reports" FROM anon, authenticated;
REVOKE ALL ON TABLE "generated_report_versions" FROM anon, authenticated;
REVOKE ALL ON TABLE "report_delivery_batches" FROM anon, authenticated;
REVOKE ALL ON TABLE "report_delivery_recipients" FROM anon, authenticated;
REVOKE ALL ON TABLE "report_delivery_attempts" FROM anon, authenticated;
REVOKE ALL ON TABLE "report_delivery_attempt_recipients" FROM anon, authenticated;
