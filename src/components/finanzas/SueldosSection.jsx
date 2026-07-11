import { useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, Users, AlertTriangle, BadgeDollarSign } from 'lucide-react'
import { useEmpleados } from '../../hooks/useEmpleados'
import { useEgresos } from '../../hooks/useEgresos'
import { fmtMoney, fmtFecha } from '../../lib/finanzas'
import EmpleadoModal from './EmpleadoModal'
import EgresoModal from './EgresoModal'
import ConfirmDelete from './ConfirmDelete'

export default function SueldosSection({ desde, hasta, label }) {
  const { empleados, loading, error, crearEmpleado, actualizarEmpleado, eliminarEmpleado } = useEmpleados()
  const { egresos, crearEgreso, actualizarEgreso, eliminarEgreso } = useEgresos(desde, hasta)

  const [empModal, setEmpModal]       = useState(null)  // null | 'nuevo' | empleado
  const [pagoModal, setPagoModal]     = useState(null)  // null | { empleado, egreso }
  const [delEmp, setDelEmp]           = useState(null)
  const [delPago, setDelPago]         = useState(null)

  const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const descPago = (emp) => {
    if (emp.frecuencia_pago === 'semanal')
      return `pago semanal${emp.dia_pago_semana != null ? ` (${DIAS_SEMANA[emp.dia_pago_semana]})` : ''}`
    if (emp.frecuencia_pago === 'quincenal')
      return `quincenal${emp.dia_pago ? ` (día ${emp.dia_pago})` : ''}`
    return emp.dia_pago ? `pago día ${emp.dia_pago}` : null
  }

  const pagosSueldos = useMemo(() => egresos.filter(e => e.categoria === 'sueldos'), [egresos])
  const totalSueldos = pagosSueldos.filter(e => e.estado === 'pagado').reduce((s, e) => s + Number(e.monto || 0), 0)

  const handleSaveEmp = async (form) => {
    if (empModal === 'nuevo') await crearEmpleado(form)
    else await actualizarEmpleado(empModal.id, form)
  }
  const handleSavePago = async (form) => {
    if (pagoModal?.egreso) await actualizarEgreso(pagoModal.egreso.id, form)
    else await crearEgreso(form)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sueldos pagados · {label}</p>
          <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{fmtMoney(totalSueldos)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPagoModal({ empleado: null, egreso: null })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
            <BadgeDollarSign size={14} /> Registrar pago
          </button>
          <button onClick={() => setEmpModal('nuevo')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
            <Plus size={14} /> Nuevo empleado
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Legajo */}
      <div>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Personal</p>
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
                  <button onClick={() => setPagoModal({ empleado: emp, egreso: null })}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all mr-1"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
                    Pagar
                  </button>
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
      </div>

      {/* Pagos del período */}
      <div>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Pagos del período</p>
        {pagosSueldos.length === 0 ? (
          <p className="text-xs py-6 text-center rounded-xl" style={{ color: 'var(--text-xmuted)', background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
            Sin pagos de sueldos en {label}
          </p>
        ) : (
          <div className="space-y-2">
            {pagosSueldos.map(e => (
              <div key={e.id} className="flex items-center justify-between rounded-xl px-4 py-3 gap-3"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {e.empleado?.nombre ? `${e.empleado.nombre} ${e.empleado.apellido || ''}` : e.descripcion}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {e.subtipo && <span className="text-[11px] capitalize" style={{ color: 'var(--text-muted)' }}>{e.subtipo}</span>}
                    <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>· {fmtFecha(e.fecha)}</span>
                    {e.estado === 'pendiente' && <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}>Pendiente</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{fmtMoney(e.monto)}</span>
                  <button onClick={() => setPagoModal({ empleado: null, egreso: e })} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => setDelPago(e)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
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

      {/* Modales */}
      {empModal && (
        <EmpleadoModal initial={empModal !== 'nuevo' ? empModal : null} onClose={() => setEmpModal(null)} onSave={handleSaveEmp} />
      )}
      {pagoModal && (
        <EgresoModal
          title={pagoModal.egreso ? 'Editar pago de sueldo' : 'Registrar pago de sueldo'}
          initial={pagoModal.egreso || null}
          empleados={empleados}
          defaults={pagoModal.egreso ? undefined : {
            categoria: 'sueldos',
            subtipo: 'sueldo',
            empleado_id: pagoModal.empleado?.id || '',
            descripcion: pagoModal.empleado ? `Sueldo ${pagoModal.empleado.nombre} ${pagoModal.empleado.apellido || ''}`.trim() : '',
            monto: pagoModal.empleado?.sueldo_base ? String(pagoModal.empleado.sueldo_base) : '',
          }}
          onClose={() => setPagoModal(null)} onSave={handleSavePago}
        />
      )}
      {delEmp && (
        <ConfirmDelete titulo="Eliminar empleado"
          mensaje={`¿Eliminás a ${delEmp.nombre} ${delEmp.apellido || ''}? Los pagos ya registrados se conservan.`}
          onClose={() => setDelEmp(null)} onConfirm={() => eliminarEmpleado(delEmp.id)} />
      )}
      {delPago && (
        <ConfirmDelete titulo="Eliminar pago"
          mensaje={`¿Eliminás este pago por ${fmtMoney(delPago.monto)}?`}
          onClose={() => setDelPago(null)} onConfirm={() => eliminarEgreso(delPago.id)} />
      )}
    </div>
  )
}
