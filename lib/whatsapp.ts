export function normalizeWhatsApp(value: string): string {
  let digits = value.replace(/\D/g, '')

  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`
  }

  return digits
}

export function buildWhatsAppUrl(phone: string | null | undefined, message?: string): string | null {
  if (!phone) return null
  const digits = normalizeWhatsApp(phone)
  if (!digits) return null

  const text = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${digits}${text}`
}
