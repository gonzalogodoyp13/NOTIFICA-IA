BEGIN;

-- Preserve timestamp requirements for every timestamped profile, while allowing
-- a basic signature with no TSA evidence. Existing signature records are intact.
ALTER TABLE public.document_signatures
  ALTER COLUMN "timestampAt" DROP NOT NULL,
  ADD CONSTRAINT signature_timestamp_level_check
    CHECK (level = 'PADES_B'::public."SignatureLevel" OR "timestampAt" IS NOT NULL);

COMMIT;
