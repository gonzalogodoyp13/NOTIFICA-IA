ALTER TABLE "users"
ADD COLUMN "isOfficeAdmin" BOOLEAN NOT NULL DEFAULT false;

WITH ranked_users AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "officeId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "users"
)
UPDATE "users"
SET "isOfficeAdmin" = true
FROM ranked_users
WHERE "users"."id" = ranked_users."id"
  AND ranked_users.rn = 1;

CREATE TABLE "generated_reports" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "reportType" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "periodDate" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "storageBucket" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "activityCount" INTEGER NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "generationMode" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "generated_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "generated_reports_officeId_reportType_periodStart_periodEnd_key"
ON "generated_reports"("officeId", "reportType", "periodStart", "periodEnd");

CREATE INDEX "generated_reports_officeId_reportType_periodDate_idx"
ON "generated_reports"("officeId", "reportType", "periodDate");

CREATE INDEX "generated_reports_officeId_generatedAt_idx"
ON "generated_reports"("officeId", "generatedAt");

CREATE INDEX "generated_reports_status_idx"
ON "generated_reports"("status");

CREATE INDEX "generated_reports_expiresAt_idx"
ON "generated_reports"("expiresAt");

CREATE INDEX "generated_reports_storageBucket_storageKey_idx"
ON "generated_reports"("storageBucket", "storageKey");

ALTER TABLE "generated_reports"
ADD CONSTRAINT "generated_reports_officeId_fkey"
FOREIGN KEY ("officeId") REFERENCES "offices"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "generated_reports"
ADD CONSTRAINT "generated_reports_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
