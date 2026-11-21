-- Additive recovery journal, no modifications to business records.
CREATE TABLE operations_recoveries (
 id TEXT PRIMARY KEY, "idempotencyKey" TEXT NOT NULL UNIQUE, "intentKey" TEXT UNIQUE,
 action TEXT NOT NULL, "targetId" TEXT NOT NULL, "officeId" INTEGER NOT NULL,
 "actorId" TEXT NOT NULL, reason TEXT NOT NULL, "correlationId" TEXT NOT NULL,
 fingerprint TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'REQUESTED',
 before JSONB NOT NULL, evidence JSONB, "resultId" TEXT, "safeCode" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "operations_recoveries_officeId_createdAt_idx" ON operations_recoveries("officeId","createdAt");
CREATE INDEX "operations_recoveries_status_createdAt_idx" ON operations_recoveries(status,"createdAt");
ALTER TABLE operations_recoveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON operations_recoveries FROM anon, authenticated;
