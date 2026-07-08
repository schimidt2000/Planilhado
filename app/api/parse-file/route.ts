import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { parsePDF } from '@/lib/parse-pdf-subprocess'
import { parseBankCsv } from '@/lib/parse-csv'
import { ok, error, unauthorized } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const pdfPassword = formData.get('pdfPassword') as string | null
  if (!file) return error('Nenhum arquivo enviado')

  try {
    if (file.name.toLowerCase().endsWith('.csv')) {
      return ok(parseBankCsv(await file.text()))
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return error('Envie um arquivo PDF ou CSV')
    }
    return ok(await parsePDF(Buffer.from(await file.arrayBuffer()), pdfPassword || undefined))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (/senha|password|incorrect/i.test(message)) {
      return error('Senha incorreta para o PDF. Por favor, informe a senha.', 400)
    }
    return error(message || 'Erro ao processar arquivo', 400)
  }
}
