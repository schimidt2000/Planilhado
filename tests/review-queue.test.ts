import { describe, expect, it } from 'vitest'
import {
  buildChargeGroups,
  buildRefundGroups,
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

  it('distributes repeated IOFs across repeated matching purchases', () => {
    const firstApple = tx({
      id: 'apple-1',
      date: '2026-07-02',
      description: 'Apple.Com/Bill',
      amountCents: 5720,
      cardLastFour: '5978',
    })
    const secondApple = tx({
      id: 'apple-2',
      date: '2026-07-02',
      description: 'Apple.Com/Bill',
      amountCents: 5720,
      cardLastFour: '5978',
    })
    const firstIof = tx({
      id: 'iof-1',
      date: '2026-07-02',
      description: 'IOF de "Apple.Com/Bill"',
      amountCents: 200,
      isCharge: true,
      cardLastFour: '5978',
    })
    const secondIof = tx({
      id: 'iof-2',
      date: '2026-07-02',
      description: 'IOF de "Apple.Com/Bill"',
      amountCents: 200,
      isCharge: true,
      cardLastFour: '5978',
    })

    const groups = buildChargeGroups([firstApple, secondApple, firstIof, secondIof])

    expect(groups.linkedChargesByParentId.get('apple-1')?.map((item) => item.id)).toEqual(['iof-1'])
    expect(groups.linkedChargesByParentId.get('apple-2')?.map((item) => item.id)).toEqual(['iof-2'])
  })

  it('uses the IOF description to avoid linking it to a different purchase', () => {
    const apple = tx({ id: 'apple', date: '2026-07-02', description: 'Apple.Com/Bill', cardLastFour: '5978' })
    const spotify = tx({ id: 'spotify', date: '2026-07-02', description: 'Spotify', cardLastFour: '5978' })
    const iof = tx({
      id: 'iof',
      date: '2026-07-02',
      description: 'IOF de "Apple.Com/Bill"',
      amountCents: 200,
      isCharge: true,
      cardLastFour: '5978',
    })

    const groups = buildChargeGroups([spotify, apple, iof])

    expect(groups.linkedChargesByParentId.get('apple')?.map((item) => item.id)).toEqual(['iof'])
    expect(groups.linkedChargesByParentId.has('spotify')).toBe(false)
  })

  it('links a partial refund to the original purchase', () => {
    const charge = tx({
      id: 'charge',
      date: '2026-07-02',
      description: 'Encargo',
      amountCents: 30000,
      isCharge: true,
      cardLastFour: '1234',
    })
    const refund = tx({
      id: 'refund',
      date: '2026-07-08',
      description: 'Estorno de "Encargo"',
      amountCents: 15000,
      isCredit: true,
      cardLastFour: '1234',
    })

    const groups = buildRefundGroups([charge, refund])

    expect(groups.groupedRefundIds.has('refund')).toBe(true)
    expect(groups.linkedRefundsByParentId.get('charge')?.map((item) => item.id)).toEqual(['refund'])
    expect(groups.refundedCentsByParentId.get('charge')).toBe(15000)
  })

  it('distributes repeated full refunds across repeated matching purchases', () => {
    const firstUber = tx({
      id: 'uber-1',
      date: '2026-07-03',
      description: 'Uber Trip',
      amountCents: 3000,
      cardLastFour: '5978',
    })
    const secondUber = tx({
      id: 'uber-2',
      date: '2026-07-03',
      description: 'Uber Trip',
      amountCents: 3000,
      cardLastFour: '5978',
    })
    const firstRefund = tx({
      id: 'refund-1',
      date: '2026-07-04',
      description: 'Estorno de "Uber Trip"',
      amountCents: 3000,
      isCredit: true,
      cardLastFour: '5978',
    })
    const secondRefund = tx({
      id: 'refund-2',
      date: '2026-07-04',
      description: 'Estorno de "Uber Trip"',
      amountCents: 3000,
      isCredit: true,
      cardLastFour: '5978',
    })

    const groups = buildRefundGroups([firstUber, secondUber, firstRefund, secondRefund])

    expect(groups.linkedRefundsByParentId.get('uber-1')?.map((item) => item.id)).toEqual(['refund-1'])
    expect(groups.linkedRefundsByParentId.get('uber-2')?.map((item) => item.id)).toEqual(['refund-2'])
    expect(groups.refundedCentsByParentId.get('uber-1')).toBe(3000)
    expect(groups.refundedCentsByParentId.get('uber-2')).toBe(3000)
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
