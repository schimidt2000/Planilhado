import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { created, error, unauthorized } from '@/lib/api-response'
import { prisma } from '@/lib/db'

function clean(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const body = await req.json()
  const description = clean(body.description)
  const amountCents = Math.round(Number(body.amountCents))
  const expectedDate = new Date(`${body.expectedDate}T12:00:00.000Z`)
  const notes = clean(body.notes) || null

  if (description.length < 2) return error('Informe uma descrição para a renda extra')
  if (amountCents <= 0) return error('Informe um valor maior que zero')
  if (!body.expectedDate || Number.isNaN(expectedDate.getTime())) return error('Informe a data prevista de recebimento')

  const income = await prisma.extraIncome.create({
    data: {
      userId: session.user.id,
      description,
      amountCents,
      expectedDate,
      notes,
      status: 'planned',
    },
  })

  return created({
    ...income,
    expectedDate: income.expectedDate.toISOString().slice(0, 10),
    receivedAt: income.receivedAt?.toISOString() ?? null,
    createdAt: income.createdAt.toISOString(),
    updatedAt: income.updatedAt.toISOString(),
  })
}
