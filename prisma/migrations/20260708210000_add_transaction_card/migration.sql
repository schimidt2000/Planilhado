ALTER TABLE "Transaction" ADD COLUMN "cardLastFour" TEXT;

CREATE INDEX "Transaction_userId_cardLastFour_idx"
ON "Transaction"("userId", "cardLastFour");
