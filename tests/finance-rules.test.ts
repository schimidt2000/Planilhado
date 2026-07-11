import { describe, expect, it } from 'vitest'
import {
  remainingBalanceCents,
  splitTotalCents,
  validatePaymentAmount,
  validateTransactionDecision,
} from '../lib/finance-rules'

describe('finance rules', () => {
  it('sums only positive split amounts', () => {
    expect(splitTotalCents([
      { debtorId: 'debtor-1', debtorName: 'Erika', amountCents: 1200 },
      { debtorId: 'debtor-2', debtorName: 'Joao', amountCents: 800 },
      { debtorId: null, debtorName: '', amountCents: -500 },
    ])).toBe(2000)
  })

  it('blocks approving a receivable without debtor', () => {
    expect(validateTransactionDecision({
      amountCents: 5000,
      transactionType: 'receivable',
      splitMode: 'none',
      splits: [],
    })).toBe('Escolha um devedor antes de aprovar este gasto')
  })

  it('blocks split totals above the transaction amount', () => {
    expect(validateTransactionDecision({
      amountCents: 5000,
      transactionType: 'expense',
      splitMode: 'custom',
      splits: [
        { debtorId: 'debtor-1', debtorName: 'Erika', amountCents: 3000 },
        { debtorId: 'debtor-2', debtorName: 'Joao', amountCents: 2500 },
      ],
    })).toBe('O rateio não pode ser maior que o valor da compra')
  })

  it('allows a receivable with a valid split instead of one debtor', () => {
    expect(validateTransactionDecision({
      amountCents: 5000,
      transactionType: 'receivable',
      splitMode: 'custom',
      splits: [
        { debtorId: 'debtor-1', debtorName: 'Erika', amountCents: 2500 },
      ],
    })).toBeNull()
  })

  it('blocks approving a split without positive debtor amounts', () => {
    expect(validateTransactionDecision({
      amountCents: 5000,
      transactionType: 'expense',
      splitMode: 'custom',
      splits: [
        { debtorId: null, debtorName: '', amountCents: 0 },
      ],
    })).toBe('Informe ao menos uma pessoa no rateio')
  })

  it('computes remaining balance without going negative', () => {
    expect(remainingBalanceCents(5000, 1200)).toBe(3800)
    expect(remainingBalanceCents(5000, 6000)).toBe(0)
  })

  it('blocks payments above the open balance', () => {
    expect(validatePaymentAmount({ amountCents: 3000, balanceCents: 2500 }))
      .toBe('O pagamento não pode ser maior que o saldo em aberto')
  })
})
