BEGIN;
SET search_path TO public;

DO $$
DECLARE unresolved_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unresolved_count
  FROM "users"
  WHERE "officeId" IS NULL;

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce users.officeId NOT NULL. Resolve % user(s) in user_office_backfill_issues first.',
      unresolved_count;
  END IF;
END $$;

ALTER TABLE "users"
  ALTER COLUMN "officeId" SET NOT NULL;

ALTER TABLE "users" VALIDATE CONSTRAINT "users_officeId_fkey";
ALTER TABLE "abogados" VALIDATE CONSTRAINT "abogados_officeId_fkey";
ALTER TABLE "bancos" VALIDATE CONSTRAINT "bancos_officeId_fkey";
ALTER TABLE "procuradores" VALIDATE CONSTRAINT "procuradores_officeId_fkey";
ALTER TABLE "banco_procuradores" VALIDATE CONSTRAINT "banco_procuradores_officeId_fkey";
ALTER TABLE "abogado_bancos" VALIDATE CONSTRAINT "abogado_bancos_officeId_fkey";
ALTER TABLE "aranceles" VALIDATE CONSTRAINT "aranceles_officeId_fkey";
ALTER TABLE "comunas" VALIDATE CONSTRAINT "comunas_officeId_fkey";
ALTER TABLE "materias" VALIDATE CONSTRAINT "materias_officeId_fkey";
ALTER TABLE "diligencia_tipos" VALIDATE CONSTRAINT "diligencia_tipos_officeId_fkey";
ALTER TABLE "tribunales" VALIDATE CONSTRAINT "tribunales_officeId_fkey";
ALTER TABLE "RolCausa" VALIDATE CONSTRAINT "RolCausa_officeId_fkey";
ALTER TABLE "Tribunal" VALIDATE CONSTRAINT "Tribunal_officeId_fkey";
ALTER TABLE "DiligenciaTipo" VALIDATE CONSTRAINT "DiligenciaTipo_officeId_fkey";

COMMIT;
