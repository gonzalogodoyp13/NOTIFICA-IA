ALTER TABLE "users"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

UPDATE "users"
SET "isActive" = true
WHERE "isActive" IS DISTINCT FROM true;

CREATE TABLE "report_delivery_batches" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "reportId" TEXT,
  "reportType" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "periodDate" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "fromAccount" TEXT NOT NULL,
  "intendedRecipientCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "mode" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "report_delivery_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_delivery_recipients" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "status" TEXT NOT NULL,
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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "report_delivery_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_delivery_batches_officeId_reportType_periodStart_periodEnd_key"
ON "report_delivery_batches"("officeId", "reportType", "periodStart", "periodEnd");

CREATE INDEX "report_delivery_batches_officeId_reportType_periodDate_idx"
ON "report_delivery_batches"("officeId", "reportType", "periodDate");

CREATE INDEX "report_delivery_batches_reportId_idx"
ON "report_delivery_batches"("reportId");

CREATE INDEX "report_delivery_batches_status_idx"
ON "report_delivery_batches"("status");

CREATE INDEX "report_delivery_batches_createdAt_idx"
ON "report_delivery_batches"("createdAt");

CREATE UNIQUE INDEX "report_delivery_recipients_batchId_userId_key"
ON "report_delivery_recipients"("batchId", "userId");

CREATE INDEX "report_delivery_recipients_batchId_idx"
ON "report_delivery_recipients"("batchId");

CREATE INDEX "report_delivery_recipients_userId_idx"
ON "report_delivery_recipients"("userId");

CREATE INDEX "report_delivery_recipients_status_idx"
ON "report_delivery_recipients"("status");

CREATE INDEX "report_delivery_recipients_email_idx"
ON "report_delivery_recipients"("email");

ALTER TABLE "report_delivery_batches"
ADD CONSTRAINT "report_delivery_batches_officeId_fkey"
FOREIGN KEY ("officeId") REFERENCES "offices"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "report_delivery_batches"
ADD CONSTRAINT "report_delivery_batches_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "generated_reports"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "report_delivery_recipients"
ADD CONSTRAINT "report_delivery_recipients_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "report_delivery_batches"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_delivery_recipients"
ADD CONSTRAINT "report_delivery_recipients_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
