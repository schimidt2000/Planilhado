import type { SplitMode, TransactionSplitInput, TransactionType } from '@/lib/types'

export function splitTotalCents(splits: TransactionSplitInput[] | null | undefined): number {
  return (splits ?? []).reduce((sum, split) => sum + Math.max(0, Math.round(Number(split.amountCents) || 0)), 0)
}

export function hasDebtorReference(input: { debtorId?: string | null; debtorName?: string | null }): boolean {
  return Boolean(input.debtorId || input.debtorName?.trim())
}

export function validateTransactionDecision(input: {
  amountCents: number
  transactionType?: TransactionType | string | null
  debtorId?: string | null
  debtorName?: string | null
  splitMode?: SplitMode | string | null
  splits?: TransactionSplitInput[] | null
}): string | null {
  if (input.transactionType === 'receivable' && !hasDebtorReference(input)) {
    return 'Escolha um devedor antes de aprovar este gasto'
  }

  if (input.splitMode && input.splitMode !== 'none') {
    const total = splitTotalCents(input.splits)
    if (total > input.amountCents) {
      return 'O rateio não pode ser maior que o valor da compra'
    }
  }

  return null
}

export function remainingBalanceCents(owedCents: number, paidCents: number): number {
  return Math.max(0, owedCents - paidCents)
}

export function validatePaymentAmount(input: {
  amountCents: number
  balanceCents: number
}): string | null {
  if (input.amountCents <= 0) return 'Informe um valor maior que zero'
  if (input.amountCents > input.balanceCents) {
    return 'O pagamento não pode ser maior que o saldo em aberto'
  }
  return null
}
