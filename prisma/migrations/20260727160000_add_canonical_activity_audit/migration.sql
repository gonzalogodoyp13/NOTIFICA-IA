DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActivityActorType') THEN
    CREATE TYPE "ActivityActorType" AS ENUM ('USER', 'SYSTEM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActivitySource') THEN
    CREATE TYPE "ActivitySource" AS ENUM ('WEB', 'INTERNAL', 'SYSTEM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActivityOutboxStatus') THEN
    CREATE TYPE "ActivityOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'DEAD');
  END IF;
END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "authUserId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_authUserId_key" ON "users"("authUserId");

ALTER TABLE "activity_events"
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "actorType" "ActivityActorType" NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS "source" "ActivitySource" NOT NULL DEFAULT 'WEB',
  ADD COLUMN IF NOT EXISTS "requestId" TEXT,
  ADD COLUMN IF NOT EXISTS "eventVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "deduplicationKey" TEXT;

CREATE INDEX IF NOT EXISTS "audit_logs_officeId_createdAt_idx" ON "audit_logs"("officeId", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_officeId_userId_createdAt_idx" ON "audit_logs"("officeId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_officeId_tabla_createdAt_idx" ON "audit_logs"("officeId", "tabla", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_officeId_accion_createdAt_idx" ON "audit_logs"("officeId", "accion", "createdAt");

CREATE INDEX IF NOT EXISTS "activity_events_officeId_eventType_occurredAt_idx" ON "activity_events"("officeId", "eventType", "occurredAt");
CREATE INDEX IF NOT EXISTS "activity_events_officeId_userId_occurredAt_idx" ON "activity_events"("officeId", "userId", "occurredAt");
CREATE INDEX IF NOT EXISTS "activity_events_requestId_idx" ON "activity_events"("requestId");
CREATE INDEX IF NOT EXISTS "activity_events_module_occurredAt_idx" ON "activity_events"("module", "occurredAt");
CREATE INDEX IF NOT EXISTS "activity_events_result_occurredAt_idx" ON "activity_events"("result", "occurredAt");
CREATE UNIQUE INDEX IF NOT EXISTS "activity_events_officeId_deduplicationKey_key" ON "activity_events"("officeId", "deduplicationKey");

CREATE TABLE IF NOT EXISTS "activity_outbox" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "userId" TEXT,
  "actorType" "ActivityActorType" NOT NULL,
  "source" "ActivitySource" NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "requestId" TEXT,
  "deduplicationKey" TEXT NOT NULL,
  "status" "ActivityOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_outbox_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "activity_outbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "activity_outbox_officeId_deduplicationKey_key" ON "activity_outbox"("officeId", "deduplicationKey");
CREATE INDEX IF NOT EXISTS "activity_outbox_status_nextAttemptAt_idx" ON "activity_outbox"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "activity_outbox_officeId_createdAt_idx" ON "activity_outbox"("officeId", "createdAt");

CREATE OR REPLACE FUNCTION prevent_activity_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS activity_events_append_only ON "activity_events";
CREATE TRIGGER activity_events_append_only
BEFORE UPDATE OR DELETE ON "activity_events"
FOR EACH ROW EXECUTE FUNCTION prevent_activity_history_mutation();

DROP TRIGGER IF EXISTS audit_logs_append_only ON "audit_logs";
CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_activity_history_mutation();
