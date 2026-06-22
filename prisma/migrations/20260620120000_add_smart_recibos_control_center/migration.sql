ALTER TABLE "recibos_dispatch_batches"
ADD COLUMN "dispatchKind" TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE "recibos_dispatch_recipients"
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "resolvedByUserId" TEXT,
ADD COLUMN "resolutionNote" TEXT,
ADD COLUMN "duplicateOverrideReason" TEXT,
ADD COLUMN "duplicateConfirmedByUserId" TEXT,
ADD COLUMN "duplicateConfirmedAt" TIMESTAMP(3),
ADD COLUMN "overlappingDispatchIds" JSONB,
ADD COLUMN "resendOfRecipientId" TEXT,
ADD COLUMN "resendReason" TEXT,
ADD COLUMN "partialResendConfirmed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "recibos_dispatch_replies"
ADD COLUMN "suggestedClassification" TEXT,
ADD COLUMN "classificationRuleVersion" TEXT,
ADD COLUMN "confirmedClassification" TEXT,
ADD COLUMN "classifiedByUserId" TEXT,
ADD COLUMN "classifiedAt" TIMESTAMP(3);

CREATE TABLE "recibos_provider_health" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "mailboxAddress" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "lastCheckedAt" TIMESTAMP(3),
  "lastHealthyAt" TIMESTAMP(3),
  "lastSuccessfulSendAt" TIMESTAMP(3),
  "lastSuccessfulSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recibos_provider_health_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recibos_dispatch_recipients_resolvedAt_idx" ON "recibos_dispatch_recipients"("resolvedAt");
CREATE INDEX "recibos_dispatch_recipients_resendOfRecipientId_idx" ON "recibos_dispatch_recipients"("resendOfRecipientId");
CREATE UNIQUE INDEX "recibos_provider_health_officeId_provider_mailboxAddress_key" ON "recibos_provider_health"("officeId", "provider", "mailboxAddress");
CREATE INDEX "recibos_provider_health_officeId_updatedAt_idx" ON "recibos_provider_health"("officeId", "updatedAt");

ALTER TABLE "recibos_dispatch_recipients"
ADD CONSTRAINT "recibos_dispatch_recipients_resendOfRecipientId_fkey"
FOREIGN KEY ("resendOfRecipientId") REFERENCES "recibos_dispatch_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recibos_provider_health"
ADD CONSTRAINT "recibos_provider_health_officeId_fkey"
FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
