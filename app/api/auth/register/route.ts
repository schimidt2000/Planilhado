import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { created, conflict, unprocessable } from '@/lib/api-response'
import { isStrongPassword } from '@/lib/password'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, password, passwordConfirmation } = body
  const normalizedEmail = String(email ?? '').trim().toLowerCase()

  if (!name || name.trim().length < 2) {
    return unprocessable('Nome deve ter pelo menos 2 caracteres')
  }
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return unprocessable('Email inválido')
  }
  if (!password || !isStrongPassword(password)) {
    return unprocessable('A senha não atende aos requisitos de segurança')
  }
  if (password !== passwordConfirmation) return unprocessable('As senhas não coincidem')

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) return conflict('Este email já está cadastrado')

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { name: name.trim(), email: normalizedEmail, passwordHash },
    select: { id: true, name: true, email: true },
  })

  return created(user)
}
