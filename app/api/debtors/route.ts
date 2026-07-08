import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { conflict, created, error, ok, unauthorized } from '@/lib/api-response'
import { normalizeWhatsApp } from '@/lib/whatsapp'

function sanitizeName(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const debtors = await prisma.debtor.findMany({
    where: { userId: session.user.id },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, whatsapp: true, createdAt: true, updatedAt: true },
  })

  return ok(
    debtors.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const body = await req.json()
  const name = sanitizeName(body.name)
  const whatsapp = normalizeWhatsApp(String(body.whatsapp ?? ''))

  if (name.length < 2) return error('Informe um nome com pelo menos 2 caracteres')
  if (whatsapp && whatsapp.length < 12) return error('Informe o WhatsApp com DDD')

  const existing = await prisma.debtor.findUnique({
    where: { userId_name: { userId: session.user.id, name } },
    select: { id: true },
  })
  if (existing) return conflict('Esse devedor já está cadastrado')

  const debtor = await prisma.debtor.create({
    data: {
      userId: session.user.id,
      name,
      whatsapp: whatsapp || null,
    },
    select: { id: true, name: true, whatsapp: true, createdAt: true, updatedAt: true },
  })

  return created({
    ...debtor,
    createdAt: debtor.createdAt.toISOString(),
    updatedAt: debtor.updatedAt.toISOString(),
  })
}
