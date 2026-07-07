'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCents } from '@/lib/format'

interface Props {
  data: { source: string; totalCents: number }[]
}

const SOURCE_COLORS: Record<string, string> = {
  nubank: '#8b5cf6',
  inter: '#f97316',
  picpay: '#10b981',
  pix: '#3b82f6',
}

const SOURCE_LABELS: Record<string, string> = {
  nubank: 'Nubank',
  inter: 'Inter',
  picpay: 'PicPay',
  pix: 'Pix',
}

export function SourceStacked({ data }: Props) {
  if (!data.length) return <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="source"
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => SOURCE_LABELS[v] ?? v}
        />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 100000).toFixed(0)}k`} />
        <Tooltip
          formatter={(v) => formatCents(v as number)}
          labelFormatter={(l) => SOURCE_LABELS[l] ?? l}
          contentStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="totalCents" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <rect key={i} fill={SOURCE_COLORS[entry.source] ?? '#94a3b8'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
