CREATE TABLE "activity_events" (
  "id" SERIAL NOT NULL,
  "officeId" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "recordType" TEXT,
  "recordId" TEXT,
  "rolId" TEXT,
  "rol" TEXT,
  "shortName" TEXT,
  "description" TEXT NOT NULL,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "activity_events"
  ADD CONSTRAINT "activity_events_officeId_fkey"
  FOREIGN KEY ("officeId") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activity_events"
  ADD CONSTRAINT "activity_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "activity_events_officeId_occurredAt_idx" ON "activity_events"("officeId", "occurredAt");
CREATE INDEX "activity_events_userId_occurredAt_idx" ON "activity_events"("userId", "occurredAt");
CREATE INDEX "activity_events_eventType_idx" ON "activity_events"("eventType");
CREATE INDEX "activity_events_module_idx" ON "activity_events"("module");
CREATE INDEX "activity_events_result_idx" ON "activity_events"("result");
