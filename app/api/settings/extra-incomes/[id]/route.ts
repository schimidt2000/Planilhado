import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { error, forbidden, notFound, ok, unauthorized } from '@/lib/api-response'
import { prisma } from '@/lib/db'

function clean(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

async function getOwnedIncome(id: string, userId: string) {
  const income = await prisma.extraIncome.findUnique({ where: { id }, select: { userId: true } })
  if (!income) return null
  if (income.userId !== userId) return 'forbidden'
  return income
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const { id } = await params
  const owned = await getOwnedIncome(id, session.user.id)
  if (!owned) return notFound('Renda extra')
  if (owned === 'forbidden') return forbidden()

  const body = await req.json()
  const data: {
    description?: string
    amountCents?: number
    expectedDate?: Date
    status?: string
    receivedAt?: Date | null
    notes?: string | null
  } = {}

  if (body.description !== undefined) {
    const description = clean(body.description)
    if (description.length < 2) return error('Informe uma descrição para a renda extra')
    data.description = description
  }
  if (body.amountCents !== undefined) {
    const amountCents = Math.round(Number(body.amountCents))
    if (amountCents <= 0) return error('Informe um valor maior que zero')
    data.amountCents = amountCents
  }
  if (body.expectedDate !== undefined) {
    const expectedDate = new Date(`${body.expectedDate}T12:00:00.000Z`)
    if (!body.expectedDate || Number.isNaN(expectedDate.getTime())) return error('Informe a data prevista de recebimento')
    data.expectedDate = expectedDate
  }
  if (body.notes !== undefined) data.notes = clean(body.notes) || null
  if (body.status !== undefined) {
    const status = body.status === 'received' ? 'received' : 'planned'
    data.status = status
    data.receivedAt = status === 'received' ? new Date() : null
  }

  const income = await prisma.extraIncome.update({ where: { id }, data })
  return ok({
    ...income,
    expectedDate: income.expectedDate.toISOString().slice(0, 10),
    receivedAt: income.receivedAt?.toISOString() ?? null,
    createdAt: income.createdAt.toISOString(),
    updatedAt: income.updatedAt.toISOString(),
  })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const { id } = await params
  const owned = await getOwnedIncome(id, session.user.id)
  if (!owned) return notFound('Renda extra')
  if (owned === 'forbidden') return forbidden()

  await prisma.extraIncome.delete({ where: { id } })
  return ok({ deleted: true })
}
