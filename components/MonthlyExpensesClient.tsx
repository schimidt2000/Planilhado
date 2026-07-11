'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Pencil, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CATEGORY_NAMES, getSubcategories } from '@/lib/categories'
import { currentMonth, formatCents, formatMonth, nextMonth, prevMonth } from '@/lib/format'
import { splitTotalCents, validateTransactionDecision } from '@/lib/finance-rules'
import type { Debtor, MonthlyReport, SplitMode, TransactionSplitInput, TransactionWithMeta } from '@/lib/types'

type SortMode = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'description'

type ExpenseForm = {
  date: string
  description: string
  amount: string
  transactionType: 'expense' | 'receivable'
  debtorId: string | null
  debtorName: string | null
  splitMode: SplitMode
  splits: TransactionSplitInput[]
  category: string
  subcategory: string
  notes: string
}

const SOURCE_LABELS: Record<string, string> = {
  nubank: 'Nubank',
  inter: 'Inter',
  picpay: 'PicPay',
  pix: 'Pix / conta',
  manual: 'Manual',
}

const SORT_LABELS: Record<SortMode, string> = {
  'date-desc': 'Data recente',
  'date-asc': 'Data antiga',
  'amount-desc': 'Maior valor',
  'amount-asc': 'Menor valor',
  description: 'Descrição',
}

function inputAmount(cents: number) {
  return (cents / 100).toFixed(2)
}

function centsFromInput(value: string) {
  return Math.max(0, Math.round(Number(value || 0) * 100))
}

function debtorSelectValue(debtorId?: string | null, debtorName?: string | null) {
  if (debtorId) return debtorId
  if (debtorName?.trim()) return `legacy:${debtorName.trim()}`
  return 'none'
}

function formFromTransaction(transaction: TransactionWithMeta): ExpenseForm {
  return {
    date: transaction.date,
    description: transaction.description,
    amount: inputAmount(transaction.grossAmountCents ?? transaction.amountCents),
    transactionType: transaction.transactionType === 'receivable' ? 'receivable' : 'expense',
    debtorId: transaction.debtorId ?? null,
    debtorName: transaction.debtorName ?? null,
    splitMode: transaction.splitMode ?? 'none',
    splits: transaction.splits ?? [],
    category: transaction.category ?? '',
    subcategory: transaction.subcategory ?? '',
    notes: transaction.notes ?? '',
  }
}

function sortTransactions(sortMode: SortMode, a: TransactionWithMeta, b: TransactionWithMeta) {
  if (sortMode === 'date-desc') return b.date.localeCompare(a.date) || a.description.localeCompare(b.description, 'pt-BR')
  if (sortMode === 'date-asc') return a.date.localeCompare(b.date) || a.description.localeCompare(b.description, 'pt-BR')
  if (sortMode === 'amount-desc') return b.amountCents - a.amountCents
  if (sortMode === 'amount-asc') return a.amountCents - b.amountCents
  return a.description.localeCompare(b.description, 'pt-BR')
}

export function MonthlyExpensesClient({ report, month }: { report: MonthlyReport; month: string }) {
  const router = useRouter()
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortMode, setSortMode] = useState<SortMode>('date-desc')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ExpenseForm | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/debtors')
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setDebtors(Array.isArray(data) ? data : []))
      .catch(() => setDebtors([]))
  }, [])

  const transactions = report.transactions
  const sourceOptions = useMemo(() => {
    return Array.from(new Set(transactions.map((transaction) => transaction.sourceType)))
      .sort((a, b) => (SOURCE_LABELS[a] ?? a).localeCompare(SOURCE_LABELS[b] ?? b, 'pt-BR'))
  }, [transactions])
  const refundTotal = transactions.reduce((sum, transaction) => sum + (transaction.refundedCents ?? 0), 0)

  const visibleTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return transactions
      .filter((transaction) => sourceFilter === 'all' || transaction.sourceType === sourceFilter)
      .filter((transaction) => {
        if (typeFilter === 'all') return true
        if (typeFilter === 'receivable') return transaction.transactionType === 'receivable' || transaction.splits.length > 0
        if (typeFilter === 'refund') return Boolean(transaction.refundedCents)
        return transaction.transactionType !== 'receivable' && transaction.splits.length === 0
      })
      .filter((transaction) => {
        if (!normalizedQuery) return true
        return [
          transaction.description,
          transaction.category,
          transaction.subcategory,
          transaction.notes,
          transaction.debtorName,
          transaction.sourceType,
        ].some((value) => value?.toLowerCase().includes(normalizedQuery))
      })
      .sort((a, b) => sortTransactions(sortMode, a, b))
  }, [query, sortMode, sourceFilter, transactions, typeFilter])

  function patchForm(patch: Partial<ExpenseForm>) {
    setForm((current) => current ? { ...current, ...patch } : current)
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

  function netAmountForForm(transaction: TransactionWithMeta, draft = form) {
    if (!draft) return transaction.amountCents
    return Math.max(0, centsFromInput(draft.amount) - (transaction.refundedCents ?? 0))
  }

  function normalizeSplits(transaction: TransactionWithMeta, splitMode: SplitMode, splits: TransactionSplitInput[]) {
    if (splitMode !== 'equal') return splits
    const named = splits.filter((split) => split.debtorId || split.debtorName.trim())
    if (named.length === 0) return splits.map((split) => ({ ...split, amountCents: 0 }))
    const share = Math.floor(netAmountForForm(transaction) / (named.length + 1))
    return splits.map((split) => ({
      ...split,
      amountCents: split.debtorId || split.debtorName.trim() ? share : 0,
    }))
  }

  function startEditing(transaction: TransactionWithMeta) {
    setEditingId(transaction.id)
    setForm(formFromTransaction(transaction))
  }

  function setSplitMode(transaction: TransactionWithMeta, splitMode: SplitMode) {
    if (!form) return
    if (splitMode === 'none') {
      patchForm({
        splitMode,
        splits: [],
        debtorId: form.transactionType === 'receivable' ? form.debtorId : null,
        debtorName: form.transactionType === 'receivable' ? form.debtorName : null,
      })
      return
    }

    patchForm({
      splitMode,
      transactionType: form.transactionType === 'receivable' ? 'receivable' : 'expense',
      debtorId: null,
      debtorName: null,
      splits: form.splits.length
        ? normalizeSplits(transaction, splitMode, form.splits)
        : [{ debtorId: null, debtorName: '', amountCents: 0 }],
    })
  }

  function updateSplit(transaction: TransactionWithMeta, index: number, patch: Partial<TransactionSplitInput>) {
    if (!form) return
    const next = [...form.splits]
    next[index] = { ...next[index], ...patch }
    patchForm({ splits: normalizeSplits(transaction, form.splitMode, next) })
  }

  function removeSplit(transaction: TransactionWithMeta, index: number) {
    if (!form) return
    patchForm({ splits: normalizeSplits(transaction, form.splitMode, form.splits.filter((_, itemIndex) => itemIndex !== index)) })
  }

  function addSplit(transaction: TransactionWithMeta) {
    if (!form) return
    patchForm({ splits: normalizeSplits(transaction, form.splitMode, [...form.splits, { debtorId: null, debtorName: '', amountCents: 0 }]) })
  }

  async function saveEdit(transaction: TransactionWithMeta) {
    if (!form) return
    const grossAmountCents = centsFromInput(form.amount)
    const netAmountCents = Math.max(0, grossAmountCents - (transaction.refundedCents ?? 0))
    const saveSplitMode = netAmountCents <= 0 ? 'none' : form.splitMode
    const preparedSplits = saveSplitMode === 'none' ? [] : normalizeSplits(transaction, saveSplitMode, form.splits)
    const transactionType = netAmountCents <= 0 ? 'expense' : form.transactionType
    const validationError = netAmountCents > 0 ? validateTransactionDecision({
      amountCents: netAmountCents,
      transactionType,
      debtorId: form.debtorId,
      debtorName: form.debtorName,
      splitMode: saveSplitMode,
      splits: preparedSplits,
    }) : null

    if (validationError) {
      toast.error(validationError)
      return
    }

    setSaving(true)
    const response = await fetch(`/api/transactions/${transaction.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: form.date,
        description: form.description,
        amountCents: grossAmountCents,
        transactionType,
        debtorId: transactionType === 'receivable' && saveSplitMode === 'none' ? form.debtorId : null,
        debtorName: transactionType === 'receivable' && saveSplitMode === 'none' ? form.debtorName : null,
        splitMode: saveSplitMode,
        splits: preparedSplits,
        category: form.category || null,
        subcategory: form.subcategory || null,
        notes: form.notes || null,
      }),
    })
    setSaving(false)

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      toast.error(data?.error ?? 'Não foi possível salvar o gasto')
      return
    }

    toast.success('Gasto atualizado')
    setEditingId(null)
    setForm(null)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href={`/expenses?m=${prevMonth(month)}`}>
            <Button variant="outline" size="icon" title="Mês anterior"><ArrowLeft className="size-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Gastos aprovados</h1>
            <p className="text-sm text-muted-foreground">{formatMonth(month)}</p>
          </div>
          {month !== currentMonth() && (
            <Link href={`/expenses?m=${nextMonth(month)}`}>
              <Button variant="outline" size="icon" title="Próximo mês"><ArrowRight className="size-4" /></Button>
            </Link>
          )}
        </div>
        <Link href={`/dashboard?m=${month}`}>
          <Button variant="outline">Voltar ao dashboard</Button>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Transações</p><p className="text-2xl font-bold">{transactions.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Gasto próprio</p><p className="text-2xl font-bold text-destructive">{formatCents(report.totalExpenseCents)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">A receber</p><p className="text-2xl font-bold text-green-600">{formatCents(report.totalReceivableCents)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Estornos</p><p className="text-2xl font-bold text-green-700">{formatCents(refundTotal)}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-3 lg:grid-cols-[1fr_180px_180px_180px] lg:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="expense-search">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="expense-search" className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Descrição, categoria, pessoa..." />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Fonte</Label>
            <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value || 'all')}>
              <SelectTrigger><SelectValue>{sourceFilter === 'all' ? 'Todas' : SOURCE_LABELS[sourceFilter] ?? sourceFilter}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {sourceOptions.map((source) => <SelectItem key={source} value={source}>{SOURCE_LABELS[source] ?? source}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value || 'all')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="expense">Gasto próprio</SelectItem>
                <SelectItem value="receivable">A receber / rateio</SelectItem>
                <SelectItem value="refund">Com estorno</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ordenar</Label>
            <Select value={sortMode} onValueChange={(value) => setSortMode((value || 'date-desc') as SortMode)}>
              <SelectTrigger><SelectValue>{SORT_LABELS[sortMode]}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Data recente</SelectItem>
                <SelectItem value="date-asc">Data antiga</SelectItem>
                <SelectItem value="amount-desc">Maior valor</SelectItem>
                <SelectItem value="amount-asc">Menor valor</SelectItem>
                <SelectItem value="description">Descrição</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {visibleTransactions.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum gasto aprovado encontrado para os filtros atuais.
            </CardContent>
          </Card>
        )}

        {visibleTransactions.map((transaction) => {
          const isEditing = editingId === transaction.id && form
          const splitTotal = isEditing ? splitTotalCents(form.splits) : splitTotalCents(transaction.splits)
          const grossAmount = transaction.grossAmountCents ?? transaction.amountCents

          return (
            <Card key={transaction.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="truncate text-base">{transaction.description}</CardTitle>
                      <Badge variant="outline">{SOURCE_LABELS[transaction.sourceType] ?? transaction.sourceType}</Badge>
                      {transaction.refundedCents ? <Badge variant="outline" className="border-emerald-300 text-emerald-700">Estorno</Badge> : null}
                      {transaction.transactionType === 'receivable' || transaction.splits.length > 0 ? <Badge variant="outline" className="border-blue-300 text-blue-700">A receber</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(`${transaction.date}T12:00:00`).toLocaleDateString('pt-BR')} · {transaction.category ?? 'Sem categoria'}
                      {transaction.cardLastFour ? ` · cartão final ${transaction.cardLastFour}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="text-right">
                      <p className="font-bold">{formatCents(transaction.amountCents)}</p>
                      {transaction.refundedCents ? (
                        <p className="text-xs text-emerald-700">{formatCents(grossAmount)} - {formatCents(transaction.refundedCents)} estorno</p>
                      ) : null}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => isEditing ? (setEditingId(null), setForm(null)) : startEditing(transaction)}>
                      {isEditing ? <X className="size-4" /> : <Pencil className="size-4" />}
                      {isEditing ? 'Fechar' : 'Editar'}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {!isEditing && (
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    {transaction.subcategory && <span>{transaction.subcategory}</span>}
                    {transaction.debtorName && <span className="text-blue-700">Devedor: {transaction.debtorName}</span>}
                    {transaction.splits.length > 0 && <span className="text-blue-700">Rateio: {formatCents(splitTotal)}</span>}
                    {transaction.notes && <span>Obs.: {transaction.notes}</span>}
                  </div>
                )}

                {isEditing && (
                  <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
                    <div className="grid gap-3 sm:grid-cols-[150px_150px_1fr]">
                      <div className="space-y-1.5">
                        <Label>Data</Label>
                        <Input type="date" value={form.date} onChange={(event) => patchForm({ date: event.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Valor original</Label>
                        <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => patchForm({ amount: event.target.value })} />
                        {transaction.refundedCents ? <p className="text-xs text-emerald-700">Líquido: {formatCents(netAmountForForm(transaction))}</p> : null}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Descrição</Label>
                        <Input value={form.description} onChange={(event) => patchForm({ description: event.target.value })} />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label>Tipo</Label>
                        <Select
                          value={form.transactionType}
                          onValueChange={(value) => {
                            const transactionType = value === 'receivable' ? 'receivable' : 'expense'
                            patchForm({
                              transactionType,
                              debtorId: transactionType === 'receivable' && form.splitMode === 'none' ? form.debtorId : null,
                              debtorName: transactionType === 'receivable' && form.splitMode === 'none' ? form.debtorName : null,
                            })
                          }}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="expense">Gasto próprio</SelectItem>
                            <SelectItem value="receivable">A receber</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {form.transactionType === 'receivable' && form.splitMode === 'none' && (
                        <div className="space-y-1.5">
                          <Label>Devedor</Label>
                          <Select value={debtorSelectValue(form.debtorId, form.debtorName)} onValueChange={(value) => patchForm(debtorPatch(value))}>
                            <SelectTrigger><SelectValue>{form.debtorName || 'Selecione'}</SelectValue></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Selecione</SelectItem>
                              {hasLegacyDebtor(form.debtorId, form.debtorName) && <SelectItem value={`legacy:${form.debtorName}`}>{form.debtorName} (sem cadastro)</SelectItem>}
                              {debtors.map((debtor) => <SelectItem key={debtor.id} value={debtor.id}>{debtor.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <Label>Rateio</Label>
                        <Select value={form.splitMode} onValueChange={(value) => setSplitMode(transaction, (value || 'none') as SplitMode)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem rateio</SelectItem>
                            <SelectItem value="equal">Dividir igualmente</SelectItem>
                            <SelectItem value="custom">Valores personalizados</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Categoria</Label>
                        <Select value={form.category} onValueChange={(category) => patchForm({ category: category || '', subcategory: '' })}>
                          <SelectTrigger><SelectValue placeholder="Selecione">{form.category || undefined}</SelectValue></SelectTrigger>
                          <SelectContent>{CATEGORY_NAMES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>

                      {form.category && getSubcategories(form.category).length > 0 && (
                        <div className="space-y-1.5">
                          <Label>Subcategoria</Label>
                          <Select value={form.subcategory} onValueChange={(subcategory) => patchForm({ subcategory: subcategory || '' })}>
                            <SelectTrigger><SelectValue placeholder="Selecione">{form.subcategory || undefined}</SelectValue></SelectTrigger>
                            <SelectContent>{getSubcategories(form.category).map((subcategory) => <SelectItem key={subcategory} value={subcategory}>{subcategory}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                        <Label>Observações</Label>
                        <Input value={form.notes} onChange={(event) => patchForm({ notes: event.target.value })} placeholder="Opcional" />
                      </div>
                    </div>

                    {form.splitMode !== 'none' && (
                      <div className="space-y-3 border-t pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">Pessoas no rateio</p>
                            <p className="text-xs text-muted-foreground">
                              {form.splitMode === 'equal' ? 'A divisão considera você e as pessoas abaixo.' : 'Informe a parte de cada pessoa.'}
                            </p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => addSplit(transaction)}>Adicionar pessoa</Button>
                        </div>
                        {form.splits.map((split, index) => (
                          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                            <Select value={debtorSelectValue(split.debtorId, split.debtorName)} onValueChange={(value) => updateSplit(transaction, index, splitDebtorPatch(value))}>
                              <SelectTrigger><SelectValue>{split.debtorName || 'Pessoa'}</SelectValue></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Selecione</SelectItem>
                                {hasLegacyDebtor(split.debtorId, split.debtorName) && <SelectItem value={`legacy:${split.debtorName}`}>{split.debtorName} (sem cadastro)</SelectItem>}
                                {debtors.map((debtor) => <SelectItem key={debtor.id} value={debtor.id}>{debtor.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={form.splitMode === 'equal'}
                              value={(normalizeSplits(transaction, form.splitMode, form.splits)[index]?.amountCents ?? 0) / 100}
                              onChange={(event) => updateSplit(transaction, index, { amountCents: Math.round(Number(event.target.value || 0) * 100) })}
                            />
                            <Button type="button" variant="outline" size="sm" onClick={() => removeSplit(transaction, index)}>Remover</Button>
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>A receber: {formatCents(splitTotalCents(normalizeSplits(transaction, form.splitMode, form.splits)))}</span>
                          <span>Sua parte: {formatCents(Math.max(0, netAmountForForm(transaction) - splitTotalCents(normalizeSplits(transaction, form.splitMode, form.splits))))}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:justify-end">
                      <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(null) }}>
                        <X className="size-4" /> Cancelar
                      </Button>
                      <Button type="button" disabled={saving} onClick={() => saveEdit(transaction)}>
                        <Check className="size-4" /> {saving ? 'Salvando...' : 'Salvar gasto'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
