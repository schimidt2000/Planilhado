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
        include: {
          debtor: { select: { id: true, name: true } },
          splits: {
            orderBy: { debtorName: 'asc' },
            include: { debtor: { select: { id: true, name: true } } },
          },
        },
      },
    },
  })

  if (!importSession) return notFound('Sessão de importação')
  if (importSession.userId !== userId) return forbidden()

  return ok({
    ...importSession,
    transactions: importSession.transactions.map((transaction) => ({
      ...transaction,
      debtorName: transaction.debtor?.name ?? transaction.debtorName,
      splits: transaction.splits.map((split) => ({
        ...split,
        debtorName: split.debtor?.name ?? split.debtorName,
      })),
    })),
  })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const userId = session.user.id

  const { id } = await params
  const importSession = await prisma.importSession.findUnique({
    where: { id },
    select: { userId: true },
  })

  if (!importSession) return notFound('Sessão de importação')
  if (importSession.userId !== userId) return forbidden()

  await prisma.importSession.delete({ where: { id } })
  return ok({ deleted: true })
}
