CREATE TABLE "recibos_dispatch_batches" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "recipientMode" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "fromAccount" TEXT,
  "status" TEXT NOT NULL,
  "selectedCount" INTEGER NOT NULL DEFAULT 0,
  "excludedCount" INTEGER NOT NULL DEFAULT 0,
  "groupCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "templateMode" TEXT NOT NULL,
  "errorMessage" TEXT,
  "replyCount" INTEGER NOT NULL DEFAULT 0,
  "lastReplyAt" TIMESTAMP(3),
  "hasReplies" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "recibos_dispatch_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recibos_dispatch_recipients" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "groupKey" TEXT NOT NULL,
  "recipientType" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "recipientEmails" JSONB NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "providerMessageId" TEXT,
  "providerThreadId" TEXT,
  "attachmentFilename" TEXT,
  "attachmentMimeType" TEXT,
  "attachmentByteSize" INTEGER,
  "attachmentSha256" TEXT,
  "reciboCount" INTEGER NOT NULL DEFAULT 0,
  "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "warningSummary" JSONB,
  "errorMessage" TEXT,
  "replyCount" INTEGER NOT NULL DEFAULT 0,
  "lastReplyAt" TIMESTAMP(3),
  "hasReplies" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "recibos_dispatch_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recibos_dispatch_items" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "reciboId" TEXT NOT NULL,
  "numeroRecibo" TEXT NOT NULL,
  "rol" TEXT NOT NULL,
  "monto" DOUBLE PRECISION NOT NULL,
  "fechaEjecucion" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "recibos_dispatch_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recibos_dispatch_batches_officeId_createdAt_idx"
ON "recibos_dispatch_batches"("officeId", "createdAt");

CREATE INDEX "recibos_dispatch_batches_userId_createdAt_idx"
ON "recibos_dispatch_batches"("userId", "createdAt");

CREATE INDEX "recibos_dispatch_batches_status_idx"
ON "recibos_dispatch_batches"("status");

CREATE INDEX "recibos_dispatch_recipients_batchId_idx"
ON "recibos_dispatch_recipients"("batchId");

CREATE INDEX "recibos_dispatch_recipients_status_idx"
ON "recibos_dispatch_recipients"("status");

CREATE INDEX "recibos_dispatch_recipients_providerMessageId_idx"
ON "recibos_dispatch_recipients"("providerMessageId");

CREATE INDEX "recibos_dispatch_items_recipientId_idx"
ON "recibos_dispatch_items"("recipientId");

CREATE INDEX "recibos_dispatch_items_reciboId_idx"
ON "recibos_dispatch_items"("reciboId");

ALTER TABLE "recibos_dispatch_batches"
ADD CONSTRAINT "recibos_dispatch_batches_officeId_fkey"
FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recibos_dispatch_batches"
ADD CONSTRAINT "recibos_dispatch_batches_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recibos_dispatch_recipients"
ADD CONSTRAINT "recibos_dispatch_recipients_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "recibos_dispatch_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recibos_dispatch_items"
ADD CONSTRAINT "recibos_dispatch_items_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "recibos_dispatch_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
