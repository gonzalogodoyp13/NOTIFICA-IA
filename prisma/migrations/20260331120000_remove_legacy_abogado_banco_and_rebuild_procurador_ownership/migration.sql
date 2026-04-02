-- Finish abogado/banco migration and rebuild procurador ownership around abogados.

CREATE TABLE IF NOT EXISTS "procurador_abogados" (
  "id" SERIAL PRIMARY KEY,
  "officeId" INTEGER NOT NULL,
  "procuradorId" INTEGER NOT NULL,
  "abogadoId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "procurador_abogados_procuradorId_idx" ON "procurador_abogados"("procuradorId");
CREATE INDEX IF NOT EXISTS "procurador_abogados_abogadoId_idx" ON "procurador_abogados"("abogadoId");
CREATE INDEX IF NOT EXISTS "procurador_abogados_officeId_idx" ON "procurador_abogados"("officeId");
CREATE UNIQUE INDEX IF NOT EXISTS "procurador_abogados_officeId_procuradorId_abogadoId_key"
  ON "procurador_abogados"("officeId", "procuradorId", "abogadoId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procurador_abogados_officeId_fkey') THEN
    ALTER TABLE "procurador_abogados"
      ADD CONSTRAINT "procurador_abogados_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procurador_abogados_procuradorId_fkey') THEN
    ALTER TABLE "procurador_abogados"
      ADD CONSTRAINT "procurador_abogados_procuradorId_fkey"
      FOREIGN KEY ("procuradorId") REFERENCES "procuradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procurador_abogados_abogadoId_fkey') THEN
    ALTER TABLE "procurador_abogados"
      ADD CONSTRAINT "procurador_abogados_abogadoId_fkey"
      FOREIGN KEY ("abogadoId") REFERENCES "abogados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "abogado_bancos" ("officeId", "abogadoId", "bancoId", "createdAt", "updatedAt")
SELECT a."officeId", a."id", a."bancoId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "abogados" a
WHERE a."bancoId" IS NOT NULL
ON CONFLICT ("officeId", "abogadoId", "bancoId") DO NOTHING;

INSERT INTO "procurador_abogados" ("officeId", "procuradorId", "abogadoId", "createdAt", "updatedAt")
SELECT p."officeId", p."id", p."abogadoId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "procuradores" p
WHERE p."abogadoId" IS NOT NULL
ON CONFLICT ("officeId", "procuradorId", "abogadoId") DO NOTHING;

WITH unique_bank_abogados AS (
  SELECT
    ab."officeId",
    ab."bancoId",
    MIN(ab."abogadoId") AS "abogadoId",
    COUNT(*) AS "abogadoCount"
  FROM "abogado_bancos" ab
  GROUP BY ab."officeId", ab."bancoId"
),
candidate_links AS (
  SELECT
    bp."officeId",
    bp."procuradorId",
    uba."abogadoId"
  FROM "banco_procuradores" bp
  JOIN unique_bank_abogados uba
    ON uba."officeId" = bp."officeId"
   AND uba."bancoId" = bp."bancoId"
  WHERE uba."abogadoCount" = 1
)
INSERT INTO "procurador_abogados" ("officeId", "procuradorId", "abogadoId", "createdAt", "updatedAt")
SELECT DISTINCT c."officeId", c."procuradorId", c."abogadoId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM candidate_links c
ON CONFLICT ("officeId", "procuradorId", "abogadoId") DO NOTHING;

DROP TABLE IF EXISTS "banco_procuradores";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procuradores_abogadoId_fkey') THEN
    ALTER TABLE "procuradores" DROP CONSTRAINT "procuradores_abogadoId_fkey";
  END IF;
END $$;

DROP INDEX IF EXISTS "procuradores_abogadoId_idx";
ALTER TABLE "procuradores" DROP COLUMN IF EXISTS "abogadoId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'abogados_bancoId_fkey') THEN
    ALTER TABLE "abogados" DROP CONSTRAINT "abogados_bancoId_fkey";
  END IF;
END $$;

DROP INDEX IF EXISTS "abogados_bancoId_idx";
ALTER TABLE "abogados" DROP COLUMN IF EXISTS "bancoId";
