-- Preserve recorded payment history while giving each receipt independent state.
BEGIN;

ALTER TABLE "Recibo"
  ADD COLUMN "estadoCobro" "EstadoCobro" NOT NULL DEFAULT 'NO_PAGADO',
  ADD COLUMN "fechaPago" TIMESTAMP(3);

UPDATE "Recibo" AS r
SET "estadoCobro" = d."estadoCobro", "fechaPago" = d."fechaPago"
FROM "Diligencia" AS d
WHERE r."diligenciaId" = d.id;

COMMIT;
