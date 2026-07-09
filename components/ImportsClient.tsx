'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FileSearch, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCents, formatMonth, nextMonth, prevMonth, currentMonth } from '@/lib/format'

interface ImportSummary {
  id: string
  month: string
  source: string
  inputType: string
  fileName?: string | null
  fileSize?: number | null
  fileHash?: string | null
  newCount: number
  completedCount: number
  duplicateCount: number
  processedCount: number
  createdAt: string
  total: number
  approved: number
  rejected: number
  pending: number
  totalCents: number
}

const SOURCE_LABELS: Record<string, string> = {
  nubank: 'Nubank',
  inter: 'Inter',
  picpay: 'PicPay',
  pix: 'Pix',
}

function formatFileSize(size?: number | null) {
  if (!size) return null
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function ImportsClient({ initialMonth }: { initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth)
  const [imports, setImports] = useState<ImportSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function loadImports(targetMonth = month) {
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/import-sessions?month=${targetMonth}`)
    if (res.ok) {
      setImports(await res.json())
    } else {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'Não foi possível carregar importações')
    }

    setLoading(false)
  }

  useEffect(() => {
    loadImports(month)
  }, [month])

  const reviewHref = useMemo(() => {
    if (imports.length === 0) return null
    return `/review?sessionIds=${imports.map((item) => item.id).join(',')}`
  }, [imports])

  async function deleteImport(item: ImportSummary) {
    const confirmed = window.confirm(
      `Remover a importação ${item.fileName ?? `${SOURCE_LABELS[item.source] ?? item.source} (${item.inputType})`} de ${item.month}? Isso apaga as transações dessa importação.`
    )
    if (!confirmed) return

    setDeletingId(item.id)
    const res = await fetch(`/api/import-sessions/${item.id}`, { method: 'DELETE' })
    setDeletingId(null)

    if (res.ok) {
      setImports((current) => current.filter((existing) => existing.id !== item.id))
    } else {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'Não foi possível remover a importação')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Importações</h1>
          <p className="text-sm text-muted-foreground">
            Controle os arquivos importados por mês e reabra a revisão quando precisar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/upload">
            <Button>Importar arquivos</Button>
          </Link>
          {reviewHref && (
            <Link href={reviewHref}>
              <Button variant="outline">
                <FileSearch className="size-4" />
                Revisar mês
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <Link href={`/imports?m=${prevMonth(month)}`} onClick={() => setMonth(prevMonth(month))}>
          <Button variant="outline" size="icon">←</Button>
        </Link>
        <div className="text-center">
          <p className="font-semibold">{formatMonth(month)}</p>
          <p className="text-xs text-muted-foreground">{imports.length} importação(ões)</p>
        </div>
        {month === currentMonth() ? (
          <Button variant="outline" size="icon" disabled>→</Button>
        ) : (
          <Link href={`/imports?m=${nextMonth(month)}`} onClick={() => setMonth(nextMonth(month))}>
            <Button variant="outline" size="icon">→</Button>
          </Link>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Carregando importações...</p>}

      {!loading && imports.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">Nenhum arquivo importado neste mês</p>
          <p className="mt-1 text-sm text-muted-foreground">Importe um PDF para começar ou navegue para outro mês.</p>
        </div>
      )}

      <div className="grid gap-3">
        {imports.map((item) => (
          <Card key={item.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">
                    {item.fileName ?? `${SOURCE_LABELS[item.source] ?? item.source} · ${item.inputType}`}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {SOURCE_LABELS[item.source] ?? item.source} · {item.inputType} · importado em {new Date(item.createdAt).toLocaleString('pt-BR')}
                  </p>
                  {(item.fileSize || item.fileHash) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[formatFileSize(item.fileSize), item.fileHash ? `hash ${item.fileHash.slice(0, 10)}` : null].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <Badge variant={item.pending > 0 ? 'outline' : 'default'}>
                  {item.pending > 0 ? `${item.pending} pendente(s)` : 'Revisado'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 text-sm sm:grid-cols-5">
                <div>
                  <p className="text-muted-foreground">Arquivo</p>
                  <p className="font-semibold">{item.processedCount || item.total}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Novos</p>
                  <p className="font-semibold text-blue-600">{item.newCount || item.total}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Completados</p>
                  <p className="font-semibold text-green-600">{item.completedCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pendentes</p>
                  <p className="font-semibold">{item.pending}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Valor novo</p>
                  <p className="font-semibold">{formatCents(item.totalCents)}</p>
                </div>
              </div>
              {item.duplicateCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {item.duplicateCount} movimentação(ões) já existiam e foram ignoradas.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Link href={`/review/${item.id}`}>
                  <Button variant="outline" size="sm">
                    <RefreshCw className="size-4" />
                    Reabrir revisão
                  </Button>
                </Link>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deletingId === item.id}
                  onClick={() => deleteImport(item)}
                >
                  <Trash2 className="size-4" />
                  {deletingId === item.id ? 'Removendo' : 'Remover importação'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
