SET search_path TO public;

-- 1) Make estampoId nullable (only if currently NOT NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='aranceles'
      AND column_name='estampoId'
      AND is_nullable='NO'
  ) THEN
    EXECUTE 'ALTER TABLE "aranceles" ALTER COLUMN "estampoId" DROP NOT NULL';
  END IF;
END $$;

-- 2) Add wizard category column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='aranceles'
      AND column_name='estampoBaseCategoria'
  ) THEN
    EXECUTE 'ALTER TABLE "aranceles" ADD COLUMN "estampoBaseCategoria" TEXT';
  END IF;
END $$;

-- 3) Drop the existing legacy unique constraint on (officeId,bancoId,abogadoId,estampoId) if present (unknown name)
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'aranceles'
    AND c.contype = 'u'
    AND c.conkey = ARRAY[
      (SELECT attnum FROM pg_attribute WHERE attrelid=t.oid AND attname='officeId'),
      (SELECT attnum FROM pg_attribute WHERE attrelid=t.oid AND attname='bancoId'),
      (SELECT attnum FROM pg_attribute WHERE attrelid=t.oid AND attname='abogadoId'),
      (SELECT attnum FROM pg_attribute WHERE attrelid=t.oid AND attname='estampoId')
    ];

  IF constraint_name IS NOT NULL AND constraint_name <> 'aranceles_legacy_unique' THEN
    EXECUTE format('ALTER TABLE "aranceles" DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- 4) Ensure legacy unique constraint exists (stable name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'aranceles_legacy_unique'
  ) THEN
    EXECUTE 'ALTER TABLE "aranceles" ADD CONSTRAINT "aranceles_legacy_unique" UNIQUE ("officeId","bancoId","abogadoId","estampoId")';
  END IF;
END $$;

-- 5) Ensure wizard unique constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'aranceles_wizard_unique'
  ) THEN
    EXECUTE 'ALTER TABLE "aranceles" ADD CONSTRAINT "aranceles_wizard_unique" UNIQUE ("officeId","bancoId","abogadoId","estampoBaseCategoria")';
  END IF;
END $$;

-- 6) Ensure index exists for wizard lookup
CREATE INDEX IF NOT EXISTS "aranceles_officeId_bancoId_estampoBaseCategoria_idx"
  ON "aranceles"("officeId","bancoId","estampoBaseCategoria");
