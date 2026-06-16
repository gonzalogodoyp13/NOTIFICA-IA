DO $$
DECLARE
  ambiguous_role_count integer;
  ambiguous_tribunal_count integer;
  missing_role_count integer;
  invalid_tribunal_count integer;
BEGIN
  SELECT COUNT(*)
  INTO ambiguous_role_count
  FROM "demandas" d
  WHERE NOT EXISTS (SELECT 1 FROM "RolCausa" linked WHERE linked."demandaId" = d.id)
    AND (
      SELECT COUNT(*)
      FROM "RolCausa" candidate
      WHERE candidate."demandaId" IS NULL
        AND candidate."officeId" = d."officeId"
        AND UPPER(BTRIM(candidate.rol)) = UPPER(BTRIM(d.rol))
    ) > 1;

  IF ambiguous_role_count > 0 THEN
    RAISE EXCEPTION 'Cannot retire demandas.tribunalId: % demanda records match multiple orphan RolCausa records', ambiguous_role_count;
  END IF;

  UPDATE "RolCausa" r
  SET "demandaId" = d.id
  FROM "demandas" d
  WHERE r."demandaId" IS NULL
    AND r."officeId" = d."officeId"
    AND UPPER(BTRIM(r.rol)) = UPPER(BTRIM(d.rol))
    AND NOT EXISTS (SELECT 1 FROM "RolCausa" linked WHERE linked."demandaId" = d.id)
    AND (
      SELECT COUNT(*)
      FROM "RolCausa" candidate
      WHERE candidate."demandaId" IS NULL
        AND candidate."officeId" = d."officeId"
        AND UPPER(BTRIM(candidate.rol)) = UPPER(BTRIM(d.rol))
    ) = 1;

  SELECT COUNT(*)
  INTO ambiguous_tribunal_count
  FROM "demandas" d
  JOIN "tribunales" old_t ON old_t.id = d."tribunalId"
  WHERE NOT EXISTS (SELECT 1 FROM "RolCausa" linked WHERE linked."demandaId" = d.id)
    AND (
      SELECT COUNT(*)
      FROM "Tribunal" candidate
      WHERE candidate."officeId" = d."officeId"
        AND LOWER(REGEXP_REPLACE(BTRIM(candidate.nombre), '\\s+', ' ', 'g')) =
            LOWER(REGEXP_REPLACE(BTRIM(old_t.nombre), '\\s+', ' ', 'g'))
    ) <> 1;

  IF ambiguous_tribunal_count > 0 THEN
    RAISE EXCEPTION 'Cannot retire demandas.tribunalId: % demanda records lack a unique normalized Tribunal match', ambiguous_tribunal_count;
  END IF;

  INSERT INTO "RolCausa" (id, "demandaId", "officeId", rol, "tribunalId", estado, "createdAt")
  SELECT
    d.id,
    d.id,
    d."officeId",
    d.rol,
    (
      SELECT candidate.id
      FROM "Tribunal" candidate
      WHERE candidate."officeId" = d."officeId"
        AND LOWER(REGEXP_REPLACE(BTRIM(candidate.nombre), '\\s+', ' ', 'g')) =
            LOWER(REGEXP_REPLACE(BTRIM(old_t.nombre), '\\s+', ' ', 'g'))
      LIMIT 1
    ),
    'pendiente',
    d."createdAt"
  FROM "demandas" d
  JOIN "tribunales" old_t ON old_t.id = d."tribunalId"
  WHERE NOT EXISTS (SELECT 1 FROM "RolCausa" linked WHERE linked."demandaId" = d.id);

  SELECT COUNT(*)
  INTO missing_role_count
  FROM "demandas" d
  LEFT JOIN "RolCausa" r
    ON r."demandaId" = d.id
  WHERE r.id IS NULL;

  IF missing_role_count > 0 THEN
    RAISE EXCEPTION 'Cannot retire demandas.tribunalId: % demanda records have no RolCausa', missing_role_count;
  END IF;

  SELECT COUNT(*)
  INTO invalid_tribunal_count
  FROM "demandas" d
  JOIN "RolCausa" r
    ON r."demandaId" = d.id
  LEFT JOIN "Tribunal" t
    ON t.id = r."tribunalId"
   AND t."officeId" = d."officeId"
  WHERE t.id IS NULL
     OR r."officeId" <> d."officeId";

  IF invalid_tribunal_count > 0 THEN
    RAISE EXCEPTION 'Cannot retire demandas.tribunalId: % demanda records lack a valid office-scoped Tribunal through RolCausa', invalid_tribunal_count;
  END IF;
END $$;

ALTER TABLE "demandas"
  DROP CONSTRAINT IF EXISTS "demandas_tribunalId_fkey";

ALTER TABLE "demandas"
  DROP COLUMN IF EXISTS "tribunalId";

-- The legacy tribunales and diligencia_tipos tables are intentionally retained
-- for rollback. Prisma no longer exposes them to active application code.
