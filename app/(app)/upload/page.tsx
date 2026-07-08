'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

type UploadState = 'idle' | 'parsing' | 'done' | 'error'
type InputType = 'fatura' | 'extrato'

interface QueuedFile {
  id: string
  file: File
  password: string
  needsPassword: boolean
  inputType: InputType
}

export default function UploadPage() {
  const router = useRouter()

  const [files, setFiles] = useState<QueuedFile[]>([])
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')

  function addFiles(inputType: InputType, selected: FileList | null) {
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

  function removeFile(id: string) {
    setFiles((current) => current.filter((item) => item.id !== id))
  }

  async function processPDF(input: QueuedFile): Promise<{ sessionId: string } | null> {
    const formData = new FormData()
    formData.append('file', input.file)
    formData.append('inputType', input.inputType)
    if (input.password) formData.append('pdfPassword', input.password)

    const parseRes = await fetch('/api/parse-pdf', { method: 'POST', body: formData })
    if (!parseRes.ok) {
      const data = await parseRes.json()
      if (data.error?.toLowerCase().includes('senha') || parseRes.status === 400) {
        throw Object.assign(new Error(data.error), { needsPassword: true, fileId: input.id })
      }
      throw new Error(data.error || 'Erro ao processar PDF')
    }

    const parseData = await parseRes.json()

    const sessionRes = await fetch('/api/import-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: parseData.month,
        source: parseData.source,
        inputType: input.inputType,
        transactions: parseData.transactions,
      }),
    })

    if (!sessionRes.ok) {
      const data = await sessionRes.json()
      if (sessionRes.status === 409) {
        toast.warning(`${input.file.name}: ${data.error}`, { duration: 5000 })
        return null
      }
      throw new Error(data.error || 'Erro ao salvar sessão')
    }

    return sessionRes.json()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!files.length) {
      toast.error('Selecione pelo menos um arquivo PDF')
      return
    }

    setState('parsing')
    setProgress(5)

    try {
      const results: string[] = []

      for (const [index, file] of files.entries()) {
        setStatus(`Processando ${file.file.name}...`)
        setProgress(Math.round((index / files.length) * 90) + 5)
        const result = await processPDF(file)
        if (result) results.push(result.sessionId)
      }

      setState('done')
      setProgress(100)

      if (results.length > 0) {
        toast.success('PDFs processados! Revise as transações.')
        router.push(`/review?sessionIds=${results.join(',')}`)
      } else {
        toast.info('Nenhuma nova sessão criada')
        router.push('/dashboard')
      }
    } catch (err: unknown) {
      setState('error')
      const error = err as Error & { needsPassword?: boolean; fileId?: string }
      if (error.needsPassword && error.fileId) {
        updateFile(error.fileId, { needsPassword: true })
        toast.error('Um PDF está protegido por senha. Informe a senha e tente de novo.')
        setState('idle')
      } else {
        toast.error(error.message || 'Erro inesperado')
      }
    }
  }

  const isLoading = state === 'parsing'

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Importar arquivos</h1>
        <p className="text-muted-foreground mt-1">
          Selecione uma ou mais faturas/extratos. Todos os gastos entram em uma revisão única.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Faturas do cartão</CardTitle>
              <CardDescription>Nubank, Inter ou PicPay</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                type="file"
                accept=".pdf"
                multiple
                className="cursor-pointer"
                onChange={(e) => addFiles('fatura', e.target.files)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Extratos bancários</CardTitle>
              <CardDescription>Conta corrente / Pix</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                type="file"
                accept=".pdf"
                multiple
                className="cursor-pointer"
                onChange={(e) => addFiles('extrato', e.target.files)}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Arquivos selecionados</CardTitle>
            <CardDescription>{files.length} arquivo(s) na fila</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {files.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum arquivo selecionado.</p>
            )}
            {files.map((item) => (
              <div key={item.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.file.name}</p>
                    <Badge variant="outline" className="mt-1">{item.inputType}</Badge>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => removeFile(item.id)}>
                    Remover
                  </Button>
                </div>
                {item.needsPassword && (
                  <div className="space-y-1">
                    <Label className="text-xs">Senha do PDF</Label>
                    <Input
                      type="password"
                      placeholder="Digite a senha do PDF"
                      value={item.password}
                      onChange={(e) => updateFile(item.id, { password: e.target.value })}
                    />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {isLoading && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground text-center">{status}</p>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Processando...' : 'Processar arquivos'}
        </Button>
      </form>
    </div>
  )
}
