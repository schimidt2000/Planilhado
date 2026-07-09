export type ImportSource = 'nubank' | 'inter' | 'picpay' | 'pix' | 'manual'
export type InputType = 'fatura' | 'extrato' | 'manual'
export type TransactionStatus = 'pending' | 'approved' | 'rejected'
export type TransactionType = 'expense' | 'receivable'
export type BudgetGroup = 'needs' | 'wants' | 'savings'
export type SplitMode = 'none' | 'equal' | 'custom'

export interface Debtor {
  id: string
  name: string
  whatsapp?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface ParsedTransaction {
  date: string
  description: string
  amountCents: number
  isCredit: boolean
  isCharge?: boolean
  installmentCurrent?: number | null
  installmentTotal?: number | null
  currencyOriginal?: string | null
  amountOriginalCents?: number | null
  rawLine?: string | null
  externalIdentifier?: string | null
  cardLastFour?: string | null
  assignedDebtorId?: string | null
  assignedDebtorName?: string | null
}

export interface ParseResult {
  source: ImportSource
  month: string
  transactions: ParsedTransaction[]
}

export interface TransactionReview {
  status?: TransactionStatus
  transactionType?: TransactionType | null
  debtorId?: string | null
  debtorName?: string | null
  splitMode?: SplitMode
  splits?: TransactionSplitInput[]
  category?: string | null
  subcategory?: string | null
  notes?: string | null
  isEssential?: boolean | null
  installmentCurrent?: number | null
  installmentTotal?: number | null
}

export interface TransactionSplitInput {
  debtorId?: string | null
  debtorName: string
  amountCents: number
}

export interface SuggestionResult {
  category?: string
  subcategory?: string
  debtorId?: string | null
  debtorName?: string
  transactionType?: TransactionType
  confidence: 'high' | 'medium' | 'low'
}

export interface MonthlyReport {
  month: string
  totalExpenseCents: number
  totalReceivableCents: number
  totalReceivableGrossCents: number
  totalPaidCents: number
  bySource: { source: string; totalCents: number }[]
  byCategory: { category: string; totalCents: number; subcategories: { subcategory: string; totalCents: number }[] }[]
  byBudgetGroup: { group: BudgetGroup; label: string; targetPercent: number; totalCents: number; actualPercent: number }[]
  byDebtor: {
    debtorId?: string | null
    debtorName: string
    totalCents: number
    owedCents: number
    paidCents: number
    whatsapp?: string | null
    whatsappUrl?: string | null
  }[]
  monthlyTrend: { month: string; totalCents: number; receivableCents: number }[]
  transactions: TransactionWithMeta[]
}

export interface TransactionWithMeta {
  id: string
  date: string
  description: string
  amountCents: number
  isCredit: boolean
  isCharge: boolean
  installmentCurrent?: number | null
  installmentTotal?: number | null
  currencyOriginal?: string | null
  amountOriginalCents?: number | null
  sourceType: string
  cardLastFour?: string | null
  status: string
  transactionType?: string | null
  debtorId?: string | null
  debtorName?: string | null
  splitMode: SplitMode
  splits: TransactionSplitInput[]
  category?: string | null
  subcategory?: string | null
  notes?: string | null
  isEssential?: boolean | null
  importSessionId: string
  origin?: string
  reconciledAt?: string | null
}

export type ReconciliationAction = 'new' | 'complete' | 'duplicate'

export interface ImportPreviewItem extends ParsedTransaction {
  key: string
  action: ReconciliationAction
  matchedTransactionId?: string
  matchedDescription?: string
}
