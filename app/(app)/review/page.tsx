import { redirect } from 'next/navigation'
import { ReviewWorkspace } from '@/components/ReviewWorkspace'
import { auth } from '@/lib/auth'

export default async function MultiReviewPage({ searchParams }: { searchParams: Promise<{ sessionIds?: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const { sessionIds } = await searchParams
  const ids = sessionIds?.split(',').map((id) => id.trim()).filter(Boolean) ?? []

  if (ids.length === 0) redirect('/imports')

  return <ReviewWorkspace sessionIds={ids} />
}
