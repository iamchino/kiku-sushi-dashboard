import { useState, useMemo } from 'react'
import {
  Plus, Search, Edit2, Trash2, Eye, EyeOff,
  UtensilsCrossed, Truck, RefreshCw, AlertCircle, Package, Sparkles, TrendingUp, Megaphone, Utensils,
  GripVertical, MoveVertical, Flame
} from 'lucide-react'
import { useMenu } from '../hooks/useMenu'
import { normalizeSearch } from '../utils/normalize'
import ProductModal from '../components/menu/ProductModal'
import EspecialesTab from '../components/menu/EspecialesTab'
import BannerTab from '../components/menu/BannerTab'
import OmakaseTab from '../components/menu/OmakaseTab'
import NovedadTab from '../components/menu/NovedadTab'
import AjustePreciosModal from '../components/menu/AjustePreciosModal'

const TABS = [
  { id: 'carta',      label: 'Carta Salón',        icon: UtensilsCrossed },
  { id: 'delivery',   label: 'Delivery / Pedidos', icon: Truck },
  { id: 'especiales', label: 'Especiales Web',     icon: Sparkles },
  { id: 'banner',     label: 'Banner web',         icon: Megaphone },
  { id: 'omakase',    label: 'Omakase',            icon: Utensils },
  { id: 'novedad',    label: 'Nuevo',              icon: Flame },
]

const BADGE_COLORS = {
  Popular:  { bg: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent-lift)',  border: 'rgba(var(--accent-rgb),0.25)' },
  Premium:  { bg: 'rgba(var(--accent-lift-rgb),0.12)', color: 'var(--accent-lift)',  border: 'rgba(var(--accent-lift-rgb),0.25)' },
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
  const [notice,      setNotice]      = useState(null)
  const [preciosOpen, setPreciosOpen] = useState(false)

  // El tab "Especiales Web" usa su propio hook (tablas especiales/especial_pasos);
  // pasamos null a useMenu para que no consulte menu_items innecesariamente.
  const esEspeciales = activeTab === 'especiales'
  const esBanner = activeTab === 'banner'
  const esOmakase = activeTab === 'omakase'
  const esNovedad = activeTab === 'novedad'
  // "config" = tabs que no listan productos (Especiales Web, Banner web, Omakase, Nuevo).
  const esConfig = esEspeciales || esBanner || esOmakase || esNovedad

  const {
    grouped, categories, stats,
    loading, error,
    createItem, updateItem, deleteItem, toggleActive, uploadImage, persistOrder,
    refetch,
  } = useMenu(esConfig ? null : activeTab)

  // ── Drag & drop (reordenar) ─────────────────────────────────────────────
  // dragItem  → arrastrando un producto dentro de su categoría
  // dragCat   → arrastrando el encabezado de una sección para moverla
  const [dragItem, setDragItem] = useState(null)   // { cat, id }
  const [dragCat,  setDragCat]  = useState(null)    // nombre de categoría
  const [dropHint, setDropHint] = useState(null)    // { type:'item'|'cat', id }
  const reordering = !esConfig && !search.trim()    // solo se reordena sin búsqueda activa

  // Aplana grouped a la lista global de items en un orden de categorías dado.
  const flatten = (catOrder) => catOrder.flatMap(c => grouped[c]?.items || [])

  const persistAndNotify = async (flat) => {
    const err = await persistOrder(flat)
    if (err) setNotice({ type: 'error', text: `No se pudo guardar el nuevo orden: ${err.message || 'error'}` })
  }

  // Reordenar un PRODUCTO dentro de su categoría
  const handleItemDrop = (cat, targetId) => {
    const drag = dragItem
    setDragItem(null); setDropHint(null)
    if (!drag || drag.cat !== cat || drag.id === targetId) return
    const catItems = grouped[cat]?.items || []
    const from = catItems.findIndex(i => i.id === drag.id)
    const to   = catItems.findIndex(i => i.id === targetId)
    if (from === -1 || to === -1) return
    const nuevos = [...catItems]
    const [moved] = nuevos.splice(from, 1)
    nuevos.splice(to, 0, moved)
    const flat = Object.keys(grouped).flatMap(c => c === cat ? nuevos : grouped[c].items)
    persistAndNotify(flat)
  }

  // Reordenar una SECCIÓN entera
  const handleCatDrop = (targetCat) => {
    const drag = dragCat
    setDragCat(null); setDropHint(null)
    if (!drag || drag === targetCat) return
    const order = Object.keys(grouped)
    const from = order.indexOf(drag)
    const to   = order.indexOf(targetCat)
    if (from === -1 || to === -1) return
    order.splice(from, 1)
    order.splice(to, 0, drag)
    persistAndNotify(flatten(order))
  }

  // ── Filtered view ──────────────────────────────────────────────────────
  const filteredGrouped = useMemo(() => {
    if (!search.trim()) return grouped
    const q = normalizeSearch(search)
    const result = {}
    Object.entries(grouped).forEach(([cat, { subtitle, items }]) => {
      const filtered = items.filter(i =>
        normalizeSearch(i.nombre).includes(q) ||
        normalizeSearch(i.descripcion).includes(q)
      )
      if (filtered.length) result[cat] = { subtitle, items: filtered }
    })
    return result
  }, [grouped, search])

  // ── Handlers ───────────────────────────────────────────────────────────
  const openNew  = () => { setEditItem(null); setModalOpen(true) }
  const openEdit = (item) => { setEditItem(item); setModalOpen(true) }

  const handleSave = async (formData, imageFile) => {
    let imagen_url = formData.imagen_url || null

    if (imageFile) {
      const { url, error } = await uploadImage(imageFile)
      if (error) return error
      imagen_url = url
    }

    const payload = { ...formData, imagen_url }
    const err = editItem
      ? await updateItem(editItem.id, payload)
      : await createItem(payload)

    return err
  }

  const handleToggle = async (item) => {
    await toggleActive(item.id, item.activo)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const nombre = deleteTarget.nombre
    setDeletingId(deleteTarget.id)
    const result = await deleteItem(deleteTarget.id)
    setDeleteTarget(null)
    setDeletingId(null)

    if (!result.ok) {
      setNotice({
        type: 'error',
        text: `No se pudo eliminar "${nombre}": ${result.error?.message || 'error desconocido'}`,
      })
    } else if (result.hidden) {
      setNotice({
        type: 'info',
        text: `"${nombre}" tiene ventas registradas, así que se ocultó de la carta en lugar de borrarse (para conservar el historial). Podés volver a mostrarlo cuando quieras.`,
      })
    } else {
      setNotice({ type: 'success', text: `"${nombre}" se eliminó correctamente.` })
    }
  }

  const isEmpty = Object.keys(filteredGrouped).length === 0

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto overflow-x-hidden">

      {/* ── Aviso (resultado de eliminar) ── */}
      {notice && (
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
          style={{
            background: notice.type === 'error' ? 'rgba(239,68,68,0.1)'
              : notice.type === 'info' ? 'rgba(251,191,36,0.1)'
              : 'rgba(52,211,153,0.1)',
            border: `1px solid ${notice.type === 'error' ? 'rgba(239,68,68,0.25)'
              : notice.type === 'info' ? 'rgba(251,191,36,0.25)'
              : 'rgba(52,211,153,0.25)'}`,
            color: 'var(--text-primary)',
          }}
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" style={{
            color: notice.type === 'error' ? '#f87171' : notice.type === 'info' ? '#fbbf24' : '#34d399',
          }} />
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} style={{ color: 'var(--text-muted)' }} className="font-medium">✕</button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Menú & Carta</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Gestioná los productos de cada sección
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={() => setPreciosOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            title="Subir precios de varias secciones de golpe, por % o por monto"
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <TrendingUp size={15} style={{ color: 'var(--accent-lift)' }} />
            <span className="hidden sm:inline">Ajustar precios</span>
          </button>
          {!esConfig && <>
            <button
              onClick={refetch} disabled={loading}
              className="p-2 rounded-lg transition-all disabled:opacity-50"
              style={{ border: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
            </button>
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))', boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.25)' }}
            >
              <Plus size={15} />
              Nuevo producto
            </button>
          </>}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div
        className="flex gap-1 p-1 rounded-xl overflow-x-auto tabs-scroll"
        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
        role="tablist"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => { setActiveTab(id); setSearch('') }}
            /* shrink-0 + whitespace-nowrap: en mobile cada tab conserva su ancho
               y la fila se desliza. Desde sm entran todos y vuelven a repartirse. */
            className="shrink-0 sm:flex-1 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={activeTab === id
              ? { background: 'var(--bg-card)', color: 'var(--accent-lift)', border: '1px solid var(--border)' }
              : { color: 'var(--text-muted)' }
            }
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab Especiales Web (autocontenido) ── */}
      {esEspeciales && <EspecialesTab />}

      {/* ── Tab Banner web (autocontenido) ── */}
      {esBanner && <BannerTab />}

      {/* ── Tab Omakase (precio web, autocontenido) ── */}
      {esOmakase && <OmakaseTab />}

      {/* ── Tab Nuevo (el plato del momento en la web, autocontenido) ── */}
      {esNovedad && <NovedadTab />}

      {/* ── Stats bar ── */}
      {!esConfig && !loading && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1.5">
            <Package size={12} />
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{stats.total}</span> productos
          </span>
          <span className="w-1 h-1 rounded-full" style={{ background: 'var(--border)' }} />
          <span className="flex items-center gap-1.5">
            <Eye size={12} style={{ color: '#34d399' }} />
            <span style={{ color: '#34d399' }}>{stats.activos}</span> visibles
          </span>
          <span className="w-1 h-1 rounded-full" style={{ background: 'var(--border)' }} />
          <span className="flex items-center gap-1.5">
            <EyeOff size={12} />
            {stats.inactivos} ocultos
          </span>
        </div>
      )}

      {/* ── Search ── */}
      {!esConfig && <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xmuted)' }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          onFocus={e => e.target.style.border = '1px solid rgba(var(--accent-rgb),0.4)'}
          onBlur={e => e.target.style.border = '1px solid var(--border)'}
        />
      </div>}

      {/* ── Error ── */}
      {!esConfig && error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {!esConfig && loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
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
      {!esConfig && !loading && isEmpty && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <UtensilsCrossed size={24} style={{ color: 'var(--text-xmuted)' }} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              {search ? `Sin resultados para "${search}"` : 'No hay productos todavía'}
            </p>
            {!search && (
              <button onClick={openNew} className="text-xs mt-2" style={{ color: 'var(--accent-lift)' }}>
                + Agregar el primer producto
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Aviso: cómo reordenar ── */}
      {reordering && !loading && !isEmpty && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <MoveVertical size={13} style={{ color: 'var(--accent-lift)' }} />
          <span>Arrastrá <GripVertical size={12} className="inline -mt-0.5" /> para reordenar productos. Arrastrá el <strong style={{ color: 'var(--text-secondary)' }}>título de una sección</strong> para mover la sección entera y cambiar qué se ve primero.</span>
        </div>
      )}

      {/* ── Products grouped by category ── */}
      {!esConfig && !loading && !isEmpty && (
        <div className="space-y-4">
          {Object.entries(filteredGrouped).map(([cat, { subtitle, items }]) => (
            <div
              key={cat}
              className="rounded-xl overflow-hidden"
              style={{
                border: dropHint?.type === 'cat' && dropHint.id === cat ? '1px solid var(--accent)' : '1px solid var(--border-card)',
                boxShadow: 'var(--shadow-card)',
              }}
              onDragOver={dragCat ? (e => { e.preventDefault(); setDropHint({ type: 'cat', id: cat }) }) : undefined}
              onDrop={dragCat ? (() => handleCatDrop(cat)) : undefined}
            >

              {/* Category header */}
              <div
                className="flex items-center justify-between px-5 py-3"
                style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border)' }}
                draggable={reordering}
                onDragStart={reordering ? (e => { setDragCat(cat); e.dataTransfer.effectAllowed = 'move' }) : undefined}
                onDragEnd={() => { setDragCat(null); setDropHint(null) }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {reordering && (
                    <GripVertical
                      size={15}
                      className="flex-shrink-0 cursor-grab active:cursor-grabbing"
                      style={{ color: 'var(--text-xmuted)' }}
                      title="Arrastrá para mover esta sección"
                    />
                  )}
                  <div className="min-w-0">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{cat}</span>
                    {subtitle && (
                      <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{subtitle}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  {items.length} productos
                </span>
              </div>

              {/* Product rows */}
              <div style={{ background: 'var(--bg-card)' }}>
                {items.map((item, idx) => {
                  const badge = BADGE_COLORS[item.etiqueta]
                  const esDropItem = dropHint?.type === 'item' && dropHint.id === item.id
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 px-5 py-3.5 transition-colors"
                      style={{
                        opacity: dragItem?.id === item.id ? 0.4 : (item.activo ? 1 : 0.5),
                        borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
                        boxShadow: esDropItem ? 'inset 0 2px 0 0 var(--accent)' : 'none',
                      }}
                      onDragOver={dragItem?.cat === cat ? (e => { e.preventDefault(); setDropHint({ type: 'item', id: item.id }) }) : undefined}
                      onDrop={dragItem?.cat === cat ? (() => handleItemDrop(cat, item.id)) : undefined}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Drag handle */}
                      {reordering && (
                        <div
                          draggable
                          onDragStart={e => { setDragItem({ cat, id: item.id }); e.dataTransfer.effectAllowed = 'move' }}
                          onDragEnd={() => { setDragItem(null); setDropHint(null) }}
                          className="flex-shrink-0 cursor-grab active:cursor-grabbing"
                          style={{ color: 'var(--text-xmuted)' }}
                          title="Arrastrá para reordenar"
                        >
                          <GripVertical size={16} />
                        </div>
                      )}

                      {/* Thumbnail */}
                      <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border)' }}>
                        {item.imagen_url
                          ? <img src={item.imagen_url} alt={item.nombre} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-lg" style={{ background: 'var(--bg-input)' }}>🍣</div>
                        }
                      </div>

                      {/* Name + desc */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.nombre}</p>
                          {badge && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                            >
                              {item.etiqueta}
                            </span>
                          )}
                          {item.solo_salon && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: 'rgba(79,142,247,0.12)', color: '#4f8ef7' }}
                              title="Disponible en salón/mesas, oculto en la carta web"
                            >
                              Solo salón
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                          {item.descripcion || '—'}
                        </p>
                      </div>

                      {/* Price */}
                      {item.precio && (
                        <span className="text-sm font-semibold flex-shrink-0 text-right" style={{ color: 'var(--accent-lift)', minWidth: '80px' }}>
                          {item.precio}
                        </span>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Toggle active */}
                        <button
                          onClick={() => handleToggle(item)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                          title={item.activo ? 'Ocultar' : 'Mostrar'}
                          style={{ color: item.activo ? '#34d399' : 'var(--text-xmuted)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          {item.activo ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => openEdit(item)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                          style={{ color: 'var(--text-xmuted)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-xmuted)'; e.currentTarget.style.background = 'transparent' }}
                        >
                          <Edit2 size={14} />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => setDeleteTarget(item)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
                          style={{ color: 'var(--text-xmuted)' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}
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

      {/* ── Ajuste masivo de precios ── */}
      <AjustePreciosModal
        open={preciosOpen}
        onClose={() => setPreciosOpen(false)}
        onAplicado={(res) => {
          refetch()
          setNotice({
            type: res.fallidos ? 'info' : 'success',
            text: res.fallidos
              ? `Se actualizaron ${res.total - res.fallidos} de ${res.total} precios (${res.fallidos} fallaron).`
              : `Se actualizaron ${res.total} precios correctamente.`,
          })
        }}
      />

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
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.3)' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <Trash2 size={18} style={{ color: '#f87171' }} />
            </div>
            <div className="text-center">
              <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>¿Eliminar producto?</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                "<span style={{ color: 'var(--text-primary)' }}>{deleteTarget.nombre}</span>" se eliminará de forma permanente.
                Tus <span style={{ color: 'var(--text-primary)' }}>reportes de ventas se conservan</span> (los pedidos guardan el nombre y el precio). Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
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
