CREATE TYPE "ReportJobType" AS ENUM ('GENERATE', 'DELIVER');
CREATE TYPE "ReportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "ReportJobOrigin" AS ENUM ('MANUAL', 'SCHEDULED', 'CHAINED');
CREATE TYPE "ReportJobRunOutcome" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'RETRY_SCHEDULED');
CREATE TYPE "ReportScheduleKind" AS ENUM ('DAILY', 'MONTHLY', 'CUSTOM');
CREATE TYPE "ReportScheduleFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "CustomReportDefinitionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

ALTER TYPE "ReportDeliveryAttemptStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "offices"
ADD COLUMN "reportConfigRevision" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "generated_reports"
ADD COLUMN "identityKey" TEXT,
ADD COLUMN "customDefinitionId" TEXT;

UPDATE "generated_reports"
SET "identityKey" = "reportType"
WHERE "identityKey" IS NULL;

ALTER TABLE "generated_reports"
ALTER COLUMN "identityKey" SET NOT NULL;

DROP INDEX IF EXISTS "generated_reports_officeId_reportType_periodStart_periodEnd_key";
CREATE UNIQUE INDEX "generated_reports_officeId_identityKey_periodStart_periodEnd_key"
ON "generated_reports"("officeId", "identityKey", "periodStart", "periodEnd");
CREATE INDEX "generated_reports_officeId_identityKey_periodDate_idx"
ON "generated_reports"("officeId", "identityKey", "periodDate");
CREATE INDEX "generated_reports_customDefinitionId_idx"
ON "generated_reports"("customDefinitionId");

CREATE TABLE "custom_report_definitions" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "CustomReportDefinitionStatus" NOT NULL DEFAULT 'ACTIVE',
  "modules" JSONB NOT NULL,
  "actionCategories" JSONB NOT NULL,
  "results" JSONB NOT NULL,
  "actorUserIds" JSONB NOT NULL,
  "includeSystem" BOOLEAN NOT NULL DEFAULT true,
  "selectedColumns" JSONB NOT NULL,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "custom_report_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "custom_report_definition_recipients" (
  "id" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custom_report_definition_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_recipient_configs" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "dailyEnabled" BOOLEAN NOT NULL DEFAULT true,
  "monthlyEnabled" BOOLEAN NOT NULL DEFAULT true,
  "customEnabled" BOOLEAN NOT NULL DEFAULT false,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_recipient_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_schedules" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "kind" "ReportScheduleKind" NOT NULL,
  "identityKey" TEXT NOT NULL,
  "customDefinitionId" TEXT,
  "frequency" "ReportScheduleFrequency" NOT NULL,
  "localTime" TEXT NOT NULL DEFAULT '07:00',
  "weekday" INTEGER,
  "monthDay" INTEGER,
  "timezone" TEXT NOT NULL DEFAULT 'America/Santiago',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "latenessThresholdMinutes" INTEGER NOT NULL DEFAULT 60,
  "nextRunAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "lastJobId" TEXT,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "safeLastError" TEXT,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_schedules_lateness_positive" CHECK ("latenessThresholdMinutes" > 0),
  CONSTRAINT "report_schedules_weekday_range" CHECK ("weekday" IS NULL OR ("weekday" BETWEEN 1 AND 7)),
  CONSTRAINT "report_schedules_month_day_range" CHECK ("monthDay" IS NULL OR ("monthDay" BETWEEN 1 AND 28)),
  CONSTRAINT "report_schedules_local_time_format" CHECK ("localTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
);

CREATE TABLE "report_jobs" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "type" "ReportJobType" NOT NULL,
  "status" "ReportJobStatus" NOT NULL DEFAULT 'QUEUED',
  "origin" "ReportJobOrigin" NOT NULL,
  "reportKind" TEXT NOT NULL,
  "customDefinitionId" TEXT,
  "scheduleId" TEXT,
  "retryOfJobId" TEXT,
  "requestedByUserId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestedPeriodStart" TIMESTAMP(3) NOT NULL,
  "requestedPeriodEnd" TIMESTAMP(3) NOT NULL,
  "requestedPeriodLabel" TEXT NOT NULL,
  "payload" JSONB,
  "progressPhase" TEXT NOT NULL DEFAULT 'queued',
  "completedUnits" INTEGER NOT NULL DEFAULT 0,
  "totalUnits" INTEGER NOT NULL DEFAULT 1,
  "resultCode" TEXT,
  "safeError" TEXT,
  "reportId" TEXT,
  "reportVersionId" TEXT,
  "deliveryAttemptId" TEXT,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduledFor" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 4,
  "claimedAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "heartbeatAt" TIMESTAMP(3),
  "cancelRequestedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_jobs_period_order" CHECK ("requestedPeriodEnd" > "requestedPeriodStart"),
  CONSTRAINT "report_jobs_progress_nonnegative" CHECK ("completedUnits" >= 0 AND "totalUnits" > 0),
  CONSTRAINT "report_jobs_attempts_valid" CHECK ("attemptCount" >= 0 AND "maxAttempts" > 0)
);

CREATE TABLE "report_job_runs" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "outcome" "ReportJobRunOutcome" NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "resultCode" TEXT,
  "safeError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_job_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_job_runs_attempt_positive" CHECK ("attemptNumber" > 0)
);

CREATE UNIQUE INDEX "custom_report_definitions_officeId_name_key" ON "custom_report_definitions"("officeId", "name");
CREATE INDEX "custom_report_definitions_officeId_status_updatedAt_idx" ON "custom_report_definitions"("officeId", "status", "updatedAt");
CREATE UNIQUE INDEX "custom_report_definition_recipients_definitionId_userId_key" ON "custom_report_definition_recipients"("definitionId", "userId");
CREATE INDEX "custom_report_definition_recipients_userId_idx" ON "custom_report_definition_recipients"("userId");
CREATE UNIQUE INDEX "report_recipient_configs_userId_key" ON "report_recipient_configs"("userId");
CREATE UNIQUE INDEX "report_recipient_configs_officeId_userId_key" ON "report_recipient_configs"("officeId", "userId");
CREATE INDEX "report_recipient_configs_officeId_isEnabled_idx" ON "report_recipient_configs"("officeId", "isEnabled");
CREATE UNIQUE INDEX "report_schedules_customDefinitionId_key" ON "report_schedules"("customDefinitionId");
CREATE UNIQUE INDEX "report_schedules_officeId_identityKey_key" ON "report_schedules"("officeId", "identityKey");
CREATE INDEX "report_schedules_enabled_nextRunAt_idx" ON "report_schedules"("enabled", "nextRunAt");
CREATE INDEX "report_schedules_officeId_enabled_idx" ON "report_schedules"("officeId", "enabled");
CREATE UNIQUE INDEX "report_jobs_officeId_idempotencyKey_key" ON "report_jobs"("officeId", "idempotencyKey");
CREATE INDEX "report_jobs_status_availableAt_createdAt_idx" ON "report_jobs"("status", "availableAt", "createdAt");
CREATE INDEX "report_jobs_officeId_createdAt_idx" ON "report_jobs"("officeId", "createdAt");
CREATE INDEX "report_jobs_officeId_status_createdAt_idx" ON "report_jobs"("officeId", "status", "createdAt");
CREATE INDEX "report_jobs_scheduleId_scheduledFor_idx" ON "report_jobs"("scheduleId", "scheduledFor");
CREATE INDEX "report_jobs_retryOfJobId_idx" ON "report_jobs"("retryOfJobId");
CREATE INDEX "report_jobs_customDefinitionId_idx" ON "report_jobs"("customDefinitionId");
CREATE UNIQUE INDEX "report_job_runs_jobId_attemptNumber_key" ON "report_job_runs"("jobId", "attemptNumber");
CREATE INDEX "report_job_runs_jobId_startedAt_idx" ON "report_job_runs"("jobId", "startedAt");

ALTER TABLE "custom_report_definitions" ADD CONSTRAINT "custom_report_definitions_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "custom_report_definitions" ADD CONSTRAINT "custom_report_definitions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "custom_report_definitions" ADD CONSTRAINT "custom_report_definitions_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "custom_report_definition_recipients" ADD CONSTRAINT "custom_report_definition_recipients_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "custom_report_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custom_report_definition_recipients" ADD CONSTRAINT "custom_report_definition_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_recipient_configs" ADD CONSTRAINT "report_recipient_configs_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_recipient_configs" ADD CONSTRAINT "report_recipient_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_recipient_configs" ADD CONSTRAINT "report_recipient_configs_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_recipient_configs" ADD CONSTRAINT "report_recipient_configs_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_customDefinitionId_fkey" FOREIGN KEY ("customDefinitionId") REFERENCES "custom_report_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_customDefinitionId_fkey" FOREIGN KEY ("customDefinitionId") REFERENCES "custom_report_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "report_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_retryOfJobId_fkey" FOREIGN KEY ("retryOfJobId") REFERENCES "report_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "generated_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_reportVersionId_fkey" FOREIGN KEY ("reportVersionId") REFERENCES "generated_report_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_deliveryAttemptId_fkey" FOREIGN KEY ("deliveryAttemptId") REFERENCES "report_delivery_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_job_runs" ADD CONSTRAINT "report_job_runs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "report_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_lastJobId_fkey" FOREIGN KEY ("lastJobId") REFERENCES "report_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_customDefinitionId_fkey" FOREIGN KEY ("customDefinitionId") REFERENCES "custom_report_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "report_recipient_configs" (
  "id", "officeId", "userId", "dailyEnabled", "monthlyEnabled", "customEnabled", "isEnabled", "createdAt", "updatedAt"
)
SELECT 'report-recipient-' || md5(user_row."id"), user_row."officeId", user_row."id", true, true, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" user_row
WHERE user_row."isActive" = true AND user_row."isOfficeAdmin" = true
ON CONFLICT ("officeId", "userId") DO NOTHING;

INSERT INTO "report_schedules" (
  "id", "officeId", "kind", "identityKey", "frequency", "localTime", "timezone", "enabled", "latenessThresholdMinutes", "createdAt", "updatedAt"
)
SELECT 'report-schedule-daily-' || md5(office_row."id"::text), office_row."id", 'DAILY', 'daily', 'DAILY', '07:00', 'America/Santiago', false, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "offices" office_row
WHERE EXISTS (SELECT 1 FROM "report_recipient_configs" config WHERE config."officeId" = office_row."id" AND config."dailyEnabled" = true)
ON CONFLICT ("officeId", "identityKey") DO NOTHING;

INSERT INTO "report_schedules" (
  "id", "officeId", "kind", "identityKey", "frequency", "localTime", "monthDay", "timezone", "enabled", "latenessThresholdMinutes", "createdAt", "updatedAt"
)
SELECT 'report-schedule-monthly-' || md5(office_row."id"::text), office_row."id", 'MONTHLY', 'monthly', 'MONTHLY', '07:15', 1, 'America/Santiago', false, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "offices" office_row
WHERE EXISTS (SELECT 1 FROM "report_recipient_configs" config WHERE config."officeId" = office_row."id" AND config."monthlyEnabled" = true)
ON CONFLICT ("officeId", "identityKey") DO NOTHING;

ALTER TABLE "custom_report_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_report_definition_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_recipient_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_job_runs" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "custom_report_definitions" FROM anon, authenticated;
REVOKE ALL ON TABLE "custom_report_definition_recipients" FROM anon, authenticated;
REVOKE ALL ON TABLE "report_recipient_configs" FROM anon, authenticated;
REVOKE ALL ON TABLE "report_schedules" FROM anon, authenticated;
REVOKE ALL ON TABLE "report_jobs" FROM anon, authenticated;
REVOKE ALL ON TABLE "report_job_runs" FROM anon, authenticated;
