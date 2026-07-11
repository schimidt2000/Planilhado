'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, HandCoins, ImageDown, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCents, formatMonth } from '@/lib/format'
import { validatePaymentAmount } from '@/lib/finance-rules'
import type { MonthlyReport } from '@/lib/types'

type DebtorRow = MonthlyReport['byDebtor'][number]
type TransactionRow = MonthlyReport['transactions'][number]
type DebtorStatementItem = {
  id: string
  date: string
  description: string
  notes?: string | null
  category?: string | null
  sourceType: string
  amountCents: number
}

interface Payment {
  id: string
  debtorId: string
  amountCents: number
  paidAt: string
  notes?: string | null
}

const SOURCE_LABELS: Record<string, string> = {
  nubank: 'Nubank',
  inter: 'Inter',
  picpay: 'PicPay',
  pix: 'Pix',
  manual: 'Manual',
}

function debtorKey(debtorId?: string | null, debtorName?: string | null) {
  return debtorId ? `id:${debtorId}` : `name:${debtorName?.trim().toLowerCase() ?? ''}`
}

function buildDebtorItems(debtor: DebtorRow, transactions: TransactionRow[]): DebtorStatementItem[] {
  const targetKey = debtorKey(debtor.debtorId, debtor.debtorName)
  const items: DebtorStatementItem[] = []

  for (const transaction of transactions) {
    if (transaction.splits.length > 0) {
      for (const split of transaction.splits) {
        if (debtorKey(split.debtorId, split.debtorName) !== targetKey) continue
        items.push({
          id: `${transaction.id}-${split.debtorId ?? split.debtorName}`,
          date: transaction.date,
          description: transaction.description,
          notes: transaction.notes,
          category: transaction.category,
          sourceType: transaction.sourceType,
          amountCents: split.amountCents,
        })
      }
      continue
    }

    if (transaction.transactionType === 'receivable' && debtorKey(transaction.debtorId, transaction.debtorName) === targetKey) {
      items.push({
        id: transaction.id,
        date: transaction.date,
        description: transaction.description,
        notes: transaction.notes,
        category: transaction.category,
        sourceType: transaction.sourceType,
        amountCents: transaction.amountCents,
      })
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description, 'pt-BR'))
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let current = text
  while (current.length > 1 && ctx.measureText(`${current}...`).width > maxWidth) {
    current = current.slice(0, -1)
  }
  return `${current}...`
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { fill?: string; align?: CanvasTextAlign; bold?: boolean; color?: string } = {}
) {
  ctx.fillStyle = options.fill ?? '#ffffff'
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = '#171717'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, width, height)
  ctx.fillStyle = options.color ?? '#111827'
  ctx.font = `${options.bold ? '700' : '500'} 22px Arial, sans-serif`
  ctx.textAlign = options.align ?? 'left'
  ctx.textBaseline = 'middle'
  const padding = 10
  const textX = options.align === 'right' ? x + width - padding : x + padding
  ctx.fillText(truncateText(ctx, text, width - padding * 2), textX, y + height / 2)
}

async function createStatementBlob(debtor: DebtorRow, items: DebtorStatementItem[], month: string) {
  const scale = 2
  const columns = [
    { title: 'A receber', width: 150, fill: '#78d69b', align: 'right' as CanvasTextAlign },
    { title: 'Motivo', width: 330, fill: '#ffd65a', align: 'left' as CanvasTextAlign },
    { title: 'Observações', width: 250, fill: '#ffd65a', align: 'left' as CanvasTextAlign },
    { title: 'Categoria', width: 190, fill: '#ffd65a', align: 'left' as CanvasTextAlign },
    { title: 'Fonte', width: 180, fill: '#ffd65a', align: 'left' as CanvasTextAlign },
  ]
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0)
  const rowHeight = 44
  const headerHeight = 46
  const footerHeight = 64
  const captionHeight = 54
  const width = tableWidth
  const rows = items.length > 0 ? items : [{
    id: 'empty',
    date: '',
    description: 'Nenhum gasto em aberto',
    notes: '',
    category: '',
    sourceType: '',
    amountCents: 0,
  }]
  const height = captionHeight + headerHeight + rows.length * rowHeight + footerHeight
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível gerar a imagem')
  ctx.scale(scale, scale)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#14532d'
  ctx.fillRect(0, 0, width, captionHeight)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 24px Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`Resumo de gastos · ${formatMonth(month)}`, 16, captionHeight / 2)

  let x = 0
  for (const column of columns) {
    drawCell(ctx, column.title, x, captionHeight, column.width, headerHeight, { fill: column.fill, bold: true, align: column.align })
    x += column.width
  }

  rows.forEach((item, index) => {
    const y = captionHeight + headerHeight + index * rowHeight
    const fill = index % 2 === 0 ? '#ffffff' : '#fffaf0'
    let colX = 0
    drawCell(ctx, formatCents(item.amountCents), colX, y, columns[0].width, rowHeight, { fill, align: 'right' })
    colX += columns[0].width
    drawCell(ctx, item.description, colX, y, columns[1].width, rowHeight, { fill })
    colX += columns[1].width
    drawCell(ctx, item.notes ?? '', colX, y, columns[2].width, rowHeight, { fill })
    colX += columns[2].width
    drawCell(ctx, item.category ?? '', colX, y, columns[3].width, rowHeight, { fill })
    colX += columns[3].width
    drawCell(ctx, SOURCE_LABELS[item.sourceType] ?? item.sourceType, colX, y, columns[4].width, rowHeight, { fill })
  })

  const footerY = captionHeight + headerHeight + rows.length * rowHeight
  ctx.fillStyle = '#14532d'
  ctx.fillRect(0, footerY, width, footerHeight)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 26px Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(debtor.debtorName, 16, footerY + footerHeight / 2)
  ctx.textAlign = 'right'
  ctx.fillText(formatCents(debtor.totalCents), width - 16, footerY + footerHeight / 2)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Não foi possível gerar a imagem'))
    }, 'image/png')
  })
}

async function copyImageToClipboard(blob: Blob) {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Seu navegador não permitiu copiar imagem automaticamente')
  }
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function DebtorReceivables({ debtors, month, transactions }: { debtors: DebtorRow[]; month: string; transactions: TransactionRow[] }) {
  const router = useRouter()
  const [payments, setPayments] = useState<Payment[]>([])
  const [payingDebtorId, setPayingDebtorId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [sharingDebtor, setSharingDebtor] = useState<string | null>(null)

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
    const debtor = debtors.find((item) => item.debtorId === payingDebtorId)
    const amountCents = Math.round(Number(amount) * 100)
    const validationError = validatePaymentAmount({
      amountCents,
      balanceCents: debtor?.totalCents ?? 0,
    })
    if (validationError) {
      toast.error(validationError)
      return
    }

    setSaving(true)
    const response = await fetch('/api/debtor-payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        debtorId: payingDebtorId,
        month,
        amountCents,
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

  async function copyStatementAndOpenWhatsApp(debtor: DebtorRow, items: DebtorStatementItem[]) {
    setSharingDebtor(debtor.debtorName)
    try {
      const blob = await createStatementBlob(debtor, items, month)
      await copyImageToClipboard(blob)
      toast.success('Imagem copiada. Cole no WhatsApp depois que a conversa abrir.')
      if (debtor.whatsappUrl) window.open(debtor.whatsappUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      const blob = await createStatementBlob(debtor, items, month)
      downloadBlob(blob, `gastos-${debtor.debtorName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${month}.png`)
      toast.warning(error instanceof Error ? `${error.message}. Baixei a imagem como alternativa.` : 'Baixei a imagem como alternativa.')
      if (debtor.whatsappUrl) window.open(debtor.whatsappUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setSharingDebtor(null)
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {debtors.map((debtor) => {
        const debtorPayments = debtor.debtorId
          ? payments.filter((payment) => payment.debtorId === debtor.debtorId)
          : []
        const isPaying = debtor.debtorId === payingDebtorId
        const statementItems = buildDebtorItems(debtor, transactions)

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
                  <Button variant="outline" size="sm" disabled={!isPaying && debtor.totalCents <= 0} onClick={() => isPaying ? setPayingDebtorId(null) : openPayment(debtor.debtorId!)}>
                    {isPaying ? <X className="size-4" /> : <HandCoins className="size-4" />}
                    {isPaying ? 'Cancelar' : debtor.totalCents <= 0 ? 'Saldo quitado' : 'Registrar pagamento'}
                  </Button>
                ) : (
                  <Link href="/debtors"><Button variant="outline" size="sm">Cadastrar pessoa</Button></Link>
                )}
                {debtor.totalCents > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sharingDebtor === debtor.debtorName}
                    onClick={() => copyStatementAndOpenWhatsApp(debtor, statementItems)}
                  >
                    {sharingDebtor === debtor.debtorName ? <ImageDown className="size-4" /> : <Copy className="size-4" />}
                    {sharingDebtor === debtor.debtorName
                      ? 'Gerando...'
                      : debtor.whatsappUrl
                        ? 'Copiar imagem e cobrar'
                        : 'Copiar imagem'}
                  </Button>
                )}
              </div>
            </div>

            {isPaying && (
              <form onSubmit={savePayment} className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-[140px_150px_1fr_auto] sm:items-end">
                <div>
                  <Label htmlFor={`payment-amount-${debtor.debtorId}`}>Valor pago</Label>
                  <Input id={`payment-amount-${debtor.debtorId}`} className="mt-1" type="number" min="0.01" max={(debtor.totalCents / 100).toFixed(2)} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
                  <p className="mt-1 text-xs text-muted-foreground">Máximo: {formatCents(debtor.totalCents)}</p>
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
