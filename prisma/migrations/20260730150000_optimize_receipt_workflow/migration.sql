CREATE TYPE "ReceiptGenerationStatus" AS ENUM ('RESERVED', 'UPLOADED', 'COMPLETED', 'FAILED');
CREATE TYPE "ReceiptGenerationOperation" AS ENUM ('GENERATE', 'REGENERATE', 'CORRECT');
CREATE TYPE "ReceiptStatus" AS ENUM ('ACTIVE', 'VOIDED', 'CORRECTED');

ALTER TABLE notificaciones
ADD COLUMN "bancoId" INTEGER;

ALTER TABLE "Recibo"
ADD COLUMN "bancoId" INTEGER,
ADD COLUMN "status" "ReceiptStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "generationFingerprint" TEXT,
ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidReason" TEXT,
ADD COLUMN "voidedByUserId" TEXT,
ADD COLUMN "supersedesReciboId" TEXT;

ALTER TABLE notificaciones
ADD CONSTRAINT "notificaciones_bancoId_fkey"
FOREIGN KEY ("bancoId") REFERENCES bancos(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "Recibo"
ADD CONSTRAINT "Recibo_bancoId_fkey"
FOREIGN KEY ("bancoId") REFERENCES bancos(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "Recibo"
ADD CONSTRAINT "Recibo_supersedesReciboId_fkey"
FOREIGN KEY ("supersedesReciboId") REFERENCES "Recibo"(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX "notificaciones_bancoId_idx" ON notificaciones("bancoId");
CREATE INDEX "notificaciones_diligenciaId_createdAt_idx" ON notificaciones("diligenciaId", "createdAt");
CREATE INDEX "Documento_notificacionId_tipo_voidedAt_createdAt_idx"
ON "Documento"("notificacionId", tipo, "voidedAt", "createdAt");
CREATE INDEX "Documento_diligenciaId_tipo_voidedAt_createdAt_idx"
ON "Documento"("diligenciaId", tipo, "voidedAt", "createdAt");
CREATE INDEX "Recibo_bancoId_idx" ON "Recibo"("bancoId");
CREATE INDEX "Recibo_status_createdAt_idx" ON "Recibo"("status", "createdAt");
CREATE UNIQUE INDEX "Recibo_supersedesReciboId_key" ON "Recibo"("supersedesReciboId");

CREATE TABLE receipt_generation_reservations (
  id TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "rolId" TEXT NOT NULL,
  "diligenciaId" TEXT NOT NULL,
  "notificacionId" TEXT NOT NULL,
  operation "ReceiptGenerationOperation" NOT NULL,
  status "ReceiptGenerationStatus" NOT NULL DEFAULT 'RESERVED',
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "numeroRecibo" TEXT NOT NULL,
  "numeroReciboYear" INTEGER NOT NULL,
  "assignedNumber" INTEGER,
  "documentoId" TEXT NOT NULL,
  "targetVersionNumber" INTEGER NOT NULL,
  "storageBucket" TEXT,
  "storageKey" TEXT,
  "fileName" TEXT,
  "sizeBytes" INTEGER,
  "checksumSha256" TEXT,
  "mimeType" TEXT,
  "receiptId" TEXT,
  "documentVersionId" TEXT,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  CONSTRAINT "receipt_generation_reservations_pkey" PRIMARY KEY (id),
  CONSTRAINT "receipt_generation_reservations_officeId_fkey"
    FOREIGN KEY ("officeId") REFERENCES offices(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "receipt_generation_reservations_officeId_idempotencyKey_key"
ON receipt_generation_reservations("officeId", "idempotencyKey");

CREATE UNIQUE INDEX "receipt_generation_reservations_active_notification_key"
ON receipt_generation_reservations("notificacionId")
WHERE status IN ('RESERVED', 'UPLOADED');

CREATE UNIQUE INDEX "receipt_generation_reservations_assigned_number_key"
ON receipt_generation_reservations("officeId", "numeroReciboYear", "assignedNumber")
WHERE "assignedNumber" IS NOT NULL;

CREATE INDEX "receipt_generation_reservations_notificacionId_status_idx"
ON receipt_generation_reservations("notificacionId", status);

CREATE INDEX "receipt_generation_reservations_officeId_status_createdAt_idx"
ON receipt_generation_reservations("officeId", status, "createdAt");

CREATE INDEX "receipt_generation_reservations_status_updatedAt_idx"
ON receipt_generation_reservations(status, "updatedAt");

-- Backfill only unambiguous attorney-bank relationships. Ambiguous rows remain null.
UPDATE notificaciones n
SET "bancoId" = candidates."bancoId"
FROM (
  SELECT n2.id AS "notificacionId", MIN(ab."bancoId") AS "bancoId"
  FROM notificaciones n2
  JOIN "Diligencia" d ON d.id = n2."diligenciaId"
  JOIN "RolCausa" rc ON rc.id = d."rolId"
  JOIN demandas dm ON dm.id = rc."demandaId"
  JOIN abogado_bancos ab ON ab."abogadoId" = dm."abogadoId" AND ab."officeId" = dm."officeId"
  GROUP BY n2.id
  HAVING COUNT(DISTINCT ab."bancoId") = 1
) candidates
WHERE n.id = candidates."notificacionId"
  AND n."bancoId" IS NULL;

UPDATE "Recibo" r
SET "bancoId" = n."bancoId"
FROM notificaciones n
WHERE r."notificacionId" = n.id
  AND r."bancoId" IS NULL
  AND n."bancoId" IS NOT NULL;
