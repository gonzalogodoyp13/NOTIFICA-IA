-- Drift-fix: indexes exist in DB, ensure migrations include them (safe for prod + shadow)

CREATE INDEX IF NOT EXISTS "Documento_rolId_createdAt_idx"
ON public."Documento" USING btree ("rolId", "createdAt");

CREATE INDEX IF NOT EXISTS "Nota_rolId_createdAt_idx"
ON public."Nota" USING btree ("rolId", "createdAt");
