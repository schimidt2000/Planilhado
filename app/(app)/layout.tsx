import { auth, signOut } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { AppNavigation } from '@/components/AppNavigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard" className="text-lg font-bold text-primary">Planilhado</Link>
          <AppNavigation />
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden max-w-48 truncate text-sm text-muted-foreground lg:block">
              {session.user.name}
            </span>
            <form action={async () => {
              'use server'
              await signOut({ redirectTo: '/login' })
            }}>
              <Button variant="outline" size="icon" type="submit" title="Sair" className="lg:hidden">
                <LogOut className="size-4" />
              </Button>
              <Button variant="outline" size="sm" type="submit" className="hidden lg:inline-flex">
                <LogOut className="size-4" /> Sair
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 pb-24 sm:py-6 lg:pb-6">
        {children}
      </main>
    </div>
  )
}
