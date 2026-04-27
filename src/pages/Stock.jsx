import { useState, useMemo } from 'react'
import {
  Plus, RefreshCw, Package, AlertTriangle, CheckCircle2,
  Minus, Truck, History, Edit2, Trash2, ChevronDown, ChevronUp
} from 'lucide-react'
import { useStock, ESTADO_STOCK, ESTADO_CONFIG } from '../hooks/useStock'
import MovimientoModal from '../components/stock/MovimientoModal'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Progress bar de stock ─────────────────────────────────────────────────────
function StockBar({ actual, minimo }) {
  const pct    = minimo > 0 ? Math.min((actual / (minimo * 2)) * 100, 100) : 100
  const estado = ESTADO_STOCK({ stock_actual: actual, stock_minimo: minimo })
  const color  = ESTADO_CONFIG[estado].color
  return (
    <div className="h-1.5 rounded-full overflow-hidden flex-1" style={{ background: '#2a2a2e' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(pct, 2)}%`, background: color }}
      />
    </div>
  )
}

// ── Fila de ingrediente ───────────────────────────────────────────────────────
function StockRow({ item, onMovimiento, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const estado  = ESTADO_STOCK(item)
  const cfg     = ESTADO_CONFIG[estado]
  const movs    = [...(item.stock_movimientos || [])].sort((a, b) =>
    b.created_at > a.created_at ? 1 : -1).slice(0, 5)
  const pct     = item.stock_minimo > 0
    ? Math.round((item.stock_actual / item.stock_minimo) * 100)
    : 100

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${cfg.border}`, background: cfg.bg }}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Estado dot */}
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all"
          style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }} />

        {/* Nombre + proveedor */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white">{item.nombre}</p>
            {item.proveedor && (
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#2a2a2e', color: '#52525b' }}>
                {item.proveedor}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <StockBar actual={item.stock_actual} minimo={item.stock_minimo} />
            <span className="text-[10px] flex-shrink-0 font-medium" style={{ color: cfg.color }}>
              {pct}%
            </span>
          </div>
        </div>

        {/* Stock actual */}
        <div className="text-right flex-shrink-0 mr-2">
          <p className="text-sm font-bold text-white">
            {parseFloat(item.stock_actual).toFixed(1)}
            <span className="text-xs font-normal ml-1" style={{ color: '#52525b' }}>{item.unidad}</span>
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: '#3f3f46' }}>
            mín: {parseFloat(item.stock_minimo).toFixed(1)} {item.unidad}
          </p>
        </div>

        {/* Quick adjust buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onMovimiento(item, false)}
            title="Registrar entrada / merma"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all hover:opacity-80"
            style={{ background: 'linear-gradient(135deg, #34d399, #059669)' }}>
            <Truck size={11} /> Entrada
          </button>

          <button onClick={() => setExpanded(e => !e)}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
            style={{ color: '#52525b' }}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          <button onClick={() => onEdit(item)}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
            style={{ color: '#52525b' }}
            onMouseEnter={e => e.currentTarget.style.color = '#a1a1aa'}
            onMouseLeave={e => e.currentTarget.style.color = '#52525b'}>
            <Edit2 size={12} />
          </button>

          <button onClick={() => onDelete(item)}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/10 transition-colors"
            style={{ color: '#52525b' }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = '#52525b'}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Historial expandible */}
      {expanded && (
        <div className="px-4 pb-3 space-y-1.5" style={{ borderTop: `1px solid ${cfg.border}` }}>
          <p className="text-[10px] uppercase tracking-wide pt-3 flex items-center gap-1.5"
            style={{ color: '#3f3f46' }}>
            <History size={10} /> Últimos movimientos
          </p>
          {movs.length === 0 ? (
            <p className="text-xs italic" style={{ color: '#3f3f46' }}>Sin movimientos registrados</p>
          ) : (
            movs.map(m => {
              const tipoColor = { entrada: '#34d399', salida: '#f87171', ajuste: '#4f8ef7', merma: '#fbbf24' }
              return (
                <div key={m.id} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="capitalize px-1.5 py-0.5 rounded font-medium"
                      style={{ background: `${tipoColor[m.tipo]}15`, color: tipoColor[m.tipo] }}>
                      {m.tipo}
                    </span>
                    <span style={{ color: '#52525b' }}>
                      {formatDistanceToNow(new Date(m.created_at), { locale: es, addSuffix: true })}
                    </span>
                    {m.notas && <span className="italic truncate max-w-32" style={{ color: '#3f3f46' }}>· {m.notas}</span>}
                  </div>
                  <span className="font-semibold" style={{ color: tipoColor[m.tipo] }}>
                    → {parseFloat(m.stock_despues).toFixed(1)}
                  </span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function StockPage() {
  const [filtro,      setFiltro]      = useState('todos')
  const [modalItem,   setModalItem]   = useState(null)   // item para movimiento
  const [modalEdit,   setModalEdit]   = useState(null)   // item para editar (null = nuevo)
  const [modoEdicion, setModoEdicion] = useState(false)
  const [deleteTarget,setDeleteTarget]= useState(null)
  const [deleting,    setDeleting]    = useState(false)

  const { items, stats, loading, error, fetchStock,
          registrarMovimiento, createItem, updateItem, deleteItem } = useStock()

  // Filtrar
  const filtered = useMemo(() => {
    if (filtro === 'alertas') return items.filter(i => ['critico','bajo'].includes(ESTADO_STOCK(i)))
    if (filtro === 'ok')      return items.filter(i => ['ok','medio'].includes(ESTADO_STOCK(i)))
    return items
  }, [items, filtro])

  // Ordenar: críticos primero, luego bajos, luego el resto
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
      nombre:       form.nombre,
      stock_actual: parseFloat(form.stock_actual) || 0,
      stock_minimo: parseFloat(form.stock_minimo) || 0,
      unidad:       form.unidad || 'kg',
      proveedor:    form.proveedor || null,
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
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Inventario</h1>
          <p className="text-sm mt-0.5" style={{ color: '#52525b' }}>Stock de ingredientes en tiempo real</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <button onClick={fetchStock} disabled={loading}
            className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-50 transition-all"
            style={{ border: '1px solid #2a2a2e' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: '#52525b' }} />
          </button>
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
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
          { label: 'Críticos', value: stats.criticos, icon: AlertTriangle, color: '#f87171' },
          { label: 'Stock bajo', value: stats.bajos,  icon: AlertTriangle, color: '#fbbf24' },
          { label: 'OK',        value: stats.ok,      icon: CheckCircle2,  color: '#34d399' },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: '#1c1c1f', border: '1px solid #2a2a2e' }}>
              <Icon size={16} style={{ color: s.color }} />
              <div>
                <p className="text-xl font-bold text-white leading-none">{s.value}</p>
                <p className="text-xs mt-0.5" style={{ color: '#52525b' }}>{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex gap-1.5">
        {[
          { id: 'todos',   label: `Todos (${stats.total})` },
          { id: 'alertas', label: `⚠️ Alertas (${stats.criticos + stats.bajos})` },
          { id: 'ok',      label: `✅ OK (${stats.ok})` },
        ].map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={filtro === f.id
              ? { background: 'rgba(124,58,237,0.12)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.3)' }
              : { color: '#52525b', border: '1px solid #2a2a2e' }
            }>
            {f.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Package size={36} style={{ color: '#2a2a2e' }} />
          <p className="text-sm" style={{ color: '#52525b' }}>
            {filtro !== 'todos' ? 'No hay ingredientes en esta categoría' : 'No hay ingredientes en el inventario'}
          </p>
          {filtro === 'todos' && (
            <button onClick={openNew} className="text-xs" style={{ color: '#7c3aed' }}>
              + Agregar primer ingrediente
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(item => (
            <StockRow
              key={item.id}
              item={item}
              onMovimiento={openMovimiento}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ))}
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
            style={{ background: '#1c1c1f', border: '1px solid #2a2a2e', boxShadow: '0 32px 64px rgba(0,0,0,0.5)' }}>
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto"
                style={{ background: 'rgba(239,68,68,0.1)' }}>
                <Trash2 size={18} style={{ color: '#f87171' }} />
              </div>
              <p className="font-semibold text-white">¿Eliminar ingrediente?</p>
              <p className="text-sm" style={{ color: '#52525b' }}>
                "<span className="text-white/70">{deleteTarget.nombre}</span>" y todo su historial se eliminará.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium hover:bg-white/5"
                style={{ color: '#71717a', border: '1px solid #2a2a2e' }}>Cancelar</button>
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
