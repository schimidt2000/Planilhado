'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buildWhatsAppUrl } from '@/lib/whatsapp'
import type { Debtor } from '@/lib/types'

type FormState = {
  name: string
  whatsapp: string
}

const emptyForm: FormState = { name: '', whatsapp: '' }

export function DebtorsClient() {
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadDebtors() {
    setLoading(true)
    const res = await fetch('/api/debtors')
    if (res.ok) {
      setDebtors(await res.json())
      setError(null)
    } else {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'Não foi possível carregar os devedores')
    }
    setLoading(false)
  }

  useEffect(() => {
    loadDebtors()
  }, [])

  async function saveDebtor(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const res = await fetch(editingId ? `/api/debtors/${editingId}` : '/api/debtors', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (res.ok) {
      setForm(emptyForm)
      setEditingId(null)
      await loadDebtors()
    } else {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'Não foi possível salvar')
    }

    setSaving(false)
  }

  function startEdit(debtor: Debtor) {
    setEditingId(debtor.id)
    setForm({ name: debtor.name, whatsapp: debtor.whatsapp ?? '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
  }

  async function removeDebtor(id: string) {
    setError(null)
    const res = await fetch(`/api/debtors/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setDebtors((items) => items.filter((item) => item.id !== id))
    } else {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'Não foi possível remover')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Devedores</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre nome e WhatsApp para cobrar valores a receber direto pelo relatório mensal.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{editingId ? 'Editar devedor' : 'Novo devedor'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveDebtor} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <Label htmlFor="debtor-name">Nome</Label>
              <Input
                id="debtor-name"
                className="mt-1"
                placeholder="Ex: Erika"
                value={form.name}
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="debtor-whatsapp">WhatsApp</Label>
              <Input
                id="debtor-whatsapp"
                className="mt-1"
                placeholder="Ex: 11 99999-9999"
                value={form.whatsapp}
                onChange={(e) => setForm((current) => ({ ...current, whatsapp: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                <Plus className="size-4" />
                {saving ? 'Salvando' : editingId ? 'Atualizar' : 'Adicionar'}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {loading && <p className="text-sm text-muted-foreground">Carregando devedores...</p>}
        {!loading && debtors.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum devedor cadastrado ainda.
          </div>
        )}
        {debtors.map((debtor) => {
          const whatsappUrl = buildWhatsAppUrl(debtor.whatsapp)
          return (
            <Card key={debtor.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{debtor.name}</p>
                  <p className="text-sm text-muted-foreground">{debtor.whatsapp || 'Sem WhatsApp cadastrado'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {whatsappUrl && (
                    <a href={whatsappUrl} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm">
                        <ExternalLink className="size-4" />
                        WhatsApp
                      </Button>
                    </a>
                  )}
                  <Button variant="outline" size="sm" onClick={() => startEdit(debtor)}>
                    <Pencil className="size-4" />
                    Editar
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => removeDebtor(debtor.id)}>
                    <Trash2 className="size-4" />
                    Remover
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
