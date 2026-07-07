'use client'

import { use, useEffect, useState, useCallback } from 'react'
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

export default function ReviewPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const router = useRouter()

  const [session, setSession] = useState<Session | null>(null)
  const [transactions, setTransactions] = useState<TransactionWithMeta[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/import-sessions/${sessionId}`)
      .then((r) => r.json())
      .then((data: Session) => {
        setSession(data)
        setTransactions(
          data.transactions.map((t: TransactionWithMeta) => ({
            ...t,
            date: new Date(t.date).toISOString().split('T')[0],
          }))
        )
        setLoading(false)
      })
      .catch(() => {
        toast.error('Erro ao carregar sessão')
        setLoading(false)
      })
  }, [sessionId])

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
      router.push(`/dashboard?m=${session?.month}`)
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
  if (!session) return <p className="text-center py-12 text-destructive">Sessão não encontrada</p>

  const approved = transactions.filter((t) => t.status === 'approved').length
  const rejected = transactions.filter((t) => t.status === 'rejected').length
  const pending = transactions.filter((t) => t.status === 'pending').length
  const reviewed = approved + rejected
  const progress = transactions.length > 0 ? (reviewed / transactions.length) * 100 : 0

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">
            Revisão — {SOURCE_LABELS[session.source] ?? session.source}
          </h1>
          <p className="text-sm text-muted-foreground">
            {session.month} · {session.inputType} · {transactions.length} transações
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

      {/* Progress */}
      <div className="space-y-1">
        <Progress value={progress} />
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="text-green-600">{approved} aprovadas</span>
          <span className="text-red-500">{rejected} rejeitadas</span>
          <span>{pending} pendentes</span>
        </div>
      </div>

      {/* Filter badges */}
      <div className="flex gap-2 flex-wrap">
        {session.source === 'nubank' && <Badge variant="outline" className="border-violet-400 text-violet-700">Nubank</Badge>}
        {session.source === 'inter' && <Badge variant="outline" className="border-orange-400 text-orange-700">Inter</Badge>}
        {session.source === 'picpay' && <Badge variant="outline" className="border-green-400 text-green-700">PicPay</Badge>}
      </div>

      {/* Transaction list */}
      <div className="space-y-2">
        {transactions.map((tx) => (
          <TransactionReviewCard key={tx.id} transaction={tx} onChange={handleChange} />
        ))}
      </div>

      {/* Bottom save */}
      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={saving} className="shadow-lg">
          {saving ? 'Salvando...' : `Salvar revisão (${approved} aprovadas)`}
        </Button>
      </div>
    </div>
  )
}
