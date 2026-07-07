'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { formatCents } from '@/lib/format'

interface Props {
  data: { debtorName: string; totalCents: number }[]
}

const COLORS = ['#f97316', '#8b5cf6', '#10b981', '#3b82f6', '#ec4899', '#f59e0b', '#06b6d4']

export function DebtorBar({ data }: Props) {
  if (!data.length) {
    return <p className="text-muted-foreground text-sm text-center py-8">Sem valores a receber</p>
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 100).toFixed(0)}`} />
        <YAxis dataKey="debtorName" type="category" tick={{ fontSize: 11 }} width={80} />
        <Tooltip formatter={(v) => formatCents(v as number)} contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="totalCents" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
