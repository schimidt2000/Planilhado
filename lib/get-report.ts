import { prisma } from '@/lib/db'
import { BUDGET_GROUPS, getBudgetGroup } from '@/lib/categories'
import type { MonthlyReport } from '@/lib/types'
import { buildWhatsAppUrl } from './whatsapp'

export async function getMonthlyReport(userId: string, month: string): Promise<MonthlyReport | null> {
  const [year, mon] = month.split('-').map(Number)
  if (!year || !mon) return null

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      status: 'approved',
      isCredit: false,
      importSession: { month },
    },
    orderBy: { date: 'asc' },
    include: {
      debtor: { select: { id: true, name: true } },
      splits: {
        include: { debtor: { select: { id: true, name: true } } },
      },
    },
  })

  const receivableFor = (t: (typeof transactions)[number]) => {
    const splitTotal = t.splits.reduce((sum, split) => sum + split.amountCents, 0)
    if (splitTotal > 0) return Math.min(splitTotal, t.amountCents)
    return t.transactionType === 'receivable' ? t.amountCents : 0
  }

  const ownExpenseFor = (t: (typeof transactions)[number]) => {
    if (t.transactionType === 'receivable' && t.splits.length === 0) return 0
    return Math.max(0, t.amountCents - receivableFor(t))
  }

  const totalExpenseCents = transactions.reduce((sum, t) => sum + ownExpenseFor(t), 0)

  const totalReceivableGrossCents = transactions.reduce((sum, t) => sum + receivableFor(t), 0)

  const sourceMap: Record<string, number> = {}
  for (const t of transactions) {
    const ownExpense = ownExpenseFor(t)
    if (ownExpense === 0) continue
    sourceMap[t.sourceType] = (sourceMap[t.sourceType] || 0) + ownExpense
  }
  const bySource = Object.entries(sourceMap)
    .map(([source, totalCents]) => ({ source, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents)

  const catMap: Record<string, { totalCents: number; subs: Record<string, number> }> = {}
  for (const t of transactions) {
    const ownExpense = ownExpenseFor(t)
    if (ownExpense === 0) continue
    const cat = t.category || 'Outros'
    if (!catMap[cat]) catMap[cat] = { totalCents: 0, subs: {} }
    catMap[cat].totalCents += ownExpense
    if (t.subcategory) {
      catMap[cat].subs[t.subcategory] = (catMap[cat].subs[t.subcategory] || 0) + ownExpense
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

  const groupMap: Record<string, number> = {}
  for (const t of transactions) {
    const ownExpense = ownExpenseFor(t)
    if (ownExpense === 0) continue
    const group = getBudgetGroup(t.category || 'Outros')
    groupMap[group] = (groupMap[group] || 0) + ownExpense
  }

  const byBudgetGroup = Object.entries(BUDGET_GROUPS).map(([group, meta]) => {
    const totalCents = groupMap[group] || 0
    return {
      group: group as 'needs' | 'wants' | 'savings',
      label: meta.label,
      targetPercent: meta.targetPercent,
      totalCents,
      actualPercent: totalExpenseCents > 0 ? Math.round((totalCents / totalExpenseCents) * 100) : 0,
    }
  })

  const debtorMap = new Map<string, { debtorId: string | null; debtorName: string; owedCents: number }>()
  const addDebtorAmount = (debtorId: string | null | undefined, debtorName: string | null | undefined, amountCents: number) => {
    const name = debtorName?.trim()
    if (!name || amountCents <= 0) return
    const key = debtorId ? `id:${debtorId}` : `name:${name.toLowerCase()}`
    const current = debtorMap.get(key)
    debtorMap.set(key, {
      debtorId: debtorId ?? current?.debtorId ?? null,
      debtorName: current?.debtorName ?? name,
      owedCents: (current?.owedCents ?? 0) + amountCents,
    })
  }

  for (const t of transactions) {
    if (t.splits.length > 0) {
      for (const split of t.splits) {
        addDebtorAmount(split.debtorId, split.debtor?.name ?? split.debtorName, split.amountCents)
      }
    } else if (t.transactionType === 'receivable') {
      addDebtorAmount(t.debtorId, t.debtor?.name ?? t.debtorName, t.amountCents)
    }
  }
  const debtors = await prisma.debtor.findMany({
    where: { userId },
    select: { id: true, name: true, whatsapp: true },
  })
  const payments = await prisma.debtorPayment.groupBy({
    by: ['debtorId'],
    where: { userId, month },
    _sum: { amountCents: true },
  })
  const paidByDebtorId = new Map(payments.map((payment) => [payment.debtorId, payment._sum.amountCents ?? 0]))
  const debtorContactsById = new Map(debtors.map((debtor) => [debtor.id, debtor]))
  const debtorContactsByName = new Map(debtors.map((debtor) => [debtor.name.toLowerCase(), debtor]))

  const byDebtor = Array.from(debtorMap.values())
    .map(({ debtorId, debtorName, owedCents }) => {
      const contact = debtorId ? debtorContactsById.get(debtorId) : debtorContactsByName.get(debtorName.toLowerCase())
      const paidCents = contact ? paidByDebtorId.get(contact.id) ?? 0 : 0
      const totalCents = Math.max(0, owedCents - paidCents)
      const displayName = contact?.name ?? debtorName
      const whatsapp = contact?.whatsapp ?? null
      const message = `Oi, ${displayName}! Fechando as contas aqui: o saldo ficou em ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCents / 100)} referente a ${month}.`
      return {
        debtorId: contact?.id ?? null,
        debtorName: displayName,
        totalCents,
        owedCents,
        paidCents,
        whatsapp,
        whatsappUrl: buildWhatsAppUrl(whatsapp, message),
      }
    })
    .sort((a, b) => b.totalCents - a.totalCents)
  const totalPaidCents = byDebtor.reduce((sum, debtor) => sum + Math.min(debtor.paidCents, debtor.owedCents), 0)
  const totalReceivableCents = Math.max(0, totalReceivableGrossCents - totalPaidCents)

  const monthlyTrend = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, mon - 1 - i, 1)
    const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    const mTxs = await prisma.transaction.findMany({
      where: {
        userId,
        status: 'approved',
        isCredit: false,
        importSession: { month: mStr },
      },
      select: { amountCents: true, transactionType: true, splits: { select: { amountCents: true } } },
    })

    monthlyTrend.push({
      month: mStr,
      totalCents: mTxs.reduce((s, t) => {
        const splitTotal = t.splits.reduce((sum, split) => sum + split.amountCents, 0)
        const receivable = splitTotal > 0 ? Math.min(splitTotal, t.amountCents) : t.transactionType === 'receivable' ? t.amountCents : 0
        return s + Math.max(0, t.amountCents - receivable)
      }, 0),
      receivableCents: mTxs.reduce((s, t) => {
        const splitTotal = t.splits.reduce((sum, split) => sum + split.amountCents, 0)
        return s + (splitTotal > 0 ? Math.min(splitTotal, t.amountCents) : t.transactionType === 'receivable' ? t.amountCents : 0)
      }, 0),
    })
  }

  return {
    month,
    totalExpenseCents,
    totalReceivableCents,
    totalReceivableGrossCents,
    totalPaidCents,
    bySource,
    byCategory,
    byBudgetGroup,
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
      cardLastFour: t.cardLastFour,
      status: t.status,
      transactionType: t.transactionType,
      debtorId: t.debtorId,
      debtorName: t.debtor?.name ?? t.debtorName,
      splitMode: (t.splitMode as 'none' | 'equal' | 'custom') ?? 'none',
      splits: t.splits.map((split) => ({
        debtorId: split.debtorId,
        debtorName: split.debtor?.name ?? split.debtorName,
        amountCents: split.amountCents,
      })),
      category: t.category,
      subcategory: t.subcategory,
      notes: t.notes,
      isEssential: t.isEssential,
      importSessionId: t.importSessionId,
    })),
  }
}
