import { useMemo, useState } from 'react'
import { Wallet, Plus, AlertTriangle, Link2, Clock, CheckCircle2 } from 'lucide-react'
import { usePagos } from '../../hooks/usePagos'
import RegistrarPagoModal from '../pagos/RegistrarPagoModal'
import { CATEGORIAS, fmtMoney, fmtFecha, catLabel, catColor, medioLabel, localDateISO } from '../../lib/finanzas'

// Pagos centralizados: TODOS los egresos del negocio se registran acá, con la
// caja abierta o cerrada. Un pago es un egreso — Finanzas lo ve al instante.
// El formulario vive en RegistrarPagoModal, compartido con el arqueo y Finanzas.

const RANGOS = [
  { id: 'hoy',    label: 'Hoy' },
  { id: 'semana', label: 'Últ. 7 días' },
  { id: 'mes',    label: 'Últ. 30 días' },
  { id: 'todo',   label: 'Todo' },
  { id: 'custom', label: 'Custom' },
]

function diasAtras(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDateISO(d)
}

function calcularRango(rango, desdeCustom, hastaCustom) {
  if (rango === 'hoy')    return { desde: localDateISO(), hasta: localDateISO() }
  if (rango === 'semana') return { desde: diasAtras(6), hasta: localDateISO() }
  if (rango === 'mes')    return { desde: diasAtras(29), hasta: localDateISO() }
  if (rango === 'custom') return { desde: desdeCustom || null, hasta: hastaCustom || null }
  return { desde: null, hasta: null }
}

export default function PagosPanel() {
  const [rango, setRango] = useState('mes')
  const [desdeCustom, setDesdeCustom] = useState('')
  const [hastaCustom, setHastaCustom] = useState('')
  const [categoria, setCategoria] = useState('todas')
  const [estado, setEstado] = useState('todos')

  const { desde, hasta } = useMemo(
    () => calcularRango(rango, desdeCustom, hastaCustom),
    [rango, desdeCustom, hastaCustom],
  )

  const { pagos, turnoAbierto, loading, error, recargar } = usePagos({ desde, hasta, categoria, estado })
  const [modal, setModal] = useState(false)
  const [aviso, setAviso] = useState(null)

  const total = useMemo(
    () => pagos.filter(p => p.estado === 'pagado').reduce((acc, p) => acc + Number(p.monto || 0), 0),
    [pagos],
  )

  const chipStyle = (activo) => activo
    ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
    : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }

  const selectStyle = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }

  return (
    <section className="rounded-2xl p-5 space-y-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <Wallet size={16} style={{ color: 'var(--accent-lift)' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Pagos</h2>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Todos los egresos del negocio se registran acá — sueldos, proveedores, servicios.
              {turnoAbierto
                ? ' Hay turno abierto: los pagos en efectivo pueden salir de la caja del día.'
                : ' La caja está cerrada: los pagos se registran igual, sin turno.'}
            </p>
          </div>
        </div>
        <button onClick={() => { setAviso(null); setModal(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          <Plus size={14} /> Registrar pago
        </button>
      </div>

      {/* Filtros: fecha + categoría + estado */}
      <div className="flex flex-wrap items-end gap-2">
        {RANGOS.map(r => (
          <button key={r.id} onClick={() => setRango(r.id)}
            className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
            style={chipStyle(rango === r.id)}>
            {r.label}
          </button>
        ))}
        {rango === 'custom' && (
          <>
            <input type="date" value={desdeCustom} onChange={e => setDesdeCustom(e.target.value)}
              className="rounded-lg px-3 py-2 text-xs outline-none" style={selectStyle} />
            <input type="date" value={hastaCustom} onChange={e => setHastaCustom(e.target.value)}
              className="rounded-lg px-3 py-2 text-xs outline-none" style={selectStyle} />
          </>
        )}
        <select value={categoria} onChange={e => setCategoria(e.target.value)}
          className="rounded-lg px-3 py-2 text-xs outline-none" style={selectStyle}>
          <option value="todas">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={estado} onChange={e => setEstado(e.target.value)}
          className="rounded-lg px-3 py-2 text-xs outline-none" style={selectStyle}>
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
      {aviso && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent-lift)' }}>
          <CheckCircle2 size={14} /> {aviso}
        </div>
      )}

      {/* Pagos del filtro, con todo el detalle a la vista */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
      ) : pagos.length === 0 ? (
        <p className="text-xs py-2" style={{ color: 'var(--text-xmuted)' }}>
          No hay pagos con estos filtros.
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {pagos.length} pago{pagos.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Total pagado: <strong style={{ color: 'var(--text-primary)' }}>{fmtMoney(total)}</strong>
            </span>
          </div>
          <div className="space-y-1.5">
            {pagos.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 flex-wrap"
                style={{ background: 'var(--bg-app)', border: '1px solid var(--border-card)' }}>
                <div className="min-w-0">
                  <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {p.descripcion}
                    {p.proveedor?.razon_social && <span style={{ color: 'var(--text-muted)' }}> · {p.proveedor.razon_social}</span>}
                    {p.empleado && <span style={{ color: 'var(--text-muted)' }}> · {p.empleado.nombre} {p.empleado.apellido || ''}</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px]">
                    <span className="font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: `${catColor(p.categoria)}22`, color: catColor(p.categoria) }}>
                      {catLabel(p.categoria)}
                    </span>
                    <span style={{ color: 'var(--text-xmuted)' }}>{fmtFecha(p.fecha)} · {medioLabel(p.medio_pago)}</span>
                    {p.estado === 'pendiente' && (
                      <span className="flex items-center gap-1" style={{ color: '#f59e0b' }}>
                        <Clock size={10} /> pendiente{p.vencimiento ? ` · vence ${fmtFecha(p.vencimiento)}` : ''}
                      </span>
                    )}
                    {p.caja_turno_id && (
                      <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        <Link2 size={10} /> caja del día
                      </span>
                    )}
                    {p.pagado_desde === 'caja_fuerte' && (
                      <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        <Link2 size={10} /> caja fuerte
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                  {fmtMoney(p.monto)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {modal && (
        <RegistrarPagoModal
          onClose={() => setModal(false)}
          onRegistrado={(mensaje) => { setAviso(mensaje); recargar() }}
        />
      )}
    </section>
  )
}
