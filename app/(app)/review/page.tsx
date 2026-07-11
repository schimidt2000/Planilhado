import { redirect } from 'next/navigation'
import { ReviewWorkspace } from '@/components/ReviewWorkspace'
import { auth } from '@/lib/auth'
import { getUserPreferences } from '@/lib/finance-settings'

export default async function MultiReviewPage({ searchParams }: { searchParams: Promise<{ sessionIds?: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const { sessionIds } = await searchParams
  const ids = sessionIds?.split(',').map((id) => id.trim()).filter(Boolean) ?? []

  if (ids.length === 0) redirect('/imports')

  const preferences = await getUserPreferences(session.user.id)
  return <ReviewWorkspace sessionIds={ids} tipsEnabled={preferences.showReviewTips} />
}
