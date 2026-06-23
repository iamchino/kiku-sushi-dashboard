import { useMemo, useState } from 'react'
import {
  Users, Clock, Calendar, Phone, Mail, Hourglass, Check, X, Trash2, Loader2, FileText,
} from 'lucide-react'
import { LISTA_ESPERA_LABEL, LISTA_ESPERA_COLOR } from '../../hooks/useListaEspera'
import { TIPO_EXPERIENCIA_LABEL, TIPO_EXPERIENCIA_COLOR } from '../../hooks/useReservas'
import { normalizeSearch } from '../../utils/normalize'

const FILTRO_OPCIONES = [
  { id: 'activos',    label: 'Activos (en espera + contactados)' },
  { id: 'esperando',  label: 'En espera' },
  { id: 'contactado', label: 'Contactados' },
  { id: 'convertida', label: 'Convertidas' },
  { id: 'cancelada',  label: 'Descartadas' },
  { id: 'todos',      label: 'Todos' },
]

/**
 * Panel de gestión de la lista de espera. Se muestra dentro de la página de
 * Reservas (pestaña "Lista de espera"). Lista los anotados y permite marcarlos
 * como contactados, convertidos (cuando se les dio lugar) o descartarlos.
 */
export default function ListaEsperaPanel({ controller }) {
  const { items, stats, loading, error, actualizarEstado, eliminar } = controller
  const [filtro, setFiltro] = useState('activos')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)

  const filtered = useMemo(() => {
    const q = normalizeSearch(search.trim())
    let list = items.slice()
    if (filtro === 'activos') list = list.filter(i => ['esperando', 'contactado'].includes(i.estado))
    else if (filtro !== 'todos') list = list.filter(i => i.estado === filtro)
    if (q) {
      list = list.filter(i => {
        const n = normalizeSearch(i.cliente_nombre || '')
        const t = normalizeSearch(i.cliente_telefono || '')
        return n.includes(q) || t.includes(q)
      })
    }
    return list
  }, [items, filtro, search])

  const handleAccion = async (id, fn) => {
    setBusyId(id)
    await fn()
    setBusyId(null)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Filtros */}
      <div className="px-4 md:px-6 py-3 flex-shrink-0 flex flex-wrap items-center gap-3"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o teléfono…"
          className="flex-1 min-w-[200px] max-w-md px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
        <select
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs outline-none cursor-pointer"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          {FILTRO_OPCIONES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      {/* Stats chips */}
      <div className="flex-shrink-0 px-4 md:px-6 py-2 flex items-center gap-2 overflow-x-auto"
        style={{ borderBottom: '1px solid var(--border)' }}>
        {['esperando', 'contactado', 'convertida', 'cancelada'].map(estado => {
          const meta = LISTA_ESPERA_COLOR[estado]
          return (
            <span key={estado}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap"
              style={{ background: meta.bg, color: meta.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
              {LISTA_ESPERA_LABEL[estado]}: {stats[estado]}
            </span>
          )
        })}
      </div>

      {error && (
        <div className="mx-4 md:mx-6 mt-3 px-4 py-3 rounded-xl text-sm flex-shrink-0"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="px-4 md:px-6 py-4 space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="skeleton h-16 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-input)' }}>
              <Hourglass size={24} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                Sin anotados en la lista de espera
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Cuando un cliente se anote desde la web (porque no había cupo) aparecerá acá.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {filtered.map(item => (
              <EsperaRow
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onEstado={(estado) => handleAccion(item.id, () => actualizarEstado(item.id, estado))}
                onEliminar={() => {
                  if (confirm('¿Eliminar definitivamente este registro de la lista de espera?')) {
                    handleAccion(item.id, () => eliminar(item.id))
                  }
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function EsperaRow({ item, busy, onEstado, onEliminar }) {
  const estadoMeta = LISTA_ESPERA_COLOR[item.estado]
  const tipoLabel  = TIPO_EXPERIENCIA_LABEL[item.tipo_experiencia]
  const tipoColor  = TIPO_EXPERIENCIA_COLOR[item.tipo_experiencia]
  const hora = item.hora ? String(item.hora).slice(0, 5) : null
  const activo = ['esperando', 'contactado'].includes(item.estado)

  return (
    <li className="px-4 md:px-6 py-3">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center justify-center min-w-[56px] py-2 px-2 rounded-lg flex-shrink-0"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <span className="text-[10px] uppercase font-bold tracking-wide" style={{ color: 'var(--text-muted)' }}>
            {new Date(item.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
          </span>
          <span className="text-base font-bold leading-none mt-0.5" style={{ color: 'var(--accent-lift)' }}>
            {hora || '—'}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {item.cliente_nombre}
            </p>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: estadoMeta.bg, color: estadoMeta.color }}>
              {LISTA_ESPERA_LABEL[item.estado]}
            </span>
            {tipoLabel && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                style={{ background: `${tipoColor}15`, color: tipoColor, border: `1px solid ${tipoColor}33` }}>
                <span className="w-1 h-1 rounded-full" style={{ background: tipoColor }} />
                {tipoLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] flex-wrap" style={{ color: 'var(--text-muted)' }}>
            <span className="flex items-center gap-1"><Users size={11} /> {item.personas}p</span>
            {item.cliente_telefono && (
              <a href={`tel:${item.cliente_telefono}`} className="flex items-center gap-1 hover:underline"
                style={{ color: 'var(--accent-lift)' }}>
                <Phone size={11} /> {item.cliente_telefono}
              </a>
            )}
            {item.cliente_email && (
              <a href={`mailto:${item.cliente_email}`} className="flex items-center gap-1 hover:underline truncate"
                style={{ color: 'var(--accent-lift)' }}>
                <Mail size={11} /> {item.cliente_email}
              </a>
            )}
          </div>
          {item.notas && (
            <p className="text-[11px] mt-1 flex items-start gap-1" style={{ color: 'var(--text-muted)' }}>
              <FileText size={11} className="mt-0.5 flex-shrink-0" /> {item.notas}
            </p>
          )}

          {/* Acciones */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {busy ? (
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            ) : (
              <>
                {item.estado === 'esperando' && (
                  <button type="button" onClick={() => onEstado('contactado')}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                    style={{ background: 'var(--bg-input)', color: '#4f8ef7', border: '1px solid var(--border)' }}>
                    <Phone size={11} /> Marcar contactado
                  </button>
                )}
                {activo && (
                  <button type="button" onClick={() => onEstado('convertida')}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                    style={{ background: 'rgba(52,211,153,0.10)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}>
                    <Check size={11} /> Le dimos lugar
                  </button>
                )}
                {activo && (
                  <button type="button" onClick={() => onEstado('cancelada')}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                    style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    <X size={11} /> Descartar
                  </button>
                )}
                <button type="button" onClick={onEliminar}
                  className="text-[11px] font-medium px-2 py-1 rounded-lg flex items-center gap-1.5"
                  style={{ background: 'transparent', color: 'var(--text-xmuted)' }}>
                  <Trash2 size={11} /> Eliminar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}
