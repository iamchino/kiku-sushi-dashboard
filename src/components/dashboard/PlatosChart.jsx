import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: 'var(--shadow-card)',
      }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 2 }}>{label}</p>
        <p style={{ color: '#7c3aed', fontSize: 13, fontWeight: 600 }}>{payload[0].value} unidades</p>
      </div>
    )
  }
  return null
}

export function PlatosChart({ data, loading }) {
  return (
    <div
      className="rounded-xl p-5 h-full"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}
    >
      <h2 className="text-xs font-medium uppercase tracking-wide mb-4" style={{ color: 'var(--text-xmuted)' }}>
        Platos más vendidos hoy
      </h2>
      {loading ? (
        <div className="space-y-3 pt-2">
          {[70, 55, 85, 45, 60].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-4 rounded" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      ) : !data?.length ? (
        <div className="h-52 flex items-center justify-center text-sm" style={{ color: 'var(--text-xmuted)' }}>
          Sin ventas aún hoy
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="nombre"
              tick={{ fontSize: 11, fill: 'var(--text-xmuted)' }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={-15}
              textAnchor="end"
              height={45}
            />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-xmuted)' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-hover)' }} />
            <Bar dataKey="unidades" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={`rgba(124,58,237,${1 - i * 0.15})`}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}