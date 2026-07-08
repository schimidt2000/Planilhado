import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { parsePDF } from '@/lib/parse-pdf-subprocess'
import { ok, error, unauthorized } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const pdfPassword = formData.get('pdfPassword') as string | null

  if (!file) return error('Nenhum arquivo enviado')
  if (!file.name.toLowerCase().endsWith('.pdf')) return error('O arquivo deve ser um PDF')

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  try {
    const result = await parsePDF(buffer, pdfPassword || undefined)
    return ok(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('senha') || msg.includes('password') || msg.includes('incorrect')) {
      return error('Senha incorreta para o PDF. Por favor, informe a senha.', 400)
    }
    return error(msg || 'Erro ao processar PDF', 400)
  }
}
