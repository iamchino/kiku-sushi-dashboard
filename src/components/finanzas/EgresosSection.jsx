import { useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, RefreshCw, AlertTriangle, ArrowDownCircle } from 'lucide-react'
import { useEgresos } from '../../hooks/useEgresos'
import { useProveedores } from '../../hooks/useProveedores'
import { useEmpleados } from '../../hooks/useEmpleados'
import { fmtMoney, fmtFecha, catLabel, catColor, medioLabel, CATEGORIAS } from '../../lib/finanzas'
import EgresoModal from './EgresoModal'
import ConfirmDelete from './ConfirmDelete'

export default function EgresosSection({ desde, hasta, label }) {
  const { egresos, loading, error, refetch, crearEgreso, actualizarEgreso, eliminarEgreso } = useEgresos(desde, hasta)
  const { proveedores } = useProveedores()
  const { empleados } = useEmpleados()
  const [modal, setModal]       = useState(null)   // null | 'nuevo' | egreso
  const [toDelete, setToDelete] = useState(null)
  const [filtroCat, setFiltroCat] = useState('todas')
  const [filtroEstado, setFiltroEstado] = useState('todos')

  const filtrados = useMemo(() => egresos.filter(e =>
    (filtroCat === 'todas' || e.categoria === filtroCat) &&
    (filtroEstado === 'todos' || e.estado === filtroEstado)
  ), [egresos, filtroCat, filtroEstado])

  const total = filtrados.filter(e => e.estado === 'pagado').reduce((s, e) => s + Number(e.monto || 0), 0)

  const handleSave = async (form) => {
    if (modal === 'nuevo') await crearEgreso(form)
    else await actualizarEgreso(modal.id, form)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Total pagado · {label}</p>
          <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{fmtMoney(total)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refetch} disabled={loading}
            className="p-2 rounded-lg disabled:opacity-50 transition-all" style={{ border: '1px solid var(--border)' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button onClick={() => setModal('nuevo')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
            <Plus size={14} /> Nuevo egreso
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
          className="rounded-lg text-xs px-3 py-2 outline-none"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          <option value="todas">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          className="rounded-lg text-xs px-3 py-2 outline-none"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          <option value="todos">Pagados y pendientes</option>
          <option value="pagado">Solo pagados</option>
          <option value="pendiente">Solo pendientes</option>
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">{[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
            <ArrowDownCircle size={22} style={{ color: 'var(--accent-lift)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No hay egresos en el período</p>
          <button onClick={() => setModal('nuevo')}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
            + Cargar el primero
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(e => (
            <div key={e.id} className="flex items-center justify-between rounded-xl px-4 py-3 gap-3"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-2 h-9 rounded-full flex-shrink-0" style={{ background: catColor(e.categoria) }} />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{e.descripcion}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{catLabel(e.categoria)}</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>· {fmtFecha(e.fecha)}</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>· {medioLabel(e.medio_pago)}</span>
                    {e.proveedor?.razon_social && <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>· {e.proveedor.razon_social}</span>}
                    {e.empleado?.nombre && <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>· {e.empleado.nombre} {e.empleado.apellido || ''}</span>}
                    {e.estado === 'pendiente' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}>Pendiente</span>
                    )}
                  </div>
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
          <p className="text-[11px] text-center pt-1" style={{ color: 'var(--text-xmuted)' }}>{filtrados.length} egreso{filtrados.length !== 1 ? 's' : ''}</p>
        </div>
      )}

      {modal && (
        <EgresoModal
          initial={modal !== 'nuevo' ? modal : null}
          proveedores={proveedores} empleados={empleados}
          onClose={() => setModal(null)} onSave={handleSave}
        />
      )}
      {toDelete && (
        <ConfirmDelete titulo="Eliminar egreso"
          mensaje={`¿Eliminás "${toDelete.descripcion}" por ${fmtMoney(toDelete.monto)}? Esta acción no se puede deshacer.`}
          onClose={() => setToDelete(null)} onConfirm={() => eliminarEgreso(toDelete.id)} />
      )}
    </div>
  )
}
