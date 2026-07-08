import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { created, error, ok, unauthorized } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const month = req.nextUrl.searchParams.get('month')
  const debtorId = req.nextUrl.searchParams.get('debtorId')

  const payments = await prisma.debtorPayment.findMany({
    where: {
      userId: session.user.id,
      ...(month && { month }),
      ...(debtorId && { debtorId }),
    },
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true, debtorId: true, month: true, amountCents: true,
      paidAt: true, notes: true, debtor: { select: { name: true } },
    },
  })
  return ok(payments)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const body = await req.json()
  const amountCents = Math.round(Number(body.amountCents))
  const month = String(body.month ?? '')
  const paidAt = new Date(`${body.paidAt}T12:00:00.000Z`)

  if (!body.debtorId || !/^\d{4}-\d{2}$/.test(month) || amountCents <= 0 || Number.isNaN(paidAt.getTime())) {
    return error('Informe devedor, mês, data e um valor maior que zero')
  }

  const debtor = await prisma.debtor.findFirst({
    where: { id: body.debtorId, userId: session.user.id },
    select: { id: true },
  })
  if (!debtor) return error('Devedor não encontrado', 404)

  const payment = await prisma.debtorPayment.create({
    data: {
      userId: session.user.id,
      debtorId: debtor.id,
      month,
      amountCents,
      paidAt,
      notes: String(body.notes ?? '').trim() || null,
    },
    select: { id: true },
  })
  return created(payment)
}
