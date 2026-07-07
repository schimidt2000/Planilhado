'use client'

import { use, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PrintableReport } from '@/components/PrintableReport'
import Link from 'next/link'
import type { MonthlyReport } from '@/lib/types'

export default function ReportPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = use(params)
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/reports/${month}`)
      .then((r) => r.json())
      .then((data) => { setReport(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [month])

  if (loading) return <p className="text-center py-12 text-muted-foreground">Gerando relatório...</p>
  if (!report) return <p className="text-center py-12 text-destructive">Relatório não encontrado</p>

  return (
    <div>
      {/* Toolbar — hidden on print */}
      <div className="print:hidden mb-6 flex justify-between items-center border-b pb-4">
        <Link href={`/dashboard?m=${month}`}>
          <Button variant="outline" size="sm">← Voltar</Button>
        </Link>
        <Button onClick={() => window.print()}>🖨️ Imprimir / Salvar PDF</Button>
      </div>

      <PrintableReport report={report} />
    </div>
  )
}
