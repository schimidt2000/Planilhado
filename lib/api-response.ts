import { NextResponse } from 'next/server'

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 })
}

export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function unauthorized() {
  return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
}

export function notFound(entity = 'Recurso') {
  return NextResponse.json({ error: `${entity} não encontrado` }, { status: 404 })
}

export function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 })
}

export function unprocessable(message: string) {
  return NextResponse.json({ error: message }, { status: 422 })
}
