'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Eye, EyeOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { isStrongPassword, passwordChecks } from '@/lib/password'
import { toast } from 'sonner'

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', passwordConfirmation: '' })
  const checks = passwordChecks(form.password)
  const passwordsMatch = form.passwordConfirmation.length > 0 && form.password === form.passwordConfirmation
  const canSubmit = form.name.trim().length >= 2 &&
    form.email.trim().length > 0 &&
    isStrongPassword(form.password) &&
    passwordsMatch

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!isStrongPassword(form.password)) {
      toast.error('Sua senha ainda não atende a todos os requisitos')
      return
    }
    if (!passwordsMatch) {
      toast.error('As senhas não coincidem')
      return
    }
    setLoading(true)

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        password: form.password,
        passwordConfirmation: form.passwordConfirmation,
      }),
    })

    if (!response.ok) {
      const data = await response.json()
      toast.error(data.error || 'Erro ao criar conta')
      setLoading(false)
      return
    }

    const signInResponse = await signIn('credentials', {
      email: form.email.trim().toLowerCase(),
      password: form.password,
      redirect: false,
    })
    setLoading(false)

    if (signInResponse?.error) {
      toast.success('Conta criada. Entre com seus dados.')
      router.push('/login')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <span className="mb-2 text-2xl font-bold text-primary">Planilhado</span>
        <CardTitle className="text-xl">Criar conta</CardTitle>
        <CardDescription>Comece a organizar seus gastos</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              autoComplete="name"
              placeholder="Seu nome"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
              minLength={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="seu@email.com"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className="pr-10"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                required
                aria-describedby="password-requirements"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <div id="password-requirements" className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-2">
              {checks.map((check) => (
                <span key={check.id} className={`flex items-center gap-1.5 text-xs ${check.met ? 'text-green-700' : 'text-muted-foreground'}`}>
                  {check.met ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                  {check.label}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password-confirmation">Confirmar senha</Label>
            <div className="relative">
              <Input
                id="password-confirmation"
                type={showConfirmation ? 'text' : 'password'}
                autoComplete="new-password"
                className="pr-10"
                value={form.passwordConfirmation}
                onChange={(event) => setForm((current) => ({ ...current, passwordConfirmation: event.target.value }))}
                required
                aria-invalid={form.passwordConfirmation.length > 0 && !passwordsMatch}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                title={showConfirmation ? 'Ocultar confirmação' : 'Mostrar confirmação'}
                onClick={() => setShowConfirmation((visible) => !visible)}
              >
                {showConfirmation ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            {form.passwordConfirmation.length > 0 && (
              <p className={`flex items-center gap-1.5 text-xs ${passwordsMatch ? 'text-green-700' : 'text-destructive'}`}>
                {passwordsMatch ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                {passwordsMatch ? 'As senhas coincidem' : 'As senhas não coincidem'}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading || !canSubmit}>
            {loading ? 'Criando conta...' : 'Criar conta'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Já tem conta? <Link href="/login" className="font-medium text-primary hover:underline">Entrar</Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
