'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'

type UploadState = 'idle' | 'parsing' | 'saving' | 'done' | 'error'

interface FileInput {
  file: File | null
  password: string
  needsPassword: boolean
  inputType: 'fatura' | 'extrato'
}

export default function UploadPage() {
  const router = useRouter()
  const faturaRef = useRef<HTMLInputElement>(null)
  const extratoRef = useRef<HTMLInputElement>(null)

  const [fatura, setFatura] = useState<FileInput>({
    file: null, password: '', needsPassword: false, inputType: 'fatura'
  })
  const [extrato, setExtrato] = useState<FileInput>({
    file: null, password: '', needsPassword: false, inputType: 'extrato'
  })
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')

  async function processPDF(input: FileInput): Promise<{ sessionId: string } | null> {
    if (!input.file) return null

    const formData = new FormData()
    formData.append('file', input.file)
    formData.append('inputType', input.inputType)
    if (input.password) formData.append('pdfPassword', input.password)

    const parseRes = await fetch('/api/parse-pdf', { method: 'POST', body: formData })
    if (!parseRes.ok) {
      const data = await parseRes.json()
      if (data.error?.includes('senha') || parseRes.status === 400) {
        throw Object.assign(new Error(data.error), { needsPassword: true, inputType: input.inputType })
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
        toast.warning(data.error, { duration: 5000 })
        return null
      }
      throw new Error(data.error || 'Erro ao salvar sessão')
    }

    return sessionRes.json()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fatura.file && !extrato.file) {
      toast.error('Selecione pelo menos um arquivo PDF')
      return
    }

    setState('parsing')
    setProgress(10)

    try {
      const results: string[] = []

      if (fatura.file) {
        setStatus('Processando fatura...')
        setProgress(20)
        const r = await processPDF(fatura)
        if (r) results.push(r.sessionId)
        setProgress(55)
      }

      if (extrato.file) {
        setStatus('Processando extrato...')
        setProgress(60)
        const r = await processPDF(extrato)
        if (r) results.push(r.sessionId)
        setProgress(90)
      }

      setState('done')
      setProgress(100)

      if (results.length > 0) {
        toast.success('PDF processado! Revise as transações.')
        router.push(`/review/${results[0]}`)
      } else {
        toast.info('Nenhuma nova sessão criada (PDFs já importados?)')
        router.push('/dashboard')
      }
    } catch (err: unknown) {
      setState('error')
      const error = err as Error & { needsPassword?: boolean; inputType?: string }
      if (error.needsPassword) {
        if (error.inputType === 'fatura') setFatura((f) => ({ ...f, needsPassword: true }))
        else setExtrato((f) => ({ ...f, needsPassword: true }))
        toast.error('Este PDF está protegido por senha. Informe a senha abaixo.')
        setState('idle')
      } else {
        toast.error(error.message || 'Erro inesperado')
      }
    }
  }

  const isLoading = state === 'parsing' || state === 'saving'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Importar PDFs</h1>
        <p className="text-muted-foreground mt-1">
          Selecione os PDFs da sua fatura e/ou extrato para extrair as transações.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Fatura */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fatura do cartão</CardTitle>
            <CardDescription>Nubank, Inter ou PicPay</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              ref={faturaRef}
              type="file"
              accept=".pdf"
              className="cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                setFatura((f) => ({ ...f, file, needsPassword: false, password: '' }))
              }}
            />
            {fatura.needsPassword && (
              <div className="space-y-1">
                <Label className="text-xs">Senha do PDF</Label>
                <Input
                  type="password"
                  placeholder="Digite a senha do PDF"
                  value={fatura.password}
                  onChange={(e) => setFatura((f) => ({ ...f, password: e.target.value }))}
                  autoFocus
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Extrato */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Extrato bancário</CardTitle>
            <CardDescription>Transações de conta corrente / Pix</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              ref={extratoRef}
              type="file"
              accept=".pdf"
              className="cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                setExtrato((f) => ({ ...f, file, needsPassword: false, password: '' }))
              }}
            />
            {extrato.needsPassword && (
              <div className="space-y-1">
                <Label className="text-xs">Senha do PDF</Label>
                <Input
                  type="password"
                  placeholder="Digite a senha do PDF"
                  value={extrato.password}
                  onChange={(e) => setExtrato((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {isLoading && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground text-center">{status}</p>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Processando...' : 'Processar PDFs'}
        </Button>
      </form>
    </div>
  )
}
