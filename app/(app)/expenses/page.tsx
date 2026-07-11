import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { currentMonth } from '@/lib/format'
import { getMonthlyReport } from '@/lib/get-report'
import { MonthlyExpensesClient } from '@/components/MonthlyExpensesClient'

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { m } = await searchParams
  const month = m || currentMonth()
  const report = await getMonthlyReport(session.user.id, month)
  if (!report) redirect('/dashboard')

  return <MonthlyExpensesClient report={report} month={month} />
}
