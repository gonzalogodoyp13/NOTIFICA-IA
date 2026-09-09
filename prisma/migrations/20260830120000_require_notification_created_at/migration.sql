-- Backfill legacy notifications with the best historical timestamp available.
-- The parent diligence date is intentionally only a fallback because it can
-- predate the notification itself by a meaningful amount.
UPDATE "notificaciones" AS n
SET "createdAt" = COALESCE(
  LEAST(
    n."updatedAt",
    (SELECT MIN(d."createdAt") FROM "Documento" AS d WHERE d."notificacionId" = n.id),
    (SELECT MIN(r."createdAt") FROM "Recibo" AS r WHERE r."notificacionId" = n.id)
  ),
  diligence."createdAt",
  CURRENT_TIMESTAMP
)
FROM "Diligencia" AS diligence
WHERE diligence.id = n."diligenciaId"
  AND n."createdAt" IS NULL;

-- Keep the final fallback explicit for any orphaned legacy row. The foreign
-- key should make this unnecessary, but it keeps the migration deterministic.
UPDATE "notificaciones"
SET "createdAt" = CURRENT_TIMESTAMP
WHERE "createdAt" IS NULL;

ALTER TABLE "notificaciones"
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "createdAt" SET NOT NULL;
