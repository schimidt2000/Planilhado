export function formatCents(cents: number): string {
  const value = cents / 100
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function parseBRL(str: string): number {
  const cleaned = str.replace(/[^0-9,]/g, '').replace(',', '.')
  return Math.round(parseFloat(cleaned) * 100)
}

export function formatMonth(month: string): string {
  const [year, mon] = month.split('-')
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ]
  return `${months[parseInt(mon) - 1]} ${year}`
}

export function getMonthLabel(month: string): string {
  const [year, mon] = month.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(mon) - 1]}/${year.slice(2)}`
}

export function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function prevMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const date = new Date(year, mon - 2)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function nextMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const date = new Date(year, mon)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
