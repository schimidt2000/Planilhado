'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CATEGORY_NAMES, getSubcategories } from '@/lib/categories'
import type { Debtor, SplitMode, TransactionSplitInput } from '@/lib/types'

const today = new Date().toISOString().slice(0, 10)
const SOURCE_NAMES: Record<string, string> = {
  pix: 'Pix / conta',
  nubank: 'Nubank',
  inter: 'Inter',
  picpay: 'PicPay',
  manual: 'Dinheiro / outro',
}

export function ManualTransactionForm() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [form, setForm] = useState({
    date: today,
    description: '',
    amount: '',
    sourceType: 'pix',
    transactionType: 'expense',
    debtorName: '',
    splitMode: 'none' as SplitMode,
    category: '',
    subcategory: '',
    notes: '',
  })
  const [splits, setSplits] = useState<TransactionSplitInput[]>([])

  useEffect(() => {
    fetch('/api/debtors').then((response) => response.ok ? response.json() : []).then(setDebtors).catch(() => setDebtors([]))
  }, [])

  function patch(values: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...values }))
  }

  function setSplitMode(splitMode: SplitMode) {
    patch({ splitMode, transactionType: 'expense', debtorName: '' })
    if (splitMode !== 'none' && splits.length === 0) setSplits([{ debtorName: '', amountCents: 0 }])
  }

  function normalizedSplits(current: TransactionSplitInput[]) {
    if (form.splitMode !== 'equal') return current
    const names = current.filter((item) => item.debtorName.trim())
    const amountCents = Math.round(Number(form.amount || 0) * 100)
    const share = names.length > 0 ? Math.floor(amountCents / (names.length + 1)) : 0
    return current.map((item) => ({ ...item, amountCents: item.debtorName.trim() ? share : 0 }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    const response = await fetch('/api/transactions/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        amountCents: Math.round(Number(form.amount) * 100),
        debtorName: form.transactionType === 'receivable' ? form.debtorName : null,
        splits: form.splitMode === 'none' ? [] : normalizedSplits(splits),
      }),
    })
    setSaving(false)

    if (!response.ok) {
      const data = await response.json()
      toast.error(data.error || 'Não foi possível adicionar o lançamento')
      return
    }

    toast.success('Lançamento adicionado')
    router.push(`/dashboard?m=${form.date.slice(0, 7)}`)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="manual-date">Data</Label>
          <Input id="manual-date" type="date" value={form.date} onChange={(event) => patch({ date: event.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manual-amount">Valor</Label>
          <Input id="manual-amount" type="number" min="0.01" step="0.01" placeholder="0,00" value={form.amount} onChange={(event) => patch({ amount: event.target.value })} required />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="manual-description">Descrição</Label>
          <Input id="manual-description" placeholder="Ex.: Mercado do bairro" value={form.description} onChange={(event) => patch({ description: event.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Fonte provável</Label>
          <Select value={form.sourceType} onValueChange={(sourceType) => patch({ sourceType: sourceType || 'manual' })}>
            <SelectTrigger><SelectValue>{SOURCE_NAMES[form.sourceType]}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="pix">Pix / conta</SelectItem>
              <SelectItem value="nubank">Nubank</SelectItem>
              <SelectItem value="inter">Inter</SelectItem>
              <SelectItem value="picpay">PicPay</SelectItem>
              <SelectItem value="manual">Dinheiro / outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Select value={form.category} onValueChange={(category) => patch({ category: category || '', subcategory: '' })}>
            <SelectTrigger><SelectValue placeholder="Selecione">{form.category || undefined}</SelectValue></SelectTrigger>
            <SelectContent>{CATEGORY_NAMES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {form.category && getSubcategories(form.category).length > 0 && (
          <div className="space-y-1.5">
            <Label>Subcategoria</Label>
            <Select value={form.subcategory} onValueChange={(subcategory) => patch({ subcategory: subcategory || '' })}>
              <SelectTrigger><SelectValue placeholder="Selecione">{form.subcategory || undefined}</SelectValue></SelectTrigger>
              <SelectContent>{getSubcategories(form.category).map((subcategory) => <SelectItem key={subcategory} value={subcategory}>{subcategory}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select
            value={form.transactionType}
            onValueChange={(transactionType) => patch({
              transactionType: transactionType || 'expense',
              splitMode: transactionType === 'receivable' ? 'none' : form.splitMode,
            })}
          >
            <SelectTrigger>
              <SelectValue>{form.transactionType === 'receivable' ? 'A receber' : 'Gasto próprio'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Gasto próprio</SelectItem>
              <SelectItem value="receivable">A receber</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.transactionType === 'receivable' ? (
          <div className="space-y-1.5">
            <Label htmlFor="manual-debtor">Devedor</Label>
            <Input id="manual-debtor" list="manual-debtors" value={form.debtorName} onChange={(event) => patch({ debtorName: event.target.value })} required />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Rateio</Label>
            <Select value={form.splitMode} onValueChange={(value) => setSplitMode((value || 'none') as SplitMode)}>
              <SelectTrigger>
                <SelectValue>
                  {form.splitMode === 'equal' ? 'Dividir igualmente' : form.splitMode === 'custom' ? 'Valores personalizados' : 'Sem rateio'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem rateio</SelectItem>
                <SelectItem value="equal">Dividir igualmente</SelectItem>
                <SelectItem value="custom">Valores personalizados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="manual-notes">Observações</Label>
          <Input id="manual-notes" value={form.notes} onChange={(event) => patch({ notes: event.target.value })} placeholder="Opcional" />
        </div>
      </div>

      {form.transactionType === 'expense' && form.splitMode !== 'none' && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Pessoas no rateio</p>
              <p className="text-xs text-muted-foreground">{form.splitMode === 'equal' ? 'A divisão considera você e as pessoas abaixo.' : 'Informe a parte de cada pessoa.'}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setSplits((current) => [...current, { debtorName: '', amountCents: 0 }])}>
              <Plus className="size-4" /> Pessoa
            </Button>
          </div>
          {splits.map((split, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_150px_40px]">
              <Input
                list="manual-debtors"
                placeholder="Nome"
                value={split.debtorName}
                onChange={(event) => setSplits((current) => normalizedSplits(current.map((item, itemIndex) => itemIndex === index ? { ...item, debtorName: event.target.value } : item)))}
              />
              <Input
                type="number" min="0" step="0.01"
                disabled={form.splitMode === 'equal'}
                value={(normalizedSplits(splits)[index]?.amountCents ?? 0) / 100}
                onChange={(event) => setSplits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amountCents: Math.round(Number(event.target.value) * 100) } : item))}
              />
              <Button type="button" variant="outline" size="icon" title="Remover pessoa" onClick={() => setSplits((current) => normalizedSplits(current.filter((_, itemIndex) => itemIndex !== index)))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <datalist id="manual-debtors">{debtors.map((debtor) => <option key={debtor.id} value={debtor.name} />)}</datalist>
      <div className="flex justify-end border-t pt-5">
        <Button type="submit" disabled={saving}>{saving ? 'Adicionando...' : 'Adicionar lançamento'}</Button>
      </div>
    </form>
  )
}
