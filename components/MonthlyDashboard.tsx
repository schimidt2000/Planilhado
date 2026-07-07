'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCents, formatMonth, prevMonth, nextMonth, currentMonth } from '@/lib/format'
import { SpendingDonut } from './charts/SpendingDonut'
import { MonthlyTrend } from './charts/MonthlyTrend'
import { DebtorBar } from './charts/DebtorBar'
import type { MonthlyReport } from '@/lib/types'

const SOURCE_COLORS: Record<string, string> = {
  nubank: 'bg-violet-100 text-violet-800',
  inter: 'bg-orange-100 text-orange-800',
  picpay: 'bg-green-100 text-green-800',
  pix: 'bg-blue-100 text-blue-800',
}

interface Props {
  report: MonthlyReport
  month: string
}

export function MonthlyDashboard({ report, month }: Props) {
  const isCurrentMonth = month === currentMonth()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard?m=${prevMonth(month)}`}>
            <Button variant="outline" size="icon">←</Button>
          </Link>
          <h1 className="text-2xl font-bold">{formatMonth(month)}</h1>
          {!isCurrentMonth && (
            <Link href={`/dashboard?m=${nextMonth(month)}`}>
              <Button variant="outline" size="icon">→</Button>
            </Link>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/upload">
            <Button size="sm">+ Importar</Button>
          </Link>
          <Link href={`/report/${month}`}>
            <Button variant="outline" size="sm">🖨️ Relatório</Button>
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Gasto</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{formatCents(report.totalExpenseCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">A Receber</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatCents(report.totalReceivableCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Líquido</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${report.totalReceivableCents - report.totalExpenseCents >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              {formatCents(report.totalReceivableCents - report.totalExpenseCents)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Por Categoria</CardTitle></CardHeader>
          <CardContent>
            <SpendingDonut data={report.byCategory} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Tendência (6 meses)</CardTitle></CardHeader>
          <CardContent>
            <MonthlyTrend data={report.monthlyTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Por Fonte</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.bySource.map((s) => (
                <div key={s.source} className="flex items-center justify-between">
                  <Badge className={SOURCE_COLORS[s.source] ?? 'bg-gray-100 text-gray-800'} variant="outline">
                    {s.source.charAt(0).toUpperCase() + s.source.slice(1)}
                  </Badge>
                  <span className="font-semibold">{formatCents(s.totalCents)}</span>
                </div>
              ))}
              {!report.bySource.length && (
                <p className="text-muted-foreground text-sm">Sem dados</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">A Receber por Pessoa</CardTitle></CardHeader>
          <CardContent>
            <DebtorBar data={report.byDebtor} />
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown */}
      {report.byCategory.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Detalhamento por Categoria</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.byCategory.map((cat) => (
                <div key={cat.category}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-sm">{cat.category}</span>
                    <span className="font-semibold text-sm">{formatCents(cat.totalCents)}</span>
                  </div>
                  {cat.subcategories.length > 0 && (
                    <div className="ml-4 space-y-1">
                      {cat.subcategories.map((sub) => (
                        <div key={sub.subcategory} className="flex justify-between text-xs text-muted-foreground">
                          <span>{sub.subcategory}</span>
                          <span>{formatCents(sub.totalCents)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
