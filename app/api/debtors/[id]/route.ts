import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { error, forbidden, notFound, ok, unauthorized } from '@/lib/api-response'
import { normalizeWhatsApp } from '@/lib/whatsapp'

function sanitizeName(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const { id } = await params
  const current = await prisma.debtor.findUnique({ where: { id } })
  if (!current) return notFound('Devedor')
  if (current.userId !== session.user.id) return forbidden()

  const body = await req.json()
  const name = body.name === undefined ? current.name : sanitizeName(body.name)
  const whatsapp = body.whatsapp === undefined ? current.whatsapp : normalizeWhatsApp(String(body.whatsapp ?? ''))

  if (name.length < 2) return error('Informe um nome com pelo menos 2 caracteres')
  if (whatsapp && whatsapp.length < 12) return error('Informe o WhatsApp com DDD')

  const updated = await prisma.debtor.update({
    where: { id },
    data: {
      name,
      whatsapp: whatsapp || null,
    },
    select: { id: true, name: true, whatsapp: true, createdAt: true, updatedAt: true },
  })

  return ok({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const { id } = await params
  const current = await prisma.debtor.findUnique({ where: { id } })
  if (!current) return notFound('Devedor')
  if (current.userId !== session.user.id) return forbidden()

  await prisma.debtor.delete({ where: { id } })
  return ok({ deleted: true })
}
