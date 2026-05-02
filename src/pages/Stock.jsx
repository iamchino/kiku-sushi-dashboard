import { useState, useMemo } from 'react'
import { Plus, RefreshCw, Package, AlertTriangle, CheckCircle2, Truck, Edit2, Trash2, Search, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { useStock, ESTADO_STOCK, ESTADO_CONFIG, costoReal, CATEGORIAS_STOCK } from '../hooks/useStock'
import { normalizeSearch } from '../utils/normalize'
import MovimientoModal from '../components/stock/MovimientoModal'

function PrecioCell({ item, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const start = () => { setValue(item.precio_unitario ?? ''); setEditing(true) }
  const save = async () => {
    setEditing(false)
    const v = parseFloat(value)
    if (!isNaN(v) && v !== parseFloat(item.precio_unitario)) await onSave(item.id, v)
  }
  if (editing) return (
    <input type="number" step="0.01" min="0" value={value}
      onChange={e => setValue(e.target.value)} onBlur={save}
      onKeyDown={e => e.key === 'Enter' && save()} autoFocus
      className="w-20 px-2 py-1 rounded text-sm text-right outline-none"
      style={{ background: 'var(--bg-input)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }} />
  )
  const precio = parseFloat(item.precio_unitario) || 0
  return (
    <button onClick={start} title="Click para editar"
      className="px-2 py-1 rounded text-sm text-right transition-colors w-20"
      style={{ color: precio > 0 ? 'var(--text-primary)' : 'var(--text-xmuted)', background: 'transparent' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      {precio > 0 ? `$${precio.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : '—'}
    </button>
  )
}

function EstadoBadge({ item }) {
  const estado = ESTADO_STOCK(item)
  const cfg = ESTADO_CONFIG[estado]
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  )
}

const TIPO_MOV = {
  entrada: { label: 'Entrada', color: '#22c55e', icon: '📥' },
  merma:   { label: 'Merma',   color: '#ef4444', icon: '📤' },
  ajuste:  { label: 'Ajuste',  color: '#3b82f6', icon: '🔄' },
}

function ItemRow({ item, updatePrecio, openMovimiento, openEdit, setDeleteTarget }) {
  const [showHistory, setShowHistory] = useState(false)
  const costo = costoReal(item)
  const rend = parseFloat(item.rendimiento) || 1
  const movs = item.stock_movimientos || []

  return (
    <>
      <tr className="transition-colors group"
        style={{ borderBottom: '1px solid var(--border)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <td className="pl-3 pr-1 py-3">
          <button onClick={() => setShowHistory(h => !h)} disabled={movs.length === 0 && !item.notas}
            className="w-6 h-6 rounded flex items-center justify-center transition-colors disabled:opacity-20"
            style={{ color: 'var(--text-xmuted)' }}
            title={movs.length > 0 || item.notas ? 'Ver detalles' : 'Sin detalles'}>
            {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </td>
        <td className="px-3 py-3">
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.nombre}</span>
          <span className="md:hidden block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {parseFloat(item.stock_actual).toFixed(1)} {item.unidad}
          </span>
        </td>
        <td className="px-3 py-3 hidden md:table-cell">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.proveedor || '—'}</span>
        </td>
        <td className="px-3 py-3 hidden md:table-cell">
          <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {parseFloat(item.stock_actual).toFixed(1)}
          </span>
          <span className="text-xs ml-1" style={{ color: 'var(--text-xmuted)' }}>{item.unidad}</span>
        </td>
        <td className="px-3 py-3 hidden md:table-cell">
          <span className="tabular-nums text-sm" style={{ color: 'var(--text-xmuted)' }}>
            {parseFloat(item.stock_minimo).toFixed(1)}
          </span>
        </td>
        <td className="px-3 py-3"><EstadoBadge item={item} /></td>
        <td className="px-3 py-3 hidden md:table-cell"><PrecioCell item={item} onSave={updatePrecio} /></td>
        <td className="px-3 py-3 hidden lg:table-cell">
          {costo > 0 ? (
            <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
              ${costo.toFixed(2)}/{item.unidad}
            </span>
          ) : <span className="text-xs" style={{ color: 'var(--text-xmuted)' }}>—</span>}
          {rend < 1 && costo > 0 && (
            <span className="block text-[10px]" style={{ color: 'var(--text-xmuted)' }}>Rend. {Math.round(rend * 100)}%</span>
          )}
        </td>
        <td className="px-2 py-3">
          <div className="flex items-center gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => openMovimiento(item)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold text-white hover:opacity-80"
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
              <Truck size={11} /><span className="hidden sm:inline">Entrada</span>
            </button>
            <button onClick={() => openEdit(item)}
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ color: 'var(--text-xmuted)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}>
              <Edit2 size={12} />
            </button>
            <button onClick={() => setDeleteTarget(item)}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/10"
              style={{ color: 'var(--text-xmuted)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}>
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      </tr>

      {showHistory && (movs.length > 0 || item.notas) && (
        <tr><td colSpan={9} style={{ padding: 0, background: 'var(--bg-input)' }}>
          <div className="px-5 py-3 mx-3 my-1 rounded-lg space-y-4" style={{ border: '1px solid var(--border)' }}>
            
            {item.notas && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
                    Notas del ingrediente
                  </span>
                </div>
                <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                  {item.notas}
                </p>
              </div>
            )}

            {movs.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock size={11} style={{ color: 'var(--text-xmuted)' }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-xmuted)' }}>
                    Historial de movimientos
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-0">
                  {movs.slice(0, 20).map(m => {
                    const cfg = TIPO_MOV[m.tipo] || { label: m.tipo, color: '#a1a1aa', icon: '📋' }
                    const fecha = new Date(m.created_at)
                    return (
                      <div key={m.id} className="flex items-center gap-3 py-1.5 text-xs"
                        style={{ borderBottom: '1px solid var(--border)' }}>
                        <span>{cfg.icon}</span>
                        <span className="font-medium w-12 flex-shrink-0" style={{ color: cfg.color }}>{cfg.label}</span>
                        <span className="tabular-nums w-16 flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                          {m.tipo === 'merma' ? '-' : '+'}{parseFloat(m.cantidad).toFixed(1)} {item.unidad}
                        </span>
                        <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: 'var(--text-xmuted)' }}>
                          {parseFloat(m.stock_antes ?? 0).toFixed(1)} → {parseFloat(m.stock_despues ?? 0).toFixed(1)}
                        </span>
                        {m.notas && <span className="flex-1 truncate text-[10px]" style={{ color: 'var(--text-xmuted)' }}>{m.notas}</span>}
                        <span className="text-[10px] tabular-nums flex-shrink-0 ml-auto" style={{ color: 'var(--text-xmuted)' }}>
                          {fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })} {fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
          </div>
        </td></tr>
      )}
    </>
  )
}

export default function StockPage() {
  const [categoria, setCategoria] = useState('todos')
  const [estadoFiltro, setEstadoFiltro] = useState('todos')
  const [search, setSearch] = useState('')
  const [modalItem, setModalItem] = useState(null)
  const [modalEdit, setModalEdit] = useState(null)
  const [modoEdicion, setModoEdicion] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [ordenFilas, setOrdenFilas] = useState('estado') // 'estado' | 'az' | 'reciente'

  const { items, stats, loading, error, fetchStock, registrarMovimiento, updatePrecio, createItem, updateItem, deleteItem } = useStock()

  const filtered = useMemo(() => {
    let list = items
    if (categoria !== 'todos') {
      list = list.filter(i => {
        const catId = (i.categoria || 'Almacen').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
        return catId === categoria
      })
    }
    if (estadoFiltro === 'alertas') list = list.filter(i => ['critico', 'bajo'].includes(ESTADO_STOCK(i)))
    if (estadoFiltro === 'ok') list = list.filter(i => ['ok', 'medio'].includes(ESTADO_STOCK(i)))
    if (search.trim()) {
      const q = normalizeSearch(search)
      list = list.filter(i => normalizeSearch(i.nombre).includes(q) || normalizeSearch(i.proveedor).includes(q))
    }

    return [...list].sort((a, b) => {
      if (ordenFilas === 'az') {
        return a.nombre.localeCompare(b.nombre)
      }
      if (ordenFilas === 'reciente') {
        const dateA = new Date(a.created_at || 0).getTime()
        const dateB = new Date(b.created_at || 0).getTime()
        // Buscar el último movimiento si lo hay
        const lastMovA = a.stock_movimientos?.[0]?.created_at
        const lastMovB = b.stock_movimientos?.[0]?.created_at
        const finalDateA = lastMovA ? new Date(lastMovA).getTime() : dateA
        const finalDateB = lastMovB ? new Date(lastMovB).getTime() : dateB
        return finalDateB - finalDateA // más reciente primero
      }
      // por defecto 'estado'
      const ordenEst = { critico: 0, bajo: 1, medio: 2, ok: 3 }
      return ordenEst[ESTADO_STOCK(a)] - ordenEst[ESTADO_STOCK(b)]
    })
  }, [items, categoria, estadoFiltro, search, ordenFilas])

  const openMovimiento = (item) => { setModalItem(item); setModoEdicion(false) }
  const openEdit = (item) => { setModalEdit(item); setModoEdicion(true) }
  const openNew = () => { setModalEdit(null); setModoEdicion(true) }

  const handleSaveItem = async (form) => {
    const payload = {
      nombre: form.nombre, stock_actual: parseFloat(form.stock_actual) || 0,
      stock_minimo: parseFloat(form.stock_minimo) || 0, unidad: form.unidad || 'kg',
      proveedor: form.proveedor || null, precio_unitario: parseFloat(form.precio_unitario) || 0,
      rendimiento: parseFloat(form.rendimiento) || 1, categoria: form.categoria || 'Almacen',
      notas: form.notas || null,
    }
    return modalEdit ? updateItem(modalEdit.id, payload) : createItem(payload)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true); await deleteItem(deleteTarget.id); setDeleteTarget(null); setDeleting(false)
  }

  // Etiqueta de la categoría activa
  const catLabel = categoria === 'todos'
    ? 'Todos los ingredientes'
    : CATEGORIAS_STOCK.find(c => c.id === categoria)?.label || categoria

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Inventario</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Ingredientes, precios y stock en tiempo real</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchStock} disabled={loading}
            className="p-2 rounded-lg disabled:opacity-50"
            style={{ border: '1px solid var(--border)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:scale-105 transition-all"
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
          { label: 'Críticos',   value: stats.criticos, icon: AlertTriangle, color: '#ef4444' },
          { label: 'Stock bajo', value: stats.bajos,    icon: AlertTriangle, color: '#f59e0b' },
          { label: 'OK',         value: stats.ok,       icon: CheckCircle2,  color: '#22c55e' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
            <s.icon size={16} style={{ color: s.color }} />
            <div>
              <p className="text-xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── CONTROLES: Categoría + Estado + Orden + Búsqueda ── */}
      <div className="flex flex-wrap gap-3 items-center">

        {/* Selector de categoría */}
        <div className="relative">
          <select
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className="pl-3 pr-8 py-2 rounded-lg text-sm font-medium outline-none appearance-none cursor-pointer transition-all"
            style={{
              background: categoria !== 'todos' ? 'var(--accent-soft)' : 'var(--bg-input)',
              border: `1px solid ${categoria !== 'todos' ? 'var(--accent-border)' : 'var(--border)'}`,
              color: categoria !== 'todos' ? 'var(--accent)' : 'var(--text-primary)',
            }}>
            <option value="todos">📋 Todas las categorías</option>
            {CATEGORIAS_STOCK.map(c => (
              <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-xmuted)' }} />
        </div>

        {/* Filtros de estado */}
        <div className="flex gap-1">
          {[
            { id: 'todos',   label: 'Todos' },
            { id: 'alertas', label: '⚠️ Alertas' },
            { id: 'ok',      label: '✅ OK' },
          ].map(f => (
            <button key={f.id} onClick={() => setEstadoFiltro(f.id)}
              className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={estadoFiltro === f.id
                ? { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }
                : { color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Selector de Orden */}
        <div className="relative">
          <select
            value={ordenFilas}
            onChange={e => setOrdenFilas(e.target.value)}
            className="pl-3 pr-8 py-2 rounded-lg text-sm font-medium outline-none appearance-none cursor-pointer transition-all"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}>
            <option value="estado">Orden: Por Alertas</option>
            <option value="az">Orden: Alfabético (A-Z)</option>
            <option value="reciente">Orden: Más Recientes</option>
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-xmuted)' }} />
        </div>

        {/* Buscador */}
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xmuted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar ingrediente…"
            className="pl-9 pr-4 py-2 rounded-lg text-sm outline-none w-48"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* ── TABLA ── */}
      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
      ) : (
        <div className="rounded-xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>

          {/* Cabecera de la tabla con título de categoría */}
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {categoria !== 'todos' && CATEGORIAS_STOCK.find(c => c.id === categoria)?.emoji + ' '}
                {catLabel}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                {filtered.length} {filtered.length === 1 ? 'ingrediente' : 'ingredientes'}
              </span>
            </div>
            {(stats.criticos + stats.bajos) > 0 && (
              <span className="text-[11px] font-semibold"
                style={{ color: '#f59e0b' }}>
                ⚠️ {stats.criticos + stats.bajos} con alerta
              </span>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Package size={32} style={{ color: 'var(--text-xmuted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {search ? `Sin resultados para "${search}"` : 'Sin ingredientes en esta categoría'}
              </p>
              {!search && categoria === 'todos' && (
                <button onClick={openNew} className="text-xs" style={{ color: 'var(--accent)' }}>
                  + Agregar primer ingrediente
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['', 'Ingrediente', 'Proveedor', 'Stock', 'Mín', 'Estado', 'Precio/U', 'Costo real', ''].map((h, i) => (
                      <th key={i}
                        className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-left whitespace-nowrap
                          ${i === 0 ? 'w-8' : ''}
                          ${i >= 2 && i <= 4 ? 'hidden md:table-cell' : ''}
                          ${i === 6 ? 'hidden md:table-cell' : ''}
                          ${i === 7 ? 'hidden lg:table-cell' : ''}
                        `}
                        style={{ color: 'var(--text-xmuted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <ItemRow key={item.id} item={item} updatePrecio={updatePrecio}
                      openMovimiento={openMovimiento} openEdit={openEdit} setDeleteTarget={setDeleteTarget} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <MovimientoModal open={!!modalItem && !modoEdicion} onClose={() => setModalItem(null)}
        item={modalItem} onSave={async p => registrarMovimiento(p)} modoEdicion={false} onSaveItem={handleSaveItem} />
      <MovimientoModal open={modoEdicion} onClose={() => { setModoEdicion(false); setModalEdit(null) }}
        item={modalEdit} onSave={async p => registrarMovimiento(p)} modoEdicion={true} onSaveItem={handleSaveItem} />

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.3)' }}>
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <Trash2 size={18} style={{ color: '#ef4444' }} />
              </div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>¿Eliminar ingrediente?</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                "<span style={{ color: 'var(--text-primary)' }}>{deleteTarget.nombre}</span>" y su historial se eliminarán.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>{deleting ? 'Eliminando…' : 'Eliminar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
