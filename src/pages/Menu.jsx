import { useState, useMemo } from 'react'
import {
  Plus, Search, Edit2, Trash2, Eye, EyeOff,
  UtensilsCrossed, Truck, RefreshCw, AlertCircle, Package
} from 'lucide-react'
import { useMenu } from '../hooks/useMenu'
import ProductModal from '../components/menu/ProductModal'

const TABS = [
  { id: 'carta',    label: 'Carta Salón',       icon: UtensilsCrossed },
  { id: 'delivery', label: 'Delivery / Pedidos', icon: Truck },
]

const BADGE_COLORS = {
  Popular:  { bg: 'rgba(232,103,58,0.12)', color: '#E8673A',  border: 'rgba(232,103,58,0.25)' },
  Premium:  { bg: 'rgba(168,85,247,0.12)', color: '#a855f7',  border: 'rgba(168,85,247,0.25)' },
  Nuevo:    { bg: 'rgba(52,211,153,0.12)', color: '#34d399',  border: 'rgba(52,211,153,0.25)' },
  Limitado: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24',  border: 'rgba(251,191,36,0.25)' },
}

export default function MenuPage() {
  const [activeTab,   setActiveTab]   = useState('carta')
  const [search,      setSearch]      = useState('')
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editItem,    setEditItem]    = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletingId,  setDeletingId]  = useState(null)
  const [saving,      setSaving]      = useState(false)

  const {
    grouped, categories, stats,
    loading, error,
    createItem, updateItem, deleteItem, toggleActive, uploadImage,
    refetch,
  } = useMenu(activeTab)

  // ── Filtered view ──────────────────────────────────────────────────────
  const filteredGrouped = useMemo(() => {
    if (!search.trim()) return grouped
    const q = search.toLowerCase()
    const result = {}
    Object.entries(grouped).forEach(([cat, { subtitle, items }]) => {
      const filtered = items.filter(i =>
        i.nombre.toLowerCase().includes(q) ||
        i.descripcion.toLowerCase().includes(q)
      )
      if (filtered.length) result[cat] = { subtitle, items: filtered }
    })
    return result
  }, [grouped, search])

  // ── Handlers ───────────────────────────────────────────────────────────
  const openNew  = () => { setEditItem(null); setModalOpen(true) }
  const openEdit = (item) => { setEditItem(item); setModalOpen(true) }

  const handleSave = async (formData, imageFile) => {
    setSaving(true)
    let imagen_url = formData.imagen_url || null

    if (imageFile) {
      const { url, error } = await uploadImage(imageFile)
      if (error) { setSaving(false); return error }
      imagen_url = url
    }

    const payload = { ...formData, imagen_url }
    const err = editItem
      ? await updateItem(editItem.id, payload)
      : await createItem(payload)

    setSaving(false)
    return err
  }

  const handleToggle = async (item) => {
    await toggleActive(item.id, item.activo)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    await deleteItem(deleteTarget.id)
    setDeleteTarget(null)
    setDeletingId(null)
  }

  const isEmpty = Object.keys(filteredGrouped).length === 0

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Menú & Carta</h1>
          <p className="text-sm mt-0.5" style={{ color: '#52525b' }}>
            Gestioná los productos de cada sección
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refetch} disabled={loading}
            className="p-2 rounded-lg transition-all hover:bg-white/5 disabled:opacity-50"
            style={{ border: '1px solid #2a2a2e' }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} style={{ color: '#52525b' }} />
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #E8673A, #C4501F)', boxShadow: '0 4px 16px rgba(232,103,58,0.25)' }}
          >
            <Plus size={15} />
            Nuevo producto
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#111113', border: '1px solid #2a2a2e' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setSearch('') }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={activeTab === id
              ? { background: '#1c1c1f', color: '#E8673A', border: '1px solid #2a2a2e' }
              : { color: '#52525b' }
            }
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Stats bar ── */}
      {!loading && (
        <div className="flex items-center gap-4 text-xs" style={{ color: '#52525b' }}>
          <span className="flex items-center gap-1.5">
            <Package size={12} />
            <span className="text-white font-semibold">{stats.total}</span> productos
          </span>
          <span className="w-1 h-1 rounded-full" style={{ background: '#2a2a2e' }} />
          <span className="flex items-center gap-1.5">
            <Eye size={12} style={{ color: '#34d399' }} />
            <span style={{ color: '#34d399' }}>{stats.activos}</span> visibles
          </span>
          <span className="w-1 h-1 rounded-full" style={{ background: '#2a2a2e' }} />
          <span className="flex items-center gap-1.5">
            <EyeOff size={12} />
            {stats.inactivos} ocultos
          </span>
        </div>
      )}

      {/* ── Search ── */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#3f3f46' }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder:text-zinc-600 outline-none transition-all"
          style={{ background: '#111113', border: '1px solid #2a2a2e' }}
          onFocus={e => e.target.style.border = '1px solid rgba(232,103,58,0.4)'}
          onBlur={e => e.target.style.border = '1px solid #2a2a2e'}
        />
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl p-4 space-y-3" style={{ background: '#1c1c1f', border: '1px solid #2a2a2e' }}>
              <div className="skeleton h-4 w-32 rounded" />
              {[1, 2].map(j => (
                <div key={j} className="flex items-center gap-3">
                  <div className="skeleton w-10 h-10 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3 w-48 rounded" />
                    <div className="skeleton h-3 w-64 rounded" />
                  </div>
                  <div className="skeleton h-6 w-16 rounded" />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && isEmpty && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#1c1c1f', border: '1px solid #2a2a2e' }}>
            <UtensilsCrossed size={24} style={{ color: '#3f3f46' }} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: '#a1a1aa' }}>
              {search ? `Sin resultados para "${search}"` : 'No hay productos todavía'}
            </p>
            {!search && (
              <button onClick={openNew} className="text-xs mt-2" style={{ color: '#E8673A' }}>
                + Agregar el primer producto
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Products grouped by category ── */}
      {!loading && !isEmpty && (
        <div className="space-y-4">
          {Object.entries(filteredGrouped).map(([cat, { subtitle, items }]) => (
            <div key={cat} className="rounded-xl overflow-hidden" style={{ border: '1px solid #2a2a2e' }}>

              {/* Category header */}
              <div className="flex items-center justify-between px-5 py-3" style={{ background: '#161618', borderBottom: '1px solid #2a2a2e' }}>
                <div>
                  <span className="text-sm font-semibold text-white">{cat}</span>
                  {subtitle && (
                    <span className="text-xs ml-2" style={{ color: '#52525b' }}>{subtitle}</span>
                  )}
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#1c1c1f', color: '#52525b', border: '1px solid #2a2a2e' }}>
                  {items.length} productos
                </span>
              </div>

              {/* Product rows */}
              <div className="divide-y" style={{ background: '#1c1c1f', borderColor: '#2a2a2e' }}>
                {items.map(item => {
                  const badge = BADGE_COLORS[item.etiqueta]
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.02]"
                      style={{ opacity: item.activo ? 1 : 0.5 }}
                    >
                      {/* Thumbnail */}
                      <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid #2a2a2e' }}>
                        {item.imagen_url
                          ? <img src={item.imagen_url} alt={item.nombre} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-lg" style={{ background: '#111113' }}>🍣</div>
                        }
                      </div>

                      {/* Name + desc */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white truncate">{item.nombre}</p>
                          {badge && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                            >
                              {item.etiqueta}
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5 truncate" style={{ color: '#52525b' }}>
                          {item.descripcion || '—'}
                        </p>
                      </div>

                      {/* Price */}
                      {item.precio && (
                        <span className="text-xs font-semibold flex-shrink-0 text-right" style={{ color: '#E8673A', minWidth: '80px' }}>
                          {item.precio}
                        </span>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Toggle active */}
                        <button
                          onClick={() => handleToggle(item)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
                          title={item.activo ? 'Ocultar' : 'Mostrar'}
                          style={{ color: item.activo ? '#34d399' : '#3f3f46' }}
                        >
                          {item.activo ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => openEdit(item)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
                          style={{ color: '#71717a' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#a1a1aa'}
                          onMouseLeave={e => e.currentTarget.style.color = '#71717a'}
                        >
                          <Edit2 size={14} />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => setDeleteTarget(item)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
                          style={{ color: '#71717a' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                          onMouseLeave={e => e.currentTarget.style.color = '#71717a'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Product Modal ── */}
      <ProductModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null) }}
        item={editItem}
        tipo={activeTab}
        categories={categories}
        onSave={handleSave}
      />

      {/* ── Delete confirmation dialog ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div
            className="relative w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: '#1c1c1f', border: '1px solid #2a2a2e', boxShadow: '0 32px 64px rgba(0,0,0,0.5)' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <Trash2 size={18} style={{ color: '#f87171' }} />
            </div>
            <div className="text-center">
              <p className="font-semibold text-white text-base">¿Eliminar producto?</p>
              <p className="text-sm mt-1" style={{ color: '#52525b' }}>
                "<span className="text-white/70">{deleteTarget.nombre}</span>" se eliminará permanentemente.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-white/5"
                style={{ color: '#71717a', border: '1px solid #2a2a2e' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={!!deletingId}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}
              >
                {deletingId ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
