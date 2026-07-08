'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { TransactionReviewCard } from '@/components/TransactionReviewCard'
import { toast } from 'sonner'
import type { TransactionWithMeta } from '@/lib/types'

interface Session {
  id: string
  month: string
  source: string
  inputType: string
  transactions: TransactionWithMeta[]
}

const SOURCE_LABELS: Record<string, string> = {
  nubank: 'Nubank', inter: 'Inter', picpay: 'PicPay', pix: 'Pix',
}

export function ReviewWorkspace({ sessionIds }: { sessionIds: string[] }) {
  const router = useRouter()

  const [sessions, setSessions] = useState<Session[]>([])
  const [transactions, setTransactions] = useState<TransactionWithMeta[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [decided, setDecided] = useState({ approved: 0, rejected: 0 })

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

  const handleDecision = useCallback(async (transaction: TransactionWithMeta, status: 'approved' | 'rejected') => {
    const response = await fetch(`/api/transactions/${transaction.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        transactionType: transaction.transactionType,
        debtorName: transaction.debtorName,
        splitMode: transaction.splitMode,
        splits: transaction.splits,
        category: transaction.category,
        subcategory: transaction.subcategory,
        notes: transaction.notes,
        isEssential: transaction.isEssential,
        installmentCurrent: transaction.installmentCurrent,
        installmentTotal: transaction.installmentTotal,
      }),
    })
    if (!response.ok) {
      toast.error('Não foi possível salvar a decisão')
      return
    }
    setTransactions((current) => current.filter((item) => item.id !== transaction.id))
    setDecided((current) => ({ ...current, [status]: current[status] + 1 }))
    toast.success(status === 'approved' ? 'Gasto aprovado' : 'Gasto recusado')
  }, [])

  async function handleSave() {
    setSaving(true)
    const updates = transactions.map((t) => ({
      id: t.id,
      status: t.status,
      transactionType: t.transactionType,
      debtorName: t.debtorName,
      splitMode: t.splitMode,
      splits: t.splits,
      category: t.category,
      subcategory: t.subcategory,
      notes: t.notes,
      isEssential: t.isEssential,
      installmentCurrent: t.installmentCurrent,
      installmentTotal: t.installmentTotal,
    }))

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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">
            Revisão de gastos
          </h1>
          <p className="text-sm text-muted-foreground">
            {month} · {sessions.length} arquivo(s) · {transactions.length} transações
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

      <div className="space-y-2">
        {transactions.length === 0 && (
          <div className="border py-12 text-center">
            <Check className="mx-auto mb-3 size-8 text-green-600" />
            <p className="font-medium">Revisão concluída</p>
            <p className="mt-1 text-sm text-muted-foreground">Todos os gastos saíram da fila.</p>
            <Button className="mt-4" onClick={() => router.push(`/dashboard?m=${month}`)}>Ver dashboard</Button>
          </div>
        )}
        {transactions.map((tx) => (
          <TransactionReviewCard key={tx.id} transaction={tx} onChange={handleChange} onDecide={handleDecision} />
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
