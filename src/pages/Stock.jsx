import { useState, useMemo } from 'react'
import {
  Plus, RefreshCw, Package, AlertTriangle, CheckCircle2,
  Truck, Edit2, Trash2, Search
} from 'lucide-react'
import { useStock, ESTADO_STOCK, ESTADO_CONFIG, costoReal } from '../hooks/useStock'
import MovimientoModal from '../components/stock/MovimientoModal'

// ── Celda de precio editable inline ──────────────────────────────────────────
function PrecioCell({ item, onSave }) {
  const [editing, setEditing]   = useState(false)
  const [value,   setValue]     = useState('')

  const start = () => {
    setValue(item.precio_unitario ?? '')
    setEditing(true)
  }

  const save = async () => {
    setEditing(false)
    const v = parseFloat(value)
    if (!isNaN(v) && v !== parseFloat(item.precio_unitario)) {
      await onSave(item.id, v)
    }
  }

  if (editing) {
    return (
      <input
        type="number" step="0.01" min="0"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => e.key === 'Enter' && save()}
        autoFocus
        className="w-20 px-2 py-1 rounded text-sm text-right outline-none"
        style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--accent)',
          color: 'var(--text-primary)',
        }}
      />
    )
  }

  const precio = parseFloat(item.precio_unitario) || 0
  return (
    <button
      onClick={start}
      className="px-2 py-1 rounded text-sm text-right transition-colors w-20 cursor-pointer"
      style={{
        color: precio > 0 ? 'var(--text-primary)' : 'var(--text-xmuted)',
        background: 'transparent',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      title="Click para editar precio"
    >
      {precio > 0 ? `$${precio.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : '—'}
    </button>
  )
}

// ── Badge de estado ──────────────────────────────────────────────────────────
function EstadoBadge({ item }) {
  const estado = ESTADO_STOCK(item)
  const cfg    = ESTADO_CONFIG[estado]
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function StockPage() {
  const [filtro,       setFiltro]       = useState('todos')
  const [search,       setSearch]       = useState('')
  const [modalItem,    setModalItem]    = useState(null)
  const [modalEdit,    setModalEdit]    = useState(null)
  const [modoEdicion,  setModoEdicion]  = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  const {
    items, stats, loading, error, fetchStock,
    registrarMovimiento, updatePrecio, createItem, updateItem, deleteItem,
  } = useStock()

  // Filtrar + buscar
  const filtered = useMemo(() => {
    let list = items
    if (filtro === 'alertas') list = list.filter(i => ['critico','bajo'].includes(ESTADO_STOCK(i)))
    if (filtro === 'ok')      list = list.filter(i => ['ok','medio'].includes(ESTADO_STOCK(i)))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        i.nombre.toLowerCase().includes(q) ||
        (i.proveedor || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [items, filtro, search])

  // Ordenar: críticos primero
  const sorted = useMemo(() => {
    const orden = { critico: 0, bajo: 1, medio: 2, ok: 3 }
    return [...filtered].sort((a, b) => orden[ESTADO_STOCK(a)] - orden[ESTADO_STOCK(b)])
  }, [filtered])

  const openMovimiento = (item) => { setModalItem(item); setModoEdicion(false) }
  const openEdit       = (item) => { setModalEdit(item); setModoEdicion(true)  }
  const openNew        = ()     => { setModalEdit(null); setModoEdicion(true)  }

  const handleSaveMovimiento = async (payload) => registrarMovimiento(payload)

  const handleSaveItem = async (form) => {
    const payload = {
      nombre:          form.nombre,
      stock_actual:    parseFloat(form.stock_actual) || 0,
      stock_minimo:    parseFloat(form.stock_minimo) || 0,
      unidad:          form.unidad || 'kg',
      proveedor:       form.proveedor || null,
      precio_unitario: parseFloat(form.precio_unitario) || 0,
      rendimiento:     parseFloat(form.rendimiento) || 1,
    }
    return modalEdit ? updateItem(modalEdit.id, payload) : createItem(payload)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    await deleteItem(deleteTarget.id)
    setDeleteTarget(null); setDeleting(false)
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Inventario
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Ingredientes, precios y stock en tiempo real
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchStock} disabled={loading}
            className="p-2 rounded-lg disabled:opacity-50 transition-all"
            style={{ border: '1px solid var(--border)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 16px rgba(124,58,237,0.25)' }}>
            <Plus size={15} />
            <span className="hidden sm:inline">Nuevo ingrediente</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Críticos', value: stats.criticos, icon: AlertTriangle, color: '#ef4444' },
          { label: 'Stock bajo', value: stats.bajos,  icon: AlertTriangle, color: '#f59e0b' },
          { label: 'OK',         value: stats.ok,      icon: CheckCircle2,  color: '#22c55e' },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
              <Icon size={16} style={{ color: s.color }} />
              <div>
                <p className="text-xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filtros + Buscador */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex gap-1.5">
          {[
            { id: 'todos',   label: `Todos (${stats.total})` },
            { id: 'alertas', label: `⚠️ Alertas (${stats.criticos + stats.bajos})` },
            { id: 'ok',      label: `✅ OK (${stats.ok})` },
          ].map(f => (
            <button key={f.id} onClick={() => setFiltro(f.id)}
              className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={filtro === f.id
                ? { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }
                : { color: 'var(--text-muted)', border: '1px solid var(--border)' }
              }>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xmuted)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar ingrediente…"
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none transition-all"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TABLA PRINCIPAL
         ═══════════════════════════════════════════════════════════════════════ */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Package size={36} style={{ color: 'var(--text-xmuted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {filtro !== 'todos' || search ? 'Sin resultados' : 'No hay ingredientes en el inventario'}
          </p>
          {filtro === 'todos' && !search && (
            <button onClick={openNew} className="text-xs" style={{ color: 'var(--accent)' }}>
              + Agregar primer ingrediente
            </button>
          )}
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Ingrediente', 'Proveedor', 'Stock', 'Mín', 'Estado', 'Precio/U', 'Costo real', ''].map((h, i) => (
                    <th
                      key={i}
                      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-left whitespace-nowrap
                        ${i >= 1 && i <= 3 ? 'hidden md:table-cell' : ''}
                        ${i === 6 ? 'hidden lg:table-cell' : ''}
                      `}
                      style={{ color: 'var(--text-xmuted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((item, idx) => {
                  const costo = costoReal(item)
                  const rend  = parseFloat(item.rendimiento) || 1
                  return (
                    <tr
                      key={item.id}
                      className="transition-colors group"
                      style={{
                        borderBottom: idx < sorted.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Nombre */}
                      <td className="px-4 py-3">
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.nombre}</span>
                        {/* Mobile: muestra stock abajo del nombre */}
                        <span className="md:hidden block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {parseFloat(item.stock_actual).toFixed(1)} {item.unidad}
                          {parseFloat(item.precio_unitario) > 0 && ` · $${parseFloat(item.precio_unitario).toLocaleString('es-AR')}`}
                        </span>
                      </td>

                      {/* Proveedor */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {item.proveedor || '—'}
                        </span>
                      </td>

                      {/* Stock actual */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {parseFloat(item.stock_actual).toFixed(1)}
                        </span>
                        <span className="text-xs ml-1" style={{ color: 'var(--text-xmuted)' }}>{item.unidad}</span>
                      </td>

                      {/* Mínimo */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="tabular-nums" style={{ color: 'var(--text-xmuted)' }}>
                          {parseFloat(item.stock_minimo).toFixed(1)}
                        </span>
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3">
                        <EstadoBadge item={item} />
                      </td>

                      {/* Precio/Unidad — editable */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <PrecioCell item={item} onSave={updatePrecio} />
                      </td>

                      {/* Costo real */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {costo > 0 ? (
                          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                            ${costo.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/{item.unidad}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-xmuted)' }}>—</span>
                        )}
                        {rend < 1 && costo > 0 && (
                          <span className="block text-[10px] mt-0.5" style={{ color: 'var(--text-xmuted)' }}>
                            Rend. {Math.round(rend * 100)}%
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-0.5 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openMovimiento(item)}
                            title="Registrar entrada"
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all hover:opacity-80"
                            style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                            <Truck size={11} /> <span className="hidden sm:inline">Entrada</span>
                          </button>
                          <button onClick={() => openEdit(item)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                            style={{ color: 'var(--text-xmuted)' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}>
                            <Edit2 size={12} />
                          </button>
                          <button onClick={() => setDeleteTarget(item)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/10"
                            style={{ color: 'var(--text-xmuted)' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal movimiento */}
      <MovimientoModal
        open={!!modalItem && !modoEdicion}
        onClose={() => setModalItem(null)}
        item={modalItem}
        onSave={handleSaveMovimiento}
        modoEdicion={false}
        onSaveItem={handleSaveItem}
      />

      {/* Modal crear/editar item */}
      <MovimientoModal
        open={modoEdicion}
        onClose={() => { setModoEdicion(false); setModalEdit(null) }}
        item={modalEdit}
        onSave={handleSaveMovimiento}
        modoEdicion={true}
        onSaveItem={handleSaveItem}
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
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>¿Eliminar ingrediente?</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                "<span style={{ color: 'var(--text-primary)' }}>{deleteTarget.nombre}</span>" y todo su historial se eliminará.
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
