import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { ok, unauthorized } from '@/lib/api-response'
import { upsertUserPreferences } from '@/lib/finance-settings'

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const body = await req.json()
  return ok(await upsertUserPreferences(session.user.id, body))
}
