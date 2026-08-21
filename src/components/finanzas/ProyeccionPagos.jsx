import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, Edit2, Flame, Plus } from 'lucide-react'
import { useEgresos } from '../../hooks/useEgresos'
import { useProveedores } from '../../hooks/useProveedores'
import { useEmpleados } from '../../hooks/useEmpleados'
import { fmtMoney, fmtFecha, catLabel, catColor, localDateISO, DIAS_ANTES_DE_SER_DEUDA } from '../../lib/finanzas'
import EgresoModal from './EgresoModal'
import RegistrarPagoModal from '../pagos/RegistrarPagoModal'

// Proyección de pagos: lo pendiente de pagar, separado en dos naturalezas:
//
//   DEUDA       → ya venció, o vence dentro de los próximos 3 días.
//                 Es plata que hay que poner YA.
//   PROYECCIÓN  → vence a más de 3 días (o no tiene fecha).
//                 Es plata comprometida a futuro, no una deuda todavía.
//
// Un pendiente pasa de proyección a deuda solo, cuando el calendario lo
// alcanza. Se marca pagado editándolo con el lápiz.


function sumar(items) {
  return items.reduce((s, e) => s + Number(e.monto || 0), 0)
}

function sumarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + dias)
  return localDateISO(d)
}

// Diferencia en días entre hoy y un vencimiento 'YYYY-MM-DD' (negativo = vencido).
function diasHasta(vencimiento, hoy) {
  const a = new Date(`${hoy}T00:00:00`)
  const b = new Date(`${vencimiento}T00:00:00`)
  return Math.round((b - a) / 86400000)
}

function tiempoLabel(e, hoy) {
  if (!e.vencimiento) return 'sin fecha de vencimiento'
  const d = diasHasta(e.vencimiento, hoy)
  if (d < 0)  return `venció hace ${-d} día${d === -1 ? '' : 's'}`
  if (d === 0) return 'vence HOY'
  if (d === 1) return 'vence mañana'
  return `vence en ${d} días`
}

function FilaPendiente({ e, hoy, onEditar }) {
  const urgente = e.vencimiento && diasHasta(e.vencimiento, hoy) <= 0
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
      style={{ background: 'var(--bg-input)' }}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="h-9 w-1.5 flex-shrink-0 rounded-full" style={{ background: catColor(e.categoria) }} />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {e.descripcion}
            {e.proveedor?.razon_social && <span style={{ color: 'var(--text-muted)' }}> · {e.proveedor.razon_social}</span>}
            {e.empleado?.nombre && <span style={{ color: 'var(--text-muted)' }}> · {e.empleado.nombre} {e.empleado.apellido || ''}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
            <span className="font-semibold rounded-full px-1.5 py-0.5"
              style={{ background: `${catColor(e.categoria)}22`, color: catColor(e.categoria) }}>
              {catLabel(e.categoria)}
            </span>
            {e.vencimiento && <span>{fmtFecha(e.vencimiento)}</span>}
            <span style={{ color: urgente ? '#f87171' : 'var(--text-muted)', fontWeight: urgente ? 600 : 400 }}>
              · {tiempoLabel(e, hoy)}
            </span>
          </p>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(e.monto)}</span>
        <button onClick={() => onEditar(e)} title="Editar / marcar pagado"
          className="p-1 rounded-md transition-colors" style={{ color: 'var(--text-xmuted)' }}
          onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
          <Edit2 size={12} />
        </button>
      </div>
    </div>
  )
}

function Grupo({ titulo, color, items, hoy, onEditar }) {
  if (items.length === 0) return null
  return (
    <div className="rounded-xl p-4"
      style={{ background: 'var(--bg-card)', border: `1px solid ${color}45`, boxShadow: 'var(--shadow-card)' }}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold" style={{ color }}>{titulo}</p>
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(sumar(items))}</span>
      </div>
      <div className="space-y-1.5">
        {items.map(e => <FilaPendiente key={e.id} e={e} hoy={hoy} onEditar={onEditar} />)}
      </div>
    </div>
  )
}

export default function ProyeccionPagos() {
  // Sin rango: las cuentas por pagar importan todas, sea cual sea su fecha.
  const { pendientes, loading, error, actualizarEgreso, refetch } = useEgresos(null, null)
  const { proveedores } = useProveedores()
  const { empleados } = useEmpleados()
  const [editando, setEditando] = useState(null)
  const [nueva, setNueva] = useState(false)
  const [aviso, setAviso] = useState(null)

  const hoy = localDateISO()

  const grupos = useMemo(() => {
    const limiteDeuda = sumarDias(hoy, DIAS_ANTES_DE_SER_DEUDA)
    const vencidos = [], porVencer = [], proyectados = [], sinFecha = []
    pendientes.forEach(e => {
      if (!e.vencimiento) sinFecha.push(e)
      else if (e.vencimiento < hoy) vencidos.push(e)
      else if (e.vencimiento <= limiteDeuda) porVencer.push(e)
      else proyectados.push(e)
    })
    return { vencidos, porVencer, proyectados, sinFecha }
  }, [pendientes, hoy])

  const totalDeuda = sumar(grupos.vencidos) + sumar(grupos.porVencer)
  const totalProyeccion = sumar(grupos.proyectados) + sumar(grupos.sinFecha)
  const cantDeuda = grupos.vencidos.length + grupos.porVencer.length
  const cantProyeccion = grupos.proyectados.length + grupos.sinFecha.length

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
      <div className="flex items-end justify-between flex-wrap gap-3">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Lo que falta pagar: cuánto y cuándo. Los pagos ya hechos están en el Resumen.
        </p>
        <button onClick={() => { setAviso(null); setNueva(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          <Plus size={14} /> Nueva proyección de pago
        </button>
      </div>

      {aviso && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent-lift)' }}>
          <CheckCircle2 size={14} /> {aviso}
        </div>
      )}

      {/* Deuda vs proyección: dos números distintos, no una sola bolsa */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl p-4"
          style={{ background: 'var(--bg-card)', border: `1px solid ${totalDeuda > 0 ? 'rgba(248,113,113,0.4)' : 'var(--border-card)'}`, boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-2">
            <Flame size={15} style={{ color: '#f87171' }} />
            <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>Deuda</p>
          </div>
          <p className="mt-1 text-3xl font-bold tracking-tight" style={{ color: totalDeuda > 0 ? '#f87171' : '#10b981' }}>
            {fmtMoney(totalDeuda)}
          </p>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {totalDeuda > 0
              ? `${cantDeuda} pago${cantDeuda !== 1 ? 's' : ''} vencido${cantDeuda !== 1 ? 's' : ''} o por vencer en ${DIAS_ANTES_DE_SER_DEUDA} días`
              : 'Sin deudas: nada vencido ni por vencer'}
          </p>
        </div>
        <div className="rounded-xl p-4"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-2">
            <CalendarClock size={15} style={{ color: '#4f8ef7' }} />
            <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>Proyección</p>
          </div>
          <p className="mt-1 text-3xl font-bold tracking-tight" style={{ color: '#4f8ef7' }}>
            {fmtMoney(totalProyeccion)}
          </p>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {cantProyeccion > 0
              ? `${cantProyeccion} pago${cantProyeccion !== 1 ? 's' : ''} comprometido${cantProyeccion !== 1 ? 's' : ''} a futuro — todavía no es deuda`
              : 'Nada comprometido a futuro'}
          </p>
        </div>
      </div>

      {pendientes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'rgba(16,185,129,0.12)' }}>
            <CheckCircle2 size={22} style={{ color: '#10b981' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No hay pagos pendientes</p>
          <button onClick={() => { setAviso(null); setNueva(true) }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
            + Cargar la primera
          </button>
        </div>
      ) : (
        <>
          <Grupo titulo="Deuda · vencidos" color="#f87171"
            items={grupos.vencidos} hoy={hoy} onEditar={setEditando} />
          <Grupo titulo={`Deuda · vencen en los próximos ${DIAS_ANTES_DE_SER_DEUDA} días`} color="#f59e0b"
            items={grupos.porVencer} hoy={hoy} onEditar={setEditando} />
          <Grupo titulo="Proyección · más adelante" color="#4f8ef7"
            items={grupos.proyectados} hoy={hoy} onEditar={setEditando} />
          <Grupo titulo="Proyección · sin fecha de vencimiento" color="#94a3b8"
            items={grupos.sinFecha} hoy={hoy} onEditar={setEditando} />
          <p className="text-center text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
            Un pago pasa de proyección a deuda solo, {DIAS_ANTES_DE_SER_DEUDA} días antes de su vencimiento ·
            para pagarlo registralo en Caja → Pagos o marcalo pagado con el lápiz
          </p>
        </>
      )}

      {nueva && (
        <RegistrarPagoModal
          estadoInicial="pendiente"
          modoProyeccion
          titulo="Nueva proyección de pago"
          onClose={() => setNueva(false)}
          onRegistrado={(mensaje) => { setAviso(mensaje); refetch() }}
        />
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
