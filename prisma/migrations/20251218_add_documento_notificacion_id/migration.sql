-- B1: Add nullable Documento.notificacionId (idempotent for shadow DB)
ALTER TABLE "Documento"
ADD COLUMN IF NOT EXISTS "notificacionId" TEXT;
