import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { MonthlyDashboard } from '@/components/MonthlyDashboard'
import { currentMonth } from '@/lib/format'
import { getMonthlyReport } from '@/lib/get-report'

interface Props {
  searchParams: Promise<{ m?: string }>
}

export default async function DashboardPage({ searchParams }: Props) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { m } = await searchParams
  const month = m || currentMonth()

  const report = await getMonthlyReport(session.user.id, month)

  if (!report || report.transactions.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg mb-2">Nenhuma transação aprovada em {month}</p>
          <p className="text-sm mb-6">Importe sua fatura para começar a visualizar seus gastos</p>
          <a
            href="/upload"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90"
          >
            + Importar PDF
          </a>
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={<p className="text-center py-12 text-muted-foreground">Carregando...</p>}>
      <MonthlyDashboard report={report} month={month} />
    </Suspense>
  )
}
