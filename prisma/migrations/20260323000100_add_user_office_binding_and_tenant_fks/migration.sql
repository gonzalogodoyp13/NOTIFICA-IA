BEGIN;
SET search_path TO public;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "officeId" INTEGER;

CREATE INDEX IF NOT EXISTS "users_officeId_idx" ON "users"("officeId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_officeId_fkey') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'abogados_officeId_fkey') THEN
    ALTER TABLE "abogados" ADD CONSTRAINT "abogados_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bancos_officeId_fkey') THEN
    ALTER TABLE "bancos" ADD CONSTRAINT "bancos_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procuradores_officeId_fkey') THEN
    ALTER TABLE "procuradores" ADD CONSTRAINT "procuradores_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'banco_procuradores_officeId_fkey') THEN
    ALTER TABLE "banco_procuradores" ADD CONSTRAINT "banco_procuradores_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'abogado_bancos_officeId_fkey') THEN
    ALTER TABLE "abogado_bancos" ADD CONSTRAINT "abogado_bancos_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aranceles_officeId_fkey') THEN
    ALTER TABLE "aranceles" ADD CONSTRAINT "aranceles_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comunas_officeId_fkey') THEN
    ALTER TABLE "comunas" ADD CONSTRAINT "comunas_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materias_officeId_fkey') THEN
    ALTER TABLE "materias" ADD CONSTRAINT "materias_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diligencia_tipos_officeId_fkey') THEN
    ALTER TABLE "diligencia_tipos" ADD CONSTRAINT "diligencia_tipos_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tribunales_officeId_fkey') THEN
    ALTER TABLE "tribunales" ADD CONSTRAINT "tribunales_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolCausa_officeId_fkey') THEN
    ALTER TABLE "RolCausa" ADD CONSTRAINT "RolCausa_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Tribunal_officeId_fkey') THEN
    ALTER TABLE "Tribunal" ADD CONSTRAINT "Tribunal_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DiligenciaTipo_officeId_fkey') THEN
    ALTER TABLE "DiligenciaTipo" ADD CONSTRAINT "DiligenciaTipo_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "offices"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

WITH unique_offices AS (
  SELECT nombre, MIN(id) AS id, COUNT(*) AS c
  FROM "offices"
  GROUP BY nombre
  HAVING COUNT(*) = 1
)
UPDATE "users" u
SET "officeId" = uo.id
FROM unique_offices uo
WHERE u."officeId" IS NULL
  AND u."officeName" = uo.nombre;

CREATE TABLE IF NOT EXISTS "user_office_backfill_issues" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL,
  "officeName" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "user_office_backfill_issues" ("id", "email", "officeName")
SELECT u.id, u.email, u."officeName"
FROM "users" u
WHERE u."officeId" IS NULL
ON CONFLICT ("id") DO NOTHING;

COMMIT;
