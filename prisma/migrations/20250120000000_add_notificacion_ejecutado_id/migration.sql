-- AlterTable
ALTER TABLE "notificaciones" ADD COLUMN "ejecutadoId" TEXT;

-- CreateIndex
CREATE INDEX "notificaciones_ejecutadoId_idx" ON "notificaciones"("ejecutadoId");

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_ejecutadoId_fkey" FOREIGN KEY ("ejecutadoId") REFERENCES "ejecutados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

