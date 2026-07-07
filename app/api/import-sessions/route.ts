import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { created, conflict, error, unauthorized } from '@/lib/api-response'
import type { ParsedTransaction, ImportSource, InputType } from '@/lib/types'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const userId = session.user.id

  const body = await req.json()
  const { month, source, inputType, transactions } = body as {
    month: string
    source: ImportSource
    inputType: InputType
    transactions: ParsedTransaction[]
  }

  if (!month || !source || !inputType || !Array.isArray(transactions)) {
    return error('Dados inválidos')
  }

  const existing = await prisma.importSession.findFirst({
    where: { userId, month, source, inputType },
  })
  if (existing) {
    return conflict(`PDF ${source} (${inputType}) de ${month} já foi importado. Deseja reimportar?`)
  }

  const importSession = await prisma.importSession.create({
    data: {
      userId,
      month,
      source,
      inputType,
      transactions: {
        create: transactions.map((t) => ({
          userId,
          date: new Date(t.date),
          description: t.description,
          amountCents: t.amountCents,
          isCredit: t.isCredit,
          isCharge: t.isCharge ?? false,
          installmentCurrent: t.installmentCurrent ?? null,
          installmentTotal: t.installmentTotal ?? null,
          currencyOriginal: t.currencyOriginal ?? null,
          amountOriginalCents: t.amountOriginalCents ?? null,
          sourceType: source,
          rawLine: t.rawLine ?? null,
        })),
      },
    },
    select: { id: true },
  })

  return created({ sessionId: importSession.id })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const userId = session.user.id

  const sessions = await prisma.importSession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      month: true,
      source: true,
      inputType: true,
      createdAt: true,
      _count: { select: { transactions: true } },
    },
  })

  return created(sessions)
}
