import { useState } from 'react'
import { Plus, Edit2, Trash2, Users, AlertTriangle } from 'lucide-react'
import { useEmpleados } from '../../hooks/useEmpleados'
import { fmtMoney } from '../../lib/finanzas'
import EmpleadoModal from '../finanzas/EmpleadoModal'
import ConfirmDelete from '../finanzas/ConfirmDelete'

// Legajo del equipo (antes vivía en Finanzas → Sueldos). Acá queda SOLO la
// ficha de cada empleado: alta, edición y baja. Los pagos de sueldos van por
// el alta centralizada (Caja → Pagos o Liquidación) y el historial se ve en
// Finanzas → Resumen.
export default function EmpleadosSection() {
  const { empleados, loading, error, crearEmpleado, actualizarEmpleado, eliminarEmpleado } = useEmpleados()
  const [empModal, setEmpModal] = useState(null)  // null | 'nuevo' | empleado
  const [delEmp, setDelEmp]     = useState(null)

  const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const descPago = (emp) => {
    if (emp.frecuencia_pago === 'diario')
      return 'pago por día'
    if (emp.frecuencia_pago === 'semanal')
      return `pago semanal${emp.dia_pago_semana != null ? ` (${DIAS_SEMANA[emp.dia_pago_semana]})` : ''}`
    if (emp.frecuencia_pago === 'quincenal')
      return `quincenal${emp.dia_pago ? ` (día ${emp.dia_pago})` : ''}`
    return emp.dia_pago ? `pago día ${emp.dia_pago}` : null
  }

  const handleSaveEmp = async (form) => {
    if (empModal === 'nuevo') await crearEmpleado(form)
    else await actualizarEmpleado(empModal.id, form)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Ficha de cada empleado. Los sueldos se pagan desde Liquidación o Caja → Pagos.
        </p>
        <button onClick={() => setEmpModal('nuevo')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          <Plus size={14} /> Nuevo empleado
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">{[1, 2].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : empleados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
            <Users size={22} style={{ color: 'var(--accent-lift)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No hay empleados cargados</p>
          <button onClick={() => setEmpModal('nuevo')}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
            + Agregar el primero
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {empleados.map(emp => (
            <div key={emp.id} className="flex items-center justify-between rounded-xl px-4 py-3 gap-3"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', opacity: emp.activo ? 1 : 0.6 }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)' }}>
                  {emp.nombre?.[0]?.toUpperCase()}{emp.apellido?.[0]?.toUpperCase() || ''}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {emp.nombre} {emp.apellido || ''}
                    {!emp.activo && <span className="ml-2 text-[10px]" style={{ color: 'var(--text-xmuted)' }}>(baja)</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {emp.puesto && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{emp.puesto}</span>}
                    {emp.sueldo_base > 0 && <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>· {emp.tipo_sueldo === 'hora' ? `${fmtMoney(emp.sueldo_base)}/h` : `base ${fmtMoney(emp.sueldo_base)}`}</span>}
                    {descPago(emp) && <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>· {descPago(emp)}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setEmpModal(emp)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Edit2 size={13} />
                </button>
                <button onClick={() => setDelEmp(emp)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; e.currentTarget.style.color = '#f87171' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {empModal && (
        <EmpleadoModal initial={empModal !== 'nuevo' ? empModal : null} onClose={() => setEmpModal(null)} onSave={handleSaveEmp} />
      )}
      {delEmp && (
        <ConfirmDelete titulo="Eliminar empleado"
          mensaje={`¿Eliminás a ${delEmp.nombre} ${delEmp.apellido || ''}? Los pagos ya registrados se conservan.`}
          onClose={() => setDelEmp(null)} onConfirm={() => eliminarEmpleado(delEmp.id)} />
      )}
    </div>
  )
}
