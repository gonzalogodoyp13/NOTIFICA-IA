ALTER TABLE "recibos_dispatch_recipients"
ADD COLUMN "trackingToken" TEXT,
ADD COLUMN "providerInternetMessageId" TEXT;

CREATE UNIQUE INDEX "recibos_dispatch_recipients_trackingToken_key"
ON "recibos_dispatch_recipients"("trackingToken");

CREATE INDEX "recibos_dispatch_recipients_providerInternetMessageId_idx"
ON "recibos_dispatch_recipients"("providerInternetMessageId");

CREATE TABLE "recibos_dispatch_replies" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "recipientId" TEXT,
  "provider" TEXT NOT NULL,
  "mailboxAddress" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "providerThreadId" TEXT,
  "internetMessageId" TEXT,
  "inReplyTo" TEXT,
  "references" JSONB,
  "trackingToken" TEXT,
  "senderName" TEXT,
  "senderEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "textPreview" TEXT NOT NULL,
  "bodyText" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "matchStatus" TEXT NOT NULL,
  "matchMethod" TEXT,
  "candidateRecipientIds" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "recibos_dispatch_replies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recibos_dispatch_reply_attachments" (
  "id" TEXT NOT NULL,
  "replyId" TEXT NOT NULL,
  "providerAttachmentId" TEXT,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT,
  "byteSize" INTEGER,
  "contentId" TEXT,
  "isInline" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "recibos_dispatch_reply_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recibos_reply_sync_checkpoints" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "mailboxAddress" TEXT NOT NULL,
  "cursor" JSONB,
  "graphDeltaLink" TEXT,
  "gmailUidValidity" TEXT,
  "gmailLastUid" INTEGER,
  "lastAttemptedAt" TIMESTAMP(3),
  "lastSuccessfulAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "recibos_reply_sync_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recibos_dispatch_replies_provider_mailboxAddress_providerMessageId_key"
ON "recibos_dispatch_replies"("provider", "mailboxAddress", "providerMessageId");

CREATE INDEX "recibos_dispatch_replies_officeId_receivedAt_idx"
ON "recibos_dispatch_replies"("officeId", "receivedAt");

CREATE INDEX "recibos_dispatch_replies_recipientId_receivedAt_idx"
ON "recibos_dispatch_replies"("recipientId", "receivedAt");

CREATE INDEX "recibos_dispatch_replies_matchStatus_receivedAt_idx"
ON "recibos_dispatch_replies"("matchStatus", "receivedAt");

CREATE INDEX "recibos_dispatch_replies_providerThreadId_idx"
ON "recibos_dispatch_replies"("providerThreadId");

CREATE INDEX "recibos_dispatch_replies_internetMessageId_idx"
ON "recibos_dispatch_replies"("internetMessageId");

CREATE INDEX "recibos_dispatch_reply_attachments_replyId_idx"
ON "recibos_dispatch_reply_attachments"("replyId");

CREATE UNIQUE INDEX "recibos_reply_sync_checkpoints_officeId_provider_mailboxAddress_key"
ON "recibos_reply_sync_checkpoints"("officeId", "provider", "mailboxAddress");

CREATE INDEX "recibos_reply_sync_checkpoints_officeId_updatedAt_idx"
ON "recibos_reply_sync_checkpoints"("officeId", "updatedAt");

ALTER TABLE "recibos_dispatch_replies"
ADD CONSTRAINT "recibos_dispatch_replies_officeId_fkey"
FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recibos_dispatch_replies"
ADD CONSTRAINT "recibos_dispatch_replies_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "recibos_dispatch_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recibos_dispatch_reply_attachments"
ADD CONSTRAINT "recibos_dispatch_reply_attachments_replyId_fkey"
FOREIGN KEY ("replyId") REFERENCES "recibos_dispatch_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recibos_reply_sync_checkpoints"
ADD CONSTRAINT "recibos_reply_sync_checkpoints_officeId_fkey"
FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
