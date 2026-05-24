import { useEffect, useMemo, useState } from 'react'
import { X, Plus, Minus, Search, Loader2, ShoppingBag, MessageSquare, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { normalizeSearch } from '../../utils/normalize'
import { parseCurrencyValue } from '../../lib/orders'
import { formatMoney } from '../../lib/printing'

/**
 * Modal "Adicionar" — layout tipo POS, casi pantalla completa.
 *  - Header en accent con número de mesa
 *  - Buscador grande arriba (sin filtros)
 *  - Grid de productos del menú (categorizados) — al hacer click se agregan al carrito
 *  - Carrito con cantidad +/-, notas inline editable, precio editable, eliminar
 *  - Footer fijo con total y botones Cancelar / Confirmar
 */
export default function AgregarItemsModal({ open, mesa, onClose, onAdd }) {
  const [items,         setItems]         = useState([])
  const [search,        setSearch]        = useState('')
  const [menuItems,     setMenuItems]     = useState([])
  const [loadingMenu,   setLoadingMenu]   = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState(null)
  const [variantePopup, setVariantePopup] = useState(null)
  const [notasOpenKey,  setNotasOpenKey]  = useState(null)

  useEffect(() => {
    if (!open) return
    setLoadingMenu(true)
    supabase
      .from('menu_items')
      .select('id, nombre, precio, categoria, tipo, menu_item_variantes(*)')
      .eq('activo', true)
      .order('categoria')
      .order('orden')
      .then(({ data }) => {
        const sorted = (data || []).map(it => ({
          ...it,
          menu_item_variantes: (it.menu_item_variantes || [])
            .sort((a, b) => (a.orden || 0) - (b.orden || 0)),
        }))
        setMenuItems(sorted)
        setLoadingMenu(false)
      })
  }, [open])

  useEffect(() => {
    if (!open) {
      setItems([]); setSearch(''); setError(null); setVariantePopup(null); setNotasOpenKey(null)
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!search.trim()) return menuItems
    const q = normalizeSearch(search)
    return menuItems.filter(m => normalizeSearch(m.nombre).includes(q))
  }, [search, menuItems])

  // Agrupar por categoría para mostrar en grid
  const grouped = useMemo(() => {
    const map = {}
    for (const m of filtered) {
      const cat = m.categoria || 'Otros'
      if (!map[cat]) map[cat] = []
      map[cat].push(m)
    }
    return Object.entries(map)
  }, [filtered])

  const handleSelectItem = (menuItem) => {
    const variantes = menuItem.menu_item_variantes || []
    if (variantes.length > 0) setVariantePopup(menuItem)
    else addItem(menuItem, null)
  }

  const addItem = (menuItem, variante) => {
    const precio = variante
      ? parseCurrencyValue(variante.precio)
      : parseCurrencyValue(menuItem.precio)

    const itemKey = variante
      ? `${menuItem.id}_${variante.id}`
      : menuItem.id

    const displayName = variante
      ? `${menuItem.nombre} (${variante.nombre})`
      : menuItem.nombre

    setItems(prev => {
      const existing = prev.find(i => i._key === itemKey)
      if (existing) return prev.map(i =>
        i._key === itemKey ? { ...i, cantidad: i.cantidad + 1 } : i
      )
      return [...prev, {
        _key:            itemKey,
        menu_item_id:    menuItem.id,
        variante_id:     variante?.id || null,
        nombre:          displayName,
        precio_unitario: precio,
        cantidad:        1,
        notas:           '',
      }]
    })
    setVariantePopup(null)
  }

  const updateCantidad = (key, delta) => {
    setItems(prev => prev
      .map(i => i._key === key ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i)
      .filter(i => i.cantidad > 0)
    )
  }

  const updatePrecio = (key, nuevo) => {
    setItems(prev => prev.map(i =>
      i._key === key ? { ...i, precio_unitario: parseCurrencyValue(nuevo) } : i
    ))
  }

  const updateNotas = (key, notas) => {
    setItems(prev => prev.map(i =>
      i._key === key ? { ...i, notas } : i
    ))
  }

  const removeItem = (key) => setItems(prev => prev.filter(i => i._key !== key))

  const total = items.reduce((acc, i) => acc + (i.precio_unitario * i.cantidad), 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (items.length === 0) { setError('Agregá al menos un item.'); return }
    setSaving(true); setError(null)
    const { error: err } = await onAdd?.(items) || {}
    setSaving(false)
    if (err) { setError(err.message || 'Error al agregar items.'); return }
    onClose?.()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 md:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-5xl h-[92vh] rounded-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
      >
        {/* Header en accent */}
        <div
          className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
            color: '#ffffff',
            borderBottom: '1px solid var(--accent-border)',
          }}
        >
          <p className="font-semibold text-base flex items-center gap-2">
            Mesa <span style={{ color: 'var(--accent-lift)' }}>{mesa?.numero ?? '—'}</span>
            {mesa?.nombre && <span className="text-xs font-normal opacity-80">({mesa.nombre})</span>}
            <span className="ml-2 text-xs font-medium opacity-80">· Adicionar productos</span>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#ffffff' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* LEFT — buscador + grid productos */}
          <div className="flex-1 flex flex-col overflow-hidden md:border-r" style={{ borderColor: 'var(--border)' }}>
            <div className="p-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                Buscar producto
              </p>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xmuted)' }} />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  className="w-full pl-9 pr-3 py-3 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingMenu ? (
                <div className="flex justify-center py-10">
                  <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-lift)' }} />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-center py-10" style={{ color: 'var(--text-xmuted)' }}>Sin resultados</p>
              ) : (
                grouped.map(([categoria, productos]) => (
                  <div key={categoria} className="mb-5">
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--text-muted)' }}>
                      {categoria} <span style={{ color: 'var(--text-xmuted)' }}>· {productos.length}</span>
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {productos.map(m => {
                        const hasVariantes = (m.menu_item_variantes || []).length > 0
                        const inCart = items.find(i => i.menu_item_id === m.id)
                        const precioMin = hasVariantes
                          ? Math.min(...m.menu_item_variantes.map(v => parseCurrencyValue(v.precio)))
                          : parseCurrencyValue(m.precio)
                        return (
                          <button
                            key={m.id} type="button"
                            onClick={() => handleSelectItem(m)}
                            className="flex flex-col items-start gap-1 p-3 rounded-lg text-left transition-all"
                            style={{
                              background: inCart ? 'var(--accent-soft)' : 'var(--bg-input)',
                              border: inCart ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                            }}
                            onMouseEnter={e => { if (!inCart) e.currentTarget.style.background = 'var(--bg-hover)' }}
                            onMouseLeave={e => { if (!inCart) e.currentTarget.style.background = 'var(--bg-input)' }}
                          >
                            <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
                              {m.nombre}
                            </p>
                            <div className="flex items-center justify-between w-full mt-auto pt-1">
                              <span className="text-[11px] font-bold" style={{ color: 'var(--accent-lift)' }}>
                                {hasVariantes ? 'desde $' : '$'}{formatMoney(precioMin)}
                              </span>
                              {hasVariantes && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)' }}>
                                  {m.menu_item_variantes.length} variantes
                                </span>
                              )}
                              {inCart && !hasVariantes && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{ background: 'var(--accent)', color: '#fff' }}>
                                  ×{inCart.cantidad}
                                </span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Popup de variantes */}
            {variantePopup && (
              <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-black/50">
                <div className="rounded-xl p-4 max-w-sm w-full space-y-3"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--accent-border)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {variantePopup.nombre}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Elegí el tamaño:</p>
                  <div className="space-y-1.5">
                    {(variantePopup.menu_item_variantes || []).map(v => (
                      <button
                        key={v.id} type="button"
                        onClick={() => addItem(variantePopup, v)}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-lift)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                      >
                        <span>{v.nombre}</span>
                        <span className="font-bold" style={{ color: 'var(--accent-lift)' }}>${formatMoney(parseCurrencyValue(v.precio))}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => setVariantePopup(null)}
                    className="text-xs font-medium w-full text-center py-1" style={{ color: 'var(--text-muted)' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — carrito */}
          <div className="md:w-[380px] flex flex-col overflow-hidden flex-shrink-0" style={{ background: 'var(--bg-input)' }}>
            <div className="p-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Items a agregar
                {items.length > 0 && <span className="ml-1" style={{ color: 'var(--accent-lift)' }}>({items.length})</span>}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {items.length === 0 ? (
                <p className="text-xs text-center py-10" style={{ color: 'var(--text-xmuted)' }}>
                  Tocá un producto de la izquierda para agregarlo
                </p>
              ) : (
                items.map(item => (
                  <div key={item._key}
                    className="rounded-lg p-2.5 space-y-2"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
                        {item.nombre}
                      </p>
                      <button type="button" onClick={() => removeItem(item._key)}
                        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                        style={{ color: '#f87171' }}>
                        <X size={12} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-md" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                        <button type="button" onClick={() => updateCantidad(item._key, -1)}
                          className="w-7 h-7 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                          <Minus size={11} />
                        </button>
                        <span className="text-xs font-bold w-7 text-center" style={{ color: 'var(--text-primary)' }}>
                          {item.cantidad}
                        </span>
                        <button type="button" onClick={() => updateCantidad(item._key, 1)}
                          className="w-7 h-7 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                          <Plus size={11} />
                        </button>
                      </div>

                      <button type="button"
                        onClick={() => setNotasOpenKey(notasOpenKey === item._key ? null : item._key)}
                        className="w-7 h-7 rounded-md flex items-center justify-center"
                        style={{
                          background: item.notas ? 'var(--accent-soft)' : 'var(--bg-input)',
                          border: '1px solid var(--border)',
                          color: item.notas ? 'var(--accent-lift)' : 'var(--text-muted)',
                        }}
                        title={item.notas ? `Notas: ${item.notas}` : 'Agregar nota'}
                      >
                        <MessageSquare size={11} />
                      </button>

                      <div className="flex-1 flex items-center gap-1 px-2 py-1 rounded-md"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>$</span>
                        <input
                          type="number" min={0} step="100"
                          value={item.precio_unitario}
                          onChange={e => updatePrecio(item._key, e.target.value)}
                          className="w-full text-xs outline-none bg-transparent text-right"
                          style={{ color: 'var(--text-primary)' }}
                        />
                      </div>
                    </div>

                    {notasOpenKey === item._key && (
                      <input
                        type="text"
                        value={item.notas}
                        onChange={e => updateNotas(item._key, e.target.value)}
                        placeholder="Sin cebolla, bien hecho, etc."
                        autoFocus
                        className="w-full px-2 py-1.5 rounded text-[11px] outline-none"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--accent-border)', color: 'var(--text-primary)' }}
                      />
                    )}

                    <div className="flex justify-end text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      Subtotal: <span className="ml-1 font-bold" style={{ color: 'var(--accent-lift)' }}>
                        ${formatMoney(item.precio_unitario * item.cantidad)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer carrito */}
            <div className="flex-shrink-0 p-3 space-y-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              {error && (
                <div className="rounded-md px-2 py-1.5 text-[11px] flex items-center gap-1.5"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
                  <AlertCircle size={11} /> {error}
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Total a confirmar</span>
                <span className="text-lg font-bold" style={{ color: 'var(--accent-lift)' }}>
                  ${formatMoney(total)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={onClose}
                  className="py-2 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving || items.length === 0}
                  className="py-2 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
                    boxShadow: '0 4px 12px rgba(var(--accent-rgb),0.3)',
                  }}>
                  {saving
                    ? <><Loader2 size={12} className="animate-spin" /> Guardando…</>
                    : <><ShoppingBag size={12} /> Confirmar</>
                  }
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
