CREATE TABLE "email_templates" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_templates_officeId_key_key"
ON "email_templates"("officeId", "key");

CREATE INDEX "email_templates_officeId_idx"
ON "email_templates"("officeId");

ALTER TABLE "email_templates"
ADD CONSTRAINT "email_templates_officeId_fkey"
FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
