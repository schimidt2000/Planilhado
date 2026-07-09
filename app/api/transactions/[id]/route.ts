import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ok, unauthorized, forbidden, notFound, error } from '@/lib/api-response'
import type { TransactionReview } from '@/lib/types'
import { validateTransactionDecision } from '@/lib/finance-rules'
import { resolveDebtorReference, resolveSplitInputs } from '@/lib/server-debtors'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const userId = session.user.id

  const { id } = await params
  const body: TransactionReview = await req.json()

  const tx = await prisma.transaction.findUnique({ where: { id }, include: { splits: true } })
  if (!tx) return notFound('Transação')
  if (tx.userId !== userId) return forbidden()

  const nextSplits = body.splits ?? tx.splits.map((split) => ({
    debtorId: split.debtorId,
    debtorName: split.debtorName,
    amountCents: split.amountCents,
  }))
  const nextTransactionType = body.transactionType !== undefined ? body.transactionType : tx.transactionType
  const nextDebtorId = body.debtorId !== undefined ? body.debtorId : tx.debtorId
  const nextDebtorName = body.debtorName !== undefined ? body.debtorName : tx.debtorName
  const nextSplitMode = body.splitMode !== undefined ? body.splitMode : tx.splitMode

  if (body.status === 'approved') {
    const validationError = validateTransactionDecision({
      amountCents: tx.amountCents,
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
    if (body.transactionType === 'receivable' || body.debtorId !== undefined || body.debtorName !== undefined) {
      debtor = await resolveDebtorReference(userId, body.debtorId, body.debtorName)
    }
    if (body.splits !== undefined) resolvedSplits = await resolveSplitInputs(userId, body.splits)
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Devedor inválido', 422)
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      ...(body.status !== undefined && { status: body.status }),
      ...(body.transactionType !== undefined && { transactionType: body.transactionType }),
      ...(body.transactionType === 'expense' && { debtorId: null, debtorName: null }),
      ...(debtor && body.transactionType !== 'expense' && { debtorId: debtor.debtorId, debtorName: debtor.debtorName }),
      ...(body.splitMode !== undefined && { splitMode: body.splitMode }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.subcategory !== undefined && { subcategory: body.subcategory }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.isEssential !== undefined && { isEssential: body.isEssential }),
      ...(body.installmentCurrent !== undefined && { installmentCurrent: body.installmentCurrent }),
      ...(body.installmentTotal !== undefined && { installmentTotal: body.installmentTotal }),
      ...(body.splits !== undefined && {
        splits: {
          deleteMany: {},
          create: resolvedSplits ?? [],
        },
      }),
    },
    include: { splits: true },
  })

  return ok(updated)
}
