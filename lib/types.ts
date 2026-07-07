export type ImportSource = 'nubank' | 'inter' | 'picpay' | 'pix'
export type InputType = 'fatura' | 'extrato'
export type TransactionStatus = 'pending' | 'approved' | 'rejected'
export type TransactionType = 'expense' | 'receivable'

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
}

export interface ParseResult {
  source: ImportSource
  month: string
  transactions: ParsedTransaction[]
}

export interface TransactionReview {
  status?: TransactionStatus
  transactionType?: TransactionType | null
  debtorName?: string | null
  category?: string | null
  subcategory?: string | null
  notes?: string | null
  isEssential?: boolean | null
  installmentCurrent?: number | null
  installmentTotal?: number | null
}

export interface SuggestionResult {
  category?: string
  subcategory?: string
  debtorName?: string
  transactionType?: TransactionType
  confidence: 'high' | 'medium' | 'low'
}

export interface MonthlyReport {
  month: string
  totalExpenseCents: number
  totalReceivableCents: number
  bySource: { source: string; totalCents: number }[]
  byCategory: { category: string; totalCents: number; subcategories: { subcategory: string; totalCents: number }[] }[]
  byDebtor: { debtorName: string; totalCents: number }[]
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
  status: string
  transactionType?: string | null
  debtorName?: string | null
  category?: string | null
  subcategory?: string | null
  notes?: string | null
  isEssential?: boolean | null
  importSessionId: string
}
