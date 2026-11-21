-- Additive, no business data changes. Only privileged server connections may access telemetry.
CREATE TABLE "operations_pulses" (
  "key" TEXT PRIMARY KEY, "status" TEXT NOT NULL, "source" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL, "lastSuccessAt" TIMESTAMP(3),
  "durationMs" INTEGER, "ttlSeconds" INTEGER NOT NULL
);
CREATE TABLE "operations_observations" (
  "id" TEXT PRIMARY KEY, "key" TEXT NOT NULL, "status" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "durationMs" INTEGER
);
CREATE INDEX "operations_observations_checkedAt_idx" ON "operations_observations"("checkedAt");
CREATE INDEX "operations_observations_key_checkedAt_idx" ON "operations_observations"("key", "checkedAt");
ALTER TABLE "operations_pulses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operations_observations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "operations_pulses", "operations_observations" FROM anon, authenticated;
