import { describe, expect, it } from 'vitest'
import {
  buildChargeGroups,
  buildLinkedChargeUpdate,
  scaleSplitsForLinkedCharge,
} from '../lib/review-queue'
import type { TransactionWithMeta } from '../lib/types'

function tx(overrides: Partial<TransactionWithMeta>): TransactionWithMeta {
  return {
    id: 'tx',
    date: '2026-07-10',
    description: 'Compra',
    amountCents: 10000,
    isCredit: false,
    isCharge: false,
    sourceType: 'nubank',
    status: 'pending',
    transactionType: 'expense',
    splitMode: 'none',
    splits: [],
    importSessionId: 'session',
    ...overrides,
  }
}

describe('review queue helpers', () => {
  it('groups IOF charges with the nearest purchase from the same card', () => {
    const parent = tx({ id: 'parent', date: '2026-07-10', cardLastFour: '1234' })
    const otherCard = tx({ id: 'other-card', date: '2026-07-10', cardLastFour: '9999' })
    const iof = tx({
      id: 'iof',
      date: '2026-07-11',
      description: 'IOF de compra internacional',
      amountCents: 120,
      isCharge: true,
      cardLastFour: '1234',
    })

    const groups = buildChargeGroups([otherCard, parent, iof])

    expect(groups.groupedChargeIds.has('iof')).toBe(true)
    expect(groups.linkedChargesByParentId.get('parent')?.map((item) => item.id)).toEqual(['iof'])
    expect(groups.linkedChargesByParentId.has('other-card')).toBe(false)
  })

  it('keeps revolving IOF visible instead of attaching it to a purchase', () => {
    const parent = tx({ id: 'parent' })
    const revolvingIof = tx({
      id: 'revolving-iof',
      description: 'IOF diario rotativo',
      isCharge: true,
      amountCents: 80,
    })

    const groups = buildChargeGroups([parent, revolvingIof])

    expect(groups.groupedChargeIds.has('revolving-iof')).toBe(false)
  })

  it('scales charge splits proportionally to the original purchase split', () => {
    const splits = scaleSplitsForLinkedCharge([
      { debtorId: 'debtor-1', debtorName: 'Erika', amountCents: 6000 },
      { debtorId: 'debtor-2', debtorName: 'Joao', amountCents: 2000 },
    ], 10000, 500)

    expect(splits).toEqual([
      { debtorId: 'debtor-1', debtorName: 'Erika', amountCents: 300 },
      { debtorId: 'debtor-2', debtorName: 'Joao', amountCents: 100 },
    ])
  })

  it('builds a linked IOF update with the parent allocation', () => {
    const parent = tx({
      id: 'parent',
      transactionType: 'receivable',
      splitMode: 'custom',
      splits: [
        { debtorId: 'debtor-1', debtorName: 'Erika', amountCents: 5000 },
      ],
      category: 'Lazer',
    })
    const iof = tx({
      id: 'iof',
      description: 'IOF',
      isCharge: true,
      amountCents: 400,
    })

    expect(buildLinkedChargeUpdate(parent, iof, 'approved')).toMatchObject({
      id: 'iof',
      status: 'approved',
      transactionType: 'receivable',
      splitMode: 'custom',
      category: 'Lazer',
      splits: [
        { debtorId: 'debtor-1', debtorName: 'Erika', amountCents: 200 },
      ],
    })
  })
})
