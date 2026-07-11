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

  const nextAmountCents = body.amountCents !== undefined ? Math.round(Number(body.amountCents)) : tx.amountCents
  if (body.amountCents !== undefined && (!Number.isFinite(nextAmountCents) || nextAmountCents <= 0)) {
    return error('Informe um valor maior que zero', 422)
  }

  const nextDate = body.date !== undefined ? new Date(`${body.date}T12:00:00.000Z`) : tx.date
  if (body.date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(body.date) || Number.isNaN(nextDate.getTime()))) {
    return error('Informe uma data válida', 422)
  }

  const nextDescription = body.description !== undefined ? body.description.trim().replace(/\s+/g, ' ') : tx.description
  if (body.description !== undefined && nextDescription.length < 2) {
    return error('Informe uma descrição com pelo menos 2 caracteres', 422)
  }

  const nextSplits = body.splits ?? tx.splits.map((split) => ({
    debtorId: split.debtorId,
    debtorName: split.debtorName,
    amountCents: split.amountCents,
  }))
  const nextTransactionType = body.transactionType !== undefined ? body.transactionType : tx.transactionType
  const nextDebtorId = body.debtorId !== undefined ? body.debtorId : tx.debtorId
  const nextDebtorName = body.debtorName !== undefined ? body.debtorName : tx.debtorName
  const nextSplitMode = body.splitMode !== undefined ? body.splitMode : tx.splitMode

  if (body.status === 'approved' || (body.status === undefined && tx.status === 'approved')) {
    const validationError = validateTransactionDecision({
      amountCents: nextAmountCents,
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
      ...(body.date !== undefined && { date: nextDate }),
      ...(body.description !== undefined && { description: nextDescription }),
      ...(body.amountCents !== undefined && { amountCents: nextAmountCents }),
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
