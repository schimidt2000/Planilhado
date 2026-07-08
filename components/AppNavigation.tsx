'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CirclePlus, FileText, LayoutDashboard, Upload, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const items = [
  { href: '/dashboard', label: 'Dashboard', mobileLabel: 'Início', icon: LayoutDashboard },
  { href: '/upload', label: 'Importar', mobileLabel: 'Importar', icon: Upload },
  { href: '/manual', label: 'Novo gasto', mobileLabel: 'Novo', icon: CirclePlus },
  { href: '/imports', label: 'Importações', mobileLabel: 'Arquivos', icon: FileText },
  { href: '/debtors', label: 'Devedores', mobileLabel: 'Pessoas', icon: Users },
]

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppNavigation() {
  const pathname = usePathname()

  return (
    <>
      <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegação principal">
        {items.map((item) => {
          const Icon = item.icon
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors',
                active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t bg-background/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden"
        aria-label="Navegação principal"
      >
        {items.map((item) => {
          const Icon = item.icon
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-[11px] font-medium',
                active ? 'bg-muted text-foreground' : 'text-muted-foreground'
              )}
            >
              <Icon className="size-5" />
              <span className="w-full truncate text-center">{item.mobileLabel}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
