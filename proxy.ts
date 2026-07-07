import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const isAuthenticated = !!req.auth

  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register')
  const isApiAuthRoute = pathname.startsWith('/api/auth')
  const isProtectedApi = pathname.startsWith('/api/') && !isApiAuthRoute
  const isProtectedPage =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/upload') ||
    pathname.startsWith('/review') ||
    pathname.startsWith('/report')

  if (isApiAuthRoute) return NextResponse.next()

  if (isProtectedApi && !isAuthenticated) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  if (isProtectedPage && !isAuthenticated) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
