ALTER TABLE "Recibo"
ADD COLUMN "fechaEjecucion" TIMESTAMP(3),
ADD COLUMN "fechaRecibo" TIMESTAMP(3);

UPDATE "Recibo"
SET "fechaRecibo" = "createdAt"
WHERE "fechaRecibo" IS NULL;

UPDATE "Recibo" r
SET "fechaEjecucion" = parsed."fechaEjecucion"
FROM (
  SELECT
    r_inner.id,
    CASE
      WHEN n."meta"->>'fechaEjecucion' ~ '^\d{4}-\d{2}-\d{2}'
        THEN (n."meta"->>'fechaEjecucion')::timestamp
      WHEN n."meta"->'ejecucion'->>'fecha' ~ '^\d{4}-\d{2}-\d{2}'
        THEN (n."meta"->'ejecucion'->>'fecha')::timestamp
      WHEN d."meta"->>'fechaEjecucion' ~ '^\d{4}-\d{2}-\d{2}'
        THEN (d."meta"->>'fechaEjecucion')::timestamp
      WHEN d."meta"->'ejecucion'->>'fecha' ~ '^\d{4}-\d{2}-\d{2}'
        THEN (d."meta"->'ejecucion'->>'fecha')::timestamp
      ELSE NULL
    END AS "fechaEjecucion"
  FROM "Recibo" r_inner
  LEFT JOIN "notificaciones" n ON n."id" = r_inner."notificacionId"
  LEFT JOIN "Diligencia" d ON d."id" = r_inner."diligenciaId"
) parsed
WHERE r."id" = parsed.id
  AND r."fechaEjecucion" IS NULL
  AND parsed."fechaEjecucion" IS NOT NULL;

CREATE INDEX "Recibo_rolId_fechaRecibo_idx" ON "Recibo"("rolId", "fechaRecibo");
CREATE INDEX "Recibo_fechaRecibo_idx" ON "Recibo"("fechaRecibo");
