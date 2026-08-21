import { useMemo, useState } from 'react'
import {
  TrendingUp, TrendingDown, ArrowDownCircle, Wallet, Percent, AlertTriangle,
  CalendarClock, CheckCircle2, ChevronDown, Edit2, History, Trash2,
} from 'lucide-react'
import { useFinanzas } from '../../hooks/useFinanzas'
import { useEgresos } from '../../hooks/useEgresos'
import { useProveedores } from '../../hooks/useProveedores'
import { useEmpleados } from '../../hooks/useEmpleados'
import { fmtMoney, fmtFecha, catLabel, catColor, medioLabel } from '../../lib/finanzas'
import EgresoModal from './EgresoModal'
import ConfirmDelete from './ConfirmDelete'
import CajaFuerteResumen from './CajaFuerteResumen'

// Resumen de Finanzas: la "foto del negocio" en una sola pantalla, pensada
// para leerse de un vistazo sin conocer el sistema. Todo lo que se puede
// desplegar se despliega acá mismo: cierres de caja con su detalle y el
// historial de pagos del período.

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

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl p-4 ${className}`}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
      {children}
    </div>
  )
}

// ¿A dónde se va la plata? Barra apilada con la composición + una fila por
// categoría con porcentaje y monto. Los anchos son proporción del TOTAL de
// egresos, así la barra cuenta la historia completa de un vistazo.
function EgresosPorCategoria({ porCategoria, totalEgresos }) {
  if (porCategoria.length === 0 || totalEgresos <= 0) {
    return <p className="text-xs py-6 text-center" style={{ color: 'var(--text-xmuted)' }}>Sin egresos en el período</p>
  }
  const pct = (v) => (v / totalEgresos) * 100
  return (
    <div>
      {/* Composición total, una sola barra */}
      <div className="flex h-4 w-full overflow-hidden rounded-full" style={{ background: 'var(--bg-input)' }}>
        {porCategoria.map(c => (
          <div key={c.categoria} title={`${catLabel(c.categoria)} · ${pct(c.total).toFixed(0)}%`}
            style={{ width: `${pct(c.total)}%`, background: catColor(c.categoria) }} />
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {porCategoria.map(c => (
          <div key={c.categoria}>
            <div className="flex items-baseline justify-between gap-2 text-sm mb-1">
              <span className="flex items-center gap-2 min-w-0" style={{ color: 'var(--text-secondary)' }}>
                <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: catColor(c.categoria) }} />
                <span className="truncate">{catLabel(c.categoria)}</span>
                <span className="text-xs font-bold flex-shrink-0" style={{ color: catColor(c.categoria) }}>
                  {pct(c.total).toFixed(0)}%
                </span>
              </span>
              <span className="font-semibold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{fmtMoney(c.total)}</span>
            </div>
            <div className="h-2.5 rounded-full" style={{ background: 'var(--bg-input)' }}>
              <div className="h-2.5 rounded-full" style={{ width: `${pct(c.total)}%`, background: catColor(c.categoria) }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Total del período</span>
        <span className="text-sm font-bold" style={{ color: '#f87171' }}>{fmtMoney(totalEgresos)}</span>
      </div>
    </div>
  )
}

// Cierres de caja del período: cada fila se despliega al clickearla y muestra
// el detalle completo del cierre (lo que antes vivía en la pestaña
// "Cajas diarias").
function CierresDeCaja({ turnos }) {
  const [abierto, setAbierto] = useState(null)

  const cuadran = turnos.filter(t => Math.abs(Number(t.diferencia || 0)) < 1).length

  if (turnos.length === 0) {
    return <p className="text-xs py-4 text-center" style={{ color: 'var(--text-xmuted)' }}>Sin cierres en el período</p>
  }
  return (
    <div>
      <p className="mb-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {cuadran} de {turnos.length} cierres cuadran · tocá un día para ver el detalle
      </p>
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {turnos.map(t => {
          const dif = Number(t.diferencia || 0)
          const ok = Math.abs(dif) < 1
          const expandido = abierto === t.id
          return (
            <div key={t.id}>
              <button type="button" onClick={() => setAbierto(expandido ? null : t.id)}
                className="flex w-full items-center justify-between gap-2 py-2 text-xs"
                aria-expanded={expandido}>
                <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                  <ChevronDown size={12} className={`transition-transform ${expandido ? 'rotate-180' : ''}`}
                    style={{ color: 'var(--text-xmuted)' }} />
                  {fmtFecha(t.business_date)}
                  {t.caja_nombre && <span style={{ color: 'var(--text-xmuted)' }}>· {t.caja_nombre}</span>}
                </span>
                <span className="flex items-center gap-1 rounded-md px-2 py-0.5 font-medium"
                  style={ok
                    ? { background: 'rgba(16,185,129,0.12)', color: '#10b981' }
                    : { background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>
                  {ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                  {ok ? 'Cuadra' : `${dif > 0 ? 'Sobra ' : 'Falta '}${fmtMoney(Math.abs(dif))}`}
                </span>
              </button>
              {expandido && (
                <div className="mb-2 rounded-lg px-3 py-2.5" style={{ background: 'var(--bg-input)' }}>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Apertura', value: fmtMoney(t.apertura_monto) },
                      { label: 'Esperado', value: fmtMoney(t.efectivo_esperado) },
                      { label: 'Contado', value: fmtMoney(t.cierre_monto) },
                      { label: 'Depósito', value: fmtMoney(t.deposito_monto) },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-xmuted)' }}>{label}</p>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{value}</p>
                      </div>
                    ))}
                  </div>
                  {t.notas_cierre && (
                    <p className="mt-2 pt-2 text-[11px]" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                      {t.notas_cierre}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Historial de pagos del período. El alta vive en Caja → Pagos; acá se ve
// todo lo pagado y se puede corregir un pago puntual.
function HistorialDePagos({ desde, hasta }) {
  const { egresos, loading, error, actualizarEgreso, eliminarEgreso } = useEgresos(desde, hasta)
  const { proveedores } = useProveedores()
  const { empleados } = useEmpleados()
  const [verTodos, setVerTodos] = useState(false)
  const [editando, setEditando] = useState(null)
  const [borrando, setBorrando] = useState(null)

  const visibles = verTodos ? egresos : egresos.slice(0, 6)

  if (error) return <p className="text-xs py-3" style={{ color: '#f87171' }}>{error}</p>
  if (loading) return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
  if (egresos.length === 0) {
    return <p className="text-xs py-4 text-center" style={{ color: 'var(--text-xmuted)' }}>Sin pagos en el período</p>
  }

  return (
    <div>
      <div className="space-y-1.5">
        {visibles.map(e => (
          <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
            style={{ background: 'var(--bg-input)' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="h-8 w-1.5 flex-shrink-0 rounded-full" style={{ background: catColor(e.categoria) }} />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {e.descripcion}
                  {e.proveedor?.razon_social && <span style={{ color: 'var(--text-muted)' }}> · {e.proveedor.razon_social}</span>}
                  {e.empleado?.nombre && <span style={{ color: 'var(--text-muted)' }}> · {e.empleado.nombre} {e.empleado.apellido || ''}</span>}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
                  {catLabel(e.categoria)} · {fmtFecha(e.fecha)} · {medioLabel(e.medio_pago)}
                  {e.estado === 'pendiente' && <span style={{ color: '#f59e0b' }}> · pendiente</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(e.monto)}</span>
              <button onClick={() => setEditando(e)} title="Corregir este pago"
                className="p-1 rounded-md transition-colors" style={{ color: 'var(--text-xmuted)' }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                <Edit2 size={12} />
              </button>
              <button onClick={() => setBorrando(e)} title="Eliminar este pago"
                className="p-1 rounded-md transition-colors" style={{ color: 'var(--text-xmuted)' }}
                onMouseEnter={ev => { ev.currentTarget.style.background = 'rgba(248,113,113,0.12)'; ev.currentTarget.style.color = '#f87171' }}
                onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = 'var(--text-xmuted)' }}>
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {egresos.length > 6 && (
        <button onClick={() => setVerTodos(v => !v)}
          className="mt-2 w-full rounded-lg py-1.5 text-[11px] font-semibold transition-colors"
          style={{ color: 'var(--accent-lift)', border: '1px dashed var(--accent-border)' }}>
          {verTodos ? 'Ver menos' : `Ver los ${egresos.length} pagos`}
        </button>
      )}
      <p className="mt-2 text-[10px] text-center" style={{ color: 'var(--text-xmuted)' }}>
        Los pagos nuevos se registran en Caja y facturación → Pagos
      </p>

      {editando && (
        <EgresoModal
          title="Editar pago"
          initial={editando}
          proveedores={proveedores}
          empleados={empleados}
          onClose={() => setEditando(null)}
          onSave={async (form) => { await actualizarEgreso(editando.id, form) }}
        />
      )}

      {borrando && (
        <ConfirmDelete titulo="Eliminar pago"
          mensaje={`¿Borrás "${borrando.descripcion}" por ${fmtMoney(borrando.monto)}? Desaparece del historial y de los totales del período. Si salió de una caja, el movimiento de esa caja NO se revierte solo.`}
          onClose={() => setBorrando(null)}
          onConfirm={async () => { await eliminarEgreso(borrando.id) }} />
      )}
    </div>
  )
}

export default function ResumenFinanzas({ desde, hasta, label }) {
  const { resumen, turnos, pendientes, loading, error } = useFinanzas(desde, hasta)

  const positivo = resumen.resultado >= 0
  const proximos = useMemo(() => pendientes.slice(0, 5), [pendientes])

  if (error) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
        <AlertTriangle size={14} /> {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs: la foto en cuatro números */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Entró" value={loading ? '—' : fmtMoney(resumen.ingresos)} icon={TrendingUp} color="#10b981"
          sub={`${resumen.cantPedidos} cobros · ${label}`} />
        <Kpi label="Salió" value={loading ? '—' : fmtMoney(resumen.totalEgresos)} icon={ArrowDownCircle} color="#f87171"
          sub="Gastos pagados del período" />
        <Kpi label="Quedó" value={loading ? '—' : fmtMoney(resumen.resultado)} icon={positivo ? TrendingUp : TrendingDown}
          color={positivo ? '#10b981' : '#f87171'} sub="Entró − Salió" />
        <Kpi label="Margen" value={loading ? '—' : `${resumen.margen.toFixed(1)}%`} icon={Percent}
          sub="De cada $100 que entran, cuánto queda" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ¿A dónde se va la plata? */}
        <Card>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>¿A dónde se va la plata?</p>
          <EgresosPorCategoria porCategoria={resumen.porCategoria} totalEgresos={resumen.totalEgresos} />
        </Card>

        <div className="space-y-4">
          {/* Cierres de caja, con detalle desplegable */}
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <Wallet size={15} style={{ color: 'var(--accent-lift)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Cierres de caja</p>
            </div>
            <CierresDeCaja turnos={turnos} />
          </Card>

          {/* Próximos a pagar */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CalendarClock size={15} style={{ color: '#f59e0b' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Próximos a pagar</p>
              </div>
              {resumen.totalPendiente > 0 && (
                <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>{fmtMoney(resumen.totalPendiente)}</span>
              )}
            </div>
            {proximos.length === 0 ? (
              <p className="text-xs py-2 text-center" style={{ color: 'var(--text-xmuted)' }}>Nada pendiente, todo al día</p>
            ) : (
              <div className="space-y-1.5">
                {proximos.map(p => (
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
                {pendientes.length > 5 && (
                  <p className="pt-1 text-[10px] text-center" style={{ color: 'var(--text-xmuted)' }}>
                    Todo el detalle está en Proyección de pagos
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Caja fuerte: cuánto hay guardado y qué se movió en el período */}
          <CajaFuerteResumen desde={desde} hasta={hasta} label={label} />
        </div>
      </div>

      {/* Historial de pagos del período */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <History size={15} style={{ color: 'var(--accent-lift)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Historial de pagos · {label}</p>
        </div>
        <HistorialDePagos desde={desde} hasta={hasta} />
      </Card>
    </div>
  )
}
