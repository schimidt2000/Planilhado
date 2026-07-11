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
  const label = clean(body.label)
  const dueDay = Math.round(Number(body.dueDay))
  const source = clean(body.source) || null
  const notes = clean(body.notes) || null

  if (label.length < 2) return error('Informe um nome para a fatura')
  if (dueDay < 1 || dueDay > 31) return error('O vencimento precisa estar entre os dias 1 e 31')

  const reminder = await prisma.billReminder.create({
    data: {
      userId: session.user.id,
      label,
      source,
      dueDay,
      notes,
      active: true,
    },
  })

  return created({
    ...reminder,
    createdAt: reminder.createdAt.toISOString(),
    updatedAt: reminder.updatedAt.toISOString(),
  })
}
