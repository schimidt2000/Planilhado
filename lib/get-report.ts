import { prisma } from '@/lib/db'
import type { MonthlyReport } from '@/lib/types'

export async function getMonthlyReport(userId: string, month: string): Promise<MonthlyReport | null> {
  const [year, mon] = month.split('-').map(Number)
  if (!year || !mon) return null

  const start = new Date(year, mon - 1, 1)
  const end = new Date(year, mon, 0, 23, 59, 59, 999)

  const transactions = await prisma.transaction.findMany({
    where: { userId, status: 'approved', date: { gte: start, lte: end }, isCredit: false },
    orderBy: { date: 'asc' },
  })

  const totalExpenseCents = transactions
    .filter((t) => t.transactionType !== 'receivable')
    .reduce((sum, t) => sum + t.amountCents, 0)

  const totalReceivableCents = transactions
    .filter((t) => t.transactionType === 'receivable')
    .reduce((sum, t) => sum + t.amountCents, 0)

  const sourceMap: Record<string, number> = {}
  for (const t of transactions) {
    if (t.transactionType === 'receivable') continue
    sourceMap[t.sourceType] = (sourceMap[t.sourceType] || 0) + t.amountCents
  }
  const bySource = Object.entries(sourceMap)
    .map(([source, totalCents]) => ({ source, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents)

  const catMap: Record<string, { totalCents: number; subs: Record<string, number> }> = {}
  for (const t of transactions) {
    if (t.transactionType === 'receivable') continue
    const cat = t.category || 'Outros'
    if (!catMap[cat]) catMap[cat] = { totalCents: 0, subs: {} }
    catMap[cat].totalCents += t.amountCents
    if (t.subcategory) {
      catMap[cat].subs[t.subcategory] = (catMap[cat].subs[t.subcategory] || 0) + t.amountCents
    }
  }
  const byCategory = Object.entries(catMap)
    .map(([category, data]) => ({
      category,
      totalCents: data.totalCents,
      subcategories: Object.entries(data.subs)
        .map(([subcategory, totalCents]) => ({ subcategory, totalCents }))
        .sort((a, b) => b.totalCents - a.totalCents),
    }))
    .sort((a, b) => b.totalCents - a.totalCents)

  const debtorMap: Record<string, number> = {}
  for (const t of transactions) {
    if (t.transactionType === 'receivable' && t.debtorName) {
      debtorMap[t.debtorName] = (debtorMap[t.debtorName] || 0) + t.amountCents
    }
  }
  const byDebtor = Object.entries(debtorMap)
    .map(([debtorName, totalCents]) => ({ debtorName, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents)

  const monthlyTrend = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, mon - 1 - i, 1)
    const tStart = new Date(d.getFullYear(), d.getMonth(), 1)
    const tEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
    const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    const mTxs = await prisma.transaction.findMany({
      where: {
        userId,
        status: 'approved',
        date: { gte: tStart, lte: tEnd },
        isCredit: false,
      },
      select: { amountCents: true, transactionType: true },
    })

    monthlyTrend.push({
      month: mStr,
      totalCents: mTxs.filter((t) => t.transactionType !== 'receivable').reduce((s, t) => s + t.amountCents, 0),
      receivableCents: mTxs.filter((t) => t.transactionType === 'receivable').reduce((s, t) => s + t.amountCents, 0),
    })
  }

  return {
    month,
    totalExpenseCents,
    totalReceivableCents,
    bySource,
    byCategory,
    byDebtor,
    monthlyTrend,
    transactions: transactions.map((t) => ({
      id: t.id,
      date: t.date.toISOString().split('T')[0],
      description: t.description,
      amountCents: t.amountCents,
      isCredit: t.isCredit,
      isCharge: t.isCharge,
      installmentCurrent: t.installmentCurrent,
      installmentTotal: t.installmentTotal,
      currencyOriginal: t.currencyOriginal,
      amountOriginalCents: t.amountOriginalCents,
      sourceType: t.sourceType,
      status: t.status,
      transactionType: t.transactionType,
      debtorName: t.debtorName,
      category: t.category,
      subcategory: t.subcategory,
      notes: t.notes,
      isEssential: t.isEssential,
      importSessionId: t.importSessionId,
    })),
  }
}
