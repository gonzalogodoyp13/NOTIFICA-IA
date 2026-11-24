ALTER TABLE public.abogado_accounts
  ADD COLUMN "datosContacto" JSONB,
  ADD COLUMN "datosBoleta" JSONB,
  ADD COLUMN "desactivadoAt" TIMESTAMP(3),
  ADD COLUMN "motivoBaja" TEXT;
