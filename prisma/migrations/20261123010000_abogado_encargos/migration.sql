BEGIN;

CREATE TABLE public.receptor_portal_profiles (
  "userId" TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  nombre TEXT NOT NULL,
  cortes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  disponible BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX receptor_portal_profiles_cortes_idx ON public.receptor_portal_profiles USING GIN (cortes);

CREATE TABLE public.abogado_encargos (
  id UUID PRIMARY KEY,
  "abogadoId" UUID NOT NULL REFERENCES public.abogado_accounts("authUserId") ON DELETE CASCADE ON UPDATE CASCADE,
  corte TEXT NOT NULL,
  tribunal TEXT NOT NULL,
  rol TEXT NOT NULL,
  datos JSONB NOT NULL,
  "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoAt" TIMESTAMP(3) NOT NULL,
  "enviadoAt" TIMESTAMP(3)
);
CREATE INDEX "abogado_encargos_abogadoId_actualizadoAt_idx" ON public.abogado_encargos ("abogadoId", "actualizadoAt");

CREATE TABLE public.abogado_encargo_receptores (
  "encargoId" UUID NOT NULL REFERENCES public.abogado_encargos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "receptorId" TEXT NOT NULL REFERENCES public.receptor_portal_profiles("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("encargoId", "receptorId")
);
CREATE INDEX "abogado_encargo_receptores_receptorId_idx" ON public.abogado_encargo_receptores ("receptorId");

ALTER TABLE public.receptor_portal_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abogado_encargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abogado_encargo_receptores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.receptor_portal_profiles, public.abogado_encargos, public.abogado_encargo_receptores FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receptor_portal_profiles, public.abogado_encargos, public.abogado_encargo_receptores TO notifica_runtime;
CREATE POLICY notifica_backend_access ON public.receptor_portal_profiles TO notifica_runtime USING (true) WITH CHECK (true);
CREATE POLICY notifica_backend_access ON public.abogado_encargos TO notifica_runtime USING (true) WITH CHECK (true);
CREATE POLICY notifica_backend_access ON public.abogado_encargo_receptores TO notifica_runtime USING (true) WITH CHECK (true);

COMMIT;
