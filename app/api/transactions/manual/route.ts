import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { created, error, unauthorized } from '@/lib/api-response'
import type { TransactionSplitInput } from '@/lib/types'
import { validateTransactionDecision } from '@/lib/finance-rules'
import { resolveDebtorReference, resolveSplitInputs } from '@/lib/server-debtors'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const userId = session.user.id
  const body = await req.json()
  const amountCents = Math.round(Number(body.amountCents))
  const date = new Date(`${body.date}T12:00:00.000Z`)

  if (!body.date || Number.isNaN(date.getTime()) || !body.description?.trim() || amountCents <= 0) {
    return error('Preencha data, descrição e um valor maior que zero')
  }

  const splits = Array.isArray(body.splits) ? body.splits as TransactionSplitInput[] : []
  const validationError = validateTransactionDecision({
    amountCents,
    transactionType: body.transactionType || 'expense',
    debtorId: body.debtorId,
    debtorName: body.debtorName,
    splitMode: body.splitMode || 'none',
    splits,
  })
  if (validationError) return error(validationError, 422)

  let debtor: Awaited<ReturnType<typeof resolveDebtorReference>>
  let resolvedSplits: Awaited<ReturnType<typeof resolveSplitInputs>>
  try {
    debtor = await resolveDebtorReference(userId, body.debtorId, body.debtorName)
    resolvedSplits = await resolveSplitInputs(userId, splits)
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Devedor inválido', 422)
  }

  const month = body.date.slice(0, 7)
  let importSession = await prisma.importSession.findFirst({
    where: { userId, month, source: 'manual', inputType: 'manual' },
    select: { id: true },
  })
  if (!importSession) {
    importSession = await prisma.importSession.create({
      data: { userId, month, source: 'manual', inputType: 'manual' },
      select: { id: true },
    })
  }

  const transaction = await prisma.transaction.create({
    data: {
      importSessionId: importSession.id,
      userId,
      date,
      description: body.description.trim(),
      amountCents,
      isCredit: Boolean(body.isCredit),
      sourceType: body.sourceType || 'manual',
      origin: 'manual',
      status: 'approved',
      transactionType: body.transactionType || 'expense',
      debtorId: body.transactionType === 'receivable' ? debtor.debtorId : null,
      debtorName: body.transactionType === 'receivable' ? debtor.debtorName : null,
      splitMode: body.splitMode || 'none',
      category: body.category || null,
      subcategory: body.subcategory || null,
      notes: body.notes?.trim() || null,
      splits: {
        create: body.splitMode === 'none' ? [] : resolvedSplits,
      },
    },
    select: { id: true },
  })

  return created(transaction)
}
