import { useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, Truck, AlertTriangle, CalendarClock, CheckCircle2 } from 'lucide-react'
import { useEgresos } from '../../hooks/useEgresos'
import { useProveedores } from '../../hooks/useProveedores'
import { fmtMoney, fmtFecha, medioLabel } from '../../lib/finanzas'
import EgresoModal from './EgresoModal'
import ConfirmDelete from './ConfirmDelete'

export default function ProveedoresPagos({ desde, hasta, label }) {
  const { egresos, pendientes, loading, error, crearEgreso, actualizarEgreso, eliminarEgreso } = useEgresos(desde, hasta)
  const { proveedores } = useProveedores()
  const [modal, setModal]       = useState(null)  // null | 'nuevo' | egreso
  const [toDelete, setToDelete] = useState(null)

  const pagosProv = useMemo(() => egresos.filter(e => e.categoria === 'proveedores' && e.estado === 'pagado'), [egresos])
  const totalPagado = pagosProv.reduce((s, e) => s + Number(e.monto || 0), 0)
  const porPagar = useMemo(() => pendientes.filter(e => e.categoria === 'proveedores' || e.proveedor_id), [pendientes])
  const totalPorPagar = porPagar.reduce((s, e) => s + Number(e.monto || 0), 0)

  // Proveedores con fecha de pago agendada (calendario)
  const agenda = useMemo(() => proveedores
    .filter(p => p.fecha_pago)
    .sort((a, b) => a.fecha_pago.localeCompare(b.fecha_pago)), [proveedores])

  const handleSave = async (form) => {
    if (modal === 'nuevo') await crearEgreso(form)
    else await actualizarEgreso(modal.id, form)
  }
  const marcarPagado = async (e) => { await actualizarEgreso(e.id, { estado: 'pagado', vencimiento: null }) }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-6">
          <div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Pagado · {label}</p>
            <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{fmtMoney(totalPagado)}</p>
          </div>
          <div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Por pagar</p>
            <p className="text-2xl font-bold tracking-tight" style={{ color: totalPorPagar > 0 ? '#f59e0b' : 'var(--text-primary)' }}>{fmtMoney(totalPorPagar)}</p>
          </div>
        </div>
        <button onClick={() => setModal('nuevo')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          <Plus size={14} /> Registrar pago
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Cuentas por pagar */}
      <div>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Cuentas por pagar</p>
        {porPagar.length === 0 ? (
          <p className="text-xs py-5 text-center rounded-xl" style={{ color: 'var(--text-xmuted)', background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
            Nada pendiente — todo al día
          </p>
        ) : (
          <div className="space-y-2">
            {porPagar.map(e => (
              <div key={e.id} className="flex items-center justify-between rounded-xl px-4 py-3 gap-3"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {e.proveedor?.razon_social || e.descripcion}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {e.vencimiento && (
                      <span className="text-[11px] flex items-center gap-1" style={{ color: '#f59e0b' }}>
                        <CalendarClock size={10} /> Vence {fmtFecha(e.vencimiento)}
                      </span>
                    )}
                    {e.proveedor?.razon_social && <span className="text-[11px] truncate" style={{ color: 'var(--text-xmuted)' }}>{e.descripcion}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{fmtMoney(e.monto)}</span>
                  <button onClick={() => marcarPagado(e)} title="Marcar como pagado"
                    className="p-1.5 rounded-lg transition-colors" style={{ color: '#10b981' }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(16,185,129,0.1)'} onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                    <CheckCircle2 size={15} />
                  </button>
                  <button onClick={() => setToDelete(e)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={ev => { ev.currentTarget.style.background = 'rgba(248,113,113,0.1)'; ev.currentTarget.style.color = '#f87171' }}
                    onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = 'var(--text-muted)' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agenda de pagos a proveedores (fecha_pago) */}
      {agenda.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Agenda de proveedores</p>
          <div className="space-y-2">
            {agenda.map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-xl px-4 py-2.5"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <Truck size={14} style={{ color: 'var(--accent-lift)' }} />
                  <span className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{p.razon_social}</span>
                </div>
                <span className="text-[11px] font-medium flex items-center gap-1" style={{ color: 'var(--accent-lift)' }}>
                  <CalendarClock size={10} /> {fmtFecha(p.fecha_pago)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagos del período */}
      <div>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Pagos realizados · {label}</p>
        {loading ? (
          <div className="space-y-2.5">{[1, 2].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
        ) : pagosProv.length === 0 ? (
          <p className="text-xs py-5 text-center rounded-xl" style={{ color: 'var(--text-xmuted)', background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
            Sin pagos a proveedores en el período
          </p>
        ) : (
          <div className="space-y-2">
            {pagosProv.map(e => (
              <div key={e.id} className="flex items-center justify-between rounded-xl px-4 py-3 gap-3"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {e.proveedor?.razon_social || e.descripcion}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>{fmtFecha(e.fecha)}</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>· {medioLabel(e.medio_pago)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{fmtMoney(e.monto)}</span>
                  <button onClick={() => setModal(e)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => setToDelete(e)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={ev => { ev.currentTarget.style.background = 'rgba(248,113,113,0.1)'; ev.currentTarget.style.color = '#f87171' }}
                    onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = 'var(--text-muted)' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <EgresoModal
          title={modal === 'nuevo' ? 'Registrar pago a proveedor' : 'Editar pago'}
          initial={modal !== 'nuevo' ? modal : null}
          proveedores={proveedores}
          defaults={modal === 'nuevo' ? { categoria: 'proveedores' } : undefined}
          onClose={() => setModal(null)} onSave={handleSave}
        />
      )}
      {toDelete && (
        <ConfirmDelete titulo="Eliminar pago"
          mensaje={`¿Eliminás este movimiento por ${fmtMoney(toDelete.monto)}?`}
          onClose={() => setToDelete(null)} onConfirm={() => eliminarEgreso(toDelete.id)} />
      )}
    </div>
  )
}
