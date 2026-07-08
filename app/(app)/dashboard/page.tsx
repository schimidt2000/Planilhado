import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { MonthlyDashboard } from '@/components/MonthlyDashboard'
import { currentMonth, nextMonth, prevMonth } from '@/lib/format'
import { getMonthlyReport } from '@/lib/get-report'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { prisma } from '@/lib/db'

interface Props {
  searchParams: Promise<{ m?: string }>
}

export default async function DashboardPage({ searchParams }: Props) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { m } = await searchParams
  const month = m || currentMonth()

  const report = await getMonthlyReport(session.user.id, month)
  const monthImportSessions = await prisma.importSession.findMany({
    where: { userId: session.user.id, month },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  })
  const reviewHref = monthImportSessions.length > 0
    ? `/review?sessionIds=${monthImportSessions.map((item) => item.id).join(',')}`
    : null

  if (!report || report.transactions.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-2">
            <Link href={`/dashboard?m=${prevMonth(month)}`}>
              <Button variant="outline" size="icon">←</Button>
            </Link>
            {month !== currentMonth() && (
              <Link href={`/dashboard?m=${nextMonth(month)}`}>
                <Button variant="outline" size="icon">→</Button>
              </Link>
            )}
          </div>
        </div>
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg mb-2">Nenhuma transação aprovada em {month}</p>
          <p className="text-sm mb-6">Você pode importar arquivos novos ou reabrir as importações já feitas para revisar gastos pendentes.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/upload">
              <Button>Importar arquivos</Button>
            </Link>
            <Link href={`/imports?m=${month}`}>
              <Button variant="outline">Ver importações do mês</Button>
            </Link>
            {reviewHref && (
              <Link href={reviewHref}>
                <Button variant="outline">Revisar gastos do mês</Button>
              </Link>
            )}
          </div>
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
