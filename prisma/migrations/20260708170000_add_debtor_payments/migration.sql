CREATE TABLE "DebtorPayment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "debtorId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DebtorPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DebtorPayment_userId_month_idx" ON "DebtorPayment"("userId", "month");
CREATE INDEX "DebtorPayment_debtorId_month_idx" ON "DebtorPayment"("debtorId", "month");

ALTER TABLE "DebtorPayment"
ADD CONSTRAINT "DebtorPayment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DebtorPayment"
ADD CONSTRAINT "DebtorPayment_debtorId_fkey"
FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
