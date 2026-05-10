import { useState, useEffect, useMemo } from 'react'
import { X, Plus, Minus, Trash2, Search, Loader2, ShoppingBag } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { normalizeSearch } from '../../utils/normalize'

const CANALES = [
  { id: 'salon',     label: '🍽️  Salón'      },
  { id: 'delivery',  label: '🚗  Delivery'    },
  { id: 'whatsapp',  label: '💬  WhatsApp'   },
  { id: 'pedidosya', label: '🟡  PedidosYa'  },
]

export default function NuevoPedidoModal({ open, onClose, onSave }) {
  const [canal,   setCanal]   = useState('salon')
  const [mesa,    setMesa]    = useState('')
  const [notas,   setNotas]   = useState('')
  const [items,   setItems]   = useState([])
  const [search,  setSearch]  = useState('')
  const [menuItems, setMenuItems] = useState([])
  const [loadingMenu, setLoadingMenu] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [variantePopup, setVariantePopup] = useState(null) // menu item que necesita elegir variante

  // Fetch menu items con variantes on open
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
        const sorted = (data || []).map(item => ({
          ...item,
          menu_item_variantes: (item.menu_item_variantes || [])
            .sort((a, b) => (a.orden || 0) - (b.orden || 0)),
        }))
        setMenuItems(sorted)
        setLoadingMenu(false)
      })
  }, [open])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setCanal('salon'); setMesa(''); setNotas('')
      setItems([]); setSearch(''); setError(null); setVariantePopup(null)
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!search.trim()) return menuItems
    const q = normalizeSearch(search)
    return menuItems.filter(m => normalizeSearch(m.nombre).includes(q))
  }, [search, menuItems])

  /**
   * Al tocar un producto:
   * - Si tiene variantes → mostrar popup para elegir cuál
   * - Si no tiene variantes → agregar directo con el precio del campo 'precio'
   */
  const handleSelectItem = (menuItem) => {
    const variantes = menuItem.menu_item_variantes || []

    if (variantes.length > 0) {
      // Mostrar popup de variantes
      setVariantePopup(menuItem)
    } else {
      // Agregar directo sin variante
      addItem(menuItem, null)
    }
  }

  const addItem = (menuItem, variante) => {
    const precio = variante
      ? parseFloat(variante.precio) || 0
      : parseFloat(String(menuItem.precio || '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0

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

    setVariantePopup(null) // cerrar popup si estaba abierto
  }

  const updateCantidad = (key, delta) => {
    setItems(prev => prev
      .map(i => i._key === key ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i)
      .filter(i => i.cantidad > 0)
    )
  }

  const removeItem = (key) => {
    setItems(prev => prev.filter(i => i._key !== key))
  }

  const total = items.reduce((acc, i) => acc + (i.precio_unitario * i.cantidad), 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (items.length === 0) { setError('Agregá al menos un ítem al pedido.'); return }
    setSaving(true)
    setError(null)
    const err = await onSave({ canal, mesa: mesa ? parseInt(mesa) : null, notas, items })
    setSaving(false)
    if (err) setError(err.message || 'Error al guardar.')
    else onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-2xl rounded-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Nuevo pedido</p>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="grid md:grid-cols-2 gap-0" style={{ borderBottom: '1px solid var(--border)' }}>

              {/* LEFT — Canal, Mesa, Notas */}
              <div className="p-6 space-y-4" style={{ borderRight: '1px solid var(--border)' }}>
                {/* Canal */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Canal *</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {CANALES.map(c => (
                      <button
                        key={c.id} type="button"
                        onClick={() => setCanal(c.id)}
                        className="px-3 py-2 rounded-lg text-sm text-left transition-all"
                        style={canal === c.id
                          ? { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }
                          : { background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                        }
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mesa (solo salón) */}
                {canal === 'salon' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Mesa</label>
                    <input
                      type="number" min={1} value={mesa} onChange={e => setMesa(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                      onFocus={e => e.target.style.border = '1px solid rgba(124,58,237,0.5)'}
                      onBlur={e => e.target.style.border = '1px solid var(--border)'}
                      placeholder="Nº de mesa"
                    />
                  </div>
                )}

                {/* Notas */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Notas</label>
                  <textarea
                    value={notas} onChange={e => setNotas(e.target.value)}
                    rows={3} placeholder="Alergias, indicaciones especiales…"
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    onFocus={e => e.target.style.border = '1px solid rgba(124,58,237,0.5)'}
                    onBlur={e => e.target.style.border = '1px solid var(--border)'}
                  />
                </div>
              </div>

              {/* RIGHT — Product search + cart */}
              <div className="p-6 flex flex-col gap-4">
                {/* Search */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xmuted)' }} />
                  <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar en el menú…"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                {/* Product list */}
                <div className="flex-1 overflow-y-auto space-y-1 max-h-48 pr-1">
                  {loadingMenu ? (
                    <div className="flex justify-center py-4">
                      <Loader2 size={18} className="animate-spin" style={{ color: '#7c3aed' }} />
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-xmuted)' }}>Sin resultados</p>
                  ) : (
                    filtered.map(m => {
                      const hasVariantes = (m.menu_item_variantes || []).length > 0
                      const inCart = items.find(i => i.menu_item_id === m.id)
                      return (
                        <button
                          key={m.id} type="button"
                          onClick={() => handleSelectItem(m)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all"
                          style={{ border: inCart ? '1px solid var(--accent-border)' : '1px solid transparent' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{m.nombre}</p>
                            <p className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
                              {m.categoria}
                              {hasVariantes && <span className="ml-1" style={{ color: '#7c3aed' }}>· {m.menu_item_variantes.length} tamaños</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            {hasVariantes ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: '#7c3aed' }}>
                                desde ${Math.min(...m.menu_item_variantes.map(v => v.precio)).toLocaleString('es-AR')}
                              </span>
                            ) : (
                              m.precio && <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{m.precio}</span>
                            )}
                            <Plus size={13} style={{ color: '#7c3aed' }} />
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>

                {/* ── Popup de variantes ── */}
                {variantePopup && (
                  <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                      Elegí el tamaño de "{variantePopup.nombre}":
                    </p>
                    <div className="space-y-1.5">
                      {(variantePopup.menu_item_variantes || []).map(v => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => addItem(variantePopup, v)}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
                          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = '#7c3aed'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                        >
                          <span>{v.nombre}</span>
                          <span className="font-bold" style={{ color: '#7c3aed' }}>${parseFloat(v.precio).toLocaleString('es-AR')}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setVariantePopup(null)}
                      className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {/* Cart summary */}
                {items.length > 0 && (
                  <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                      Pedido actual
                    </p>
                    {items.map(item => (
                      <div key={item._key} className="flex items-center gap-2">
                        <button type="button" onClick={() => updateCantidad(item._key, -1)}>
                          <Minus size={11} style={{ color: 'var(--text-muted)' }} />
                        </button>
                        <span className="text-xs font-bold w-4 text-center" style={{ color: 'var(--text-primary)' }}>{item.cantidad}</span>
                        <button type="button" onClick={() => updateCantidad(item._key, 1)}>
                          <Plus size={11} style={{ color: 'var(--text-muted)' }} />
                        </button>
                        <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{item.nombre}</span>
                        <span className="text-[10px] font-medium" style={{ color: 'var(--text-xmuted)' }}>
                          ${(item.precio_unitario * item.cantidad).toLocaleString('es-AR')}
                        </span>
                        <button type="button" onClick={() => removeItem(item._key)}>
                          <Trash2 size={11} style={{ color: 'var(--text-xmuted)' }} />
                        </button>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Total estimado</span>
                      <span className="text-xs font-bold" style={{ color: '#7c3aed' }}>
                        ${total.toLocaleString('es-AR')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
            {error
              ? <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>
              : <span />
            }
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 16px rgba(124,58,237,0.25)' }}>
                {saving
                  ? <><Loader2 size={14} className="animate-spin" /> Creando…</>
                  : <><ShoppingBag size={14} /> Crear pedido</>
                }
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
