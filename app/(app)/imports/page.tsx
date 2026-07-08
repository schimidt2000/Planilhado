import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { currentMonth } from '@/lib/format'
import { ImportsClient } from '@/components/ImportsClient'

export default async function ImportsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { m } = await searchParams

  return <ImportsClient initialMonth={m || currentMonth()} />
}
