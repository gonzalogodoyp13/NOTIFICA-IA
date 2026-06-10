ALTER TABLE "offices"
ADD COLUMN "pdfReceptorNombre" TEXT,
ADD COLUMN "pdfReceptorDireccionLinea" TEXT,
ADD COLUMN "pdfReceptorTelefono" TEXT,
ADD COLUMN "pdfFirmaStorageBucket" TEXT,
ADD COLUMN "pdfFirmaStorageKey" TEXT,
ADD COLUMN "pdfSelloStorageBucket" TEXT,
ADD COLUMN "pdfSelloStorageKey" TEXT,
ADD COLUMN "pdfReciboStampStorageBucket" TEXT,
ADD COLUMN "pdfReciboStampStorageKey" TEXT;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'pdf-assets',
  'pdf-assets',
  false,
  10485760,
  ARRAY['image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
