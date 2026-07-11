import type {
  SplitMode,
  TransactionReview,
  TransactionSplitInput,
  TransactionStatus,
  TransactionType,
  TransactionWithMeta,
} from '@/lib/types'

export type ReviewSortMode = 'date-asc' | 'date-desc' | 'amount-desc' | 'amount-asc' | 'source'

export interface ReviewUpdatePayload extends TransactionReview {
  id: string
}

export interface ChargeGroups {
  groupedChargeIds: Set<string>
  linkedChargesByParentId: Map<string, TransactionWithMeta[]>
}

const GROUPABLE_IOF_BLOCKLIST = /\b(rotativo|financiamento|mora|multa|juros|atraso)\b/i

function dateValue(date: string): number {
  const value = new Date(`${date}T12:00:00.000Z`).getTime()
  return Number.isFinite(value) ? value : 0
}

function daysBetween(a: string, b: string): number {
  const day = 24 * 60 * 60 * 1000
  return Math.round((dateValue(a) - dateValue(b)) / day)
}

function normalizeTransactionType(value: string | null | undefined): TransactionType | null {
  return value === 'expense' || value === 'receivable' ? value : null
}

function normalizeSplitMode(value: string | null | undefined): SplitMode {
  return value === 'equal' || value === 'custom' ? value : 'none'
}

export function isGroupableIofCharge(transaction: Pick<TransactionWithMeta, 'description' | 'isCharge'>): boolean {
  const description = transaction.description.toLowerCase()
  return description.includes('iof') && !GROUPABLE_IOF_BLOCKLIST.test(description)
}

function canBeChargeParent(charge: TransactionWithMeta, candidate: TransactionWithMeta): boolean {
  if (candidate.id === charge.id || candidate.isCredit || candidate.isCharge) return false
  if (candidate.sourceType !== charge.sourceType) return false
  if (charge.cardLastFour && candidate.cardLastFour && charge.cardLastFour !== candidate.cardLastFour) return false
  return Math.abs(daysBetween(candidate.date, charge.date)) <= 5
}

function chargeParentScore(charge: TransactionWithMeta, candidate: TransactionWithMeta): number {
  const dayDiff = daysBetween(candidate.date, charge.date)
  const absDiff = Math.abs(dayDiff)
  let score = absDiff * 10
  if (dayDiff > 0) score += 20
  if (charge.cardLastFour && candidate.cardLastFour === charge.cardLastFour) score -= 5
  if (candidate.amountCents < charge.amountCents) score += 15
  return score
}

export function buildChargeGroups(transactions: TransactionWithMeta[]): ChargeGroups {
  const groupedChargeIds = new Set<string>()
  const linkedChargesByParentId = new Map<string, TransactionWithMeta[]>()
  const parents = transactions.filter((transaction) => !transaction.isCharge && !transaction.isCredit)

  for (const charge of transactions) {
    if (!isGroupableIofCharge(charge)) continue

    const parent = parents
      .filter((candidate) => canBeChargeParent(charge, candidate))
      .sort((a, b) => chargeParentScore(charge, a) - chargeParentScore(charge, b))[0]

    if (!parent) continue

    groupedChargeIds.add(charge.id)
    const linked = linkedChargesByParentId.get(parent.id) ?? []
    linked.push(charge)
    linked.sort((a, b) => dateValue(a.date) - dateValue(b.date))
    linkedChargesByParentId.set(parent.id, linked)
  }

  return { groupedChargeIds, linkedChargesByParentId }
}

export function compareReviewTransactions(sortMode: ReviewSortMode, a: TransactionWithMeta, b: TransactionWithMeta): number {
  if (sortMode === 'date-desc') return dateValue(b.date) - dateValue(a.date)
  if (sortMode === 'amount-desc') return b.amountCents - a.amountCents
  if (sortMode === 'amount-asc') return a.amountCents - b.amountCents
  if (sortMode === 'source') {
    const source = a.sourceType.localeCompare(b.sourceType, 'pt-BR')
    if (source !== 0) return source
  }
  return dateValue(a.date) - dateValue(b.date)
}

export function buildReviewUpdate(transaction: TransactionWithMeta, status: TransactionStatus): ReviewUpdatePayload {
  return {
    id: transaction.id,
    status,
    transactionType: normalizeTransactionType(transaction.transactionType),
    debtorId: transaction.debtorId,
    debtorName: transaction.debtorName,
    splitMode: normalizeSplitMode(transaction.splitMode),
    splits: transaction.splits ?? [],
    category: transaction.category,
    subcategory: transaction.subcategory,
    notes: transaction.notes,
    isEssential: transaction.isEssential,
    installmentCurrent: transaction.installmentCurrent,
    installmentTotal: transaction.installmentTotal,
  }
}

export function scaleSplitsForLinkedCharge(
  parentSplits: TransactionSplitInput[] | null | undefined,
  parentAmountCents: number,
  chargeAmountCents: number
): TransactionSplitInput[] {
  const positiveSplits = (parentSplits ?? []).filter((split) => Math.round(Number(split.amountCents) || 0) > 0)
  if (positiveSplits.length === 0 || parentAmountCents <= 0 || chargeAmountCents <= 0) return []

  const scaled = positiveSplits.map((split) => ({
    debtorId: split.debtorId,
    debtorName: split.debtorName,
    amountCents: Math.max(0, Math.round((chargeAmountCents * split.amountCents) / parentAmountCents)),
  }))

  let total = scaled.reduce((sum, split) => sum + split.amountCents, 0)
  for (let index = scaled.length - 1; total > chargeAmountCents && index >= 0; index -= 1) {
    const reduction = Math.min(scaled[index].amountCents, total - chargeAmountCents)
    scaled[index].amountCents -= reduction
    total -= reduction
  }

  return scaled.filter((split) => split.amountCents > 0)
}

export function buildLinkedChargeUpdate(
  parent: TransactionWithMeta,
  charge: TransactionWithMeta,
  status: TransactionStatus
): ReviewUpdatePayload {
  const transactionType = normalizeTransactionType(parent.transactionType) ?? 'expense'
  const scaledSplits = scaleSplitsForLinkedCharge(parent.splits, parent.amountCents, charge.amountCents)
  const hasSplits = scaledSplits.length > 0
  const parentSplitMode = normalizeSplitMode(parent.splitMode)

  return {
    id: charge.id,
    status,
    transactionType,
    debtorId: !hasSplits && transactionType === 'receivable' ? parent.debtorId : null,
    debtorName: !hasSplits && transactionType === 'receivable' ? parent.debtorName : null,
    splitMode: hasSplits ? (parentSplitMode === 'none' ? 'custom' : parentSplitMode) : 'none',
    splits: hasSplits ? scaledSplits : [],
    category: parent.category ?? charge.category,
    subcategory: parent.subcategory ?? charge.subcategory,
    notes: charge.notes ?? parent.notes,
    isEssential: parent.isEssential ?? charge.isEssential,
    installmentCurrent: charge.installmentCurrent,
    installmentTotal: charge.installmentTotal,
  }
}
