ALTER TABLE "Transaction" ADD COLUMN "splitMode" TEXT NOT NULL DEFAULT 'none';

CREATE TABLE "TransactionSplit" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "debtorName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionSplit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TransactionSplit_userId_debtorName_idx" ON "TransactionSplit"("userId", "debtorName");
CREATE INDEX "TransactionSplit_transactionId_idx" ON "TransactionSplit"("transactionId");

ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
