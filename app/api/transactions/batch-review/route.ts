import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ok, error, unauthorized, forbidden } from '@/lib/api-response'
import type { TransactionReview } from '@/lib/types'

interface BatchUpdate extends TransactionReview {
  id: string
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const userId = session.user.id

  const body = await req.json()
  const updates: BatchUpdate[] = body.updates

  if (!Array.isArray(updates) || updates.length === 0) {
    return error('Lista de atualizações inválida')
  }

  const ids = updates.map((u) => u.id)
  const existing: { id: string; userId: string }[] = await prisma.transaction.findMany({
    where: { id: { in: ids } },
    select: { id: true, userId: true },
  })

  const unauthorized_ids = existing.filter((t: { id: string; userId: string }) => t.userId !== userId)
  if (unauthorized_ids.length > 0) return forbidden()

  const result = await prisma.$transaction(
    updates.map((u) => {
      const { id, ...fields } = u
      return prisma.transaction.update({
        where: { id },
        data: {
          ...(fields.status !== undefined && { status: fields.status }),
          ...(fields.transactionType !== undefined && { transactionType: fields.transactionType }),
          ...(fields.debtorName !== undefined && { debtorName: fields.debtorName }),
          ...(fields.splitMode !== undefined && { splitMode: fields.splitMode }),
          ...(fields.category !== undefined && { category: fields.category }),
          ...(fields.subcategory !== undefined && { subcategory: fields.subcategory }),
          ...(fields.notes !== undefined && { notes: fields.notes }),
          ...(fields.isEssential !== undefined && { isEssential: fields.isEssential }),
          ...(fields.installmentCurrent !== undefined && { installmentCurrent: fields.installmentCurrent }),
          ...(fields.installmentTotal !== undefined && { installmentTotal: fields.installmentTotal }),
          ...(fields.splits !== undefined && {
            splits: {
              deleteMany: {},
              create: fields.splits
                .filter((split) => split.debtorName.trim() && split.amountCents > 0)
                .map((split) => ({
                  userId,
                  debtorName: split.debtorName.trim(),
                  amountCents: split.amountCents,
                })),
            },
          }),
        },
      })
    })
  )

  return ok({ updated: result.length })
}
