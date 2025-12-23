BEGIN;
SET search_path TO public;

-- 1. Make estampoId nullable
ALTER TABLE "aranceles"
  ALTER COLUMN "estampoId" DROP NOT NULL;

-- 2. Add wizard category column
ALTER TABLE "aranceles"
  ADD COLUMN IF NOT EXISTS "estampoBaseCategoria" TEXT;

-- 3. Drop legacy unique constraint safely (dynamic)
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.aranceles'::regclass
    AND contype = 'u'
    AND conkey = ARRAY[
      (SELECT attnum FROM pg_attribute WHERE attrelid='public.aranceles'::regclass AND attname='officeId'),
      (SELECT attnum FROM pg_attribute WHERE attrelid='public.aranceles'::regclass AND attname='bancoId'),
      (SELECT attnum FROM pg_attribute WHERE attrelid='public.aranceles'::regclass AND attname='abogadoId'),
      (SELECT attnum FROM pg_attribute WHERE attrelid='public.aranceles'::regclass AND attname='estampoId')
    ];

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "aranceles" DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- 4. Recreate legacy constraint with stable name
ALTER TABLE "aranceles"
  ADD CONSTRAINT "aranceles_legacy_unique"
  UNIQUE ("officeId","bancoId","abogadoId","estampoId");

-- 5. Wizard unique constraint
ALTER TABLE "aranceles"
  ADD CONSTRAINT "aranceles_wizard_unique"
  UNIQUE ("officeId","bancoId","abogadoId","estampoBaseCategoria");

-- 6. Wizard lookup index
CREATE INDEX IF NOT EXISTS "aranceles_officeId_bancoId_estampoBaseCategoria_idx"
  ON "aranceles"("officeId","bancoId","estampoBaseCategoria");

COMMIT;
