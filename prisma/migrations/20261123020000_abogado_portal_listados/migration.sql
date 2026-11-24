BEGIN;

CREATE TYPE public."RespuestaEncargo" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA');
ALTER TABLE public.abogado_encargo_receptores ADD COLUMN respuesta public."RespuestaEncargo" NOT NULL DEFAULT 'PENDIENTE';
ALTER TABLE public.abogado_encargos ADD COLUMN "finalizadoAt" TIMESTAMP(3);
ALTER TABLE public.receptor_portal_profiles ADD COLUMN tribunales TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX receptor_portal_profiles_tribunales_idx ON public.receptor_portal_profiles USING GIN (tribunales);

CREATE TABLE public.abogado_estampos (
  id UUID PRIMARY KEY,
  "encargoId" UUID NOT NULL,
  "receptorId" TEXT NOT NULL,
  notificado TEXT NOT NULL,
  resultado TEXT NOT NULL,
  "firmadoAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("encargoId", "receptorId") REFERENCES public.abogado_encargo_receptores ("encargoId", "receptorId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "abogado_estampos_encargoId_firmadoAt_idx" ON public.abogado_estampos ("encargoId", "firmadoAt");

CREATE TABLE public.abogado_pagos (
  id UUID PRIMARY KEY,
  "encargoId" UUID NOT NULL,
  "receptorId" TEXT NOT NULL,
  "montoClp" INTEGER NOT NULL CHECK ("montoClp" > 0),
  medio TEXT NOT NULL,
  referencia TEXT,
  "pagadoAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("encargoId", "receptorId") REFERENCES public.abogado_encargo_receptores ("encargoId", "receptorId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "abogado_pagos_encargoId_pagadoAt_idx" ON public.abogado_pagos ("encargoId", "pagadoAt");

CREATE TABLE public.abogado_boletas (
  id UUID PRIMARY KEY,
  "encargoId" UUID NOT NULL,
  "receptorId" TEXT NOT NULL,
  numero TEXT NOT NULL,
  "numeroRecibo" TEXT,
  "montoClp" INTEGER NOT NULL CHECK ("montoClp" >= 0),
  "emitidoAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("encargoId", "receptorId") REFERENCES public.abogado_encargo_receptores ("encargoId", "receptorId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "abogado_boletas_receptorId_numero_key" ON public.abogado_boletas ("receptorId", numero);
CREATE INDEX "abogado_boletas_encargoId_emitidoAt_idx" ON public.abogado_boletas ("encargoId", "emitidoAt");

ALTER TABLE public.abogado_estampos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abogado_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abogado_boletas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.abogado_estampos, public.abogado_pagos, public.abogado_boletas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abogado_estampos, public.abogado_pagos, public.abogado_boletas TO notifica_runtime;
CREATE POLICY notifica_backend_access ON public.abogado_estampos TO notifica_runtime USING (true) WITH CHECK (true);
CREATE POLICY notifica_backend_access ON public.abogado_pagos TO notifica_runtime USING (true) WITH CHECK (true);
CREATE POLICY notifica_backend_access ON public.abogado_boletas TO notifica_runtime USING (true) WITH CHECK (true);

COMMIT;
