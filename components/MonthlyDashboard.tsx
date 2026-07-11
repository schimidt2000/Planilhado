'use client'

import Link from 'next/link'
import { FileText, Plus, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCents, formatMonth, prevMonth, nextMonth, currentMonth } from '@/lib/format'
import { getBudgetGroup } from '@/lib/categories'
import { SpendingDonut } from './charts/SpendingDonut'
import { MonthlyTrend } from './charts/MonthlyTrend'
import { DebtorBar } from './charts/DebtorBar'
import { DebtorReceivables } from './DebtorReceivables'
import { GuidanceCards } from './GuidanceCards'
import type { FinanceSettingsSnapshot, MonthlyReport } from '@/lib/types'

const SOURCE_COLORS: Record<string, string> = {
  nubank: 'bg-violet-100 text-violet-800',
  inter: 'bg-orange-100 text-orange-800',
  picpay: 'bg-green-100 text-green-800',
  pix: 'bg-blue-100 text-blue-800',
}

interface Props {
  report: MonthlyReport
  month: string
  settings: FinanceSettingsSnapshot
}

export function MonthlyDashboard({ report, month, settings }: Props) {
  const isCurrentMonth = month === currentMonth()
  const extraIncome = settings.extraIncomes
    .filter((income) => income.expectedDate.slice(0, 7) === month)
    .reduce((sum, income) => sum + income.amountCents, 0)
  const expectedIncome = (settings.currentSalary?.amountCents ?? 0) + extraIncome
  const projectedBalance = expectedIncome - report.totalExpenseCents + report.totalReceivableCents

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href={`/dashboard?m=${prevMonth(month)}`}>
            <Button variant="outline" size="icon">←</Button>
          </Link>
          <h1 className="min-w-0 flex-1 text-xl font-bold sm:text-2xl">{formatMonth(month)}</h1>
          {!isCurrentMonth && (
            <Link href={`/dashboard?m=${nextMonth(month)}`}>
              <Button variant="outline" size="icon">→</Button>
            </Link>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/upload">
            <Button size="sm" className="flex-1 sm:flex-none"><Plus className="size-4" /> Importar</Button>
          </Link>
          <Link href={`/report/${month}`}>
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none"><FileText className="size-4" /> Relatório</Button>
          </Link>
        </div>
      </div>

      <GuidanceCards scope="dashboard" initialEnabled={settings.preferences.showDashboardTips} />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Renda prevista do mês</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Salário</p>
              <p className="font-semibold">{settings.currentSalary ? formatCents(settings.currentSalary.amountCents) : 'Não informado'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Extras</p>
              <p className="font-semibold">{formatCents(extraIncome)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Projeção</p>
              <p className={`font-semibold ${projectedBalance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                {expectedIncome > 0 ? formatCents(projectedBalance) : 'Configure sua renda'}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Próximas faturas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {settings.upcomingBillReminders.slice(0, 3).map((reminder) => (
              <div key={reminder.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{reminder.label}</span>
                <Badge variant={reminder.daysUntil <= 3 ? 'destructive' : 'outline'}>
                  {reminder.daysUntil === 0 ? 'Hoje' : `${reminder.daysUntil} dia(s)`}
                </Badge>
              </div>
            ))}
            {settings.upcomingBillReminders.length === 0 && (
              <Link href="/settings">
                <Button variant="outline" size="sm">Cadastrar vencimentos</Button>
              </Link>
            )}
          </CardContent>
        </Card>
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
            {report.totalPaidCents > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCents(report.totalReceivableGrossCents)} devido · {formatCents(report.totalPaidCents)} pago
              </p>
            )}
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

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="size-4" /> Regra 50-30-20</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {report.byBudgetGroup.map((item) => {
              const diff = item.actualPercent - item.targetPercent
              return (
                <div key={item.group} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{item.label}</span>
                    <Badge variant={diff <= 0 ? 'outline' : 'destructive'}>
                      {item.actualPercent}% / {item.targetPercent}%
                    </Badge>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${Math.min(item.actualPercent, 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm font-semibold">{formatCents(item.totalCents)}</p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

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
            {report.byDebtor.length > 0 && (
              <DebtorReceivables debtors={report.byDebtor} month={month} transactions={report.transactions} />
            )}
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
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{getBudgetGroup(cat.category) === 'needs' ? '50%' : getBudgetGroup(cat.category) === 'wants' ? '30%' : '20%'}</Badge>
                      <span className="font-semibold text-sm">{formatCents(cat.totalCents)}</span>
                    </div>
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
