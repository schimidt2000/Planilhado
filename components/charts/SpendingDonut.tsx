'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCents } from '@/lib/format'
import { getCategoryColor } from '@/lib/categories'

interface Props {
  data: { category: string; totalCents: number }[]
}

export function SpendingDonut({ data }: Props) {
  if (!data.length) return <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>

  const chartData = data.slice(0, 8).map((d) => ({
    name: d.category,
    value: d.totalCents,
    color: getCategoryColor(d.category),
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
        >
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatCents(value as number)}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend
          formatter={(value) => <span style={{ fontSize: 12 }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
