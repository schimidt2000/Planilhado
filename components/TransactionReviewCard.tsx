'use client'

import { useState, useEffect, useCallback } from 'react'
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCents } from '@/lib/format'
import { CATEGORY_NAMES, getSubcategories } from '@/lib/categories'
import type { Debtor, SplitMode, TransactionSplitInput, TransactionWithMeta, SuggestionResult, TransactionType } from '@/lib/types'

interface Props {
  transaction: TransactionWithMeta
  onChange: (id: string, patch: Partial<TransactionWithMeta>) => void
  onDecide: (transaction: TransactionWithMeta, status: 'approved' | 'rejected') => Promise<void>
}

const SOURCE_LABELS: Record<string, string> = {
  nubank: 'Nubank',
  inter: 'Inter',
  picpay: 'PicPay',
  pix: 'Pix',
}

export function TransactionReviewCard({ transaction: tx, onChange, onDecide }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null)
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [debtors, setDebtors] = useState<Debtor[]>([])

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
  }, [tx.description, tx.installmentTotal, tx.installmentCurrent])

  useEffect(() => {
    if (expanded && !suggestion && !suggestionLoading) {
      fetchSuggestion()
    }
  }, [expanded, suggestion, suggestionLoading, fetchSuggestion])

  useEffect(() => {
    if (!expanded || debtors.length > 0) return
    fetch('/api/debtors')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setDebtors(Array.isArray(data) ? data : []))
      .catch(() => setDebtors([]))
  }, [expanded, debtors.length])

  function applySuggestion() {
    if (!suggestion) return
    onChange(tx.id, {
      ...(suggestion.category && { category: suggestion.category }),
      ...(suggestion.subcategory && { subcategory: suggestion.subcategory }),
      ...(suggestion.debtorName && { debtorName: suggestion.debtorName }),
      ...(suggestion.transactionType && { transactionType: suggestion.transactionType }),
    })
  }

  function setSplitMode(splitMode: SplitMode) {
    if (splitMode === 'none') {
      onChange(tx.id, { splitMode, splits: [], debtorName: null, transactionType: 'expense' })
      return
    }

    onChange(tx.id, {
      splitMode,
      transactionType: 'expense',
      debtorName: null,
      splits: tx.splits?.length ? normalizeSplits(splitMode, tx.splits) : [{ debtorName: '', amountCents: 0 }],
    })
  }

  function normalizeSplits(splitMode: SplitMode, splits: TransactionSplitInput[]) {
    if (splitMode !== 'equal') return splits
    const named = splits.filter((split) => split.debtorName.trim())
    if (named.length === 0) return splits.map((split) => ({ ...split, amountCents: 0 }))
    const equalShare = Math.floor(tx.amountCents / (named.length + 1))
    return splits.map((split) => ({
      ...split,
      amountCents: split.debtorName.trim() ? equalShare : 0,
    }))
  }

  function updateSplit(index: number, patch: Partial<TransactionSplitInput>) {
    const next = [...(tx.splits ?? [])]
    next[index] = { ...next[index], ...patch }
    onChange(tx.id, { splits: normalizeSplits(tx.splitMode, next) })
  }

  function addSplit() {
    const next = [...(tx.splits ?? []), { debtorName: '', amountCents: 0 }]
    onChange(tx.id, { splits: normalizeSplits(tx.splitMode, next) })
  }

  function removeSplit(index: number) {
    const next = (tx.splits ?? []).filter((_, i) => i !== index)
    onChange(tx.id, { splits: normalizeSplits(tx.splitMode, next) })
  }

  const splitTotal = (tx.splits ?? []).reduce((sum, split) => sum + split.amountCents, 0)

  return (
    <Card className={`transition-all ${tx.isCharge ? 'border-amber-200' : ''}`}>
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
              <Badge className="bg-yellow-50 text-xs text-yellow-800" variant="outline">Pendente</Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{new Date(tx.date).toLocaleDateString('pt-BR')}</span>
              <span>·</span>
              <span>{SOURCE_LABELS[tx.sourceType] ?? tx.sourceType}</span>
              {tx.cardLastFour && <><span>·</span><span>Cartão final {tx.cardLastFour}</span></>}
              {tx.category && <><span>·</span><span>{tx.category}</span></>}
              {tx.splitMode !== 'none' && splitTotal > 0 && <><span>·</span><span className="text-blue-600">Rateio {formatCents(splitTotal)}</span></>}
              {tx.debtorName && <><span>·</span><span className="text-blue-600">→ {tx.debtorName}</span></>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`font-bold text-sm ${tx.isCredit ? 'text-green-600' : ''}`}>
              {tx.isCredit ? '-' : ''}{formatCents(tx.amountCents)}
            </span>
            <Button size="icon-sm" variant="ghost" title={expanded ? 'Recolher detalhes' : 'Revisar gasto'} onClick={() => setExpanded((value) => !value)}>
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
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
                  onValueChange={(v) => {
                    const transactionType = (v as TransactionType) || null
                    onChange(tx.id, {
                      transactionType,
                      splitMode: transactionType === 'receivable' ? 'none' : tx.splitMode,
                      splits: transactionType === 'receivable' ? [] : tx.splits,
                    })
                  }}
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
                    list={`debtors-${tx.id}`}
                    placeholder="Nome do devedor"
                    value={tx.debtorName ?? ''}
                    onChange={(e) => onChange(tx.id, { debtorName: e.target.value || null })}
                  />
                  <datalist id={`debtors-${tx.id}`}>
                    {debtors.map((debtor) => (
                      <option key={debtor.id} value={debtor.name} />
                    ))}
                  </datalist>
                </div>
              )}

              {tx.transactionType !== 'receivable' && (
                <div>
                  <Label className="text-xs">Rateio</Label>
                  <Select
                    value={tx.splitMode ?? 'none'}
                    onValueChange={(v) => setSplitMode(v as SplitMode)}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue placeholder="Rateio..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem rateio</SelectItem>
                      <SelectItem value="equal">Dividir igualmente</SelectItem>
                      <SelectItem value="custom">Valores personalizados</SelectItem>
                    </SelectContent>
                  </Select>
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

            {tx.transactionType !== 'receivable' && tx.splitMode !== 'none' && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium">Pessoas no rateio</p>
                    <p className="text-xs text-muted-foreground">
                      {tx.splitMode === 'equal'
                        ? 'Divisão igual considera você + as pessoas abaixo.'
                        : 'Informe quanto cada pessoa deve nesta compra.'}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={addSplit}>Adicionar</Button>
                </div>

                {(tx.splits ?? []).map((split, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                    <div>
                      <Input
                        className="h-8 text-xs"
                        list={`split-debtors-${tx.id}`}
                        placeholder="Nome"
                        value={split.debtorName}
                        onChange={(e) => updateSplit(index, { debtorName: e.target.value })}
                      />
                    </div>
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={tx.splitMode === 'equal'}
                      value={(split.amountCents / 100).toFixed(2)}
                      onChange={(e) => updateSplit(index, { amountCents: Math.round(Number(e.target.value || 0) * 100) })}
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => removeSplit(index)}>
                      Remover
                    </Button>
                  </div>
                ))}

                <datalist id={`split-debtors-${tx.id}`}>
                  {debtors.map((debtor) => (
                    <option key={debtor.id} value={debtor.name} />
                  ))}
                </datalist>

                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="text-muted-foreground">A receber: {formatCents(splitTotal)}</span>
                  <span className="text-muted-foreground">Sua parte: {formatCents(Math.max(0, tx.amountCents - splitTotal))}</span>
                  {splitTotal > tx.amountCents && <span className="text-destructive">Rateio maior que o valor da compra</span>}
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onDecide(tx, 'rejected')}>
                <X className="size-4" /> Recusar gasto
              </Button>
              <Button type="button" onClick={() => onDecide(tx, 'approved')}>
                <Check className="size-4" /> Aprovar gasto
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
