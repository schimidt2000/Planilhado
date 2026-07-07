import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ok, unauthorized } from '@/lib/api-response'
import type { SuggestionResult } from '@/lib/types'

function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\s*-?\s*parcela\s*\d+\/\d+/gi, '')
    .replace(/\s*parc\s*0?\d+\/0?\d+/gi, '')
    .replace(/\s*\(\s*parcela\s*\d+\s*de\s*\d+\s*\)/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const userId = session.user.id

  const { searchParams } = req.nextUrl
  const description = searchParams.get('description') || ''
  const installmentTotalStr = searchParams.get('installmentTotal')
  const installmentCurrentStr = searchParams.get('installmentCurrent')

  const installmentTotal = installmentTotalStr ? parseInt(installmentTotalStr) : null
  const installmentCurrent = installmentCurrentStr ? parseInt(installmentCurrentStr) : null

  const normalized = normalizeDescription(description)
  if (!normalized) return ok<SuggestionResult>({ confidence: 'low' })

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const past = await prisma.transaction.findMany({
    where: {
      userId,
      status: 'approved',
      date: { gte: sixMonthsAgo },
    },
    select: {
      description: true,
      category: true,
      subcategory: true,
      debtorName: true,
      transactionType: true,
      installmentCurrent: true,
      installmentTotal: true,
      date: true,
    },
    orderBy: { date: 'desc' },
    take: 500,
  })

  const matches = past.filter((t: typeof past[number]) => normalizeDescription(t.description) === normalized)

  if (matches.length === 0) return ok<SuggestionResult>({ confidence: 'low' })

  // Priority 1: installment continuity
  if (installmentTotal && installmentCurrent && installmentCurrent > 1) {
    const prevInstallment = matches.find(
      (t) => t.installmentTotal === installmentTotal && t.installmentCurrent === installmentCurrent - 1
    )
    if (prevInstallment?.debtorName) {
      return ok<SuggestionResult>({
        debtorName: prevInstallment.debtorName,
        transactionType: (prevInstallment.transactionType as 'expense' | 'receivable') ?? undefined,
        category: prevInstallment.category ?? undefined,
        subcategory: prevInstallment.subcategory ?? undefined,
        confidence: 'high',
      })
    }
  }

  // Priority 2: most common debtor
  const debtorCounts: Record<string, number> = {}
  const categoryCounts: Record<string, number> = {}
  const subcategoryCounts: Record<string, number> = {}
  const typeCounts: Record<string, number> = {}

  for (const t of matches) {
    if (t.debtorName) debtorCounts[t.debtorName] = (debtorCounts[t.debtorName] || 0) + 1
    if (t.category) categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1
    if (t.subcategory) subcategoryCounts[t.subcategory] = (subcategoryCounts[t.subcategory] || 0) + 1
    if (t.transactionType) typeCounts[t.transactionType] = (typeCounts[t.transactionType] || 0) + 1
  }

  const topDebtor = Object.entries(debtorCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  const topSubcategory = Object.entries(subcategoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0]

  const suggestion: SuggestionResult = {
    confidence: matches.length >= 3 ? 'high' : 'medium',
    ...(topDebtor && { debtorName: topDebtor }),
    ...(topCategory && { category: topCategory }),
    ...(topSubcategory && { subcategory: topSubcategory }),
    ...(topType && { transactionType: topType as 'expense' | 'receivable' }),
  }

  return ok(suggestion)
}
