ALTER TABLE "ImportSession"
ADD COLUMN "fileName" TEXT,
ADD COLUMN "fileSize" INTEGER,
ADD COLUMN "fileHash" TEXT,
ADD COLUMN "newCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "completedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "duplicateCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "ImportSession_userId_month_idx" ON "ImportSession"("userId", "month");
CREATE INDEX "ImportSession_userId_fileHash_idx" ON "ImportSession"("userId", "fileHash");

ALTER TABLE "Transaction"
ADD COLUMN "debtorId" TEXT;

UPDATE "Transaction" t
SET "debtorId" = d."id"
FROM "Debtor" d
WHERE t."userId" = d."userId"
  AND t."debtorName" IS NOT NULL
  AND lower(t."debtorName") = lower(d."name");

CREATE INDEX "Transaction_userId_debtorId_idx" ON "Transaction"("userId", "debtorId");

ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_debtorId_fkey"
FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TransactionSplit"
ADD COLUMN "debtorId" TEXT;

UPDATE "TransactionSplit" s
SET "debtorId" = d."id"
FROM "Debtor" d
WHERE s."userId" = d."userId"
  AND lower(s."debtorName") = lower(d."name");

CREATE INDEX "TransactionSplit_userId_debtorId_idx" ON "TransactionSplit"("userId", "debtorId");

ALTER TABLE "TransactionSplit"
ADD CONSTRAINT "TransactionSplit_debtorId_fkey"
FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "ImportSession" s
SET "newCount" = COALESCE(t.total, 0)
FROM (
  SELECT "importSessionId", COUNT(*)::integer AS total
  FROM "Transaction"
  GROUP BY "importSessionId"
) t
WHERE s."id" = t."importSessionId";
