import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const COLORES = {
  salon: '#7c3aed',
  delivery: '#4f8ef7',
  whatsapp: '#34d399',
  pedidosya: '#fbbf24',
  rappi: '#f472b6',
}

const ETIQUETAS = {
  salon: 'Salón',
  delivery: 'Delivery',
  whatsapp: 'WhatsApp',
  pedidosya: 'PedidosYa',
  rappi: 'Rappi',
}

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0]
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: 'var(--shadow-card)',
      }}>
        <p style={{ color: COLORES[d.name] || '#7c3aed', fontSize: 13, fontWeight: 600 }}>
          {ETIQUETAS[d.name] || d.name}: {d.value}
        </p>
      </div>
    )
  }
  return null
}

export function CanalDonut({ kpis, loading }) {
  const data = kpis ? [
    { name: 'salon', value: Number(kpis.pedidos_salon || 0) },
    { name: 'delivery', value: Number(kpis.pedidos_delivery || 0) },
  ].filter(d => d.value > 0) : []

  const total = data.reduce((a, b) => a + b.value, 0)

  return (
    <div
      className="rounded-xl p-5 h-full"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}
    >
      <h2 className="text-xs font-medium uppercase tracking-wide mb-4" style={{ color: 'var(--text-xmuted)' }}>
        Por canal
      </h2>
      {loading ? (
        <div className="flex flex-col items-center gap-4 pt-2">
          <div className="skeleton w-32 h-32 rounded-full" />
          <div className="w-full space-y-2">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-3/4" />
          </div>
        </div>
      ) : !data.length ? (
        <div className="h-52 flex items-center justify-center text-sm" style={{ color: 'var(--text-xmuted)' }}>
          Sin pedidos aún
        </div>
      ) : (
        <>
          <div className="relative">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={48} outerRadius={72} dataKey="value" paddingAngle={3}>
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={COLORES[entry.name] || '#888'} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Texto central */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{total}</p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-xmuted)' }}>total</p>
              </div>
            </div>
          </div>
          <div className="space-y-2 mt-3">
            {data.map(d => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: COLORES[d.name] }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{ETIQUETAS[d.name] || d.name}</span>
                </span>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {d.value} <span style={{ color: 'var(--text-xmuted)' }}>({Math.round(d.value / total * 100)}%)</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}