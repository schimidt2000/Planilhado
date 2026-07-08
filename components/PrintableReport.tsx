'use client'

import { formatCents, formatMonth } from '@/lib/format'
import type { MonthlyReport } from '@/lib/types'

const SOURCE_LABELS: Record<string, string> = {
  nubank: 'Nubank', inter: 'Inter', picpay: 'PicPay', pix: 'Pix',
}

interface Props {
  report: MonthlyReport
}

export function PrintableReport({ report }: Props) {
  return (
    <div className="font-sans max-w-4xl mx-auto p-8 space-y-8 print:p-4">
      {/* Header */}
      <div className="border-b pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-primary">Planilhado</h1>
          <h2 className="text-xl text-muted-foreground mt-1">{formatMonth(report.month)}</h2>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <p>Gerado em {new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Gasto</p>
          <p className="text-2xl font-bold text-destructive mt-1">{formatCents(report.totalExpenseCents)}</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">A Receber</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatCents(report.totalReceivableCents)}</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Líquido</p>
          <p className={`text-2xl font-bold mt-1 ${report.totalReceivableCents - report.totalExpenseCents >= 0 ? 'text-green-600' : 'text-destructive'}`}>
            {formatCents(report.totalReceivableCents - report.totalExpenseCents)}
          </p>
        </div>
      </div>

      {/* By source */}
      {report.bySource.length > 0 && (
        <section>
          <h3 className="font-bold text-base mb-3 border-b pb-1">Por Fonte</h3>
          <div className="grid grid-cols-2 gap-2">
            {report.bySource.map((s) => (
              <div key={s.source} className="flex justify-between items-center py-2 border-b">
                <span className="font-medium">{SOURCE_LABELS[s.source] ?? s.source}</span>
                <span className="font-bold">{formatCents(s.totalCents)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* By category */}
      {report.byCategory.length > 0 && (
        <section>
          <h3 className="font-bold text-base mb-3 border-b pb-1">Por Categoria</h3>
          <div className="space-y-2">
            {report.byCategory.map((cat) => (
              <div key={cat.category}>
                <div className="flex justify-between items-center font-medium py-1">
                  <span>{cat.category}</span>
                  <span>{formatCents(cat.totalCents)}</span>
                </div>
                {cat.subcategories.length > 0 && (
                  <div className="ml-4 space-y-1">
                    {cat.subcategories.map((sub) => (
                      <div key={sub.subcategory} className="flex justify-between text-sm text-muted-foreground">
                        <span>{sub.subcategory}</span>
                        <span>{formatCents(sub.totalCents)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* By debtor */}
      {report.byDebtor.length > 0 && (
        <section>
          <h3 className="font-bold text-base mb-3 border-b pb-1">A Receber por Pessoa</h3>
          <div className="space-y-1">
            {report.byDebtor.map((d) => (
              <div key={d.debtorName} className="flex justify-between items-center py-1 border-b last:border-0">
                <span className="font-medium">{d.debtorName}</span>
                <span className="text-green-600 font-bold">{formatCents(d.totalCents)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Transactions */}
      <section className="print:break-before-page">
        <h3 className="font-bold text-base mb-3 border-b pb-1">
          Todas as Transações ({report.transactions.length})
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground text-left">
              <th className="py-2 pr-3 font-medium">Data</th>
              <th className="py-2 pr-3 font-medium">Descrição</th>
              <th className="py-2 pr-3 font-medium">Categoria</th>
              <th className="py-2 pr-3 font-medium">Fonte</th>
              <th className="py-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {report.transactions.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">
                  {new Date(t.date).toLocaleDateString('pt-BR')}
                </td>
                <td className="py-1.5 pr-3">
                  {t.description}
                  {t.installmentCurrent && t.installmentTotal && (
                    <span className="text-muted-foreground"> ({t.installmentCurrent}/{t.installmentTotal})</span>
                  )}
                  {t.debtorName && (
                    <span className="text-blue-600 text-xs ml-1">→ {t.debtorName}</span>
                  )}
                  {t.splits.length > 0 && (
                    <span className="block text-blue-600 text-xs">
                      Rateio: {t.splits.map((split) => `${split.debtorName} ${formatCents(split.amountCents)}`).join(' · ')}
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-muted-foreground">{t.category ?? '-'}</td>
                <td className="py-1.5 pr-3 text-muted-foreground">{SOURCE_LABELS[t.sourceType] ?? t.sourceType}</td>
                <td className="py-1.5 text-right font-medium whitespace-nowrap">
                  <span className={t.transactionType === 'receivable' ? 'text-green-600' : ''}>
                    {formatCents(t.amountCents)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
