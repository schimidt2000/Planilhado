import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ok, unauthorized, forbidden, notFound } from '@/lib/api-response'
import type { TransactionReview } from '@/lib/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const userId = session.user.id

  const { id } = await params
  const body: TransactionReview = await req.json()

  const tx = await prisma.transaction.findUnique({ where: { id } })
  if (!tx) return notFound('Transação')
  if (tx.userId !== userId) return forbidden()

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      ...(body.status !== undefined && { status: body.status }),
      ...(body.transactionType !== undefined && { transactionType: body.transactionType }),
      ...(body.debtorName !== undefined && { debtorName: body.debtorName }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.subcategory !== undefined && { subcategory: body.subcategory }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.isEssential !== undefined && { isEssential: body.isEssential }),
      ...(body.installmentCurrent !== undefined && { installmentCurrent: body.installmentCurrent }),
      ...(body.installmentTotal !== undefined && { installmentTotal: body.installmentTotal }),
    },
  })

  return ok(updated)
}
