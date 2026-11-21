-- Additive private operations metadata; no customer data changes.
CREATE TABLE operations_policies (key TEXT PRIMARY KEY, settings JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE operations_maintenance (id TEXT PRIMARY KEY, "officeId" INTEGER, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, reason TEXT NOT NULL, "cancelledAt" TIMESTAMP(3), CHECK ("endsAt" > "startsAt"));
CREATE INDEX "operations_maintenance_endsAt_officeId_idx" ON operations_maintenance("endsAt", "officeId");
CREATE TABLE operations_alerts (key TEXT PRIMARY KEY, kind TEXT NOT NULL, "referenceId" TEXT NOT NULL, "officeId" INTEGER, status TEXT NOT NULL, severity TEXT NOT NULL, "firstObservedAt" TIMESTAMP(3) NOT NULL, "lastObservedAt" TIMESTAMP(3) NOT NULL, "lastNotifiedAt" TIMESTAMP(3), generation INTEGER NOT NULL DEFAULT 1, level INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0, evidence JSONB NOT NULL);
CREATE INDEX "operations_alerts_status_lastObservedAt_idx" ON operations_alerts(status,"lastObservedAt");
CREATE INDEX "operations_alerts_officeId_lastObservedAt_idx" ON operations_alerts("officeId","lastObservedAt");
CREATE TABLE operations_notifications (id TEXT PRIMARY KEY, "dedupeKey" TEXT NOT NULL UNIQUE, "recipientId" TEXT NOT NULL, kind TEXT NOT NULL, "referenceId" TEXT, status TEXT NOT NULL DEFAULT 'QUEUED', content JSONB NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "claimedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3), "safeCode" TEXT);
CREATE INDEX "operations_notifications_status_availableAt_idx" ON operations_notifications(status,"availableAt");
ALTER TABLE operations_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON operations_policies, operations_maintenance, operations_alerts, operations_notifications FROM anon, authenticated;
