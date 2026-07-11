import { auth } from '@/lib/auth'
import { forbidden, notFound, ok, unauthorized } from '@/lib/api-response'
import { prisma } from '@/lib/db'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const { id } = await params
  const entry = await prisma.salaryEntry.findUnique({ where: { id }, select: { userId: true } })
  if (!entry) return notFound('Salário')
  if (entry.userId !== session.user.id) return forbidden()

  await prisma.salaryEntry.delete({ where: { id } })
  return ok({ deleted: true })
}
