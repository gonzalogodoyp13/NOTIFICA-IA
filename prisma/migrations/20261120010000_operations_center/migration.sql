-- Additive migration. Existing users receive no platform grant.
CREATE TABLE "platform_grants" (
  "userId" TEXT PRIMARY KEY, "role" TEXT NOT NULL DEFAULT 'OWNER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" TIMESTAMP(3),
  CONSTRAINT "platform_grants_owner_only" CHECK ("role" = 'OWNER'),
  CONSTRAINT "platform_grants_user_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "platform_audit" (
  "id" TEXT PRIMARY KEY, "actorUserId" TEXT, "action" TEXT NOT NULL,
  "targetId" TEXT NOT NULL, "details" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "platform_audit_targetId_createdAt_idx" ON "platform_audit"("targetId", "createdAt");
CREATE INDEX "platform_audit_actorUserId_createdAt_idx" ON "platform_audit"("actorUserId", "createdAt");
ALTER TABLE "platform_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_audit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "platform_grants", "platform_audit" FROM anon, authenticated;
ALTER TABLE "diagnostic_incidents"
  ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'error',
  ADD COLUMN "assignedToUserId" TEXT,
  ADD COLUMN "impact" TEXT,
  ADD COLUMN "suspectedCause" TEXT,
  ADD COLUMN "confirmedCause" TEXT,
  ADD COLUMN "nextSteps" TEXT,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "diagnostic_incidents_status_lastSeen_idx" ON "diagnostic_incidents"("status", "lastSeen");
