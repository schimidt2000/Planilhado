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
import { splitTotalCents, validateTransactionDecision } from '@/lib/finance-rules'
import type { Debtor, SplitMode, TransactionSplitInput, TransactionWithMeta, SuggestionResult, TransactionType } from '@/lib/types'

interface Props {
  transaction: TransactionWithMeta
  linkedCharges?: TransactionWithMeta[]
  linkedRefunds?: TransactionWithMeta[]
  onChange: (id: string, patch: Partial<TransactionWithMeta>) => void
  onDecide: (transaction: TransactionWithMeta, status: 'approved' | 'rejected') => Promise<void>
}

const SOURCE_LABELS: Record<string, string> = {
  nubank: 'Nubank',
  inter: 'Inter',
  picpay: 'PicPay',
  pix: 'Pix',
  manual: 'Manual',
}

export function TransactionReviewCard({ transaction: tx, linkedCharges = [], linkedRefunds = [], onChange, onDecide }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null)
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const linkedRefundsTotal = linkedRefunds.reduce((sum, refund) => sum + refund.amountCents, 0)
  const netAmountCents = Math.max(0, tx.amountCents - linkedRefundsTotal)

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
      ...(suggestion.debtorId && { debtorId: suggestion.debtorId }),
      ...(suggestion.debtorName && { debtorName: suggestion.debtorName }),
      ...(suggestion.transactionType && { transactionType: suggestion.transactionType }),
    })
  }

  function setSplitMode(splitMode: SplitMode) {
    if (splitMode === 'none') {
      onChange(tx.id, {
        splitMode,
        splits: [],
        debtorId: tx.transactionType === 'receivable' ? tx.debtorId : null,
        debtorName: tx.transactionType === 'receivable' ? tx.debtorName : null,
      })
      return
    }

    onChange(tx.id, {
      splitMode,
      transactionType: tx.transactionType === 'receivable' ? 'receivable' : 'expense',
      debtorId: null,
      debtorName: null,
      splits: tx.splits?.length ? normalizeSplits(splitMode, tx.splits) : [{ debtorId: null, debtorName: '', amountCents: 0 }],
    })
  }

  function normalizeSplits(splitMode: SplitMode, splits: TransactionSplitInput[]) {
    if (splitMode !== 'equal') return splits
    const named = splits.filter((split) => split.debtorId || split.debtorName.trim())
    if (named.length === 0) return splits.map((split) => ({ ...split, amountCents: 0 }))
    const equalShare = Math.floor(netAmountCents / (named.length + 1))
    return splits.map((split) => ({
      ...split,
      amountCents: split.debtorId || split.debtorName.trim() ? equalShare : 0,
    }))
  }

  function updateSplit(index: number, patch: Partial<TransactionSplitInput>) {
    const next = [...(tx.splits ?? [])]
    next[index] = { ...next[index], ...patch }
    onChange(tx.id, { splits: normalizeSplits(tx.splitMode, next) })
  }

  function addSplit() {
    const next = [...(tx.splits ?? []), { debtorId: null, debtorName: '', amountCents: 0 }]
    onChange(tx.id, { splits: normalizeSplits(tx.splitMode, next) })
  }

  function removeSplit(index: number) {
    const next = (tx.splits ?? []).filter((_, i) => i !== index)
    onChange(tx.id, { splits: normalizeSplits(tx.splitMode, next) })
  }

  function debtorValue(debtorId?: string | null, debtorName?: string | null) {
    if (debtorId) return debtorId
    if (debtorName?.trim()) return `legacy:${debtorName.trim()}`
    return 'none'
  }

  function debtorPatch(value: string | null) {
    if (!value || value === 'none') return { debtorId: null, debtorName: null }
    if (value.startsWith('legacy:')) return { debtorId: null, debtorName: value.slice(7) }
    const debtor = debtors.find((item) => item.id === value)
    return { debtorId: debtor?.id ?? null, debtorName: debtor?.name ?? null }
  }

  function splitDebtorPatch(value: string | null): Partial<TransactionSplitInput> {
    const patch = debtorPatch(value)
    return { debtorId: patch.debtorId, debtorName: patch.debtorName ?? '' }
  }

  function hasLegacyDebtor(debtorId?: string | null, debtorName?: string | null) {
    const name = debtorName?.trim()
    return Boolean(!debtorId && name && !debtors.some((debtor) => debtor.name.toLowerCase() === name.toLowerCase()))
  }

  const splitTotal = splitTotalCents(tx.splits)
  const approvalError = netAmountCents > 0 ? validateTransactionDecision({
    amountCents: netAmountCents,
    transactionType: tx.transactionType,
    debtorId: tx.debtorId,
    debtorName: tx.debtorName,
    splitMode: tx.splitMode,
    splits: tx.splits,
  }) : null
  const linkedChargesTotal = linkedCharges.reduce((sum, charge) => sum + charge.amountCents, 0)

  return (
    <Card className={`transition-all ${tx.isCharge ? 'border-amber-200' : ''}`}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{tx.description}</span>
              {tx.isCharge && <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">Encargo</Badge>}
              {linkedCharges.length > 0 && (
                <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">
                  IOF +{formatCents(linkedChargesTotal)}
                </Badge>
              )}
              {linkedRefunds.length > 0 && (
                <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-700">
                  {netAmountCents === 0 ? 'Estornado' : `Estorno -${formatCents(linkedRefundsTotal)}`}
                </Badge>
              )}
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
          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
            <div className="text-right">
              <span className={`block font-bold text-sm ${tx.isCredit || linkedRefunds.length > 0 ? 'text-green-600' : ''}`}>
                {tx.isCredit ? '-' : ''}{formatCents(tx.isCredit ? tx.amountCents : netAmountCents)}
              </span>
              {linkedRefunds.length > 0 && (
                <span className="block text-[11px] text-muted-foreground">
                  {formatCents(tx.amountCents)} - {formatCents(linkedRefundsTotal)} estorno
                </span>
              )}
            </div>
            <Button size="icon-sm" variant="ghost" title={expanded ? 'Recolher detalhes' : 'Revisar gasto'} onClick={() => setExpanded((value) => !value)}>
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
          </div>
        </div>

        {/* Expanded detail panel */}
        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-3">
            {linkedCharges.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-medium text-amber-900">IOF vinculado automaticamente</p>
                <div className="mt-2 space-y-1 text-xs text-amber-900">
                  {linkedCharges.map((charge) => (
                    <div key={charge.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {new Date(charge.date).toLocaleDateString('pt-BR')} · {charge.description}
                      </span>
                      <span className="shrink-0 font-medium">{formatCents(charge.amountCents)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {linkedRefunds.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-medium text-emerald-900">Estorno vinculado automaticamente</p>
                <div className="mt-2 space-y-1 text-xs text-emerald-900">
                  {linkedRefunds.map((refund) => (
                    <div key={refund.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {new Date(refund.date).toLocaleDateString('pt-BR')} · {refund.description}
                      </span>
                      <span className="shrink-0 font-medium">-{formatCents(refund.amountCents)}</span>
                    </div>
                  ))}
                </div>
                {netAmountCents === 0 && (
                  <p className="mt-2 text-xs text-emerald-800">
                    Estorno integral: após aprovar, este item não entra nos gastos do mês.
                  </p>
                )}
              </div>
            )}

            {suggestion && (
              <div className="p-2 rounded bg-blue-50 border border-blue-200 flex items-center justify-between">
                <div className="text-xs text-blue-700">
                  <strong>Sugestão:</strong>
                  {suggestion.category && ` ${suggestion.category}`}
                  {suggestion.debtorName && ` · Devedor: ${suggestion.debtorName}`}
                  {suggestion.transactionType === 'receivable' && ' · A receber'}
                </div>
                <Button size="sm" variant="outline" className="text-xs h-6 border-blue-300" onClick={applySuggestion}>
                  Aplicar
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select
                  value={tx.transactionType ?? ''}
                  onValueChange={(v) => {
                    const transactionType = (v as TransactionType) || null
                    const hasSplits = tx.splitMode !== 'none'
                    onChange(tx.id, {
                      transactionType,
                      debtorId: transactionType === 'receivable' && !hasSplits ? tx.debtorId : null,
                      debtorName: transactionType === 'receivable' && !hasSplits ? tx.debtorName : null,
                    })
                  }}
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue placeholder="Selecione...">
                      {tx.transactionType === 'receivable' ? 'A receber de alguém' : tx.transactionType === 'expense' ? 'Gasto próprio' : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Gasto próprio</SelectItem>
                    <SelectItem value="receivable">A receber de alguém</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {tx.transactionType === 'receivable' && tx.splitMode === 'none' && (
                <div>
                  <Label className="text-xs">Devedor</Label>
                  <Select
                    value={debtorValue(tx.debtorId, tx.debtorName)}
                    onValueChange={(value) => onChange(tx.id, debtorPatch(value))}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue placeholder="Selecione...">
                        {tx.debtorName || 'Selecione...'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione...</SelectItem>
                      {hasLegacyDebtor(tx.debtorId, tx.debtorName) && (
                        <SelectItem value={`legacy:${tx.debtorName}`}>{tx.debtorName} (sem cadastro)</SelectItem>
                      )}
                      {debtors.map((debtor) => (
                        <SelectItem key={debtor.id} value={debtor.id}>{debtor.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className="text-xs">Rateio</Label>
                <Select
                  value={tx.splitMode ?? 'none'}
                  onValueChange={(v) => setSplitMode(v as SplitMode)}
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue placeholder="Rateio...">
                      {tx.splitMode === 'equal' ? 'Dividir igualmente' : tx.splitMode === 'custom' ? 'Valores personalizados' : 'Sem rateio'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem rateio</SelectItem>
                    <SelectItem value="equal">Dividir igualmente</SelectItem>
                    <SelectItem value="custom">Valores personalizados</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Categoria</Label>
                <Select
                  value={tx.category ?? ''}
                  onValueChange={(v) => onChange(tx.id, { category: v || null, subcategory: null })}
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue placeholder="Categoria...">{tx.category || undefined}</SelectValue>
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
                      <SelectValue placeholder="Subcategoria...">{tx.subcategory || undefined}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {getSubcategories(tx.category).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="sm:col-span-2">
                <Label className="text-xs">Observações</Label>
                <Input
                  className="h-8 text-xs mt-1"
                  placeholder="Notas opcionais..."
                  value={tx.notes ?? ''}
                  onChange={(e) => onChange(tx.id, { notes: e.target.value || null })}
                />
              </div>
            </div>

            {tx.splitMode !== 'none' && (
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
                      <Select
                        value={debtorValue(split.debtorId, split.debtorName)}
                        onValueChange={(value) => updateSplit(index, splitDebtorPatch(value))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Pessoa">
                            {split.debtorName || 'Pessoa'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione...</SelectItem>
                          {hasLegacyDebtor(split.debtorId, split.debtorName) && (
                            <SelectItem value={`legacy:${split.debtorName}`}>{split.debtorName} (sem cadastro)</SelectItem>
                          )}
                          {debtors.map((debtor) => (
                            <SelectItem key={debtor.id} value={debtor.id}>{debtor.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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

                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="text-muted-foreground">A receber: {formatCents(splitTotal)}</span>
                  <span className="text-muted-foreground">Sua parte: {formatCents(Math.max(0, netAmountCents - splitTotal))}</span>
                  {approvalError && <span className="text-destructive">{approvalError}</span>}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
              {approvalError && <p className="text-xs text-destructive sm:mr-auto sm:self-center">{approvalError}</p>}
              <Button type="button" variant="outline" onClick={() => onDecide(tx, 'rejected')}>
                <X className="size-4" /> Recusar gasto
              </Button>
              <Button type="button" disabled={Boolean(approvalError)} onClick={() => onDecide(tx, 'approved')}>
                <Check className="size-4" /> Aprovar gasto
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
