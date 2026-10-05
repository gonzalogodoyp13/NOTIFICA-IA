CREATE TABLE "procurador_bancos" (
  "id" SERIAL PRIMARY KEY,
  "officeId" INTEGER NOT NULL REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "procuradorId" INTEGER NOT NULL REFERENCES "procuradores"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "bancoId" INTEGER NOT NULL REFERENCES "bancos"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "procurador_bancos_officeId_procuradorId_bancoId_key" ON "procurador_bancos"("officeId", "procuradorId", "bancoId");
CREATE INDEX "procurador_bancos_procuradorId_idx" ON "procurador_bancos"("procuradorId");
CREATE INDEX "procurador_bancos_bancoId_idx" ON "procurador_bancos"("bancoId");
ALTER TABLE "procurador_bancos" ENABLE ROW LEVEL SECURITY;

-- Preserve existing assignments; new procuradores only receive explicitly selected banks.
INSERT INTO "procurador_bancos" ("officeId", "procuradorId", "bancoId")
SELECT DISTINCT pa."officeId", pa."procuradorId", ab."bancoId"
FROM "procurador_abogados" pa
JOIN "abogado_bancos" ab ON ab."abogadoId" = pa."abogadoId" AND ab."officeId" = pa."officeId";

ALTER TABLE "demandas" ADD COLUMN "bancoId" INTEGER;
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_bancoId_fkey" FOREIGN KEY ("bancoId") REFERENCES "bancos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Resolve old demands only when their bank prefix identifies one bank unambiguously.
UPDATE "demandas" d SET "bancoId" = matched.id
FROM (
  SELECT d2.id AS demanda_id, MIN(b.id) AS id
  FROM "demandas" d2
  JOIN "bancos" b ON b."officeId" = d2."officeId"
    AND lower(trim(b.nombre)) = lower(trim(split_part(d2.caratula, '/', 1)))
  GROUP BY d2.id HAVING COUNT(*) = 1
) matched WHERE d.id = matched.demanda_id;

UPDATE "demandas" d SET "bancoId" = matched.id
FROM (
  SELECT "officeId", "abogadoId", MIN("bancoId") AS id
  FROM "abogado_bancos" GROUP BY "officeId", "abogadoId" HAVING COUNT(*) = 1
) matched
WHERE d."bancoId" IS NULL AND d."officeId" = matched."officeId" AND d."abogadoId" = matched."abogadoId";
