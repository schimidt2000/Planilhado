import type { SplitMode, TransactionSplitInput, TransactionType } from '@/lib/types'

export function splitTotalCents(splits: TransactionSplitInput[] | null | undefined): number {
  return (splits ?? []).reduce((sum, split) => sum + Math.max(0, Math.round(Number(split.amountCents) || 0)), 0)
}

export function hasDebtorReference(input: { debtorId?: string | null; debtorName?: string | null }): boolean {
  return Boolean(input.debtorId || input.debtorName?.trim())
}

export function hasPositiveSplitWithoutDebtor(splits: TransactionSplitInput[] | null | undefined): boolean {
  return (splits ?? []).some((split) => {
    const amountCents = Math.max(0, Math.round(Number(split.amountCents) || 0))
    return amountCents > 0 && !hasDebtorReference(split)
  })
}

export function validateTransactionDecision(input: {
  amountCents: number
  transactionType?: TransactionType | string | null
  debtorId?: string | null
  debtorName?: string | null
  splitMode?: SplitMode | string | null
  splits?: TransactionSplitInput[] | null
}): string | null {
  const usesSplits = Boolean(input.splitMode && input.splitMode !== 'none')

  if (usesSplits) {
    const total = splitTotalCents(input.splits)
    if (total <= 0) {
      return 'Informe ao menos uma pessoa no rateio'
    }
    if (hasPositiveSplitWithoutDebtor(input.splits)) {
      return 'Informe o devedor de cada pessoa no rateio'
    }
    if (total > input.amountCents) {
      return 'O rateio não pode ser maior que o valor da compra'
    }
  }

  if (input.transactionType === 'receivable' && !usesSplits && !hasDebtorReference(input)) {
    return 'Escolha um devedor antes de aprovar este gasto'
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
