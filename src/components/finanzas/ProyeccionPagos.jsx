import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Edit2 } from 'lucide-react'
import { useEgresos } from '../../hooks/useEgresos'
import { useProveedores } from '../../hooks/useProveedores'
import { useEmpleados } from '../../hooks/useEmpleados'
import { fmtMoney, fmtFecha, catLabel, catColor, localDateISO } from '../../lib/finanzas'
import EgresoModal from './EgresoModal'

// Proyección de pagos: todo lo que está PENDIENTE de pagar, ordenado por
// urgencia — vencido, esta semana, más adelante y sin fecha. Es la vista de
// "cuánta plata tengo comprometida y cuándo la voy a necesitar".
// Un pago se marca como pagado editándolo (lápiz) y cambiando su estado.

function sumar(items) {
  return items.reduce((s, e) => s + Number(e.monto || 0), 0)
}

function GrupoPendientes({ titulo, color, items, onEditar, vacio }) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: 'var(--bg-card)', border: `1px solid ${color}45`, boxShadow: 'var(--shadow-card)' }}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold" style={{ color }}>{titulo}</p>
        <span className="text-sm font-bold" style={{ color: items.length ? 'var(--text-primary)' : 'var(--text-xmuted)' }}>
          {fmtMoney(sumar(items))}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="py-2 text-xs" style={{ color: 'var(--text-xmuted)' }}>{vacio}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
              style={{ background: 'var(--bg-input)' }}>
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="h-8 w-1.5 flex-shrink-0 rounded-full" style={{ background: catColor(e.categoria) }} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    {e.descripcion}
                    {e.proveedor?.razon_social && <span style={{ color: 'var(--text-muted)' }}> · {e.proveedor.razon_social}</span>}
                    {e.empleado?.nombre && <span style={{ color: 'var(--text-muted)' }}> · {e.empleado.nombre} {e.empleado.apellido || ''}</span>}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
                    {catLabel(e.categoria)}
                    {e.vencimiento ? ` · vence ${fmtFecha(e.vencimiento)}` : ' · sin fecha de vencimiento'}
                  </p>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(e.monto)}</span>
                <button onClick={() => onEditar(e)} title="Editar / marcar pagado"
                  className="p-1 rounded-md transition-colors" style={{ color: 'var(--text-xmuted)' }}
                  onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                  <Edit2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ProyeccionPagos() {
  // Sin rango: las cuentas por pagar importan todas, sea cual sea su fecha.
  const { pendientes, loading, error, actualizarEgreso } = useEgresos(null, null)
  const { proveedores } = useProveedores()
  const { empleados } = useEmpleados()
  const [editando, setEditando] = useState(null)

  const grupos = useMemo(() => {
    const hoy = localDateISO()
    const enUnaSemana = (() => {
      const d = new Date()
      d.setDate(d.getDate() + 7)
      return localDateISO(d)
    })()
    const vencidos = [], semana = [], despues = [], sinFecha = []
    pendientes.forEach(e => {
      if (!e.vencimiento) sinFecha.push(e)
      else if (e.vencimiento < hoy) vencidos.push(e)
      else if (e.vencimiento <= enUnaSemana) semana.push(e)
      else despues.push(e)
    })
    return { vencidos, semana, despues, sinFecha }
  }, [pendientes])

  const total = sumar(pendientes)

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
        <AlertTriangle size={14} /> {error}
      </div>
    )
  }
  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>
  }

  return (
    <div className="space-y-4">
      {/* El número que importa: cuánto hay comprometido */}
      <div className="rounded-xl p-4 text-center"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
        <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>
          Total comprometido (cuentas por pagar)
        </p>
        <p className="mt-1 text-3xl font-bold tracking-tight" style={{ color: total > 0 ? '#f59e0b' : '#10b981' }}>
          {fmtMoney(total)}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {pendientes.length === 0
            ? 'Nada pendiente: todo al día'
            : `${pendientes.length} pago${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''} · para pagarlos, registralos desde Caja → Pagos o marcalos pagados con el lápiz`}
        </p>
      </div>

      {pendientes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'rgba(16,185,129,0.12)' }}>
            <CheckCircle2 size={22} style={{ color: '#10b981' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No hay pagos pendientes</p>
        </div>
      ) : (
        <>
          {grupos.vencidos.length > 0 && (
            <GrupoPendientes titulo="Vencidos — atender ya" color="#f87171" items={grupos.vencidos} onEditar={setEditando} />
          )}
          <GrupoPendientes titulo="Vencen esta semana" color="#f59e0b" items={grupos.semana} onEditar={setEditando}
            vacio="Nada vence en los próximos 7 días" />
          {grupos.despues.length > 0 && (
            <GrupoPendientes titulo="Más adelante" color="#4f8ef7" items={grupos.despues} onEditar={setEditando} />
          )}
          {grupos.sinFecha.length > 0 && (
            <GrupoPendientes titulo="Sin fecha de vencimiento" color="#94a3b8" items={grupos.sinFecha} onEditar={setEditando} />
          )}
        </>
      )}

      {editando && (
        <EgresoModal
          initial={editando}
          proveedores={proveedores}
          empleados={empleados}
          onClose={() => setEditando(null)}
          onSave={async (form) => { await actualizarEgreso(editando.id, form) }}
        />
      )}
    </div>
  )
}
