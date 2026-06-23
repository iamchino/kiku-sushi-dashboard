import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, RefreshCw, Search, Calendar, ChevronRight, Users, Clock, Hourglass } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  useReservas, RESERVA_ESTADO_LABEL, RESERVA_ESTADO_COLOR,
  TIPO_EXPERIENCIA_OPCIONES, TIPO_EXPERIENCIA_LABEL, TIPO_EXPERIENCIA_COLOR,
} from '../hooks/useReservas'
import { useListaEspera } from '../hooks/useListaEspera'
import { normalizeSearch } from '../utils/normalize'
import NuevaReservaModal from '../components/reservas/NuevaReservaModal'
import ReservaDetalleModal from '../components/reservas/ReservaDetalleModal'
import ListaEsperaPanel from '../components/reservas/ListaEsperaPanel'

const ORIGEN_META = {
  web:       { label: 'Web',       color: '#4f8ef7' },
  dashboard: { label: 'Dashboard', color: 'var(--accent-lift)' },
  telefono:  { label: 'Teléfono',  color: '#fbbf24' },
  whatsapp:  { label: 'WhatsApp',  color: '#34d399' },
}

const ESTADO_FILTRO_OPCIONES = [
  { id: 'todos',      label: 'Todos los estados' },
  { id: 'pendiente',  label: 'Pendientes' },
  { id: 'confirmada', label: 'Confirmadas' },
  { id: 'sentada',    label: 'Sentadas' },
  { id: 'no_show',    label: 'No-show' },
  { id: 'cancelada',  label: 'Canceladas' },
]

const RANGO_OPCIONES = [
  { id: 'hoy',      label: 'Hoy' },
  { id: 'semana',   label: 'Próx. 7 días' },
  { id: 'mes',      label: 'Próx. 30 días' },
  { id: 'custom',   label: 'Custom' },
]

const TIPO_FILTRO_OPCIONES = [
  { id: 'todos', label: 'Todos los tipos' },
  ...TIPO_EXPERIENCIA_OPCIONES.map(o => ({ id: o.id, label: o.label })),
  { id: 'sin_tipo', label: 'Sin tipo (legacy)' },
]

const SORT_OPCIONES = [
  { id: 'fecha_asc',  label: 'Fecha · más cercana primero' },
  { id: 'fecha_desc', label: 'Fecha · más lejana primero' },
  { id: 'creada_desc', label: 'Más recientes (por creación)' },
  { id: 'creada_asc',  label: 'Más antiguas (por creación)' },
]

function rangoToDates(rango, customFrom, customTo) {
  const today = new Date()
  const toIso = (d) => d.toISOString().slice(0, 10)
  if (rango === 'hoy')    return { from: toIso(today), to: toIso(today) }
  if (rango === 'semana') return { from: toIso(today), to: toIso(new Date(today.getTime() + 6 * 86400000)) }
  if (rango === 'mes')    return { from: toIso(today), to: toIso(new Date(today.getTime() + 30 * 86400000)) }
  return { from: customFrom || toIso(today), to: customTo || toIso(today) }
}

export default function ReservasPage() {
  const [rango, setRango]           = useState('semana')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [search, setSearch]         = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('todos')
  const [tipoFiltro, setTipoFiltro]     = useState('todos')
  const [sortBy, setSortBy]             = useState('fecha_asc')

  const [nuevaOpen, setNuevaOpen] = useState(false)
  const [selected,  setSelected]  = useState(null)
  const [mesasLibres, setMesasLibres] = useState([])
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('focus')

  // Vista: reservas | espera (la notificación de lista de espera entra con ?espera=1)
  const [vista, setVista] = useState(searchParams.get('espera') ? 'espera' : 'reservas')
  const listaEspera = useListaEspera()

  const { from, to } = useMemo(
    () => rangoToDates(rango, customFrom, customTo),
    [rango, customFrom, customTo]
  )

  const {
    reservas, stats, loading, error,
    crearReserva, actualizarEstado, sentarReserva, reactivarReserva, eliminarReserva, refetch,
  } = useReservas({ mode: 'range', dateFrom: from, dateTo: to })

  // Si venimos de una notificación con ?focus=<id>, abrimos automáticamente
  // el detalle de esa reserva cuando termina de cargar.
  useEffect(() => {
    if (!focusId || loading) return
    const target = reservas.find(r => r.id === focusId)
    if (target) {
      setSelected(target)
      searchParams.delete('focus')
      setSearchParams(searchParams, { replace: true })
    }
  }, [focusId, loading, reservas, searchParams, setSearchParams])

  // Cargar mesas libres cuando se abre el modal de detalle (para acción Sentar)
  useEffect(() => {
    if (!selected) return
    supabase
      .from('v_mesas_estado')
      .select('id, numero, capacidad, salon_id, estado_mesa, activa')
      .eq('activa', true)
      .eq('estado_mesa', 'libre')
      .order('numero', { ascending: true })
      .then(({ data }) => setMesasLibres(data || []))
  }, [selected])

  const filtered = useMemo(() => {
    const q = normalizeSearch(search.trim())
    let list = reservas.slice()
    if (estadoFiltro !== 'todos') list = list.filter(r => r.estado === estadoFiltro)
    if (tipoFiltro !== 'todos') {
      if (tipoFiltro === 'sin_tipo') {
        list = list.filter(r => !r.tipo_experiencia)
      } else {
        list = list.filter(r => r.tipo_experiencia === tipoFiltro)
      }
    }
    if (q) {
      list = list.filter(r => {
        const nombre = normalizeSearch(r.cliente_nombre || '')
        const tel    = normalizeSearch(r.cliente_telefono || '')
        const email  = normalizeSearch(r.cliente_email || '')
        return nombre.includes(q) || tel.includes(q) || email.includes(q)
      })
    }
    // Sort según opción seleccionada
    const cmpFecha = (a, b) => {
      const aKey = `${a.fecha} ${a.hora}`
      const bKey = `${b.fecha} ${b.hora}`
      return aKey.localeCompare(bKey)
    }
    const cmpCreada = (a, b) => new Date(a.created_at) - new Date(b.created_at)

    if (sortBy === 'fecha_asc')   list.sort(cmpFecha)
    if (sortBy === 'fecha_desc')  list.sort((a, b) => -cmpFecha(a, b))
    if (sortBy === 'creada_asc')  list.sort(cmpCreada)
    if (sortBy === 'creada_desc') list.sort((a, b) => -cmpCreada(a, b))

    return list
  }, [reservas, search, estadoFiltro, tipoFiltro, sortBy])

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-4 md:px-6 py-4 flex-shrink-0 gap-3 flex-wrap"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h1 className="text-lg md:text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Reservas
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {vista === 'reservas'
              ? `Reservas del salón · ${stats.total} en el rango`
              : `Lista de espera · ${listaEspera.stats.total} anotados`}
          </p>

          {/* Switch de vista */}
          <div className="inline-flex items-center gap-1 mt-2 p-0.5 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setVista('reservas')}
              className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
              style={vista === 'reservas'
                ? { background: 'var(--bg-card)', color: 'var(--accent-lift)' }
                : { background: 'transparent', color: 'var(--text-muted)' }}
            >
              Reservas
            </button>
            <button
              type="button"
              onClick={() => setVista('espera')}
              className="px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
              style={vista === 'espera'
                ? { background: 'var(--bg-card)', color: 'var(--accent-lift)' }
                : { background: 'transparent', color: 'var(--text-muted)' }}
            >
              <Hourglass size={12} />
              Lista de espera
              {listaEspera.pendientes > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                  {listaEspera.pendientes}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={vista === 'reservas' ? refetch : listaEspera.refetch}
            disabled={loading}
            className="p-2 rounded-lg transition-all disabled:opacity-50"
            style={{ border: '1px solid var(--border)' }}
            title="Actualizar"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
          </button>

          {vista === 'reservas' && (
            <button
              onClick={() => setNuevaOpen(true)}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
                boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.25)',
              }}
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Nueva reserva</span>
              <span className="sm:hidden">Nueva</span>
            </button>
          )}
        </div>
      </div>

      {vista === 'espera' && <ListaEsperaPanel controller={listaEspera} />}

      {vista === 'reservas' && (
      <>

      {/* Filtros */}
      <div
        className="px-4 md:px-6 py-3 flex-shrink-0 flex flex-wrap items-end gap-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono o email…"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        <select
          value={rango}
          onChange={e => setRango(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs outline-none cursor-pointer"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          {RANGO_OPCIONES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>

        {rango === 'custom' && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </>
        )}

        <select
          value={estadoFiltro}
          onChange={e => setEstadoFiltro(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs outline-none cursor-pointer"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          {ESTADO_FILTRO_OPCIONES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>

        <select
          value={tipoFiltro}
          onChange={e => setTipoFiltro(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs outline-none cursor-pointer"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          title="Filtrar por experiencia"
        >
          {TIPO_FILTRO_OPCIONES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs outline-none cursor-pointer"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          title="Ordenar por"
        >
          {SORT_OPCIONES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      {/* Stats chips */}
      <div className="flex-shrink-0 px-4 md:px-6 py-2 flex items-center gap-2 overflow-x-auto"
        style={{ borderBottom: '1px solid var(--border)' }}>
        {Object.entries(stats).filter(([k]) => k !== 'total').map(([estado, count]) => {
          const meta = RESERVA_ESTADO_COLOR[estado]
          if (!meta) return null
          return (
            <span
              key={estado}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap"
              style={{ background: meta.bg, color: meta.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
              {RESERVA_ESTADO_LABEL[estado]}: {count}
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
            {[1,2,3,4].map(i => <div key={i} className="skeleton h-14 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-input)' }}>
              <Calendar size={24} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                Sin reservas en el rango seleccionado
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Cuando entren reservas desde la web aparecerán acá automáticamente.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {filtered.map(r => (
              <ReservaRow key={r.id} reserva={r} onSelect={() => setSelected(r)} />
            ))}
          </ul>
        )}
      </div>

      </>
      )}

      <NuevaReservaModal
        open={nuevaOpen}
        onClose={() => setNuevaOpen(false)}
        onCreate={crearReserva}
      />

      <ReservaDetalleModal
        reserva={selected}
        mesasLibres={mesasLibres}
        onClose={() => { setSelected(null); setMesasLibres([]) }}
        onActualizarEstado={actualizarEstado}
        onSentar={sentarReserva}
        onReactivar={reactivarReserva}
        onEliminar={eliminarReserva}
      />
    </div>
  )
}

function ReservaRow({ reserva, onSelect }) {
  const estadoMeta = RESERVA_ESTADO_COLOR[reserva.estado]
  const origenMeta = ORIGEN_META[reserva.origen] || ORIGEN_META.dashboard
  const tipoLabel  = TIPO_EXPERIENCIA_LABEL[reserva.tipo_experiencia]
  const tipoColor  = TIPO_EXPERIENCIA_COLOR[reserva.tipo_experiencia]
  const hora = String(reserva.hora).slice(0, 5)

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left px-4 md:px-6 py-3 transition-colors hover:bg-[var(--bg-hover)] flex items-center gap-3"
      >
        <div className="flex flex-col items-center justify-center min-w-[56px] py-2 px-2 rounded-lg flex-shrink-0"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <span className="text-[10px] uppercase font-bold tracking-wide" style={{ color: 'var(--text-muted)' }}>
            {new Date(reserva.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
          </span>
          <span className="text-base font-bold leading-none mt-0.5" style={{ color: 'var(--accent-lift)' }}>
            {hora}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {reserva.cliente_nombre}
            </p>
            {estadoMeta && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={{ background: estadoMeta.bg, color: estadoMeta.color }}>
                {RESERVA_ESTADO_LABEL[reserva.estado]}
              </span>
            )}
            {tipoLabel && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                style={{ background: `${tipoColor}15`, color: tipoColor, border: `1px solid ${tipoColor}33` }}>
                <span className="w-1 h-1 rounded-full" style={{ background: tipoColor }} />
                {tipoLabel}
              </span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--bg-input)', color: origenMeta.color, border: '1px solid var(--border)' }}>
              {origenMeta.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span className="flex items-center gap-1"><Users size={11} /> {reserva.personas}p</span>
            <span className="flex items-center gap-1"><Clock size={11} /> {reserva.duracion_min}m</span>
            {reserva.cliente_telefono && (
              <span className="truncate">📞 {reserva.cliente_telefono}</span>
            )}
          </div>
        </div>

        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
      </button>
    </li>
  )
}
