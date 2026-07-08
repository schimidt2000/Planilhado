'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, FileCheck2, FilePlus2, Link2, RotateCcw, Upload } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { formatCents } from '@/lib/format'
import { toast } from 'sonner'
import type { ImportPreviewItem, ImportSource, InputType, ParseResult } from '@/lib/types'

type UploadState = 'idle' | 'parsing' | 'preview' | 'saving'

interface QueuedFile {
  id: string
  file: File
  password: string
  needsPassword: boolean
  inputType: Exclude<InputType, 'manual'>
}

interface PreparedFile {
  input: QueuedFile
  source: ImportSource
  month: string
  preview: ImportPreviewItem[]
}

export default function UploadPage() {
  const router = useRouter()
  const [files, setFiles] = useState<QueuedFile[]>([])
  const [prepared, setPrepared] = useState<PreparedFile[]>([])
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')

  function addFiles(inputType: Exclude<InputType, 'manual'>, selected: FileList | null) {
    if (!selected?.length) return
    const nextFiles = Array.from(selected).map((file) => ({
      id: `${inputType}-${file.name}-${file.size}-${file.lastModified}`,
      file,
      password: '',
      needsPassword: false,
      inputType,
    }))
    setFiles((current) => {
      const known = new Set(current.map((item) => item.id))
      return [...current, ...nextFiles.filter((item) => !known.has(item.id))]
    })
  }

  function updateFile(id: string, patch: Partial<QueuedFile>) {
    setFiles((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  async function prepareFile(input: QueuedFile): Promise<PreparedFile> {
    const formData = new FormData()
    formData.append('file', input.file)
    formData.append('inputType', input.inputType)
    if (input.password) formData.append('pdfPassword', input.password)
    const parseResponse = await fetch('/api/parse-file', { method: 'POST', body: formData })
    const parseData = await parseResponse.json()
    if (!parseResponse.ok) {
      throw Object.assign(new Error(parseData.error || 'Erro ao ler arquivo'), {
        needsPassword: /senha/i.test(parseData.error || ''),
        fileId: input.id,
      })
    }

    const result = parseData as ParseResult
    const previewResponse = await fetch('/api/import-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...result, inputType: input.inputType, previewOnly: true }),
    })
    const previewData = await previewResponse.json()
    if (!previewResponse.ok) throw new Error(previewData.error || 'Erro ao comparar lançamentos')
    return { input, source: result.source, month: result.month, preview: previewData.preview }
  }

  async function analyze(event: React.FormEvent) {
    event.preventDefault()
    if (files.length === 0) return toast.error('Selecione pelo menos um arquivo PDF ou CSV')
    setState('parsing')
    setProgress(5)
    try {
      const results: PreparedFile[] = []
      for (const [index, file] of files.entries()) {
        setStatus(`Analisando ${file.file.name}...`)
        setProgress(Math.round((index / files.length) * 90) + 5)
        results.push(await prepareFile(file))
      }
      setPrepared(results)
      setProgress(100)
      setState('preview')
    } catch (unknownError) {
      const error = unknownError as Error & { needsPassword?: boolean; fileId?: string }
      if (error.needsPassword && error.fileId) updateFile(error.fileId, { needsPassword: true })
      toast.error(error.message || 'Erro inesperado')
      setState('idle')
    }
  }

  async function confirmImport() {
    setState('saving')
    try {
      const sessionIds: string[] = []
      let completed = 0
      let imported = 0
      for (const file of prepared) {
        setStatus(`Importando ${file.input.file.name}...`)
        const response = await fetch('/api/import-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            month: file.month,
            source: file.source,
            inputType: file.input.inputType,
            transactions: file.preview,
          }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Erro ao importar')
        if (data.imported > 0) sessionIds.push(data.sessionId)
        completed += data.completed
        imported += data.imported
      }
      toast.success(`${imported} novo(s) e ${completed} lançamento(s) completado(s)`)
      if (sessionIds.length > 0) router.push(`/review?sessionIds=${sessionIds.join(',')}`)
      else router.push(`/dashboard?m=${prepared[0]?.month}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao importar')
      setState('preview')
    }
  }

  const allItems = prepared.flatMap((file) => file.preview)
  const counts = {
    new: allItems.filter((item) => item.action === 'new').length,
    complete: allItems.filter((item) => item.action === 'complete').length,
    duplicate: allItems.filter((item) => item.action === 'duplicate').length,
  }

  if (state === 'preview' || state === 'saving') {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Conferir importação</h1>
            <p className="mt-1 text-muted-foreground">Veja o que será criado e o que será completado antes de continuar.</p>
          </div>
          <Button variant="outline" onClick={() => { setPrepared([]); setState('idle') }} disabled={state === 'saving'}>
            <RotateCcw className="size-4" /> Trocar arquivos
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="flex items-center gap-3 p-4"><FilePlus2 className="size-5 text-blue-600" /><div><p className="text-2xl font-bold">{counts.new}</p><p className="text-xs text-muted-foreground">Novos lançamentos</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><Link2 className="size-5 text-green-600" /><div><p className="text-2xl font-bold">{counts.complete}</p><p className="text-xs text-muted-foreground">Manuais completados</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><FileCheck2 className="size-5 text-zinc-500" /><div><p className="text-2xl font-bold">{counts.duplicate}</p><p className="text-xs text-muted-foreground">Já importados</p></div></CardContent></Card>
        </div>

        <div className="space-y-4">
          {prepared.map((file) => (
            <Card key={file.input.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><CardTitle className="text-base">{file.input.file.name}</CardTitle><CardDescription>{file.month} · {file.preview.length} movimentações</CardDescription></div>
                  <Badge variant="outline">{file.source}</Badge>
                </div>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {file.preview.map((item) => (
                  <div key={item.key} className="grid gap-2 px-5 py-3 sm:grid-cols-[110px_1fr_auto_auto] sm:items-center">
                    <span className="text-xs text-muted-foreground">{new Date(item.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.description}</p>
                      {item.action === 'complete' && <p className="truncate text-xs text-muted-foreground">Completa: {item.matchedDescription}</p>}
                    </div>
                    <span className={item.isCredit ? 'text-sm font-semibold text-green-600' : 'text-sm font-semibold'}>{item.isCredit ? '+' : ''}{formatCents(item.amountCents)}</span>
                    <Badge variant="outline" className={
                      item.action === 'new' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                      item.action === 'complete' ? 'border-green-200 bg-green-50 text-green-700' :
                      'text-muted-foreground'
                    }>
                      {item.action === 'new' ? 'Novo' : item.action === 'complete' ? 'Completar' : 'Já existe'}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="sticky bottom-4 flex justify-end border bg-background p-3 shadow-lg">
          <Button size="lg" onClick={confirmImport} disabled={state === 'saving'}>
            <CheckCircle2 className="size-4" /> {state === 'saving' ? 'Importando...' : `Confirmar ${counts.new + counts.complete} alterações`}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Importar arquivos</h1>
        <p className="mt-1 text-muted-foreground">Envie PDFs ou CSVs. Antes de salvar, você verá novos gastos, conciliações e duplicidades.</p>
      </div>
      <form onSubmit={analyze} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {([
            ['fatura', 'Faturas do cartão', 'Nubank, Inter ou PicPay'],
            ['extrato', 'Extratos bancários', 'Conta corrente / Pix'],
          ] as const).map(([inputType, title, description]) => (
            <Card key={inputType}>
              <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
              <CardContent><Input type="file" accept=".pdf,.csv,text/csv" multiple className="cursor-pointer" onChange={(event) => addFiles(inputType, event.target.files)} /></CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Arquivos selecionados</CardTitle><CardDescription>{files.length} arquivo(s) na fila</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {files.length === 0 && <p className="text-sm text-muted-foreground">Nenhum arquivo selecionado.</p>}
            {files.map((item) => (
              <div key={item.id} className="space-y-2 border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{item.file.name}</p><Badge variant="outline" className="mt-1">{item.inputType}</Badge></div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setFiles((current) => current.filter((file) => file.id !== item.id))}>Remover</Button>
                </div>
                {item.needsPassword && <div className="space-y-1"><Label className="text-xs">Senha do PDF</Label><Input type="password" value={item.password} onChange={(event) => updateFile(item.id, { password: event.target.value })} /></div>}
              </div>
            ))}
          </CardContent>
        </Card>
        {state === 'parsing' && <div className="space-y-2"><Progress value={progress} /><p className="text-center text-sm text-muted-foreground">{status}</p></div>}
        <Button type="submit" className="w-full" disabled={state === 'parsing'}><Upload className="size-4" /> {state === 'parsing' ? 'Analisando...' : 'Analisar arquivos'}</Button>
      </form>
    </div>
  )
}
