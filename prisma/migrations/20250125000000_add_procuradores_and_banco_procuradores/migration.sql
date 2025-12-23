SET search_path TO public;

-- 1) Create procuradores table if not exists
CREATE TABLE IF NOT EXISTS "procuradores" (
  "id" SERIAL NOT NULL,
  "officeId" INTEGER NOT NULL,
  "nombre" TEXT NOT NULL,
  "email" TEXT,
  "telefono" TEXT,
  "notas" TEXT,
  "abogadoId" INTEGER,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "procuradores_pkey" PRIMARY KEY ("id")
);

-- 2) Create banco_procuradores table if not exists
CREATE TABLE IF NOT EXISTS "banco_procuradores" (
  "id" SERIAL NOT NULL,
  "officeId" INTEGER NOT NULL,
  "bancoId" INTEGER NOT NULL,
  "procuradorId" INTEGER NOT NULL,
  "alias" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "banco_procuradores_pkey" PRIMARY KEY ("id")
);

-- 3) Add foreign keys with idempotent checks
DO $$
BEGIN
  -- FK: procuradores.abogadoId -> abogados.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'procuradores_abogadoId_fkey'
  ) THEN
    ALTER TABLE "procuradores" ADD CONSTRAINT "procuradores_abogadoId_fkey" 
      FOREIGN KEY ("abogadoId") REFERENCES "abogados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  -- FK: banco_procuradores.bancoId -> bancos.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'banco_procuradores_bancoId_fkey'
  ) THEN
    ALTER TABLE "banco_procuradores" ADD CONSTRAINT "banco_procuradores_bancoId_fkey" 
      FOREIGN KEY ("bancoId") REFERENCES "bancos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- FK: banco_procuradores.procuradorId -> procuradores.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'banco_procuradores_procuradorId_fkey'
  ) THEN
    ALTER TABLE "banco_procuradores" ADD CONSTRAINT "banco_procuradores_procuradorId_fkey" 
      FOREIGN KEY ("procuradorId") REFERENCES "procuradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- Note: NO FK for officeId -> offices.id
  -- Banco and Abogado models don't have FK to offices either (only indexes),
  -- so we maintain consistency with existing patterns.
END $$;

-- 4) Create indexes
CREATE INDEX IF NOT EXISTS "procuradores_officeId_idx" ON "procuradores"("officeId");
CREATE INDEX IF NOT EXISTS "procuradores_abogadoId_idx" ON "procuradores"("abogadoId");
CREATE INDEX IF NOT EXISTS "procuradores_officeId_activo_idx" ON "procuradores"("officeId", "activo");
CREATE INDEX IF NOT EXISTS "banco_procuradores_bancoId_idx" ON "banco_procuradores"("bancoId");
CREATE INDEX IF NOT EXISTS "banco_procuradores_procuradorId_idx" ON "banco_procuradores"("procuradorId");
CREATE INDEX IF NOT EXISTS "banco_procuradores_officeId_idx" ON "banco_procuradores"("officeId");

-- 5) Create unique constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'banco_procuradores_officeId_bancoId_procuradorId_key'
  ) THEN
    ALTER TABLE "banco_procuradores" ADD CONSTRAINT "banco_procuradores_officeId_bancoId_procuradorId_key" 
      UNIQUE ("officeId", "bancoId", "procuradorId");
  END IF;
END $$;

