import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { ok, unauthorized } from '@/lib/api-response'
import { getMonthlyReport } from '@/lib/get-report'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const { month } = await params
  const report = await getMonthlyReport(session.user.id, month)
  if (!report) return unauthorized()

  return ok(report)
}
