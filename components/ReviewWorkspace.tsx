'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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
        setTransactions(
          loaded.flatMap((item) =>
            item.transactions.map((t: TransactionWithMeta) => ({
              ...t,
              splitMode: t.splitMode ?? 'none',
              splits: t.splits ?? [],
              date: new Date(t.date).toISOString().split('T')[0],
            }))
          )
        )
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

  function approveAll() {
    setTransactions((prev) =>
      prev.map((t) => t.status === 'pending' ? { ...t, status: 'approved' } : t)
    )
  }

  if (loading) return <p className="text-center py-12 text-muted-foreground">Carregando transações...</p>
  if (sessions.length === 0) return <p className="text-center py-12 text-destructive">Sessão não encontrada</p>

  const approved = transactions.filter((t) => t.status === 'approved').length
  const rejected = transactions.filter((t) => t.status === 'rejected').length
  const pending = transactions.filter((t) => t.status === 'pending').length
  const reviewed = approved + rejected
  const progress = transactions.length > 0 ? (reviewed / transactions.length) * 100 : 0
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
          <Button variant="outline" size="sm" onClick={approveAll} disabled={pending === 0}>
            Aprovar pendentes ({pending})
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar revisão'}
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
        {transactions.map((tx) => (
          <TransactionReviewCard key={tx.id} transaction={tx} onChange={handleChange} />
        ))}
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={saving} className="shadow-lg">
          {saving ? 'Salvando...' : `Salvar revisão (${approved} aprovadas)`}
        </Button>
      </div>
    </div>
  )
}
