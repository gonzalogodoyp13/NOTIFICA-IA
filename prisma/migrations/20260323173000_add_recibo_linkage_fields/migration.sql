ALTER TABLE "Recibo"
ADD COLUMN "diligenciaId" TEXT,
ADD COLUMN "notificacionId" TEXT,
ADD COLUMN "documentoId" TEXT,
ADD COLUMN "numeroRecibo" TEXT,
ADD COLUMN "numeroBoleta" TEXT;

CREATE INDEX "Recibo_createdAt_idx" ON "Recibo"("createdAt");
CREATE INDEX "Recibo_diligenciaId_idx" ON "Recibo"("diligenciaId");
CREATE INDEX "Recibo_notificacionId_idx" ON "Recibo"("notificacionId");
CREATE INDEX "Recibo_documentoId_idx" ON "Recibo"("documentoId");
