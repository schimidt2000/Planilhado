import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { forbidden, notFound, ok, unauthorized } from '@/lib/api-response'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const { id } = await params
  const payment = await prisma.debtorPayment.findUnique({ where: { id }, select: { userId: true } })
  if (!payment) return notFound('Pagamento')
  if (payment.userId !== session.user.id) return forbidden()
  await prisma.debtorPayment.delete({ where: { id } })
  return ok({ deleted: true })
}
