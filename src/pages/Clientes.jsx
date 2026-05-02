import { useState, useMemo } from 'react'
import {
  Plus, Search, Download, RefreshCw, Users, Star, TrendingUp,
  Edit2, Trash2, Phone, Mail, Calendar, AlertCircle
} from 'lucide-react'
import { useClientes, TAGS_CONFIG, ALL_TAGS } from '../hooks/useClientes'
import { normalizeSearch } from '../utils/normalize'
import ClienteModal from '../components/clientes/ClienteModal'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Avatar de iniciales ───────────────────────────────────────────────────────
const AVATAR_COLORS = ['#7c3aed','#4f8ef7','#34d399','#a855f7','#f59e0b','#ec4899']
function Avatar({ nombre }) {
  const initials = (nombre || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  const color    = AVATAR_COLORS[(nombre || '').charCodeAt(0) % AVATAR_COLORS.length] || AVATAR_COLORS[0]
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {initials}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#1c1c1f', border: '1px solid #2a2a2e' }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}15` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <p className="text-xl font-bold text-white leading-none">{value}</p>
        <p className="text-xs mt-0.5" style={{ color: '#52525b' }}>{label}</p>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ClientesPage() {
  const [search,      setSearch]      = useState('')
  const [tagFilter,   setTagFilter]   = useState('') // '' = todos
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editCliente, setEditCliente] = useState(null)
  const [deleteTarget,setDeleteTarget]= useState(null)
  const [deletingId,  setDeletingId]  = useState(null)

  const {
    clientes, stats,
    loading, error,
    createCliente, updateCliente, deleteCliente,
    exportCSV, refetch,
  } = useClientes()

  // ── Filtros ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = clientes
    if (search.trim()) {
      const q = normalizeSearch(search)
      list = list.filter(c =>
        normalizeSearch(c.nombre).includes(q) ||
        normalizeSearch(c.telefono).includes(q) ||
        normalizeSearch(c.email).includes(q)
      )
    }
    if (tagFilter) {
      list = list.filter(c => (c.tags || '').includes(tagFilter))
    }
    return list
  }, [clientes, search, tagFilter])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openNew   = ()     => { setEditCliente(null); setModalOpen(true) }
  const openEdit  = (c)    => { setEditCliente(c);    setModalOpen(true) }

  const handleSave = async (formData) => {
    return editCliente
      ? await updateCliente(editCliente.id, formData)
      : await createCliente(formData)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    await deleteCliente(deleteTarget.id)
    setDeleteTarget(null)
    setDeletingId(null)
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Clientes & CRM</h1>
          <p className="text-sm mt-0.5" style={{ color: '#52525b' }}>Base de datos de clientes</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <button onClick={refetch} disabled={loading}
            className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-50 transition-all"
            style={{ border: '1px solid #2a2a2e' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: '#52525b' }} />
          </button>
          <button onClick={exportCSV}
            className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:bg-white/5"
            style={{ color: '#a1a1aa', border: '1px solid #2a2a2e' }}>
            <Download size={14} /> Exportar CSV
          </button>
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 16px rgba(124,58,237,0.25)' }}>
            <Plus size={15} />
            <span className="hidden sm:inline">Nuevo cliente</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users}      label="Total clientes"    value={stats.total}        color="#a1a1aa" />
        <StatCard icon={Star}       label="VIP"               value={stats.vip}          color="#fbbf24" />
        <StatCard icon={TrendingUp} label="Nuevos este mes"   value={stats.nuevos}       color="#34d399" />
        <StatCard icon={Star}       label="Puntos emitidos"   value={stats.totalPuntos.toLocaleString('es-AR')} color="#7c3aed" />
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#3f3f46' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono o email…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder:text-zinc-600 outline-none"
            style={{ background: '#111113', border: '1px solid #2a2a2e' }}
            onFocus={e => e.target.style.border = '1px solid rgba(124,58,237,0.4)'}
            onBlur={e => e.target.style.border = '1px solid #2a2a2e'} />
        </div>

        {/* Tag filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setTagFilter('')}
            className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={!tagFilter
              ? { background: 'rgba(124,58,237,0.12)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.3)' }
              : { color: '#52525b', border: '1px solid #2a2a2e' }
            }>
            Todos
          </button>
          {ALL_TAGS.map(tag => {
            const cfg = TAGS_CONFIG[tag]
            const active = tagFilter === tag
            return (
              <button key={tag} onClick={() => setTagFilter(active ? '' : tag)}
                className="px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: active ? cfg.bg : '#111113',
                  color:      active ? cfg.color : '#52525b',
                  border:     `1px solid ${active ? cfg.border : '#2a2a2e'}`,
                }}>
                {tag}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* ── Loading skeletons ── */}
      {loading && (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 rounded-xl"
              style={{ background: '#1c1c1f', border: '1px solid #2a2a2e' }}>
              <div className="skeleton w-9 h-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3 w-40 rounded" />
                <div className="skeleton h-3 w-56 rounded" />
              </div>
              <div className="skeleton h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {/* ── Lista de clientes ── */}
      {!loading && (
        <>
          {/* Count */}
          <p className="text-xs" style={{ color: '#3f3f46' }}>
            {filtered.length} de {clientes.length} clientes
          </p>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Users size={36} style={{ color: '#2a2a2e' }} />
              <p className="text-sm font-medium" style={{ color: '#52525b' }}>
                {search || tagFilter ? 'Sin resultados para este filtro' : 'No hay clientes todavía'}
              </p>
              {!search && !tagFilter && (
                <button onClick={openNew} className="text-xs" style={{ color: '#7c3aed' }}>
                  + Agregar el primer cliente
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #2a2a2e' }}>
              {filtered.map((c, idx) => {
                const tags = c.tags ? c.tags.split(',').map(t => t.trim()).filter(Boolean) : []
                const cumple = c.cumpleanos
                  ? format(new Date(c.cumpleanos + 'T00:00:00'), 'd MMM', { locale: es })
                  : null
                const ultimaVisita = c._ultimaVisita
                  ? format(new Date(c._ultimaVisita), 'd MMM yyyy', { locale: es })
                  : null

                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3.5 transition-colors hover:bg-white/[0.02] cursor-pointer"
                    style={{
                      background: '#1c1c1f',
                      borderBottom: idx < filtered.length - 1 ? '1px solid #2a2a2e' : 'none',
                    }}
                    onClick={() => openEdit(c)}
                  >
                    <Avatar nombre={c.nombre} />

                    {/* Name + contact */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white">{c.nombre}</p>
                        {/* Puntos badge */}
                        {(c.puntos || 0) > 0 && (
                          <span
                            className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}
                          >
                            <Star size={8} />
                            {c.puntos}
                          </span>
                        )}
                        {tags.map(tag => {
                          const cfg = TAGS_CONFIG[tag]
                          return cfg ? (
                            <span key={tag} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                              {tag}
                            </span>
                          ) : null
                        })}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {c.telefono && (
                          <span className="flex items-center gap-1 text-[11px]" style={{ color: '#52525b' }}>
                            <Phone size={10} /> {c.telefono}
                          </span>
                        )}
                        {c.email && (
                          <span className="flex items-center gap-1 text-[11px] truncate" style={{ color: '#52525b' }}>
                            <Mail size={10} /> {c.email}
                          </span>
                        )}
                        {cumple && (
                          <span className="flex items-center gap-1 text-[11px]" style={{ color: '#52525b' }}>
                            <Calendar size={10} /> {cumple}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Visit stats — ocultas en mobile */}
                    <div className="hidden md:flex flex-col items-end gap-1 flex-shrink-0 text-right">
                      <p className="text-xs font-semibold text-white/80">
                        {c._visitas} {c._visitas === 1 ? 'visita' : 'visitas'}
                      </p>
                      {ultimaVisita && (
                        <p className="text-[10px]" style={{ color: '#3f3f46' }}>
                          Última: {ultimaVisita}
                        </p>
                      )}
                      {c._totalGastado > 0 && (
                        <p className="text-xs font-bold" style={{ color: '#7c3aed' }}>
                          ${c._totalGastado.toLocaleString('es-AR')}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(c)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
                        style={{ color: '#71717a' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#a1a1aa'}
                        onMouseLeave={e => e.currentTarget.style.color = '#71717a'}>
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => setDeleteTarget(c)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
                        style={{ color: '#71717a' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                        onMouseLeave={e => e.currentTarget.style.color = '#71717a'}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Modal ── */}
      <ClienteModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditCliente(null) }}
        cliente={editCliente}
        onSave={handleSave}
      />

      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: '#1c1c1f', border: '1px solid #2a2a2e', boxShadow: '0 32px 64px rgba(0,0,0,0.5)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto"
              style={{ background: 'rgba(239,68,68,0.1)' }}>
              <Trash2 size={18} style={{ color: '#f87171' }} />
            </div>
            <div className="text-center">
              <p className="font-semibold text-white text-base">¿Eliminar cliente?</p>
              <p className="text-sm mt-1" style={{ color: '#52525b' }}>
                "<span className="text-white/70">{deleteTarget.nombre}</span>" se eliminará permanentemente.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium hover:bg-white/5"
                style={{ color: '#71717a', border: '1px solid #2a2a2e' }}>Cancelar</button>
              <button onClick={handleDelete} disabled={!!deletingId}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>
                {deletingId ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
