import { redirect } from 'next/navigation'
import { ReviewWorkspace } from '@/components/ReviewWorkspace'

export default async function MultiReviewPage({ searchParams }: { searchParams: Promise<{ sessionIds?: string }> }) {
  const { sessionIds } = await searchParams
  const ids = sessionIds?.split(',').map((id) => id.trim()).filter(Boolean) ?? []

  if (ids.length === 0) redirect('/imports')

  return <ReviewWorkspace sessionIds={ids} />
}
