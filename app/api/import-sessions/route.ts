import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { created, conflict, error, ok, unauthorized } from '@/lib/api-response'
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

  const month = req.nextUrl.searchParams.get('month')

  const sessions = await prisma.importSession.findMany({
    where: { userId, ...(month && { month }) },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      month: true,
      source: true,
      inputType: true,
      createdAt: true,
      transactions: {
        select: {
          id: true,
          status: true,
          amountCents: true,
          isCredit: true,
        },
      },
    },
  })

  return ok(sessions.map((session) => {
    const total = session.transactions.length
    const approved = session.transactions.filter((tx) => tx.status === 'approved').length
    const rejected = session.transactions.filter((tx) => tx.status === 'rejected').length
    const pending = session.transactions.filter((tx) => tx.status === 'pending').length
    const totalCents = session.transactions
      .filter((tx) => !tx.isCredit)
      .reduce((sum, tx) => sum + tx.amountCents, 0)

    return {
      id: session.id,
      month: session.month,
      source: session.source,
      inputType: session.inputType,
      createdAt: session.createdAt.toISOString(),
      total,
      approved,
      rejected,
      pending,
      totalCents,
    }
  }))
}
