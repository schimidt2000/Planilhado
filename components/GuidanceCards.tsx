'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ComponentType } from 'react'
import { CheckCircle2, EyeOff, FileUp, Filter, ListChecks, WalletCards } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { UserPreferences } from '@/lib/types'

type GuidanceScope = 'dashboard' | 'review' | 'upload'

interface Tip {
  title: string
  body: string
  href?: string
  action?: string
  icon: ComponentType<{ className?: string }>
}

const preferenceField: Record<GuidanceScope, keyof UserPreferences> = {
  dashboard: 'showDashboardTips',
  review: 'showReviewTips',
  upload: 'showUploadTips',
}

const tipsByScope: Record<GuidanceScope, Tip[]> = {
  dashboard: [
    { title: 'Comece pelo mês certo', body: 'Navegue pelo mês que você quer fechar antes de importar ou revisar.', icon: ListChecks },
    { title: 'Importe e revise', body: 'Depois de enviar os arquivos, aprove ou recuse os gastos pendentes.', href: '/upload', action: 'Importar', icon: FileUp },
    { title: 'Configure sua renda', body: 'Salário, freelas e vencimentos deixam o dashboard mais útil.', href: '/settings', action: 'Ajustar', icon: WalletCards },
  ],
  review: [
    { title: 'Filtre por fonte', body: 'Use os filtros para revisar Nubank, Inter, PicPay ou itens manuais separadamente.', icon: Filter },
    { title: 'Defina tipo e rateio', body: 'Um gasto pode ser próprio, a receber de alguém ou dividido entre pessoas.', icon: ListChecks },
    { title: 'Aprove por último', body: 'Ao aprovar ou recusar, o gasto sai da fila de revisão.', icon: CheckCircle2 },
  ],
  upload: [
    { title: 'Escolha o mês primeiro', body: 'Todos os arquivos selecionados entram no mês da planilha escolhido.', icon: ListChecks },
    { title: 'Envie vários arquivos', body: 'Você pode misturar PDFs e CSVs e conferir duplicidades antes de salvar.', icon: FileUp },
    { title: 'Associe cartões', body: 'Se um cartão virtual pertence a alguém, marque isso antes de confirmar a importação.', icon: WalletCards },
  ],
}

export function GuidanceCards({ scope, initialEnabled }: { scope: GuidanceScope; initialEnabled?: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled ?? false)
  const [loaded, setLoaded] = useState(initialEnabled !== undefined)
  const field = preferenceField[scope]

  useEffect(() => {
    if (initialEnabled !== undefined) return
    let cancelled = false
    fetch('/api/settings')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (cancelled) return
        setEnabled(Boolean(data?.preferences?.[field]))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [field, initialEnabled])

  async function hideTips() {
    setEnabled(false)
    await fetch('/api/settings/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: false }),
    })
  }

  if (!loaded || !enabled) return null

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-3 md:grid-cols-3">
          {tipsByScope[scope].map((tip) => {
            const Icon = tip.icon
            const content = (
              <div className="h-full rounded-lg border bg-background p-3 transition-colors hover:bg-muted/40">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <p className="text-sm font-medium">{tip.title}</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{tip.body}</p>
                {tip.action && <p className="mt-2 text-xs font-medium text-primary">{tip.action}</p>}
              </div>
            )

            return tip.href ? <Link key={tip.title} href={tip.href}>{content}</Link> : <div key={tip.title}>{content}</div>
          })}
        </div>
        <Button variant="ghost" size="sm" className="self-end sm:self-start" onClick={hideTips}>
          <EyeOff className="size-4" /> Ocultar dicas
        </Button>
      </div>
    </div>
  )
}
