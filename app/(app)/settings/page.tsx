import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getFinanceSettings } from '@/lib/finance-settings'
import { PersonalSettingsClient } from '@/components/PersonalSettingsClient'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const settings = await getFinanceSettings(session.user.id)
  return <PersonalSettingsClient initialSettings={settings} />
}
