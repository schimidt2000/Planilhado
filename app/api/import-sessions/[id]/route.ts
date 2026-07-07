import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ok, unauthorized, forbidden, notFound } from '@/lib/api-response'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const userId = session.user.id

  const { id } = await params

  const importSession = await prisma.importSession.findUnique({
    where: { id },
    include: {
      transactions: {
        orderBy: { date: 'asc' },
      },
    },
  })

  if (!importSession) return notFound('Sessão de importação')
  if (importSession.userId !== userId) return forbidden()

  return ok(importSession)
}
