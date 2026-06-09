ALTER TABLE "Documento"
  ADD COLUMN "generatedByUserId" text,
  ADD COLUMN "generatedAt" timestamp(3),
  ADD COLUMN "sourceTemplate" jsonb,
  ADD COLUMN "generationVariables" jsonb,
  ADD COLUMN "generationVersion" integer NOT NULL DEFAULT 1;
