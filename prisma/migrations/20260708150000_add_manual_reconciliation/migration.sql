ALTER TABLE "Transaction"
ADD COLUMN "externalIdentifier" TEXT,
ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'imported',
ADD COLUMN "reconciledAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Transaction_userId_sourceType_externalIdentifier_key"
ON "Transaction"("userId", "sourceType", "externalIdentifier");
