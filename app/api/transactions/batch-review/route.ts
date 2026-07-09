import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ok, error, unauthorized, forbidden } from '@/lib/api-response'
import type { TransactionReview } from '@/lib/types'
import { validateTransactionDecision } from '@/lib/finance-rules'
import { resolveDebtorReference, resolveSplitInputs } from '@/lib/server-debtors'

interface BatchUpdate extends TransactionReview {
  id: string
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const userId = session.user.id

  const body = await req.json()
  const updates: BatchUpdate[] = body.updates

  if (!Array.isArray(updates) || updates.length === 0) {
    return error('Lista de atualizações inválida')
  }

  const ids = updates.map((u) => u.id)
  const existing = await prisma.transaction.findMany({
    where: { id: { in: ids } },
    include: { splits: true },
  })

  const unauthorized_ids = existing.filter((t: { id: string; userId: string }) => t.userId !== userId)
  if (unauthorized_ids.length > 0) return forbidden()

  const byId = new Map(existing.map((item) => [item.id, item]))
  const preparedUpdates = []

  for (const u of updates) {
    const current = byId.get(u.id)
    if (!current) return error('Transação não encontrada', 404)
    const { id, ...fields } = u
    const nextSplits = fields.splits ?? current.splits.map((split) => ({
      debtorId: split.debtorId,
      debtorName: split.debtorName,
      amountCents: split.amountCents,
    }))
    const nextTransactionType = fields.transactionType !== undefined ? fields.transactionType : current.transactionType
    const nextDebtorId = fields.debtorId !== undefined ? fields.debtorId : current.debtorId
    const nextDebtorName = fields.debtorName !== undefined ? fields.debtorName : current.debtorName
    const nextSplitMode = fields.splitMode !== undefined ? fields.splitMode : current.splitMode

    if (fields.status === 'approved') {
      const validationError = validateTransactionDecision({
        amountCents: current.amountCents,
        transactionType: nextTransactionType,
        debtorId: nextDebtorId,
        debtorName: nextDebtorName,
        splitMode: nextSplitMode,
        splits: nextSplits,
      })
      if (validationError) return error(validationError, 422)
    }

    let debtor: Awaited<ReturnType<typeof resolveDebtorReference>> | null = null
    let resolvedSplits: Awaited<ReturnType<typeof resolveSplitInputs>> | null = null
    try {
      if (fields.transactionType === 'receivable' || fields.debtorId !== undefined || fields.debtorName !== undefined) {
        debtor = await resolveDebtorReference(userId, fields.debtorId, fields.debtorName)
      }
      if (fields.splits !== undefined) resolvedSplits = await resolveSplitInputs(userId, fields.splits)
    } catch (err) {
      return error(err instanceof Error ? err.message : 'Devedor inválido', 422)
    }

    preparedUpdates.push({
      id,
      fields,
      debtor,
      resolvedSplits,
    })
  }

  const result = await prisma.$transaction(
    preparedUpdates.map(({ id, fields, debtor, resolvedSplits }) => {
      return prisma.transaction.update({
        where: { id },
        data: {
          ...(fields.status !== undefined && { status: fields.status }),
          ...(fields.transactionType !== undefined && { transactionType: fields.transactionType }),
          ...(fields.transactionType === 'expense' && { debtorId: null, debtorName: null }),
          ...(debtor && fields.transactionType !== 'expense' && { debtorId: debtor.debtorId, debtorName: debtor.debtorName }),
          ...(fields.splitMode !== undefined && { splitMode: fields.splitMode }),
          ...(fields.category !== undefined && { category: fields.category }),
          ...(fields.subcategory !== undefined && { subcategory: fields.subcategory }),
          ...(fields.notes !== undefined && { notes: fields.notes }),
          ...(fields.isEssential !== undefined && { isEssential: fields.isEssential }),
          ...(fields.installmentCurrent !== undefined && { installmentCurrent: fields.installmentCurrent }),
          ...(fields.installmentTotal !== undefined && { installmentTotal: fields.installmentTotal }),
          ...(fields.splits !== undefined && {
            splits: {
              deleteMany: {},
              create: resolvedSplits ?? [],
            },
          }),
        },
      })
    })
  )

  return ok({ updated: result.length })
}
