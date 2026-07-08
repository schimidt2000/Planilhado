import type { ImportSource, ParseResult, ParsedTransaction } from '@/lib/types'

function parseRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  row.push(field)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function parseDate(value: string): Date | null {
  const clean = value.trim()
  const br = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00.000Z`)
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00.000Z`)
  return null
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function parseBankCsv(text: string): ParseResult {
  const rows = parseRows(text.replace(/^\uFEFF/, ''))
  if (rows.length < 2) throw new Error('CSV vazio ou sem transações')

  const headers = rows[0].map(normalizeHeader)
  const dateIndex = headers.findIndex((header) => ['data', 'date'].includes(header))
  const amountIndex = headers.findIndex((header) => ['valor', 'amount'].includes(header))
  const descriptionIndex = headers.findIndex((header) => ['descricao', 'description', 'titulo'].includes(header))
  const identifierIndex = headers.findIndex((header) => ['identificador', 'id', 'identifier'].includes(header))

  if (dateIndex < 0 || amountIndex < 0 || descriptionIndex < 0) {
    throw new Error('CSV não reconhecido. São necessárias as colunas Data, Valor e Descrição.')
  }

  const source: ImportSource = headers.includes('identificador') ? 'nubank' : 'pix'
  const transactions: ParsedTransaction[] = rows.slice(1).flatMap((row) => {
    const date = parseDate(row[dateIndex] ?? '')
    const amount = Number((row[amountIndex] ?? '').replace(/\s/g, '').replace(',', '.'))
    const description = (row[descriptionIndex] ?? '').trim()
    if (!date || !Number.isFinite(amount) || !description) return []

    return [{
      date: date.toISOString(),
      description,
      amountCents: Math.abs(Math.round(amount * 100)),
      isCredit: amount > 0,
      rawLine: row.join(','),
      externalIdentifier: identifierIndex >= 0 ? row[identifierIndex]?.trim() || null : null,
    }]
  })

  if (transactions.length === 0) throw new Error('Nenhuma transação válida encontrada no CSV')
  const firstDate = new Date(transactions[0].date)
  return {
    source,
    month: `${firstDate.getUTCFullYear()}-${String(firstDate.getUTCMonth() + 1).padStart(2, '0')}`,
    transactions,
  }
}
