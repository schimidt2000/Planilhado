'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCents } from '@/lib/format'
import { CATEGORY_NAMES, getSubcategories } from '@/lib/categories'
import type { TransactionWithMeta, SuggestionResult, TransactionType } from '@/lib/types'

interface Props {
  transaction: TransactionWithMeta
  onChange: (id: string, patch: Partial<TransactionWithMeta>) => void
}

const SOURCE_LABELS: Record<string, string> = {
  nubank: 'Nubank',
  inter: 'Inter',
  picpay: 'PicPay',
  pix: 'Pix',
}

export function TransactionReviewCard({ transaction: tx, onChange }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null)
  const [suggestionLoading, setSuggestionLoading] = useState(false)

  const fetchSuggestion = useCallback(async () => {
    if (suggestionLoading) return
    setSuggestionLoading(true)
    const params = new URLSearchParams({ description: tx.description })
    if (tx.installmentTotal) params.set('installmentTotal', String(tx.installmentTotal))
    if (tx.installmentCurrent) params.set('installmentCurrent', String(tx.installmentCurrent))
    const res = await fetch(`/api/suggestions?${params}`)
    if (res.ok) {
      const data: SuggestionResult = await res.json()
      setSuggestion(data.confidence !== 'low' ? data : null)
    }
    setSuggestionLoading(false)
  }, [tx.description, tx.installmentTotal, tx.installmentCurrent, suggestionLoading])

  useEffect(() => {
    if (expanded && !suggestion && !suggestionLoading) {
      fetchSuggestion()
    }
  }, [expanded, suggestion, suggestionLoading, fetchSuggestion])

  function applySuggestion() {
    if (!suggestion) return
    onChange(tx.id, {
      ...(suggestion.category && { category: suggestion.category }),
      ...(suggestion.subcategory && { subcategory: suggestion.subcategory }),
      ...(suggestion.debtorName && { debtorName: suggestion.debtorName }),
      ...(suggestion.transactionType && { transactionType: suggestion.transactionType }),
    })
  }

  const statusBadge = {
    pending: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-800' },
    approved: { label: 'Aprovado', cls: 'bg-green-100 text-green-800' },
    rejected: { label: 'Rejeitado', cls: 'bg-red-100 text-red-800' },
  }[tx.status] ?? { label: tx.status, cls: '' }

  return (
    <Card className={`transition-all ${tx.status === 'rejected' ? 'opacity-50' : ''} ${tx.isCharge ? 'border-amber-200' : ''}`}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{tx.description}</span>
              {tx.isCharge && <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">Encargo</Badge>}
              {tx.installmentCurrent && tx.installmentTotal && (
                <Badge variant="outline" className="text-xs">{tx.installmentCurrent}/{tx.installmentTotal}</Badge>
              )}
              <Badge className={`text-xs ${statusBadge.cls}`} variant="outline">{statusBadge.label}</Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{new Date(tx.date).toLocaleDateString('pt-BR')}</span>
              <span>·</span>
              <span>{SOURCE_LABELS[tx.sourceType] ?? tx.sourceType}</span>
              {tx.category && <><span>·</span><span>{tx.category}</span></>}
              {tx.debtorName && <><span>·</span><span className="text-blue-600">→ {tx.debtorName}</span></>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`font-bold text-sm ${tx.isCredit ? 'text-green-600' : ''}`}>
              {tx.isCredit ? '-' : ''}{formatCents(tx.amountCents)}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={tx.status === 'approved' ? 'default' : 'outline'}
                className="h-7 text-xs px-2"
                onClick={() => { onChange(tx.id, { status: 'approved' }); setExpanded(true) }}
              >✓</Button>
              <Button
                size="sm"
                variant={tx.status === 'rejected' ? 'destructive' : 'outline'}
                className="h-7 text-xs px-2"
                onClick={() => onChange(tx.id, { status: 'rejected' })}
              >✕</Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2"
                onClick={() => setExpanded((v) => !v)}
              >{expanded ? '▲' : '▼'}</Button>
            </div>
          </div>
        </div>

        {/* Expanded detail panel */}
        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-3">
            {suggestion && (
              <div className="p-2 rounded bg-blue-50 border border-blue-200 flex items-center justify-between">
                <div className="text-xs text-blue-700">
                  <strong>Sugestão {suggestion.confidence === 'high' ? '🎯' : '💡'}:</strong>
                  {suggestion.category && ` ${suggestion.category}`}
                  {suggestion.debtorName && ` · Devedor: ${suggestion.debtorName}`}
                  {suggestion.transactionType === 'receivable' && ' · A receber'}
                </div>
                <Button size="sm" variant="outline" className="text-xs h-6 border-blue-300" onClick={applySuggestion}>
                  Aplicar
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select
                  value={tx.transactionType ?? ''}
                  onValueChange={(v) => onChange(tx.id, { transactionType: (v as TransactionType) || null })}
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Gasto próprio</SelectItem>
                    <SelectItem value="receivable">A receber de alguém</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {tx.transactionType === 'receivable' && (
                <div>
                  <Label className="text-xs">Devedor</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    placeholder="Nome do devedor"
                    value={tx.debtorName ?? ''}
                    onChange={(e) => onChange(tx.id, { debtorName: e.target.value || null })}
                  />
                </div>
              )}

              <div>
                <Label className="text-xs">Categoria</Label>
                <Select
                  value={tx.category ?? ''}
                  onValueChange={(v) => onChange(tx.id, { category: v || null, subcategory: null })}
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue placeholder="Categoria..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_NAMES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {tx.category && getSubcategories(tx.category).length > 0 && (
                <div>
                  <Label className="text-xs">Subcategoria</Label>
                  <Select
                    value={tx.subcategory ?? ''}
                    onValueChange={(v) => onChange(tx.id, { subcategory: v || null })}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue placeholder="Subcategoria..." />
                    </SelectTrigger>
                    <SelectContent>
                      {getSubcategories(tx.category).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="col-span-2">
                <Label className="text-xs">Observações</Label>
                <Input
                  className="h-8 text-xs mt-1"
                  placeholder="Notas opcionais..."
                  value={tx.notes ?? ''}
                  onChange={(e) => onChange(tx.id, { notes: e.target.value || null })}
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
