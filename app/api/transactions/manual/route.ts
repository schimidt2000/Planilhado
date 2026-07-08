import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { created, error, unauthorized } from '@/lib/api-response'
import type { TransactionSplitInput } from '@/lib/types'

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

  const splits = Array.isArray(body.splits) ? body.splits as TransactionSplitInput[] : []
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
      debtorName: body.debtorName?.trim() || null,
      splitMode: body.splitMode || 'none',
      category: body.category || null,
      subcategory: body.subcategory || null,
      notes: body.notes?.trim() || null,
      splits: {
        create: splits
          .filter((split) => split.debtorName.trim() && split.amountCents > 0)
          .map((split) => ({ userId, debtorName: split.debtorName.trim(), amountCents: split.amountCents })),
      },
    },
    select: { id: true },
  })

  return created(transaction)
}
