import { AlertTriangle, AlertCircle } from 'lucide-react'

export function AlertasStock({ alertas }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}
    >
      <h2 className="text-xs font-medium uppercase tracking-wide mb-3" style={{ color: 'var(--text-xmuted)' }}>
        Alertas de stock
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {alertas.map(a => {
          const critico = a.estado === 'critico'
          return (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm"
              style={critico
                ? { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }
                : { background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', color: '#f59e0b' }
              }
            >
              {critico
                ? <AlertCircle size={15} className="flex-shrink-0" />
                : <AlertTriangle size={15} className="flex-shrink-0" />
              }
              <div>
                <span className="font-semibold">{a.nombre}</span>
                <span style={{ color: critico ? '#fca5a5' : '#fcd34d' }}> — Quedan {a.stock_actual} {a.unidad}</span>
                <span className="ml-1 text-xs opacity-60">(mín: {a.stock_minimo} {a.unidad})</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}