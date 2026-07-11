import { ReviewWorkspace } from '@/components/ReviewWorkspace'
import { auth } from '@/lib/auth'
import { getUserPreferences } from '@/lib/finance-settings'
import { redirect } from 'next/navigation'

export default async function ReviewPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const { sessionId } = await params
  const preferences = await getUserPreferences(session.user.id)
  return <ReviewWorkspace sessionIds={[sessionId]} tipsEnabled={preferences.showReviewTips} />
}
