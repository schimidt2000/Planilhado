import { auth, signOut } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CirclePlus, FileText, LayoutDashboard, Upload, Users } from 'lucide-react'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-4">
            <Link href="/dashboard" className="font-bold text-lg text-primary">
              Planilhado
            </Link>
            <div className="flex items-center gap-3 sm:hidden">
              <span className="text-sm text-muted-foreground">
                {session.user.name}
              </span>
              <form action={async () => {
                'use server'
                await signOut({ redirectTo: '/login' })
              }}>
                <Button variant="outline" size="sm" type="submit">Sair</Button>
              </form>
            </div>
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm"><LayoutDashboard className="size-4" /> Dashboard</Button>
            </Link>
            <Link href="/upload">
              <Button variant="ghost" size="sm"><Upload className="size-4" /> Importar</Button>
            </Link>
            <Link href="/manual">
              <Button variant="ghost" size="sm"><CirclePlus className="size-4" /> Novo gasto</Button>
            </Link>
            <Link href="/imports">
              <Button variant="ghost" size="sm"><FileText className="size-4" /> Importações</Button>
            </Link>
            <Link href="/debtors">
              <Button variant="ghost" size="sm"><Users className="size-4" /> Devedores</Button>
            </Link>
          </nav>
          <div className="hidden items-center gap-3 sm:flex">
            <span className="text-sm text-muted-foreground">
              {session.user.name}
            </span>
            <form action={async () => {
              'use server'
              await signOut({ redirectTo: '/login' })
            }}>
              <Button variant="outline" size="sm" type="submit">Sair</Button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  )
}
