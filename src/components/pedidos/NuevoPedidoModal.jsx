import { useState, useEffect, useMemo } from 'react'
import { X, Plus, Minus, Trash2, Search, Loader2, ShoppingBag } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const CANALES = [
  { id: 'salon',     label: '🍽️  Salón'      },
  { id: 'delivery',  label: '🚗  Delivery'    },
  { id: 'whatsapp',  label: '💬  WhatsApp'   },
  { id: 'pedidosya', label: '🟡  PedidosYa'  },
  { id: 'rappi',     label: '🟠  Rappi'      },
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

  // Fetch menu items on open
  useEffect(() => {
    if (!open) return
    setLoadingMenu(true)
    supabase
      .from('menu_items')
      .select('id, nombre, precio, categoria, tipo')
      .eq('activo', true)
      .order('categoria')
      .order('orden')
      .then(({ data }) => { setMenuItems(data || []); setLoadingMenu(false) })
  }, [open])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setCanal('salon'); setMesa(''); setNotas('')
      setItems([]); setSearch(''); setError(null)
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!search.trim()) return menuItems
    const q = search.toLowerCase()
    return menuItems.filter(m => m.nombre.toLowerCase().includes(q))
  }, [search, menuItems])

  const addItem = (menuItem) => {
    // Parse first price found (take first numeric value from price string)
    const priceMatch = menuItem.precio?.match(/[\d.,]+/)
    const precio = priceMatch
      ? parseFloat(priceMatch[0].replace('.', '').replace(',', '.'))
      : 0

    setItems(prev => {
      const existing = prev.find(i => i.menu_item_id === menuItem.id)
      if (existing) return prev.map(i =>
        i.menu_item_id === menuItem.id ? { ...i, cantidad: i.cantidad + 1 } : i
      )
      return [...prev, {
        menu_item_id:    menuItem.id,
        nombre:          menuItem.nombre,
        precio_unitario: precio,
        cantidad:        1,
        notas:           '',
      }]
    })
  }

  const updateCantidad = (menu_item_id, delta) => {
    setItems(prev => prev
      .map(i => i.menu_item_id === menu_item_id ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i)
      .filter(i => i.cantidad > 0)
    )
  }

  const removeItem = (menu_item_id) => {
    setItems(prev => prev.filter(i => i.menu_item_id !== menu_item_id))
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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-2xl rounded-2xl flex flex-col max-h-[90vh]"
        style={{ background: '#1c1c1f', border: '1px solid #2a2a2e', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #2a2a2e' }}>
          <p className="font-semibold text-white text-base">Nuevo pedido</p>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: '#71717a' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="grid md:grid-cols-2 gap-0" style={{ borderBottom: '1px solid #2a2a2e' }}>

              {/* LEFT — Canal, Mesa, Notas */}
              <div className="p-6 space-y-4" style={{ borderRight: '1px solid #2a2a2e' }}>
                {/* Canal */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: '#a1a1aa' }}>Canal *</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {CANALES.map(c => (
                      <button
                        key={c.id} type="button"
                        onClick={() => setCanal(c.id)}
                        className="px-3 py-2 rounded-lg text-sm text-left transition-all"
                        style={canal === c.id
                          ? { background: 'rgba(232,103,58,0.15)', color: '#E8673A', border: '1px solid rgba(232,103,58,0.3)' }
                          : { background: '#111113', color: '#71717a', border: '1px solid #2a2a2e' }
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
                    <label className="text-xs font-medium" style={{ color: '#a1a1aa' }}>Mesa</label>
                    <input
                      type="number" min={1} value={mesa} onChange={e => setMesa(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                      style={{ background: '#111113', border: '1px solid #2a2a2e' }}
                      onFocus={e => e.target.style.border = '1px solid rgba(232,103,58,0.5)'}
                      onBlur={e => e.target.style.border = '1px solid #2a2a2e'}
                      placeholder="Nº de mesa"
                    />
                  </div>
                )}

                {/* Notas */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: '#a1a1aa' }}>Notas</label>
                  <textarea
                    value={notas} onChange={e => setNotas(e.target.value)}
                    rows={3} placeholder="Alergias, indicaciones especiales…"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none resize-none"
                    style={{ background: '#111113', border: '1px solid #2a2a2e' }}
                    onFocus={e => e.target.style.border = '1px solid rgba(232,103,58,0.5)'}
                    onBlur={e => e.target.style.border = '1px solid #2a2a2e'}
                  />
                </div>
              </div>

              {/* RIGHT — Product search + cart */}
              <div className="p-6 flex flex-col gap-4">
                {/* Search */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#3f3f46' }} />
                  <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar en el menú…"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm text-white outline-none"
                    style={{ background: '#111113', border: '1px solid #2a2a2e' }}
                  />
                </div>

                {/* Product list */}
                <div className="flex-1 overflow-y-auto space-y-1 max-h-48 pr-1">
                  {loadingMenu ? (
                    <div className="flex justify-center py-4">
                      <Loader2 size={18} className="animate-spin" style={{ color: '#E8673A' }} />
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="text-xs text-center py-4" style={{ color: '#3f3f46' }}>Sin resultados</p>
                  ) : (
                    filtered.map(m => {
                      const inCart = items.find(i => i.menu_item_id === m.id)
                      return (
                        <button
                          key={m.id} type="button"
                          onClick={() => addItem(m)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all hover:bg-white/5"
                          style={{ border: inCart ? '1px solid rgba(232,103,58,0.3)' : '1px solid transparent' }}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-white truncate">{m.nombre}</p>
                            <p className="text-[10px]" style={{ color: '#52525b' }}>{m.categoria}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            {inCart && (
                              <span className="text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center"
                                style={{ background: '#E8673A', color: 'white' }}>
                                {inCart.cantidad}
                              </span>
                            )}
                            <Plus size={13} style={{ color: '#E8673A' }} />
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>

                {/* Cart summary */}
                {items.length > 0 && (
                  <div className="rounded-xl p-3 space-y-1.5" style={{ background: '#111113', border: '1px solid #2a2a2e' }}>
                    <p className="text-[10px] font-medium uppercase tracking-wide mb-2" style={{ color: '#52525b' }}>
                      Pedido actual
                    </p>
                    {items.map(item => (
                      <div key={item.menu_item_id} className="flex items-center gap-2">
                        <button type="button" onClick={() => updateCantidad(item.menu_item_id, -1)}>
                          <Minus size={11} style={{ color: '#52525b' }} />
                        </button>
                        <span className="text-xs font-bold w-4 text-center text-white">{item.cantidad}</span>
                        <button type="button" onClick={() => updateCantidad(item.menu_item_id, 1)}>
                          <Plus size={11} style={{ color: '#52525b' }} />
                        </button>
                        <span className="text-xs text-white/70 flex-1 truncate">{item.nombre}</span>
                        <button type="button" onClick={() => removeItem(item.menu_item_id)}>
                          <Trash2 size={11} style={{ color: '#52525b' }} />
                        </button>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2" style={{ borderTop: '1px solid #2a2a2e' }}>
                      <span className="text-xs" style={{ color: '#52525b' }}>Total estimado</span>
                      <span className="text-xs font-bold" style={{ color: '#E8673A' }}>
                        ${total.toLocaleString('es-AR')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: '1px solid #2a2a2e' }}>
            {error
              ? <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>
              : <span />
            }
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/5"
                style={{ color: '#71717a', border: '1px solid #2a2a2e' }}>
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #E8673A, #C4501F)', boxShadow: '0 4px 16px rgba(232,103,58,0.25)' }}>
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
