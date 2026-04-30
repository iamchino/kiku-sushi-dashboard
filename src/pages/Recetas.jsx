import { useState, useMemo } from 'react'
import {
  Plus, RefreshCw, BookOpen, Search, Edit2, Trash2,
  AlertTriangle, ChevronDown, ChevronUp
} from 'lucide-react'
import { useRecetas } from '../hooks/useRecetas'
import RecetaModal from '../components/recetas/RecetaModal'

// ── Badge de margen ─────────────────────────────────────────────────────────
function MargenBadge({ margen }) {
  if (margen === null || margen === undefined) {
    return <span className="text-xs" style={{ color: 'var(--text-xmuted)' }}>—</span>
  }

  const bajo = margen < 30
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${bajo ? 'animate-pulse' : ''}`}
      style={{
        background: bajo ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.06)',
        color: bajo ? '#ef4444' : '#22c55e',
        border: `1px solid ${bajo ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.15)'}`,
      }}
    >
      {bajo && <AlertTriangle size={10} />}
      {margen.toFixed(1)}%
    </span>
  )
}

// ── Fila expandible con detalle de ingredientes ─────────────────────────────
function RecetaRow({ receta, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        className="transition-colors group"
        style={{ borderBottom: '1px solid var(--border)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {/* Expand */}
        <td className="px-3 py-3">
          <button onClick={() => setExpanded(e => !e)}
            className="w-6 h-6 rounded flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-xmuted)' }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </td>

        {/* Nombre */}
        <td className="px-4 py-3">
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{receta.nombre}</span>
          {receta.porciones > 1 && (
            <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              ×{receta.porciones} porciones
            </span>
          )}
        </td>

        {/* Producto vinculado */}
        <td className="px-4 py-3 hidden md:table-cell">
          {receta._menuItem ? (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {receta._menuItem.nombre}
            </span>
          ) : (
            <span className="text-xs" style={{ color: 'var(--text-xmuted)' }}>—</span>
          )}
        </td>

        {/* # Ingredientes */}
        <td className="px-4 py-3 hidden sm:table-cell text-center">
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {receta.receta_ingredientes?.length || 0}
          </span>
        </td>

        {/* Costo */}
        <td className="px-4 py-3">
          <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
            ${receta._costoPorcion.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </td>

        {/* Precio venta */}
        <td className="px-4 py-3 hidden md:table-cell">
          {receta._precioVenta ? (
            <span className="text-sm tabular-nums" style={{ color: 'var(--text-primary)' }}>
              ${receta._precioVenta.toLocaleString('es-AR')}
            </span>
          ) : (
            <span className="text-xs" style={{ color: 'var(--text-xmuted)' }}>—</span>
          )}
        </td>

        {/* Margen */}
        <td className="px-4 py-3 hidden sm:table-cell">
          <MargenBadge margen={receta._margen} />
        </td>

        {/* Acciones */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-0.5 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(receta)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: 'var(--text-xmuted)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}>
              <Edit2 size={13} />
            </button>
            <button onClick={() => onDelete(receta)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/10"
              style={{ color: 'var(--text-xmuted)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}>
              <Trash2 size={13} />
            </button>
          </div>
        </td>
      </tr>

      {/* Detalle expandido */}
      {expanded && receta.receta_ingredientes?.length > 0 && (
        <tr>
          <td colSpan={8} style={{ padding: 0 }}>
            <div className="px-6 py-3 mx-4 mb-2 rounded-lg"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-xmuted)' }}>
                Ingredientes — desglose de costos
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-1 font-medium" style={{ color: 'var(--text-muted)' }}>Ingrediente</th>
                    <th className="text-right py-1 font-medium" style={{ color: 'var(--text-muted)' }}>Cantidad</th>
                    <th className="text-right py-1 font-medium hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>Precio/U</th>
                    <th className="text-right py-1 font-medium" style={{ color: 'var(--text-muted)' }}>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {receta.receta_ingredientes.map(ri => {
                    const precio = ri.stock ? (parseFloat(ri.stock.precio_unitario) || 0) : 0
                    const rend   = ri.stock ? (parseFloat(ri.stock.rendimiento) || 1) : 1
                    const cant   = parseFloat(ri.cantidad) || 0
                    const costo  = cant * (precio / (rend > 0 ? rend : 1))
                    return (
                      <tr key={ri.id || ri.stock_id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="py-1.5" style={{ color: 'var(--text-primary)' }}>
                          {ri.stock?.nombre || 'Desconocido'}
                          {rend < 1 && (
                            <span className="text-[10px] ml-1" style={{ color: 'var(--text-xmuted)' }}>
                              (rend. {Math.round(rend * 100)}%)
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                          {cant} {ri.stock?.unidad || ''}
                        </td>
                        <td className="py-1.5 text-right tabular-nums hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>
                          ${precio.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}/{ri.stock?.unidad || ''}
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: 'var(--accent)' }}>
                          ${costo.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td colSpan={3} className="py-2 text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      Total:
                    </td>
                    <td className="py-2 text-right font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                      ${receta._costo.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function RecetasPage() {
  const [search,       setSearch]       = useState('')
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editReceta,   setEditReceta]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  const {
    recetas, stockItems, menuItems,
    loading, error, fetchAll,
    createReceta, updateReceta, deleteReceta,
    costoIngrediente,
  } = useRecetas()

  // Buscar
  const filtered = useMemo(() => {
    if (!search.trim()) return recetas
    const q = search.toLowerCase()
    return recetas.filter(r =>
      r.nombre.toLowerCase().includes(q) ||
      (r._menuItem?.nombre || '').toLowerCase().includes(q)
    )
  }, [recetas, search])

  // Stats
  const stats = useMemo(() => {
    const conMargen = recetas.filter(r => r._margen !== null)
    const bajoMargen = conMargen.filter(r => r._margen < 30)
    return {
      total: recetas.length,
      conMargen: conMargen.length,
      bajoMargen: bajoMargen.length,
    }
  }, [recetas])

  const openNew  = () => { setEditReceta(null); setModalOpen(true) }
  const openEdit = (r) => { setEditReceta(r); setModalOpen(true) }

  const handleSave = async (id, data) => {
    return id ? updateReceta(id, data) : createReceta(data)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    await deleteReceta(deleteTarget.id)
    setDeleteTarget(null); setDeleting(false)
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Recetas
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Fórmulas de cada producto con cálculo de costo automático
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} disabled={loading}
            className="p-2 rounded-lg disabled:opacity-50 transition-all"
            style={{ border: '1px solid var(--border)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 16px rgba(124,58,237,0.25)' }}>
            <Plus size={15} />
            <span className="hidden sm:inline">Nueva receta</span>
            <span className="sm:hidden">Nueva</span>
          </button>
        </div>
      </div>

      {/* Stats rápidas */}
      {!loading && stats.total > 0 && (
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{stats.total}</span> recetas
          </span>
          {stats.bajoMargen > 0 && (
            <>
              <span className="w-1 h-1 rounded-full" style={{ background: 'var(--border)' }} />
              <span className="flex items-center gap-1" style={{ color: '#ef4444' }}>
                <AlertTriangle size={11} />
                <span className="font-semibold">{stats.bajoMargen}</span> con margen bajo (&lt;30%)
              </span>
            </>
          )}
        </div>
      )}

      {/* Buscador */}
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xmuted)' }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar receta…"
          className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none transition-all"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* ═══════ TABLA DE RECETAS ═══════ */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <BookOpen size={36} style={{ color: 'var(--text-xmuted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {search ? `Sin resultados para "${search}"` : 'No hay recetas todavía'}
          </p>
          {!search && (
            <button onClick={openNew} className="text-xs" style={{ color: 'var(--accent)' }}>
              + Crear primera receta
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="w-10" />
                  {['Receta', 'Producto', 'Ing.', 'Costo', 'Venta', 'Margen', ''].map((h, i) => (
                    <th
                      key={i}
                      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-left whitespace-nowrap
                        ${i === 1 ? 'hidden md:table-cell' : ''}
                        ${i === 2 ? 'hidden sm:table-cell text-center' : ''}
                        ${i === 4 ? 'hidden md:table-cell' : ''}
                        ${i === 5 ? 'hidden sm:table-cell' : ''}
                      `}
                      style={{ color: 'var(--text-xmuted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <RecetaRow key={r.id} receta={r} onEdit={openEdit} onDelete={setDeleteTarget} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal crear/editar receta */}
      <RecetaModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditReceta(null) }}
        receta={editReceta}
        stockItems={stockItems}
        menuItems={menuItems}
        onSave={handleSave}
        costoIngrediente={costoIngrediente}
      />

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.3)' }}>
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto"
                style={{ background: 'rgba(239,68,68,0.1)' }}>
                <Trash2 size={18} style={{ color: '#ef4444' }} />
              </div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>¿Eliminar receta?</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                "<span style={{ color: 'var(--text-primary)' }}>{deleteTarget.nombre}</span>" y sus ingredientes se eliminarán.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >Cancelar</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
