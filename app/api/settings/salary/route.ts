import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { created, error, unauthorized } from '@/lib/api-response'
import { prisma } from '@/lib/db'

function cleanNotes(value: unknown) {
  const notes = String(value ?? '').trim()
  return notes ? notes : null
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const body = await req.json()
  const amountCents = Math.round(Number(body.amountCents))
  const effectiveMonth = String(body.effectiveMonth ?? '').trim()

  if (amountCents <= 0) return error('Informe um salário maior que zero')
  if (!/^\d{4}-\d{2}$/.test(effectiveMonth)) return error('Informe o mês de início do salário')

  const entry = await prisma.salaryEntry.create({
    data: {
      userId: session.user.id,
      effectiveMonth,
      amountCents,
      notes: cleanNotes(body.notes),
    },
  })

  return created({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
  })
}
