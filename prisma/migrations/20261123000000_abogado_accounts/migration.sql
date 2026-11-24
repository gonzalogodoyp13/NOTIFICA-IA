BEGIN;

CREATE TABLE public.abogado_accounts (
  "authUserId" UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  "termsVersion" TEXT NOT NULL,
  "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.receptor_consultations (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  celular TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX receptor_consultations_email_nombre_celular_key ON public.receptor_consultations (email, nombre, celular);

ALTER TABLE public.abogado_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receptor_consultations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.abogado_accounts, public.receptor_consultations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abogado_accounts, public.receptor_consultations TO notifica_runtime;
CREATE POLICY notifica_backend_access ON public.abogado_accounts TO notifica_runtime USING (true) WITH CHECK (true);
CREATE POLICY notifica_backend_access ON public.receptor_consultations TO notifica_runtime USING (true) WITH CHECK (true);

COMMIT;
