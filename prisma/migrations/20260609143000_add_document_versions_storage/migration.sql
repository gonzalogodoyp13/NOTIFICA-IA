CREATE TABLE "DocumentoVersion" (
  "id" TEXT NOT NULL,
  "documentoId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "storageBucket" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT,
  "deletedAt" TIMESTAMP(3),
  "deletedByUserId" TEXT,
  CONSTRAINT "DocumentoVersion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Documento"
ADD COLUMN "currentVersionId" TEXT;

ALTER TABLE "Recibo"
ADD COLUMN "documentVersionId" TEXT;

CREATE UNIQUE INDEX "DocumentoVersion_documentoId_versionNumber_key"
ON "DocumentoVersion"("documentoId", "versionNumber");

CREATE INDEX "DocumentoVersion_documentoId_createdAt_idx"
ON "DocumentoVersion"("documentoId", "createdAt");

CREATE INDEX "DocumentoVersion_storageBucket_storageKey_idx"
ON "DocumentoVersion"("storageBucket", "storageKey");

CREATE INDEX "Documento_currentVersionId_idx"
ON "Documento"("currentVersionId");

CREATE INDEX "Recibo_documentVersionId_idx"
ON "Recibo"("documentVersionId");

ALTER TABLE "DocumentoVersion"
ADD CONSTRAINT "DocumentoVersion_documentoId_fkey"
FOREIGN KEY ("documentoId") REFERENCES "Documento"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Documento"
ADD CONSTRAINT "Documento_currentVersionId_fkey"
FOREIGN KEY ("currentVersionId") REFERENCES "DocumentoVersion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Recibo"
ADD CONSTRAINT "Recibo_documentVersionId_fkey"
FOREIGN KEY ("documentVersionId") REFERENCES "DocumentoVersion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
