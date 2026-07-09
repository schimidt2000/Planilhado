import { prisma } from '@/lib/db'
import type { TransactionSplitInput } from '@/lib/types'

function cleanName(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

export async function resolveDebtorReference(
  userId: string,
  debtorId?: string | null,
  debtorName?: string | null
) {
  if (debtorId) {
    const debtor = await prisma.debtor.findFirst({
      where: { id: debtorId, userId },
      select: { id: true, name: true },
    })
    if (!debtor) throw new Error('Devedor inválido')
    return { debtorId: debtor.id, debtorName: debtor.name }
  }

  const name = cleanName(debtorName)
  if (!name) return { debtorId: null, debtorName: null }

  const debtor = await prisma.debtor.findFirst({
    where: { userId, name },
    select: { id: true, name: true },
  })
  return debtor ? { debtorId: debtor.id, debtorName: debtor.name } : { debtorId: null, debtorName: name }
}

export async function resolveSplitInputs(userId: string, splits: TransactionSplitInput[] | undefined) {
  const validSplits = (splits ?? []).filter((split) =>
    split.amountCents > 0 && (split.debtorId || split.debtorName.trim())
  )

  return Promise.all(validSplits.map(async (split) => {
    const debtor = await resolveDebtorReference(userId, split.debtorId, split.debtorName)
    if (!debtor.debtorName) throw new Error('Informe o devedor de cada pessoa no rateio')

    return {
      userId,
      debtorId: debtor.debtorId,
      debtorName: debtor.debtorName,
      amountCents: Math.round(split.amountCents),
    }
  }))
}
