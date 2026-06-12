CREATE TABLE "ReceiptBulkOperation" (
  "id" TEXT NOT NULL,
  "officeId" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "receiptIds" JSONB NOT NULL,
  "beforeState" JSONB NOT NULL,
  "afterState" JSONB NOT NULL,
  "summary" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "undoneAt" TIMESTAMP(3),
  "undoneByUserId" TEXT,
  CONSTRAINT "ReceiptBulkOperation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReceiptBulkOperation_officeId_createdAt_idx"
ON "ReceiptBulkOperation"("officeId", "createdAt");

CREATE INDEX "ReceiptBulkOperation_userId_createdAt_idx"
ON "ReceiptBulkOperation"("userId", "createdAt");

ALTER TABLE "ReceiptBulkOperation"
ADD CONSTRAINT "ReceiptBulkOperation_officeId_fkey"
FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReceiptBulkOperation"
ADD CONSTRAINT "ReceiptBulkOperation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
