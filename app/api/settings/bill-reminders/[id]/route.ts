import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { error, forbidden, notFound, ok, unauthorized } from '@/lib/api-response'
import { prisma } from '@/lib/db'

function clean(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

async function getOwnedReminder(id: string, userId: string) {
  const reminder = await prisma.billReminder.findUnique({ where: { id }, select: { userId: true } })
  if (!reminder) return null
  if (reminder.userId !== userId) return 'forbidden'
  return reminder
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const { id } = await params
  const owned = await getOwnedReminder(id, session.user.id)
  if (!owned) return notFound('Fatura')
  if (owned === 'forbidden') return forbidden()

  const body = await req.json()
  const data: {
    label?: string
    source?: string | null
    dueDay?: number
    active?: boolean
    notes?: string | null
  } = {}

  if (body.label !== undefined) {
    const label = clean(body.label)
    if (label.length < 2) return error('Informe um nome para a fatura')
    data.label = label
  }
  if (body.source !== undefined) data.source = clean(body.source) || null
  if (body.notes !== undefined) data.notes = clean(body.notes) || null
  if (body.active !== undefined) data.active = Boolean(body.active)
  if (body.dueDay !== undefined) {
    const dueDay = Math.round(Number(body.dueDay))
    if (dueDay < 1 || dueDay > 31) return error('O vencimento precisa estar entre os dias 1 e 31')
    data.dueDay = dueDay
  }

  const reminder = await prisma.billReminder.update({ where: { id }, data })
  return ok({
    ...reminder,
    createdAt: reminder.createdAt.toISOString(),
    updatedAt: reminder.updatedAt.toISOString(),
  })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const { id } = await params
  const owned = await getOwnedReminder(id, session.user.id)
  if (!owned) return notFound('Fatura')
  if (owned === 'forbidden') return forbidden()

  await prisma.billReminder.delete({ where: { id } })
  return ok({ deleted: true })
}
