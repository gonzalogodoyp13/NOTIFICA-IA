SET search_path TO public;

-- 1) Add procuradorId column to demandas table (nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'demandas' AND column_name = 'procuradorId'
  ) THEN
    ALTER TABLE "demandas" ADD COLUMN "procuradorId" INTEGER NULL;
  END IF;
END $$;

-- 2) Add foreign key constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'demandas_procuradorId_fkey'
  ) THEN
    ALTER TABLE "demandas" ADD CONSTRAINT "demandas_procuradorId_fkey" 
      FOREIGN KEY ("procuradorId") REFERENCES "procuradores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

