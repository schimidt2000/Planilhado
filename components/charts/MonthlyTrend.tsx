'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { formatCents, getMonthLabel } from '@/lib/format'

interface Props {
  data: { month: string; totalCents: number; receivableCents: number }[]
}

export function MonthlyTrend({ data }: Props) {
  if (!data.length) return <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>

  const chartData = data.map((d) => ({
    name: getMonthLabel(d.month),
    Gastos: d.totalCents / 100,
    'A receber': d.receivableCents / 100,
  }))

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="gastos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="receber" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v) => formatCents((v as number) * 100)} contentStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="Gastos" stroke="#f97316" fill="url(#gastos)" strokeWidth={2} />
        <Area type="monotone" dataKey="A receber" stroke="#10b981" fill="url(#receber)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
