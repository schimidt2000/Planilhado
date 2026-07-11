import { ReviewWorkspace } from '@/components/ReviewWorkspace'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function ReviewPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const { sessionId } = await params
  return <ReviewWorkspace sessionIds={[sessionId]} />
}
