'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, HandCoins, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCents } from '@/lib/format'
import type { MonthlyReport } from '@/lib/types'

type DebtorRow = MonthlyReport['byDebtor'][number]

interface Payment {
  id: string
  debtorId: string
  amountCents: number
  paidAt: string
  notes?: string | null
}

export function DebtorReceivables({ debtors, month }: { debtors: DebtorRow[]; month: string }) {
  const router = useRouter()
  const [payments, setPayments] = useState<Payment[]>([])
  const [payingDebtorId, setPayingDebtorId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadPayments() {
    const response = await fetch(`/api/debtor-payments?month=${month}`)
    if (response.ok) setPayments(await response.json())
  }

  useEffect(() => {
    loadPayments()
  }, [month])

  function openPayment(debtorId: string) {
    setPayingDebtorId(debtorId)
    setAmount('')
    setNotes('')
  }

  async function savePayment(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    const response = await fetch('/api/debtor-payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        debtorId: payingDebtorId,
        month,
        amountCents: Math.round(Number(amount) * 100),
        paidAt,
        notes,
      }),
    })
    setSaving(false)
    if (!response.ok) {
      const data = await response.json()
      toast.error(data.error || 'Não foi possível registrar o pagamento')
      return
    }
    toast.success('Pagamento registrado')
    setPayingDebtorId(null)
    await loadPayments()
    router.refresh()
  }

  async function removePayment(id: string) {
    const response = await fetch(`/api/debtor-payments/${id}`, { method: 'DELETE' })
    if (!response.ok) return toast.error('Não foi possível remover o pagamento')
    setPayments((current) => current.filter((payment) => payment.id !== id))
    toast.success('Pagamento removido')
    router.refresh()
  }

  return (
    <div className="mt-4 space-y-3">
      {debtors.map((debtor) => {
        const debtorPayments = debtor.debtorId
          ? payments.filter((payment) => payment.debtorId === debtor.debtorId)
          : []
        const isPaying = debtor.debtorId === payingDebtorId

        return (
          <div key={debtor.debtorName} className="border p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">{debtor.debtorName}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Devido: {formatCents(debtor.owedCents)}</span>
                  <span className="text-green-700">Pago: {formatCents(debtor.paidCents)}</span>
                  <span className="font-semibold">Saldo: {formatCents(debtor.totalCents)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {debtor.debtorId ? (
                  <Button variant="outline" size="sm" onClick={() => isPaying ? setPayingDebtorId(null) : openPayment(debtor.debtorId!)}>
                    {isPaying ? <X className="size-4" /> : <HandCoins className="size-4" />}
                    {isPaying ? 'Cancelar' : 'Registrar pagamento'}
                  </Button>
                ) : (
                  <Link href="/debtors"><Button variant="outline" size="sm">Cadastrar pessoa</Button></Link>
                )}
                {debtor.totalCents > 0 && debtor.whatsappUrl && (
                  <a href={debtor.whatsappUrl} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm"><ExternalLink className="size-4" /> Cobrar saldo</Button>
                  </a>
                )}
              </div>
            </div>

            {isPaying && (
              <form onSubmit={savePayment} className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-[140px_150px_1fr_auto] sm:items-end">
                <div>
                  <Label htmlFor={`payment-amount-${debtor.debtorId}`}>Valor pago</Label>
                  <Input id={`payment-amount-${debtor.debtorId}`} className="mt-1" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
                </div>
                <div>
                  <Label htmlFor={`payment-date-${debtor.debtorId}`}>Data</Label>
                  <Input id={`payment-date-${debtor.debtorId}`} className="mt-1" type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} required />
                </div>
                <div>
                  <Label htmlFor={`payment-notes-${debtor.debtorId}`}>Observação</Label>
                  <Input id={`payment-notes-${debtor.debtorId}`} className="mt-1" placeholder="Ex.: primeira parte" value={notes} onChange={(event) => setNotes(event.target.value)} />
                </div>
                <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Confirmar'}</Button>
              </form>
            )}

            {debtorPayments.length > 0 && (
              <div className="mt-3 space-y-1 border-t pt-2">
                {debtorPayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {new Date(payment.paidAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                      {payment.notes ? ` · ${payment.notes}` : ''}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-green-700">+ {formatCents(payment.amountCents)}</span>
                      <Button type="button" variant="ghost" size="icon-sm" title="Remover pagamento" onClick={() => removePayment(payment.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
