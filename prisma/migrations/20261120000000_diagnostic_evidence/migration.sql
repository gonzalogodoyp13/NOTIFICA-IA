-- Additive only: no business rows or audit history modified.
ALTER TABLE "report_jobs" ADD COLUMN "diagnosticRequestId" TEXT;
CREATE TABLE "diagnostic_incidents" (
  "id" TEXT PRIMARY KEY, "fingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN', "firstSeen" TIMESTAMP(3) NOT NULL,
  "lastSeen" TIMESTAMP(3) NOT NULL, "occurrences" INTEGER NOT NULL DEFAULT 0,
  "resolvedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "diagnostic_incidents_fingerprint_key" ON "diagnostic_incidents"("fingerprint");
CREATE TABLE "diagnostic_events" (
  "reference" TEXT PRIMARY KEY, "incidentId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "officeId" INTEGER, "userId" TEXT, "requestId" TEXT NOT NULL, "jobId" TEXT, "evidence" JSONB NOT NULL,
  CONSTRAINT "diagnostic_events_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "diagnostic_incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "diagnostic_events_incidentId_occurredAt_idx" ON "diagnostic_events"("incidentId", "occurredAt");
CREATE INDEX "diagnostic_events_officeId_userId_occurredAt_idx" ON "diagnostic_events"("officeId", "userId", "occurredAt");
CREATE INDEX "diagnostic_events_requestId_idx" ON "diagnostic_events"("requestId");
CREATE INDEX "diagnostic_events_jobId_idx" ON "diagnostic_events"("jobId");
CREATE INDEX "diagnostic_events_occurredAt_idx" ON "diagnostic_events"("occurredAt");
ALTER TABLE "diagnostic_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "diagnostic_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "diagnostic_incidents", "diagnostic_events" FROM anon, authenticated;
