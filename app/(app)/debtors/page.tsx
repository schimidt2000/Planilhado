import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { DebtorsClient } from '@/components/DebtorsClient'

export default async function DebtorsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  return <DebtorsClient />
}
