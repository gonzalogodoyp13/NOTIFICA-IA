DROP INDEX IF EXISTS demandas_rol_key;

UPDATE demandas
SET rol = UPPER(TRIM(rol))
WHERE rol IS NOT NULL;

UPDATE "RolCausa"
SET rol = UPPER(TRIM(rol))
WHERE rol IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM demandas
    GROUP BY "officeId", rol
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add office-scoped Demanda ROL uniqueness because duplicate normalized ROLs exist inside at least one office.';
  END IF;
END $$;

CREATE UNIQUE INDEX "demandas_officeId_rol_key" ON demandas("officeId", rol);

CREATE TYPE "DocumentType" AS ENUM ('RECIBO');

CREATE TABLE "DocumentNumberSequence" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "documentType" "DocumentType" NOT NULL,
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentNumberSequence_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DocumentNumberSequence"
ADD CONSTRAINT "DocumentNumberSequence_officeId_fkey"
FOREIGN KEY ("officeId") REFERENCES offices(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE UNIQUE INDEX "DocumentNumberSequence_officeId_year_documentType_key"
ON "DocumentNumberSequence"("officeId", "year", "documentType");

CREATE INDEX "DocumentNumberSequence_officeId_year_idx"
ON "DocumentNumberSequence"("officeId", "year");

ALTER TABLE "Recibo"
ADD COLUMN "officeId" INTEGER,
ADD COLUMN "numeroReciboYear" INTEGER;

UPDATE "Recibo" r
SET
  "officeId" = rc."officeId",
  "numeroReciboYear" = EXTRACT(YEAR FROM COALESCE(r."fechaRecibo", r."createdAt"))::INTEGER
FROM "RolCausa" rc
WHERE r."rolId" = rc.id
  AND r."officeId" IS NULL;

ALTER TABLE "Recibo"
ADD CONSTRAINT "Recibo_officeId_fkey"
FOREIGN KEY ("officeId") REFERENCES offices(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE UNIQUE INDEX "Recibo_officeId_numeroReciboYear_numeroRecibo_official_key"
ON "Recibo"("officeId", "numeroReciboYear", "numeroRecibo")
WHERE "officeId" IS NOT NULL
  AND "numeroReciboYear" IS NOT NULL
  AND "numeroRecibo" ~ '^R-\d{4}-\d{6}$';

CREATE INDEX "Recibo_officeId_numeroReciboYear_idx"
ON "Recibo"("officeId", "numeroReciboYear");

INSERT INTO "DocumentNumberSequence" (
  "id",
  "officeId",
  "year",
  "documentType",
  "nextNumber",
  "createdAt",
  "updatedAt"
)
SELECT
  concat('recibo-', official."officeId", '-', official."year"),
  official."officeId",
  official."year",
  'RECIBO'::"DocumentType",
  MAX(official.sequence_number) + 1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT
    r."officeId",
    ((regexp_match(r."numeroRecibo", '^R-(\d{4})-(\d{6})$'))[1])::INTEGER AS "year",
    ((regexp_match(r."numeroRecibo", '^R-(\d{4})-(\d{6})$'))[2])::INTEGER AS sequence_number
  FROM "Recibo" r
  WHERE r."officeId" IS NOT NULL
    AND r."numeroRecibo" ~ '^R-\d{4}-\d{6}$'
) official
GROUP BY official."officeId", official."year"
ON CONFLICT ("officeId", "year", "documentType")
DO UPDATE SET
  "nextNumber" = GREATEST("DocumentNumberSequence"."nextNumber", EXCLUDED."nextNumber"),
  "updatedAt" = CURRENT_TIMESTAMP;
