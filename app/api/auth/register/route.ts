import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { created, conflict, unprocessable } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, password } = body

  if (!name || name.trim().length < 2) {
    return unprocessable('Nome deve ter pelo menos 2 caracteres')
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return unprocessable('Email inválido')
  }
  if (!password || password.length < 8) {
    return unprocessable('Senha deve ter pelo menos 8 caracteres')
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return conflict('Este email já está cadastrado')

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { name: name.trim(), email: email.toLowerCase(), passwordHash },
    select: { id: true, name: true, email: true },
  })

  return created(user)
}
