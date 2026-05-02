import { useState, useMemo } from 'react'
import {
  Plus, RefreshCw, BookOpen, Search, Edit2, Trash2,
  AlertTriangle, ChevronDown, ChevronUp, Package, ChefHat
} from 'lucide-react'
import { useRecetas } from '../hooks/useRecetas'
import { normalizeSearch } from '../utils/normalize'
import { useCombos } from '../hooks/useCombos'
import RecetaModal from '../components/recetas/RecetaModal'
import ComboModal from '../components/recetas/ComboModal'

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

// ── Fila expandible con detalle de ingredientes (Receta) ─────────────────────
function RecetaRow({ receta, recetas, onEdit, onDelete }) {
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
          {receta.es_subreceta && (
            <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.2)' }}>
              Sub-receta
            </span>
          )}
          {receta.porciones > 1 && (
            <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              rendimiento: {receta.porciones}
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
            <button onClick={() => onDelete(receta, 'receta')}
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
                    let nombre = 'Desconocido'
                    let unidad = ''
                    let infoPrecio = ''
                    let costo = 0
                    const cant = parseFloat(ri.cantidad) || 0

                    if (ri.stock) {
                      const precio = parseFloat(ri.stock.precio_unitario) || 0
                      const rend = parseFloat(ri.stock.rendimiento) || 1
                      nombre = ri.stock.nombre
                      unidad = ri.stock.unidad
                      infoPrecio = `$${precio.toLocaleString('es-AR')}/${unidad}`
                      costo = cant * (precio / (rend > 0 ? rend : 1))
                      if (rend < 1) nombre += ` (rend. ${Math.round(rend * 100)}%)`
                    } else if (ri.subreceta_id) {
                      const sub = recetas.find(r => r.id === ri.subreceta_id)
                      if (sub) {
                        nombre = `[Sub-receta] ${sub.nombre}`
                        unidad = 'porc.'
                        infoPrecio = `$${sub._costoPorcion.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}/porc`
                        costo = cant * sub._costoPorcion
                      }
                    }

                    return (
                      <tr key={ri.id || (ri.stock_id || ri.subreceta_id)} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="py-1.5" style={{ color: ri.subreceta_id ? '#7c3aed' : 'var(--text-primary)' }}>
                          {nombre}
                        </td>
                        <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                          {cant} {unidad}
                        </td>
                        <td className="py-1.5 text-right tabular-nums hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>
                          {infoPrecio}
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

// ── Fila expandible con detalle de recetas (Combo) ─────────────────────────
function ComboRow({ combo, onEdit, onDelete }) {
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
          <div className="flex flex-col">
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{combo.nombre}</span>
            <span className="text-[10px] line-clamp-1 mt-0.5" style={{ color: 'var(--text-xmuted)' }}>
              {combo._resumen || 'Sin items'}
            </span>
          </div>
        </td>

        {/* Producto vinculado */}
        <td className="px-4 py-3 hidden md:table-cell">
          {combo._menuItem ? (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {combo._menuItem.nombre}
            </span>
          ) : (
            <span className="text-xs" style={{ color: 'var(--text-xmuted)' }}>—</span>
          )}
        </td>

        {/* Piezas Totales */}
        <td className="px-4 py-3 hidden sm:table-cell text-center">
          <span className="text-xs font-medium tabular-nums px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316', border: '1px solid rgba(249,115,22,0.2)' }}>
            {combo._totalItems || 0} pzas
          </span>
        </td>

        {/* Costo */}
        <td className="px-4 py-3">
          <span className="text-sm font-semibold tabular-nums" style={{ color: '#f97316' }}>
            ${combo._costoTotal?.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || 0}
          </span>
        </td>

        {/* Precio venta */}
        <td className="px-4 py-3 hidden md:table-cell">
          {combo._precioVenta ? (
            <span className="text-sm tabular-nums" style={{ color: 'var(--text-primary)' }}>
              ${combo._precioVenta.toLocaleString('es-AR')}
            </span>
          ) : (
            <span className="text-xs" style={{ color: 'var(--text-xmuted)' }}>—</span>
          )}
        </td>

        {/* Margen */}
        <td className="px-4 py-3 hidden sm:table-cell">
          <MargenBadge margen={combo._margen} />
        </td>

        {/* Acciones */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-0.5 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(combo)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: 'var(--text-xmuted)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}>
              <Edit2 size={13} />
            </button>
            <button onClick={() => onDelete(combo, 'combo')}
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
      {expanded && combo.combo_items?.length > 0 && (
        <tr>
          <td colSpan={8} style={{ padding: 0 }}>
            <div className="px-6 py-3 mx-4 mb-2 rounded-lg"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-xmuted)' }}>
                Recetas del combo — desglose de costos
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-1 font-medium" style={{ color: 'var(--text-muted)' }}>Receta</th>
                    <th className="text-right py-1 font-medium" style={{ color: 'var(--text-muted)' }}>Cantidad</th>
                    <th className="text-right py-1 font-medium hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>Costo/U</th>
                    <th className="text-right py-1 font-medium" style={{ color: 'var(--text-muted)' }}>Costo Total</th>
                  </tr>
                </thead>
                <tbody>
                  {combo.combo_items.map(ci => {
                    const receta = ci.recetas
                    // Calculamos el costo unitario por porcion sumando sus ingredientes
                    const costoUnitario = receta?.receta_ingredientes?.reduce((sum, ri) => {
                      const p = ri.stock ? (parseFloat(ri.stock.precio_unitario) || 0) : 0
                      const r = ri.stock ? (parseFloat(ri.stock.rendimiento) || 1) : 1
                      const c = parseFloat(ri.cantidad) || 0
                      return sum + c * (p / (r > 0 ? r : 1))
                    }, 0) / (parseInt(receta?.porciones) || 1) || 0;

                    const costoTotalLinea = costoUnitario * ci.cantidad

                    return (
                      <tr key={ci.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="py-1.5" style={{ color: 'var(--text-primary)' }}>
                          {receta?.nombre || 'Receta Desconocida'}
                        </td>
                        <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                          {ci.cantidad}
                        </td>
                        <td className="py-1.5 text-right tabular-nums hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>
                          ${costoUnitario.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: '#f97316' }}>
                          ${costoTotalLinea.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
                    <td className="py-2 text-right font-bold tabular-nums" style={{ color: '#f97316' }}>
                      ${combo._costoTotal?.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || 0}
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
  const [activeTab,    setActiveTab]    = useState('recetas') // 'recetas' | 'combos'
  const [search,       setSearch]       = useState('')
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editItem,     setEditItem]     = useState(null)
  
  // deleteTarget puede ser { type: 'receta', data: {...} } o { type: 'combo', data: {...} }
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  // Data Recetas
  const {
    recetas, stockItems, menuItems,
    loading: loadingRecetas, error: errorRecetas, fetchAll,
    createReceta, updateReceta, deleteReceta,
    costoIngrediente,
  } = useRecetas()

  // Data Combos
  const {
    combos, loading: loadingCombos, error: errorCombos, fetchCombos,
    createCombo, updateCombo, deleteCombo, costoPorcionReceta
  } = useCombos(recetas, menuItems)

  const loading = activeTab === 'recetas' ? loadingRecetas : loadingCombos
  const error = activeTab === 'recetas' ? errorRecetas : errorCombos

  const handleRefresh = () => {
    if (activeTab === 'recetas') fetchAll()
    else fetchCombos()
  }

  // Buscar
  const filteredRecetas = useMemo(() => {
    if (!search.trim()) return recetas
    const q = normalizeSearch(search)
    return recetas.filter(r =>
      normalizeSearch(r.nombre).includes(q) ||
      normalizeSearch(r._menuItem?.nombre).includes(q)
    )
  }, [recetas, search])

  const filteredCombos = useMemo(() => {
    if (!search.trim()) return combos
    const q = normalizeSearch(search)
    return combos.filter(c =>
      normalizeSearch(c.nombre).includes(q) ||
      normalizeSearch(c._menuItem?.nombre).includes(q)
    )
  }, [combos, search])

  // Stats Recetas
  const statsRecetas = useMemo(() => {
    const conMargen = recetas.filter(r => r._margen !== null)
    const bajoMargen = conMargen.filter(r => r._margen < 30)
    return {
      total: recetas.length,
      bajoMargen: bajoMargen.length,
    }
  }, [recetas])

  // Stats Combos
  const statsCombos = useMemo(() => {
    const conMargen = combos.filter(c => c._margen !== null)
    const bajoMargen = conMargen.filter(c => c._margen < 30)
    return {
      total: combos.length,
      bajoMargen: bajoMargen.length,
    }
  }, [combos])

  const stats = activeTab === 'recetas' ? statsRecetas : statsCombos

  // Handlers Modal
  const openNew = () => { setEditItem(null); setModalOpen(true) }
  const openEdit = (item) => { setEditItem(item); setModalOpen(true) }

  const handleSaveReceta = async (id, data) => {
    return id ? updateReceta(id, data) : createReceta(data)
  }

  const handleSaveCombo = async (id, data) => {
    return id ? updateCombo(id, data) : createCombo(data)
  }

  // Handler Delete
  const handleDeleteTarget = (item, type) => {
    setDeleteTarget({ data: item, type })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    if (deleteTarget.type === 'receta') {
      await deleteReceta(deleteTarget.data.id)
    } else {
      await deleteCombo(deleteTarget.data.id)
    }
    setDeleteTarget(null); setDeleting(false)
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto flex flex-col h-full">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Fichas Técnicas
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Recetas y combos con cálculo de costo automático
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={loading}
            className="p-2 rounded-lg disabled:opacity-50 transition-all"
            style={{ border: '1px solid var(--border)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
          </button>
          
          {activeTab === 'recetas' ? (
            <button onClick={openNew}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 16px rgba(124,58,237,0.25)' }}>
              <Plus size={15} />
              <span className="hidden sm:inline">Nueva receta</span>
              <span className="sm:hidden">Nueva</span>
            </button>
          ) : (
            <button onClick={openNew}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.25)' }}>
              <Plus size={15} />
              <span className="hidden sm:inline">Nuevo combo</span>
              <span className="sm:hidden">Nuevo</span>
            </button>
          )}
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => setActiveTab('recetas')}
          className={`pb-3 text-sm font-medium flex items-center gap-2 transition-colors relative`}
          style={{ color: activeTab === 'recetas' ? 'var(--text-primary)' : 'var(--text-muted)' }}
        >
          <ChefHat size={16} style={{ color: activeTab === 'recetas' ? 'var(--accent)' : 'inherit' }} />
          Recetas Individuales
          {activeTab === 'recetas' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full" style={{ background: 'var(--accent)' }} />
          )}
        </button>
        <button
          onClick={() => setActiveTab('combos')}
          className={`pb-3 text-sm font-medium flex items-center gap-2 transition-colors relative`}
          style={{ color: activeTab === 'combos' ? 'var(--text-primary)' : 'var(--text-muted)' }}
        >
          <Package size={16} style={{ color: activeTab === 'combos' ? '#f97316' : 'inherit' }} />
          Combos
          {activeTab === 'combos' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full" style={{ background: '#f97316' }} />
          )}
        </button>
      </div>

      {/* Controles: Stats y Buscador */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        {/* Buscador */}
        <div className="relative w-full max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xmuted)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={activeTab === 'recetas' ? "Buscar receta…" : "Buscar combo…"}
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none transition-all"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Stats rápidas */}
        {!loading && stats.total > 0 && (
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{stats.total}</span> {activeTab === 'recetas' ? 'recetas' : 'combos'}
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
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* ═══════ TABLA ═══════ */}
      <div className="flex-1 min-h-0 relative">
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-lg" />)}
          </div>
        ) : (
          <>
            {activeTab === 'recetas' && filteredRecetas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 border rounded-xl" style={{ borderColor: 'var(--border)' }}>
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
            ) : activeTab === 'combos' && filteredCombos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 border rounded-xl" style={{ borderColor: 'var(--border)' }}>
                <Package size={36} style={{ color: 'var(--text-xmuted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {search ? `Sin resultados para "${search}"` : 'No hay combos todavía'}
                </p>
                {!search && (
                  <button onClick={openNew} className="text-xs" style={{ color: '#f97316' }}>
                    + Crear primer combo
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden shadow-sm"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th className="w-10" />
                        {activeTab === 'recetas' ? (
                          ['Receta', 'Producto', 'Ing.', 'Costo', 'Venta', 'Margen', ''].map((h, i) => (
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
                          ))
                        ) : (
                          ['Combo', 'Producto', 'Piezas', 'Costo', 'Venta', 'Margen', ''].map((h, i) => (
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
                          ))
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {activeTab === 'recetas' ? (
                        filteredRecetas.map(r => (
                          <RecetaRow key={r.id} receta={r} recetas={recetas} onEdit={openEdit} onDelete={handleDeleteTarget} />
                        ))
                      ) : (
                        filteredCombos.map(c => (
                          <ComboRow key={c.id} combo={c} onEdit={openEdit} onDelete={handleDeleteTarget} />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal crear/editar receta */}
      {activeTab === 'recetas' && (
        <RecetaModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditItem(null) }}
          receta={editItem}
          recetas={recetas}
          stockItems={stockItems}
          menuItems={menuItems}
          onSave={handleSaveReceta}
          costoIngrediente={costoIngrediente}
        />
      )}

      {/* Modal crear/editar combo */}
      {activeTab === 'combos' && (
        <ComboModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditItem(null) }}
          combo={editItem}
          recetasDisponibles={recetas}
          menuItems={menuItems}
          onSave={handleSaveCombo}
          costoPorcionReceta={costoPorcionReceta}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.3)' }}>
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto"
                style={{ background: 'rgba(239,68,68,0.1)' }}>
                <Trash2 size={18} style={{ color: '#ef4444' }} />
              </div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                ¿Eliminar {deleteTarget.type}?
              </p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                "<span style={{ color: 'var(--text-primary)' }}>{deleteTarget.data.nombre}</span>" se eliminará permanentemente.
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
