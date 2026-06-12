ALTER TABLE "Diligencia"
ADD COLUMN "fechaPago" TIMESTAMP(3);

CREATE INDEX "Diligencia_fechaPago_idx" ON "Diligencia"("fechaPago");
