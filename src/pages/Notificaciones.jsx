import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell, Filter, CheckCheck, Trash2, RefreshCw,
  Calendar, Users, Phone, Mail, MapPin,
  ChevronDown, ChevronUp, ArrowRight, Inbox,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useHistorialNotificaciones } from '../hooks/useNotificaciones'

const TIPO_OPCIONES = [
  { id: 'todos',         label: 'Todos los tipos' },
  { id: 'reserva_nueva', label: 'Reservas' },
  { id: 'pedido_nuevo',  label: 'Pedidos' },
]

const LEIDA_OPCIONES = [
  { id: 'todos', label: 'Todas' },
  { id: 'no',    label: 'No leídas' },
  { id: 'si',    label: 'Leídas' },
]

// Colores por tipo
const TIPO_COLOR = {
  reserva_nueva: '#4f8ef7',
  pedido_nuevo:  'var(--accent-lift)',
}

export default function NotificacionesPage() {
  const { items, loading, filtros, setFiltros, refresh, marcarLeida, marcarTodas, eliminarOne } =
    useHistorialNotificaciones()
  const [expandido, setExpandido] = useState(null)

  const stats = useMemo(() => {
    const total      = items.length
    const noLeidas   = items.filter(n => !n.leida).length
    const reservas   = items.filter(n => n.tipo === 'reserva_nueva').length
    const pedidos    = items.filter(n => n.tipo === 'pedido_nuevo').length
    return { total, noLeidas, reservas, pedidos }
  }, [items])

  return (
    <div className="min-h-screen px-4 sm:px-6 py-6" style={{ background: 'var(--bg-app)' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Inbox size={18} style={{ color: 'var(--accent-lift)' }} />
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Notificaciones</h1>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Historial completo de eventos del sistema
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
              style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refrescar
            </button>
            {stats.noLeidas > 0 && (
              <button
                onClick={marcarTodas}
                className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 text-white"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
              >
                <CheckCheck size={12} /> Marcar todas leídas
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <StatCard label="Total" value={stats.total} color="var(--text-primary)" />
          <StatCard label="No leídas" value={stats.noLeidas} color="var(--accent-lift)" />
          <StatCard label="Reservas" value={stats.reservas} color={TIPO_COLOR.reserva_nueva} />
          <StatCard label="Pedidos"  value={stats.pedidos}  color="var(--accent-lift)" />
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap mb-4 p-3 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Filtros:</span>

          <select
            value={filtros.tipo}
            onChange={e => setFiltros({ ...filtros, tipo: e.target.value })}
            className="px-2 py-1 rounded-lg text-xs outline-none"
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            {TIPO_OPCIONES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>

          <select
            value={filtros.leida}
            onChange={e => setFiltros({ ...filtros, leida: e.target.value })}
            className="px-2 py-1 rounded-lg text-xs outline-none"
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            {LEIDA_OPCIONES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>

        {/* Lista */}
        <div className="space-y-2">
          {loading && items.length === 0 && (
            <p className="text-center text-xs py-10" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
          )}

          {!loading && items.length === 0 && (
            <div className="text-center py-16 rounded-xl"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <Bell size={32} className="mx-auto mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Sin notificaciones {filtros.tipo !== 'todos' || filtros.leida !== 'todos' ? 'que coincidan con los filtros' : ''}
              </p>
            </div>
          )}

          {items.map(n => (
            <NotifItem
              key={n.id}
              notif={n}
              expandido={expandido === n.id}
              onToggle={() => setExpandido(expandido === n.id ? null : n.id)}
              onMarcarLeida={() => marcarLeida(n.id)}
              onEliminar={() => {
                if (confirm('¿Eliminar esta notificación del historial?')) eliminarOne(n.id)
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Subcomponentes ────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div className="rounded-xl px-4 py-3"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-xl font-bold mt-0.5" style={{ color }}>{value}</p>
    </div>
  )
}

function NotifItem({ notif, expandido, onToggle, onMarcarLeida, onEliminar }) {
  const color = TIPO_COLOR[notif.tipo] || '#a1a1aa'
  const isReserva = notif.tipo === 'reserva_nueva'
  const meta = notif.metadata || {}
  const linkDestino = notif.referencia_tabla === 'reservas' ? '/reservas'
                    : notif.referencia_tabla === 'pedidos'  ? '/pedidos'
                    : null

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: notif.leida ? 'var(--bg-card)' : `${color}08`,
        border: `1px solid ${notif.leida ? 'var(--border)' : color + '30'}`,
      }}
    >
      <div
        className="flex items-start gap-3 p-3 cursor-pointer"
        onClick={onToggle}
      >
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2"
          style={{ background: notif.leida ? 'transparent' : color, border: notif.leida ? '1px solid var(--border)' : 'none' }} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{notif.titulo}</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide font-medium"
              style={{ background: `${color}20`, color }}>
              {isReserva ? 'Reserva' : 'Pedido'}
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{notif.mensaje}</p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {format(new Date(notif.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
            <span className="mx-1">·</span>
            {formatDistanceToNow(new Date(notif.created_at), { locale: es, addSuffix: true })}
          </p>
        </div>

        <button
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ color: 'var(--text-muted)' }}
        >
          {expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expandido && (
        <div className="px-3 pb-3 space-y-2.5" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {isReserva ? (
              <ReservaDetalle meta={meta} />
            ) : (
              <PedidoDetalle meta={meta} />
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-1">
            {!notif.leida && (
              <button
                onClick={onMarcarLeida}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5"
                style={{ background: 'var(--bg-input)', color: 'var(--accent-lift)', border: '1px solid var(--border)' }}
              >
                <CheckCheck size={11} /> Marcar leída
              </button>
            )}

            {linkDestino && (
              <Link
                to={linkDestino}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 text-white"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
              >
                Ir al detalle <ArrowRight size={11} />
              </Link>
            )}

            <button
              onClick={onEliminar}
              className="ml-auto px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5"
              style={{ color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <Trash2 size={11} /> Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ReservaDetalle({ meta }) {
  return (
    <>
      {meta.fecha && meta.hora && (
        <DetalleItem icon={Calendar}>
          {meta.fecha} · {String(meta.hora).slice(0, 5)}
        </DetalleItem>
      )}
      {meta.personas && (
        <DetalleItem icon={Users}>
          {meta.personas} {meta.personas === 1 ? 'persona' : 'personas'}
        </DetalleItem>
      )}
      {meta.cliente_telefono && (
        <DetalleItem icon={Phone}>
          <a href={`tel:${meta.cliente_telefono}`} className="hover:underline" style={{ color: 'var(--accent-lift)' }}>
            {meta.cliente_telefono}
          </a>
        </DetalleItem>
      )}
      {meta.cliente_email && (
        <DetalleItem icon={Mail}>
          <a href={`mailto:${meta.cliente_email}`} className="hover:underline" style={{ color: 'var(--accent-lift)' }}>
            {meta.cliente_email}
          </a>
        </DetalleItem>
      )}
      {meta.origen && (
        <DetalleItem label="Origen">{meta.origen}</DetalleItem>
      )}
      {meta.estado && (
        <DetalleItem label="Estado">{meta.estado}</DetalleItem>
      )}
      {meta.restricciones && (
        <DetalleItem label="Restricciones" full>{meta.restricciones}</DetalleItem>
      )}
      {meta.accesibilidad && (
        <DetalleItem label="Accesibilidad" full>{meta.accesibilidad}</DetalleItem>
      )}
      {meta.notas && (
        <DetalleItem label="Notas" full>{meta.notas}</DetalleItem>
      )}
    </>
  )
}

function PedidoDetalle({ meta }) {
  return (
    <>
      {meta.numero && <DetalleItem label="N°">#{meta.numero}</DetalleItem>}
      {meta.canal  && <DetalleItem label="Canal">{meta.canal}</DetalleItem>}
      {meta.total !== undefined && <DetalleItem label="Total">${meta.total}</DetalleItem>}
      {meta.cliente_telefono && (
        <DetalleItem icon={Phone}>
          <a href={`tel:${meta.cliente_telefono}`} className="hover:underline" style={{ color: 'var(--accent-lift)' }}>
            {meta.cliente_telefono}
          </a>
        </DetalleItem>
      )}
      {meta.cliente_direccion && (
        <DetalleItem icon={MapPin} full>{meta.cliente_direccion}</DetalleItem>
      )}
      {meta.notas && (
        <DetalleItem label="Notas" full>{meta.notas}</DetalleItem>
      )}
    </>
  )
}

function DetalleItem({ icon: Icon, label, children, full }) {
  return (
    <div className={`flex items-start gap-1.5 text-xs ${full ? 'sm:col-span-2' : ''}`}>
      {Icon && <Icon size={12} style={{ color: 'var(--text-muted)' }} className="flex-shrink-0 mt-0.5" />}
      {label && (
        <span className="font-medium" style={{ color: 'var(--text-muted)' }}>{label}:</span>
      )}
      <span style={{ color: 'var(--text-secondary)' }}>{children}</span>
    </div>
  )
}
