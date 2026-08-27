-- Phase 5C: remove the empty, guarded legacy AuditLog table.
-- Deliberately omit CASCADE so an unexpected dependency blocks deployment.

DROP TRIGGER IF EXISTS audit_logs_retired ON "audit_logs";
DROP TABLE "audit_logs";
