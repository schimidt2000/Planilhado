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

export interface RefundGroups {
  groupedRefundIds: Set<string>
  linkedRefundsByParentId: Map<string, TransactionWithMeta[]>
  refundedCentsByParentId: Map<string, number>
}

const GROUPABLE_IOF_BLOCKLIST = /\b(rotativo|financiamento|mora|multa|juros|atraso)\b/i
const REFUND_BLOCKLIST = /\b(pagamento\s+de\s+fatura|pagamento\s+fatura|pagamento\s+recebido)\b/i

function normalizeDescription(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function iofReferenceDescription(description: string): string | null {
  const normalized = description.trim()
  const quoted = normalized.match(/\biof\s+(?:de|do|da)\s+["“”](.+?)["“”]/i)
  if (quoted?.[1]) return normalizeDescription(quoted[1])

  const unquoted = normalized.match(/\biof\s+(?:de|do|da)\s+(.+)$/i)
  if (unquoted?.[1]) return normalizeDescription(unquoted[1])

  return null
}

function refundReferenceDescription(description: string): string | null {
  const normalized = description.trim()
  const quoted = normalized.match(/\b(?:estorno|reembolso|refund|devolu[cç][aã]o|cancelamento)\s+(?:de|do|da)?\s*["“”](.+?)["“”]/i)
  if (quoted?.[1]) return normalizeDescription(quoted[1])

  const unquoted = normalized.match(/\b(?:estorno|reembolso|refund|devolu[cç][aã]o|cancelamento)\s+(?:de|do|da)?\s+(.+)$/i)
  if (unquoted?.[1]) return normalizeDescription(unquoted[1])

  return null
}

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

export function isRefundCredit(transaction: Pick<TransactionWithMeta, 'description' | 'isCredit'>): boolean {
  if (!transaction.isCredit) return false
  return !REFUND_BLOCKLIST.test(normalizeDescription(transaction.description))
}

function canBeChargeParent(charge: TransactionWithMeta, candidate: TransactionWithMeta): boolean {
  if (candidate.id === charge.id || candidate.isCredit || candidate.isCharge) return false
  if (candidate.sourceType !== charge.sourceType) return false
  if (charge.cardLastFour && candidate.cardLastFour && charge.cardLastFour !== candidate.cardLastFour) return false

  const reference = iofReferenceDescription(charge.description)
  if (reference) {
    const candidateDescription = normalizeDescription(candidate.description)
    if (!candidateDescription.includes(reference) && !reference.includes(candidateDescription)) return false
  }

  return Math.abs(daysBetween(candidate.date, charge.date)) <= 5
}

function chargeParentScore(charge: TransactionWithMeta, candidate: TransactionWithMeta): number {
  const dayDiff = daysBetween(candidate.date, charge.date)
  const absDiff = Math.abs(dayDiff)
  let score = absDiff * 10
  if (dayDiff > 0) score += 20
  if (charge.cardLastFour && candidate.cardLastFour === charge.cardLastFour) score -= 5
  if (candidate.amountCents < charge.amountCents) score += 15

  const reference = iofReferenceDescription(charge.description)
  if (reference) {
    const candidateDescription = normalizeDescription(candidate.description)
    if (candidateDescription === reference) score -= 50
    else if (candidateDescription.includes(reference) || reference.includes(candidateDescription)) score -= 35
  }

  return score
}

function chargeDistributionKey(charge: TransactionWithMeta): string {
  return [
    charge.sourceType,
    charge.cardLastFour ?? '',
    charge.date,
    iofReferenceDescription(charge.description) ?? normalizeDescription(charge.description),
  ].join('|')
}

export function buildChargeGroups(transactions: TransactionWithMeta[]): ChargeGroups {
  const groupedChargeIds = new Set<string>()
  const linkedChargesByParentId = new Map<string, TransactionWithMeta[]>()
  const parents = transactions
    .filter((transaction) => !transaction.isCharge && !transaction.isCredit)
    .sort((a, b) => dateValue(a.date) - dateValue(b.date) || a.description.localeCompare(b.description, 'pt-BR') || a.id.localeCompare(b.id))
  const assignmentCounts = new Map<string, Map<string, number>>()
  const charges = transactions
    .filter((transaction) => isGroupableIofCharge(transaction))
    .sort((a, b) => dateValue(a.date) - dateValue(b.date) || a.description.localeCompare(b.description, 'pt-BR') || a.amountCents - b.amountCents || a.id.localeCompare(b.id))

  for (const charge of charges) {
    const distributionKey = chargeDistributionKey(charge)
    const countsForGroup = assignmentCounts.get(distributionKey) ?? new Map<string, number>()
    assignmentCounts.set(distributionKey, countsForGroup)

    const candidates = parents
      .filter((candidate) => canBeChargeParent(charge, candidate))
      .map((candidate) => ({
        candidate,
        score: chargeParentScore(charge, candidate),
        assignedCount: countsForGroup.get(candidate.id) ?? 0,
      }))
      .sort((a, b) => a.score - b.score || a.assignedCount - b.assignedCount || dateValue(a.candidate.date) - dateValue(b.candidate.date) || a.candidate.id.localeCompare(b.candidate.id))

    const bestScore = candidates[0]?.score
    const parent = candidates
      .filter((item) => bestScore !== undefined && item.score <= bestScore + 5)
      .sort((a, b) => a.assignedCount - b.assignedCount || a.score - b.score || dateValue(a.candidate.date) - dateValue(b.candidate.date) || a.candidate.id.localeCompare(b.candidate.id))[0]
      ?.candidate
    if (!parent) continue

    countsForGroup.set(parent.id, (countsForGroup.get(parent.id) ?? 0) + 1)
    groupedChargeIds.add(charge.id)
    const linked = linkedChargesByParentId.get(parent.id) ?? []
    linked.push(charge)
    linked.sort((a, b) => dateValue(a.date) - dateValue(b.date))
    linkedChargesByParentId.set(parent.id, linked)
  }

  return { groupedChargeIds, linkedChargesByParentId }
}

function canBeRefundParent(refund: TransactionWithMeta, candidate: TransactionWithMeta): boolean {
  if (candidate.id === refund.id || candidate.isCredit) return false
  if (candidate.sourceType !== refund.sourceType) return false
  if (refund.cardLastFour && candidate.cardLastFour && refund.cardLastFour !== candidate.cardLastFour) return false
  if (refund.amountCents > candidate.amountCents) return false

  const reference = refundReferenceDescription(refund.description)
  const candidateDescription = normalizeDescription(candidate.description)
  if (reference && !candidateDescription.includes(reference) && !reference.includes(candidateDescription)) return false

  const sameAmount = refund.amountCents === candidate.amountCents
  const similarDescription = candidateDescription === normalizeDescription(refund.description) ||
    normalizeDescription(refund.description).includes(candidateDescription) ||
    candidateDescription.includes(normalizeDescription(refund.description)) ||
    Boolean(reference)

  return Math.abs(daysBetween(candidate.date, refund.date)) <= 45 && (sameAmount || similarDescription)
}

function refundParentScore(refund: TransactionWithMeta, candidate: TransactionWithMeta): number {
  const dayDiff = Math.abs(daysBetween(candidate.date, refund.date))
  let score = dayDiff * 2
  if (refund.cardLastFour && candidate.cardLastFour === refund.cardLastFour) score -= 5
  if (refund.amountCents === candidate.amountCents) score -= 25
  if (candidate.amountCents < refund.amountCents) score += 100

  const reference = refundReferenceDescription(refund.description)
  if (reference) {
    const candidateDescription = normalizeDescription(candidate.description)
    if (candidateDescription === reference) score -= 60
    else if (candidateDescription.includes(reference) || reference.includes(candidateDescription)) score -= 45
  }

  return score
}

function refundDistributionKey(refund: TransactionWithMeta): string {
  return [
    refund.sourceType,
    refund.cardLastFour ?? '',
    refund.date,
    refund.amountCents,
    refundReferenceDescription(refund.description) ?? normalizeDescription(refund.description),
  ].join('|')
}

export function buildRefundGroups(transactions: TransactionWithMeta[]): RefundGroups {
  const groupedRefundIds = new Set<string>()
  const linkedRefundsByParentId = new Map<string, TransactionWithMeta[]>()
  const refundedCentsByParentId = new Map<string, number>()
  const assignmentCounts = new Map<string, Map<string, number>>()
  const remainingByParentId = new Map<string, number>()
  const parents = transactions
    .filter((transaction) => !transaction.isCredit)
    .sort((a, b) => dateValue(a.date) - dateValue(b.date) || a.description.localeCompare(b.description, 'pt-BR') || a.id.localeCompare(b.id))
  for (const parent of parents) remainingByParentId.set(parent.id, parent.amountCents)

  const refunds = transactions
    .filter((transaction) => isRefundCredit(transaction))
    .sort((a, b) => dateValue(a.date) - dateValue(b.date) || a.description.localeCompare(b.description, 'pt-BR') || a.amountCents - b.amountCents || a.id.localeCompare(b.id))

  for (const refund of refunds) {
    const distributionKey = refundDistributionKey(refund)
    const countsForGroup = assignmentCounts.get(distributionKey) ?? new Map<string, number>()
    assignmentCounts.set(distributionKey, countsForGroup)

    const candidates = parents
      .filter((candidate) => (remainingByParentId.get(candidate.id) ?? 0) > 0)
      .filter((candidate) => refund.amountCents <= (remainingByParentId.get(candidate.id) ?? 0))
      .filter((candidate) => canBeRefundParent(refund, candidate))
      .map((candidate) => ({
        candidate,
        score: refundParentScore(refund, candidate),
        assignedCount: countsForGroup.get(candidate.id) ?? 0,
      }))
      .sort((a, b) => a.score - b.score || a.assignedCount - b.assignedCount || dateValue(a.candidate.date) - dateValue(b.candidate.date) || a.candidate.id.localeCompare(b.candidate.id))

    const bestScore = candidates[0]?.score
    const parent = candidates
      .filter((item) => bestScore !== undefined && item.score <= bestScore + 5)
      .sort((a, b) => a.assignedCount - b.assignedCount || a.score - b.score || dateValue(a.candidate.date) - dateValue(b.candidate.date) || a.candidate.id.localeCompare(b.candidate.id))[0]
      ?.candidate
    if (!parent) continue

    countsForGroup.set(parent.id, (countsForGroup.get(parent.id) ?? 0) + 1)
    groupedRefundIds.add(refund.id)
    remainingByParentId.set(parent.id, Math.max(0, (remainingByParentId.get(parent.id) ?? parent.amountCents) - refund.amountCents))
    refundedCentsByParentId.set(parent.id, (refundedCentsByParentId.get(parent.id) ?? 0) + refund.amountCents)

    const linked = linkedRefundsByParentId.get(parent.id) ?? []
    linked.push(refund)
    linked.sort((a, b) => dateValue(a.date) - dateValue(b.date))
    linkedRefundsByParentId.set(parent.id, linked)
  }

  return { groupedRefundIds, linkedRefundsByParentId, refundedCentsByParentId }
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

export function buildLinkedRefundUpdate(
  parent: TransactionWithMeta,
  refund: TransactionWithMeta,
  status: TransactionStatus
): ReviewUpdatePayload {
  return {
    id: refund.id,
    status,
    transactionType: 'expense',
    debtorId: null,
    debtorName: null,
    splitMode: 'none',
    splits: [],
    category: parent.category ?? refund.category,
    subcategory: parent.subcategory ?? refund.subcategory,
    notes: refund.notes ?? parent.notes,
    isEssential: refund.isEssential,
    installmentCurrent: refund.installmentCurrent,
    installmentTotal: refund.installmentTotal,
  }
}
