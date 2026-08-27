-- Phase 5A: retire legacy AuditLog data under AUDITLOG-DEV-ZERO-RETENTION-V1.
-- No row-level archive is created and no legacy row is migrated to ActivityEvent.

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "audit_logs" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE "audit_logs_id_seq" FROM anon, authenticated;

INSERT INTO "activity_events" (
  "officeId",
  "userId",
  "actorType",
  "source",
  "eventType",
  "module",
  "result",
  "recordType",
  "recordId",
  "rolId",
  "rol",
  "shortName",
  "description",
  "metadata",
  "requestId",
  "eventVersion",
  "deduplicationKey",
  "occurredAt",
  "createdAt"
)
SELECT
  legacy."officeId",
  NULL,
  'SYSTEM'::"ActivityActorType",
  'SYSTEM'::"ActivitySource",
  'audit.legacy_retired',
  'audit',
  'success',
  'AuditLog',
  NULL,
  NULL,
  NULL,
  NULL,
  'Historial de auditoría heredado retirado según la política aprobada.',
  jsonb_build_object(
    'policyId', 'AUDITLOG-DEV-ZERO-RETENTION-V1',
    'strategy', 'PURGE_NO_ARCHIVE',
    'deletedCount', COUNT(*)::integer,
    'oldestAt', to_char(MIN(legacy."createdAt"), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'newestAt', to_char(MAX(legacy."createdAt"), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ),
  NULL,
  1,
  'auditlog-retirement:AUDITLOG-DEV-ZERO-RETENTION-V1:' || legacy."officeId"::text,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "audit_logs" AS legacy
GROUP BY legacy."officeId"
ON CONFLICT ("officeId", "deduplicationKey") DO NOTHING;

DROP TRIGGER IF EXISTS audit_logs_append_only ON "audit_logs";
DROP TRIGGER IF EXISTS audit_logs_retired ON "audit_logs";

DELETE FROM "audit_logs";

CREATE TRIGGER audit_logs_retired
BEFORE INSERT OR UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_activity_history_mutation();
