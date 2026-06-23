import { useState } from 'react'
import {
  Plus, Edit2, Trash2, Eye, EyeOff,
  RefreshCw, AlertCircle, Sparkles, Link as LinkIcon, GripVertical,
} from 'lucide-react'
import { useEspeciales } from '../../hooks/useEspeciales'
import EspecialModal from './EspecialModal'

const formatPrecio = (precio, nota) => {
  if (precio == null) return null
  const n = Number(precio)
  if (!Number.isFinite(n) || n <= 0) return null
  return `$${n.toLocaleString('es-AR')}${nota ? ` ${nota}` : ''}`
}

/**
 * EspecialesTab — gestión de los "Especiales de Kiku" de la web pública.
 * Tab dentro de /menu, autocontenido (lista + modal + confirmación de borrado).
 */
export default function EspecialesTab() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState(null)

  // Drag & drop (HTML5 nativo, sin librerías)
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const [canDrag, setCanDrag] = useState(false)

  const {
    items, stats, loading, error,
    createItem, updateItem, deleteItem, toggleActive, reorderItems, uploadImage,
    refetch,
  } = useEspeciales()

  const resetDrag = () => { setDragIndex(null); setOverIndex(null); setCanDrag(false) }

  const handleDragStart = (e, idx) => {
    setDragIndex(idx)
    e.dataTransfer.effectAllowed = 'move'
    // Algunos navegadores exigen setData para iniciar el arrastre.
    try { e.dataTransfer.setData('text/plain', String(idx)) } catch { /* noop */ }
  }

  const handleDragOver = (e, idx) => {
    if (dragIndex === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (idx !== overIndex) setOverIndex(idx)
  }

  const handleDrop = async (e, idx) => {
    e.preventDefault()
    const from = dragIndex
    resetDrag()
    if (from === null || from === idx) return

    const reordered = [...items]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(idx, 0, moved)

    const err = await reorderItems(reordered)
    if (err) {
      setNotice({ type: 'error', text: `No se pudo guardar el orden: ${err.message || 'error desconocido'}` })
    }
  }

  const openNew = () => { setEditItem(null); setModalOpen(true) }
  const openEdit = (item) => { setEditItem(item); setModalOpen(true) }

  const handleSave = async (formData, imageFile) => {
    let imagen_url = formData.imagen_url || null

    if (imageFile) {
      const { url, error } = await uploadImage(imageFile)
      if (error) return error
      imagen_url = url
    }

    const payload = { ...formData, imagen_url }
    return editItem
      ? await updateItem(editItem.id, payload)
      : await createItem(payload)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const titulo = deleteTarget.titulo
    setDeleting(true)
    const result = await deleteItem(deleteTarget.id)
    setDeleteTarget(null)
    setDeleting(false)

    if (!result.ok) {
      setNotice({ type: 'error', text: `No se pudo eliminar "${titulo}": ${result.error?.message || 'error desconocido'}` })
    } else {
      setNotice({ type: 'success', text: `"${titulo}" se eliminó de la web.` })
    }
  }

  return (
    <div className="space-y-5">

      {/* Aviso */}
      {notice && (
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
          style={{
            background: notice.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.1)',
            border: `1px solid ${notice.type === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(52,211,153,0.25)'}`,
            color: 'var(--text-primary)',
          }}
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" style={{ color: notice.type === 'error' ? '#f87171' : '#34d399' }} />
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} style={{ color: 'var(--text-muted)' }} className="font-medium">✕</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1.5">
            <Sparkles size={12} />
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{stats.total}</span> especiales
          </span>
          <span className="w-1 h-1 rounded-full" style={{ background: 'var(--border)' }} />
          <span className="flex items-center gap-1.5">
            <Eye size={12} style={{ color: '#34d399' }} />
            <span style={{ color: '#34d399' }}>{stats.activos}</span> visibles en la web
          </span>
          <span className="w-1 h-1 rounded-full" style={{ background: 'var(--border)' }} />
          <span className="flex items-center gap-1.5">
            <EyeOff size={12} />
            {stats.inactivos} ocultos
          </span>
        </div>
        <div className="flex items-center gap-3">
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
            Nuevo especial
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
        >
          <AlertCircle size={14} />
          {error}
          {/does not exist|schema cache/i.test(error) && (
            <span style={{ color: 'var(--text-muted)' }}>
              — ¿Aplicaste la migración <code>20260612010000_especiales_web.sql</code> en Supabase?
            </span>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl p-4 flex items-center gap-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
              <div className="skeleton w-16 h-20 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-40 rounded" />
                <div className="skeleton h-3 w-72 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <Sparkles size={24} style={{ color: 'var(--text-xmuted)' }} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              No hay especiales todavía
            </p>
            <button onClick={openNew} className="text-xs mt-2" style={{ color: 'var(--accent-lift)' }}>
              + Agregar el primer especial
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {!loading && items.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ background: 'var(--bg-card)' }}>
            {items.map((item, idx) => {
              const precio = formatPrecio(item.precio, item.precio_nota)
              return (
                <div
                  key={item.id}
                  draggable={canDrag}
                  onDragStart={e => handleDragStart(e, idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDrop={e => handleDrop(e, idx)}
                  onDragEnd={resetDrag}
                  className="flex items-center gap-3 px-5 py-4 transition-colors"
                  style={{
                    opacity: dragIndex === idx ? 0.4 : (item.activo ? 1 : 0.5),
                    borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
                    borderTop: overIndex === idx && dragIndex !== null && dragIndex !== idx
                      ? '2px solid var(--accent)' : '2px solid transparent',
                    background: overIndex === idx && dragIndex !== null && dragIndex !== idx
                      ? 'var(--bg-hover)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (dragIndex === null) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (dragIndex === null) e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Asa de arrastre */}
                  <button
                    onMouseDown={() => setCanDrag(true)}
                    onMouseUp={() => setCanDrag(false)}
                    title="Arrastrar para reordenar"
                    className="flex items-center justify-center flex-shrink-0 cursor-grab active:cursor-grabbing touch-none"
                    style={{ color: 'var(--text-xmuted)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}
                  >
                    <GripVertical size={16} />
                  </button>

                  {/* Thumbnail 4:5 */}
                  <div className="w-14 h-[70px] rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border)' }}>
                    {item.imagen_url
                      ? <img src={item.imagen_url} alt={item.titulo} draggable={false} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-lg" style={{ background: 'var(--bg-input)' }}>✨</div>
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {item.numero && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                        >
                          {item.numero}
                        </span>
                      )}
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {item.titulo}{item.titulo_acento ? ` ${item.titulo_acento}` : ''}
                      </p>
                      {item.especial_pasos?.length > 0 && (
                        <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-xmuted)' }}>
                          · {item.especial_pasos.length} pasos
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                      {item.descripcion || '—'}
                    </p>
                    <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: 'var(--text-xmuted)' }}>
                      <LinkIcon size={9} />
                      {item.cta_tipo === 'pedir'
                        ? 'Botón: Pedir (deli / take away)'
                        : item.cta_tipo === 'link'
                          ? `Botón: ${item.cta_url || 'link'}`
                          : `/reservar?experiencia=${item.experiencia}`}
                    </p>
                  </div>

                  {/* Precio */}
                  {precio && (
                    <span className="text-sm font-semibold flex-shrink-0 text-right" style={{ color: 'var(--accent-lift)', minWidth: '120px' }}>
                      {precio}
                    </span>
                  )}

                  {/* Acciones */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleActive(item.id, item.activo)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                      title={item.activo ? 'Ocultar de la web' : 'Mostrar en la web'}
                      style={{ color: item.activo ? '#34d399' : 'var(--text-xmuted)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {item.activo ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      onClick={() => openEdit(item)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                      style={{ color: 'var(--text-xmuted)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-xmuted)'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <Edit2 size={14} />
                    </button>
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
      )}

      {/* Tip */}
      {!loading && items.length > 0 && (
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          💡 Arrastrá desde el ⠿ para reordenar: ese orden es el que se ve en la web pública,
          al instante y sin redeploy. El ojito oculta/muestra un especial sin borrarlo (ideal
          para los que rotan por temporada).
        </p>
      )}

      {/* Modal */}
      <EspecialModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null) }}
        item={editItem}
        onSave={handleSave}
      />

      {/* Confirmación de borrado */}
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
              <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>¿Eliminar especial?</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                "<span style={{ color: 'var(--text-primary)' }}>{deleteTarget.titulo}</span>" se eliminará de forma permanente
                junto con sus pasos. Si solo rota por temporada, conviene <span style={{ color: 'var(--text-primary)' }}>ocultarlo</span> con el ojito.
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
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
