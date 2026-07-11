import { auth } from '@/lib/auth'
import { ok, unauthorized } from '@/lib/api-response'
import { getFinanceSettings } from '@/lib/finance-settings'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  return ok(await getFinanceSettings(session.user.id))
}
