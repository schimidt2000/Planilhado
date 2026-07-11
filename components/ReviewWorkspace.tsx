'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Check, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TransactionReviewCard } from '@/components/TransactionReviewCard'
import { toast } from 'sonner'
import { validateTransactionDecision } from '@/lib/finance-rules'
import {
  buildChargeGroups,
  buildRefundGroups,
  buildLinkedChargeUpdate,
  buildLinkedRefundUpdate,
  buildReviewUpdate,
  compareReviewTransactions,
  type ReviewSortMode,
} from '@/lib/review-queue'
import type { TransactionWithMeta } from '@/lib/types'

interface Session {
  id: string
  month: string
  source: string
  inputType: string
  transactions: TransactionWithMeta[]
}

const SOURCE_LABELS: Record<string, string> = {
  nubank: 'Nubank', inter: 'Inter', picpay: 'PicPay', pix: 'Pix', manual: 'Manual',
}

const SORT_LABELS: Record<ReviewSortMode, string> = {
  'date-asc': 'Data crescente',
  'date-desc': 'Data decrescente',
  'amount-desc': 'Maior valor',
  'amount-asc': 'Menor valor',
  source: 'Fonte',
}

export function ReviewWorkspace({ sessionIds }: { sessionIds: string[] }) {
  const router = useRouter()

  const [sessions, setSessions] = useState<Session[]>([])
  const [transactions, setTransactions] = useState<TransactionWithMeta[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [decided, setDecided] = useState({ approved: 0, rejected: 0 })
  const [sourceFilter, setSourceFilter] = useState('all')
  const [sortMode, setSortMode] = useState<ReviewSortMode>('date-asc')

  useEffect(() => {
    async function loadSessions() {
      try {
        const loaded = await Promise.all(
          sessionIds.map(async (sessionId) => {
            const res = await fetch(`/api/import-sessions/${sessionId}`)
            if (!res.ok) throw new Error('Erro ao carregar sessão')
            return res.json() as Promise<Session>
          })
        )

        setSessions(loaded)
        const normalized = (
          loaded.flatMap((item) =>
            item.transactions.map((t: TransactionWithMeta) => ({
              ...t,
              splitMode: t.splitMode ?? 'none',
              splits: t.splits ?? [],
              date: new Date(t.date).toISOString().split('T')[0],
            }))
          )
        )
        setDecided({
          approved: normalized.filter((item) => item.status === 'approved').length,
          rejected: normalized.filter((item) => item.status === 'rejected').length,
        })
        setTransactions(normalized.filter((item) => item.status === 'pending'))
      } catch {
        toast.error('Erro ao carregar sessão')
      } finally {
        setLoading(false)
      }
    }

    loadSessions()
  }, [sessionIds])

  const handleChange = useCallback((id: string, patch: Partial<TransactionWithMeta>) => {
    setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t))
  }, [])

  const chargeGroups = useMemo(() => buildChargeGroups(transactions), [transactions])
  const refundGroups = useMemo(() => buildRefundGroups(transactions), [transactions])

  const sourceOptions = useMemo(() => {
    return Array.from(new Set(transactions.map((transaction) => transaction.sourceType)))
      .sort((a, b) => (SOURCE_LABELS[a] ?? a).localeCompare(SOURCE_LABELS[b] ?? b, 'pt-BR'))
  }, [transactions])

  const visibleTransactions = useMemo(() => {
    return transactions
      .filter((transaction) => !chargeGroups.groupedChargeIds.has(transaction.id))
      .filter((transaction) => !refundGroups.groupedRefundIds.has(transaction.id))
      .filter((transaction) => sourceFilter === 'all' || transaction.sourceType === sourceFilter)
      .sort((a, b) => compareReviewTransactions(sortMode, a, b))
  }, [chargeGroups, refundGroups, sourceFilter, sortMode, transactions])

  const groupedChargeCount = chargeGroups.groupedChargeIds.size
  const groupedRefundCount = refundGroups.groupedRefundIds.size

  const handleDecision = useCallback(async (transaction: TransactionWithMeta, status: 'approved' | 'rejected') => {
    const linkedRefunds = refundGroups.linkedRefundsByParentId.get(transaction.id) ?? []
    const refundedCents = refundGroups.refundedCentsByParentId.get(transaction.id) ?? 0
    const effectiveAmountCents = Math.max(0, transaction.amountCents - refundedCents)
    const reviewTransaction = status === 'approved' && effectiveAmountCents === 0
      ? { ...transaction, transactionType: 'expense', debtorId: null, debtorName: null, splitMode: 'none' as const, splits: [] }
      : transaction

    if (status === 'approved') {
      if (effectiveAmountCents > 0) {
        const validationError = validateTransactionDecision({
          amountCents: effectiveAmountCents,
          transactionType: transaction.transactionType,
          debtorId: transaction.debtorId,
          debtorName: transaction.debtorName,
          splitMode: transaction.splitMode,
          splits: transaction.splits,
        })
        if (validationError) {
          toast.error(validationError)
          return
        }
      }
    }

    const linkedCharges = chargeGroups.linkedChargesByParentId.get(transaction.id) ?? []
    const updates = [
      buildReviewUpdate(reviewTransaction, status),
      ...linkedCharges.map((charge) => buildLinkedChargeUpdate(reviewTransaction, charge, status)),
      ...linkedRefunds.map((refund) => buildLinkedRefundUpdate(reviewTransaction, refund, status)),
    ]

    const response = await fetch('/api/transactions/batch-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    if (!response.ok) {
      toast.error('Não foi possível salvar a decisão')
      return
    }
    const decidedIds = new Set(updates.map((item) => item.id))
    setTransactions((current) => current.filter((item) => !decidedIds.has(item.id)))
    setDecided((current) => ({ ...current, [status]: current[status] + updates.length }))
    const suffixParts = []
    if (linkedCharges.length > 0) suffixParts.push(`${linkedCharges.length} IOF vinculado(s)`)
    if (linkedRefunds.length > 0) suffixParts.push(`${linkedRefunds.length} estorno(s) vinculado(s)`)
    const suffix = suffixParts.length > 0 ? ` com ${suffixParts.join(' e ')}` : ''
    toast.success(status === 'approved' ? `Gasto aprovado${suffix}` : `Gasto recusado${suffix}`)
  }, [chargeGroups, refundGroups])

  async function handleSave() {
    setSaving(true)
    const updates = transactions.map((t) => buildReviewUpdate(t, t.status === 'approved' || t.status === 'rejected' ? t.status : 'pending'))

    const res = await fetch('/api/transactions/batch-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })

    setSaving(false)
    if (res.ok) {
      toast.success('Revisão salva com sucesso!')
      router.push(`/dashboard?m=${sessions[0]?.month}`)
    } else {
      toast.error('Erro ao salvar revisão')
    }
  }

  if (loading) return <p className="text-center py-12 text-muted-foreground">Carregando transações...</p>
  if (sessions.length === 0) return <p className="text-center py-12 text-destructive">Sessão não encontrada</p>

  const approved = decided.approved
  const rejected = decided.rejected
  const pending = transactions.length
  const total = approved + rejected + pending
  const progress = total > 0 ? ((approved + rejected) / total) * 100 : 100
  const month = sessions[0]?.month

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">
            Revisão de gastos
          </h1>
          <p className="text-sm text-muted-foreground">
            {month} · {sessions.length} arquivo(s) · {transactions.length} pendentes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving || pending === 0}>
            {saving ? 'Salvando...' : 'Salvar rascunho'}
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <Progress value={progress} />
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="text-green-600">{approved} aprovadas</span>
          <span className="text-red-500">{rejected} rejeitadas</span>
          <span>{pending} pendentes</span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {sessions.map((session) => (
          <Badge key={session.id} variant="outline">
            {SOURCE_LABELS[session.source] ?? session.source} · {session.inputType}
          </Badge>
        ))}
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs">Filtrar fonte</Label>
          <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value || 'all')}>
            <SelectTrigger className="w-full">
              <SelectValue>{sourceFilter === 'all' ? 'Todas as fontes' : SOURCE_LABELS[sourceFilter] ?? sourceFilter}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as fontes</SelectItem>
              {sourceOptions.map((source) => (
                <SelectItem key={source} value={source}>{SOURCE_LABELS[source] ?? source}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ordenar por</Label>
          <Select value={sortMode} onValueChange={(value) => setSortMode((value || 'date-asc') as ReviewSortMode)}>
            <SelectTrigger className="w-full">
              <SelectValue>{SORT_LABELS[sortMode]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-asc">Data crescente</SelectItem>
              <SelectItem value="date-desc">Data decrescente</SelectItem>
              <SelectItem value="amount-desc">Maior valor</SelectItem>
              <SelectItem value="amount-asc">Menor valor</SelectItem>
              <SelectItem value="source">Fonte</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-h-8 items-center gap-2 text-xs text-muted-foreground sm:justify-end">
          <SlidersHorizontal className="size-4" />
          <span>{visibleTransactions.length} visível(is)</span>
          {groupedChargeCount > 0 && <span>· {groupedChargeCount} IOF agrupado(s)</span>}
          {groupedRefundCount > 0 && <span>· {groupedRefundCount} estorno(s) agrupado(s)</span>}
        </div>
      </div>

      <div className="space-y-2">
        {transactions.length === 0 && (
          <div className="border py-12 text-center">
            <Check className="mx-auto mb-3 size-8 text-green-600" />
            <p className="font-medium">Revisão concluída</p>
            <p className="mt-1 text-sm text-muted-foreground">Todos os gastos saíram da fila.</p>
            <Button className="mt-4" onClick={() => router.push(`/dashboard?m=${month}`)}>Ver dashboard</Button>
          </div>
        )}
        {transactions.length > 0 && visibleTransactions.length === 0 && (
          <div className="border py-10 text-center text-sm text-muted-foreground">
            Nenhum gasto encontrado com os filtros atuais.
          </div>
        )}
        {visibleTransactions.map((tx) => (
          <TransactionReviewCard
            key={tx.id}
            transaction={tx}
            linkedCharges={chargeGroups.linkedChargesByParentId.get(tx.id) ?? []}
            linkedRefunds={refundGroups.linkedRefundsByParentId.get(tx.id) ?? []}
            onChange={handleChange}
            onDecide={handleDecision}
          />
        ))}
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" variant="outline" onClick={handleSave} disabled={saving || pending === 0} className="shadow-lg">
          {saving ? 'Salvando...' : `Salvar rascunho (${pending} pendentes)`}
        </Button>
      </div>
    </div>
  )
}
