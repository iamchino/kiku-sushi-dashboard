import { TrendingUp, TrendingDown, ArrowDownCircle, Wallet, Percent, AlertTriangle, CalendarClock } from 'lucide-react'
import { useFinanzas } from '../../hooks/useFinanzas'
import { fmtMoney, fmtFecha, catLabel, catColor } from '../../lib/finanzas'

function Kpi({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>{label}</p>
        {Icon && <Icon size={15} style={{ color: color || 'var(--text-muted)' }} />}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

export default function ResumenFinanzas({ desde, hasta, label }) {
  const { resumen, turnos, pendientes, loading, error } = useFinanzas(desde, hasta)

  const positivo = resumen.resultado >= 0
  const maxCat = Math.max(1, ...resumen.porCategoria.map(c => c.total))

  if (error) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
        <AlertTriangle size={14} /> {error}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Ingresos" value={loading ? '—' : fmtMoney(resumen.ingresos)} icon={TrendingUp} color="#10b981"
          sub={`${resumen.cantPedidos} cobros · ${label}`} />
        <Kpi label="Egresos" value={loading ? '—' : fmtMoney(resumen.totalEgresos)} icon={ArrowDownCircle} color="#f87171"
          sub="Gastos pagados del período" />
        <Kpi label="Resultado neto" value={loading ? '—' : fmtMoney(resumen.resultado)} icon={positivo ? TrendingUp : TrendingDown}
          color={positivo ? '#10b981' : '#f87171'} sub="Ingresos − Egresos" />
        <Kpi label="Margen" value={loading ? '—' : `${resumen.margen.toFixed(1)}%`} icon={Percent}
          sub="Sobre ingresos" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Egresos por categoría */}
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Egresos por categoría</p>
          {resumen.porCategoria.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: 'var(--text-xmuted)' }}>Sin egresos en el período</p>
          ) : (
            <div className="space-y-2.5">
              {resumen.porCategoria.map(c => (
                <div key={c.categoria}>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: 'var(--text-secondary)' }}>{catLabel(c.categoria)}</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(c.total)}</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--bg-input)' }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${(c.total / maxCat) * 100}%`, background: catColor(c.categoria) }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cajas recientes + vencimientos */}
        <div className="space-y-4">
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Wallet size={15} style={{ color: 'var(--accent-lift)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Cierres de caja recientes</p>
            </div>
            {turnos.length === 0 ? (
              <p className="text-xs py-4 text-center" style={{ color: 'var(--text-xmuted)' }}>Sin cierres en el período</p>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {turnos.slice(0, 5).map(t => {
                  const dif = Number(t.diferencia || 0)
                  const ok = Math.abs(dif) < 1
                  return (
                    <div key={t.id} className="flex items-center justify-between py-2 text-xs">
                      <span style={{ color: 'var(--text-secondary)' }}>{fmtFecha(t.business_date)}</span>
                      <span className="px-2 py-0.5 rounded-md font-medium"
                        style={ok
                          ? { background: 'rgba(16,185,129,0.12)', color: '#10b981' }
                          : { background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>
                        {ok ? 'Cuadra' : `${dif > 0 ? '+' : ''}${fmtMoney(dif)}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CalendarClock size={15} style={{ color: '#f59e0b' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Próximos a pagar</p>
              </div>
              {resumen.totalPendiente > 0 && (
                <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>{fmtMoney(resumen.totalPendiente)}</span>
              )}
            </div>
            {pendientes.length === 0 ? (
              <p className="text-xs py-2 text-center" style={{ color: 'var(--text-xmuted)' }}>Nada pendiente, todo al día</p>
            ) : (
              <div className="space-y-1.5">
                {pendientes.slice(0, 5).map(p => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span className="truncate mr-2" style={{ color: 'var(--text-secondary)' }}>
                      {p.proveedor?.razon_social || p.descripcion}
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      {p.vencimiento && <span style={{ color: 'var(--text-xmuted)' }}>{fmtFecha(p.vencimiento)}</span>}
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(p.monto)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
