'use client'

import { useMemo, useState } from 'react'
import { Bell, CalendarDays, Check, Eye, EyeOff, Plus, Trash2, TrendingUp, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { currentMonth, formatCents, formatMonth } from '@/lib/format'
import { getUpcomingBillReminders } from '@/lib/finance-settings-utils'
import type { BillReminderDTO, ExtraIncomeDTO, FinanceSettingsSnapshot, SalaryEntryDTO, UserPreferences } from '@/lib/types'

const SOURCE_LABELS: Record<string, string> = {
  nubank: 'Nubank',
  inter: 'Inter',
  picpay: 'PicPay',
  pix: 'Pix / conta',
  manual: 'Outro',
}

const TIP_LABELS: { key: keyof UserPreferences; label: string; description: string }[] = [
  { key: 'showDashboardTips', label: 'Dashboard', description: 'Cards de próximos passos e atalhos no início.' },
  { key: 'showReviewTips', label: 'Revisão de gastos', description: 'Lembretes sobre filtros, rateio e aprovação.' },
  { key: 'showUploadTips', label: 'Importação', description: 'Orientações antes de enviar PDF ou CSV.' },
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function amountToInput(cents?: number | null) {
  if (!cents) return ''
  return (cents / 100).toFixed(2)
}

function inputToCents(value: string) {
  return Math.round(Number(value || 0) * 100)
}

function sortSalary(entries: SalaryEntryDTO[]) {
  return [...entries].sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth) || b.createdAt.localeCompare(a.createdAt))
}

function sortExtraIncomes(entries: ExtraIncomeDTO[]) {
  return [...entries].sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))
}

export function PersonalSettingsClient({ initialSettings }: { initialSettings: FinanceSettingsSnapshot }) {
  const [settings, setSettings] = useState(initialSettings)
  const [salaryForm, setSalaryForm] = useState({ amount: amountToInput(initialSettings.currentSalary?.amountCents), effectiveMonth: currentMonth(), notes: '' })
  const [billForm, setBillForm] = useState({ label: '', source: 'nubank', dueDay: '10', notes: '' })
  const [incomeForm, setIncomeForm] = useState({ description: '', amount: '', expectedDate: today(), notes: '' })
  const [saving, setSaving] = useState<string | null>(null)

  const salaryEntries = useMemo(() => sortSalary(settings.salaryEntries), [settings.salaryEntries])
  const extraIncomes = useMemo(() => sortExtraIncomes(settings.extraIncomes), [settings.extraIncomes])
  const upcoming = useMemo(() => getUpcomingBillReminders(settings.billReminders), [settings.billReminders])
  const plannedIncomeThisMonth = settings.extraIncomes
    .filter((income) => income.expectedDate.slice(0, 7) === currentMonth())
    .reduce((sum, income) => sum + income.amountCents, 0)
  const latestSalary = settings.currentSalary
  const previousSalary = salaryEntries.find((entry) => entry.id !== latestSalary?.id && entry.effectiveMonth <= (latestSalary?.effectiveMonth ?? currentMonth()))
  const salaryGrowth = latestSalary && previousSalary
    ? Math.round(((latestSalary.amountCents - previousSalary.amountCents) / previousSalary.amountCents) * 100)
    : null

  async function refreshSettings() {
    const response = await fetch('/api/settings')
    if (response.ok) setSettings(await response.json())
  }

  async function addSalary(event: React.FormEvent) {
    event.preventDefault()
    setSaving('salary')
    const response = await fetch('/api/settings/salary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountCents: inputToCents(salaryForm.amount),
        effectiveMonth: salaryForm.effectiveMonth,
        notes: salaryForm.notes,
      }),
    })
    setSaving(null)

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      toast.error(data?.error ?? 'Não foi possível salvar o salário')
      return
    }
    setSalaryForm((current) => ({ ...current, notes: '' }))
    await refreshSettings()
    toast.success('Salário registrado')
  }

  async function removeSalary(entry: SalaryEntryDTO) {
    setSaving(entry.id)
    const response = await fetch(`/api/settings/salary/${entry.id}`, { method: 'DELETE' })
    setSaving(null)
    if (!response.ok) {
      toast.error('Não foi possível remover este registro')
      return
    }
    setSettings((current) => {
      const salaryEntries = current.salaryEntries.filter((item) => item.id !== entry.id)
      return {
        ...current,
        salaryEntries,
        currentSalary: sortSalary(salaryEntries).find((item) => item.effectiveMonth <= currentMonth()) ?? salaryEntries[0] ?? null,
      }
    })
  }

  async function addBillReminder(event: React.FormEvent) {
    event.preventDefault()
    setSaving('bill')
    const response = await fetch('/api/settings/bill-reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(billForm),
    })
    setSaving(null)

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      toast.error(data?.error ?? 'Não foi possível salvar a fatura')
      return
    }
    setBillForm({ label: '', source: 'nubank', dueDay: '10', notes: '' })
    await refreshSettings()
    toast.success('Fatura cadastrada')
  }

  async function toggleBillReminder(reminder: BillReminderDTO) {
    setSaving(reminder.id)
    const response = await fetch(`/api/settings/bill-reminders/${reminder.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !reminder.active }),
    })
    setSaving(null)
    if (!response.ok) {
      toast.error('Não foi possível atualizar a fatura')
      return
    }
    await refreshSettings()
  }

  async function removeBillReminder(reminder: BillReminderDTO) {
    setSaving(reminder.id)
    const response = await fetch(`/api/settings/bill-reminders/${reminder.id}`, { method: 'DELETE' })
    setSaving(null)
    if (!response.ok) {
      toast.error('Não foi possível remover a fatura')
      return
    }
    await refreshSettings()
  }

  async function addExtraIncome(event: React.FormEvent) {
    event.preventDefault()
    setSaving('income')
    const response = await fetch('/api/settings/extra-incomes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: incomeForm.description,
        amountCents: inputToCents(incomeForm.amount),
        expectedDate: incomeForm.expectedDate,
        notes: incomeForm.notes,
      }),
    })
    setSaving(null)

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      toast.error(data?.error ?? 'Não foi possível salvar a renda extra')
      return
    }
    setIncomeForm({ description: '', amount: '', expectedDate: today(), notes: '' })
    await refreshSettings()
    toast.success('Renda extra registrada')
  }

  async function toggleIncome(income: ExtraIncomeDTO) {
    setSaving(income.id)
    const response = await fetch(`/api/settings/extra-incomes/${income.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: income.status === 'received' ? 'planned' : 'received' }),
    })
    setSaving(null)
    if (!response.ok) {
      toast.error('Não foi possível atualizar a renda extra')
      return
    }
    await refreshSettings()
  }

  async function removeIncome(income: ExtraIncomeDTO) {
    setSaving(income.id)
    const response = await fetch(`/api/settings/extra-incomes/${income.id}`, { method: 'DELETE' })
    setSaving(null)
    if (!response.ok) {
      toast.error('Não foi possível remover a renda extra')
      return
    }
    await refreshSettings()
  }

  async function updatePreference(key: keyof UserPreferences, value: boolean) {
    const nextPreferences = { ...settings.preferences, [key]: value }
    setSettings((current) => ({ ...current, preferences: nextPreferences }))
    const response = await fetch('/api/settings/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
    if (!response.ok) {
      toast.error('Não foi possível atualizar as dicas')
      await refreshSettings()
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações pessoais</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organize renda, faturas e preferências para o dashboard ficar mais útil no dia a dia.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Wallet className="size-4" /> Salário atual</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{latestSalary ? formatCents(latestSalary.amountCents) : 'Não informado'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{latestSalary ? `Desde ${formatMonth(latestSalary.effectiveMonth)}` : 'Cadastre abaixo para acompanhar evolução.'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="size-4" /> Evolução</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{salaryGrowth === null ? '-' : `${salaryGrowth >= 0 ? '+' : ''}${salaryGrowth}%`}</p>
            <p className="mt-1 text-xs text-muted-foreground">Comparado ao salário anterior cadastrado.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Plus className="size-4" /> Extras do mês</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCents(plannedIncomeThisMonth)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Freelas e valores previstos para {formatMonth(currentMonth())}.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico salarial</CardTitle>
            <CardDescription>Registre mudanças de salário por mês para acompanhar sua evolução.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={addSalary} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div>
                <Label htmlFor="salary-amount">Valor mensal</Label>
                <Input id="salary-amount" type="number" min="0.01" step="0.01" value={salaryForm.amount} onChange={(event) => setSalaryForm((current) => ({ ...current, amount: event.target.value }))} required />
              </div>
              <div>
                <Label htmlFor="salary-month">A partir de</Label>
                <Input id="salary-month" type="month" value={salaryForm.effectiveMonth} onChange={(event) => setSalaryForm((current) => ({ ...current, effectiveMonth: event.target.value }))} required />
              </div>
              <Button type="submit" disabled={saving === 'salary'}>
                <Plus className="size-4" /> Adicionar
              </Button>
              <div className="sm:col-span-3">
                <Label htmlFor="salary-notes">Observação</Label>
                <Input id="salary-notes" value={salaryForm.notes} onChange={(event) => setSalaryForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Ex.: promoção, reajuste, troca de empresa" />
              </div>
            </form>

            <div className="space-y-2">
              {salaryEntries.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum salário cadastrado.</p>}
              {salaryEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{formatCents(entry.amountCents)}</p>
                    <p className="text-xs text-muted-foreground">{formatMonth(entry.effectiveMonth)}{entry.notes ? ` · ${entry.notes}` : ''}</p>
                  </div>
                  <Button variant="outline" size="icon-sm" title="Remover salário" disabled={saving === entry.id} onClick={() => removeSalary(entry)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rendas extras previstas</CardTitle>
            <CardDescription>Cadastre freelas, bônus e outros valores antes de receber.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={addExtraIncome} className="grid gap-3 sm:grid-cols-[1fr_140px_150px_auto] sm:items-end">
              <div>
                <Label htmlFor="income-description">Descrição</Label>
                <Input id="income-description" value={incomeForm.description} onChange={(event) => setIncomeForm((current) => ({ ...current, description: event.target.value }))} placeholder="Ex.: freela landing page" required />
              </div>
              <div>
                <Label htmlFor="income-amount">Valor</Label>
                <Input id="income-amount" type="number" min="0.01" step="0.01" value={incomeForm.amount} onChange={(event) => setIncomeForm((current) => ({ ...current, amount: event.target.value }))} required />
              </div>
              <div>
                <Label htmlFor="income-date">Previsão</Label>
                <Input id="income-date" type="date" value={incomeForm.expectedDate} onChange={(event) => setIncomeForm((current) => ({ ...current, expectedDate: event.target.value }))} required />
              </div>
              <Button type="submit" disabled={saving === 'income'}>
                <Plus className="size-4" /> Adicionar
              </Button>
            </form>

            <div className="space-y-2">
              {extraIncomes.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma renda extra prevista.</p>}
              {extraIncomes.map((income) => (
                <div key={income.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{income.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCents(income.amountCents)} · {new Date(`${income.expectedDate}T12:00:00`).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant={income.status === 'received' ? 'default' : 'outline'} size="sm" disabled={saving === income.id} onClick={() => toggleIncome(income)}>
                      <Check className="size-4" /> {income.status === 'received' ? 'Recebido' : 'Marcar recebido'}
                    </Button>
                    <Button variant="outline" size="icon-sm" title="Remover renda extra" disabled={saving === income.id} onClick={() => removeIncome(income)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="size-4" /> Vencimentos de fatura</CardTitle>
          <CardDescription>Esses dias viram lembretes no dashboard quando a fatura estiver perto de vencer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addBillReminder} className="grid gap-3 md:grid-cols-[1fr_160px_120px_auto] md:items-end">
            <div>
              <Label htmlFor="bill-label">Nome</Label>
              <Input id="bill-label" value={billForm.label} onChange={(event) => setBillForm((current) => ({ ...current, label: event.target.value }))} placeholder="Ex.: Nubank principal" required />
            </div>
            <div>
              <Label>Fonte</Label>
              <Select value={billForm.source} onValueChange={(source) => setBillForm((current) => ({ ...current, source: source || 'manual' }))}>
                <SelectTrigger><SelectValue>{SOURCE_LABELS[billForm.source]}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nubank">Nubank</SelectItem>
                  <SelectItem value="inter">Inter</SelectItem>
                  <SelectItem value="picpay">PicPay</SelectItem>
                  <SelectItem value="pix">Pix / conta</SelectItem>
                  <SelectItem value="manual">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="bill-day">Dia</Label>
              <Input id="bill-day" type="number" min="1" max="31" value={billForm.dueDay} onChange={(event) => setBillForm((current) => ({ ...current, dueDay: event.target.value }))} required />
            </div>
            <Button type="submit" disabled={saving === 'bill'}>
              <Plus className="size-4" /> Adicionar
            </Button>
          </form>

          {upcoming.length > 0 && (
            <div className="grid gap-2 md:grid-cols-3">
              {upcoming.slice(0, 3).map((reminder) => (
                <div key={reminder.id} className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-sm font-medium">{reminder.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {reminder.daysUntil === 0 ? 'Vence hoje' : `Vence em ${reminder.daysUntil} dia(s)`}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-2">
            {settings.billReminders.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma fatura cadastrada.</p>}
            {settings.billReminders.map((reminder) => (
              <div key={reminder.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{reminder.label}</p>
                    <Badge variant={reminder.active ? 'outline' : 'secondary'}>{reminder.active ? 'Ativa' : 'Pausada'}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {SOURCE_LABELS[reminder.source ?? 'manual'] ?? reminder.source} · vence todo dia {reminder.dueDay}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={saving === reminder.id} onClick={() => toggleBillReminder(reminder)}>
                    <Bell className="size-4" /> {reminder.active ? 'Pausar' : 'Ativar'}
                  </Button>
                  <Button variant="outline" size="icon-sm" title="Remover fatura" disabled={saving === reminder.id} onClick={() => removeBillReminder(reminder)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dicas interativas</CardTitle>
          <CardDescription>Você pode esconder as dicas em cada tela e religar por aqui quando quiser.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {TIP_LABELS.map((tip) => {
            const enabled = settings.preferences[tip.key]
            return (
              <div key={tip.key} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{tip.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{tip.description}</p>
                  </div>
                  <Badge variant={enabled ? 'outline' : 'secondary'}>{enabled ? 'Ligadas' : 'Ocultas'}</Badge>
                </div>
                <Button className="mt-3 w-full" variant="outline" size="sm" onClick={() => updatePreference(tip.key, !enabled)}>
                  {enabled ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  {enabled ? 'Ocultar' : 'Mostrar'}
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
