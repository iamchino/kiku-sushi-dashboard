import { useState, useEffect, useMemo } from 'react'
import { X, Loader2, Plus, Trash2 } from 'lucide-react'

export default function RecetaModal({
  open, onClose, receta, recetas = [], stockItems, menuItems, onSave, costoIngrediente,
}) {
  const [nombre,      setNombre]      = useState('')
  const [menuItemId,  setMenuItemId]  = useState('')
  const [porciones,   setPorciones]   = useState('1')
  const [notas,       setNotas]       = useState('')
  const [es_subreceta, setEsSubreceta] = useState(false)
  const [ingredientes, setIngredientes] = useState([]) // [{id, tipo: 'stock'|'subreceta', cantidad}]
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState(null)

  // Reset on open
  useEffect(() => {
    if (!open) return
    setError(null)
    if (receta) {
      setNombre(receta.nombre || '')
      setMenuItemId(receta.menu_item_id || '')
      setPorciones(String(receta.porciones || 1))
      setNotas(receta.notas || '')
      setEsSubreceta(!!receta.es_subreceta)
      setIngredientes(
        (receta.receta_ingredientes || []).map(ri => {
          if (ri.subreceta_id) return { id: ri.subreceta_id, tipo: 'subreceta', cantidad: String(ri.cantidad) }
          return { id: ri.stock_id, tipo: 'stock', cantidad: String(ri.cantidad) }
        })
      )
    } else {
      setNombre('')
      setMenuItemId('')
      setPorciones('1')
      setNotas('')
      setEsSubreceta(false)
      setIngredientes([])
    }
  }, [open, receta])

  // ── Cálculos en vivo ──────────────────────────────────────────────────────
  const costoTotal = useMemo(() => {
    return ingredientes.reduce((sum, ing) => {
      let riMock = null
      if (ing.tipo === 'stock') {
        const stock = stockItems.find(s => s.id === ing.id)
        if (!stock) return sum
        riMock = { stock, cantidad: parseFloat(ing.cantidad) || 0 }
      } else if (ing.tipo === 'subreceta') {
        riMock = { subreceta_id: ing.id, cantidad: parseFloat(ing.cantidad) || 0 }
      }
      if (!riMock) return sum
      return sum + costoIngrediente(riMock)
    }, 0)
  }, [ingredientes, stockItems, costoIngrediente])

  const costoPorPorcion = costoTotal / (parseInt(porciones) || 1)

  const menuItem = menuItems.find(m => m.id === menuItemId)
  const precioVenta = menuItem
    ? parseFloat(String(menuItem.precio).replace(/[^0-9.,]/g, '').replace(',', '.'))
    : null
  const margen = precioVenta && precioVenta > 0
    ? ((precioVenta - costoPorPorcion) / precioVenta) * 100
    : null

  // ── Ingredientes CRUD ─────────────────────────────────────────────────────
  const addIngrediente = () => {
    setIngredientes(prev => [...prev, { id: '', tipo: 'stock', cantidad: '' }])
  }

  const updateIng = (idx, field, value) => {
    setIngredientes(prev => prev.map((ing, i) =>
      i === idx ? { ...ing, [field]: value } : ing
    ))
  }

  const removeIng = (idx) => {
    setIngredientes(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) { setError('Nombre requerido.'); return }
    if (ingredientes.length === 0) { setError('Agregá al menos un ingrediente.'); return }

    const valid = ingredientes.filter(i => i.id && parseFloat(i.cantidad) > 0)
    if (valid.length === 0) { setError('Completá los ingredientes con cantidad válida.'); return }

    setSaving(true); setError(null)

    const err = await onSave(receta?.id, {
      nombre: nombre.trim(),
      menu_item_id: menuItemId || null,
      porciones: parseInt(porciones) || 1,
      notas: notas.trim() || null,
      es_subreceta,
      ingredientes: valid,
    })

    setSaving(false)
    if (err) setError(err.message || 'Error al guardar.')
    else onClose()
  }

  if (!open) return null

  const inputStyle = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  }

  const labelStyle = { color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500 }

  // Ingredientes ya usados (para no duplicar)
  const usedStockIds = ingredientes.map(i => i.stock_id).filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
            {receta ? 'Editar receta' : 'Nueva receta'}
          </p>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Nombre */}
          <div className="space-y-1.5">
            <label style={labelStyle}>Nombre de la receta *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)}
              required className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle} placeholder='Ej: Roll New York' />
          </div>

          <label className="flex items-center gap-2 cursor-pointer mt-1">
            <input type="checkbox" checked={es_subreceta} onChange={e => setEsSubreceta(e.target.checked)}
              className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent)' }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Usar como ingrediente (Sub-receta)
            </span>
          </label>

          {/* Producto vinculado + porciones */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label style={labelStyle}>Producto del menú (opcional)</label>
              <select value={menuItemId} onChange={e => setMenuItemId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}>
                <option value="">— Sin vincular —</option>
                {menuItems.map(mi => (
                  <option key={mi.id} value={mi.id}>
                    {mi.nombre} {mi.precio ? `(${mi.precio})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label style={labelStyle}>Porciones / Rendimiento</label>
              <input type="number" min="1" value={porciones}
                onChange={e => setPorciones(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle} />
            </div>
          </div>

          {/* ═══════ INGREDIENTES (BOM) ═══════ */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label style={labelStyle}>Ingredientes</label>
              <button type="button" onClick={addIngrediente}
                className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
                style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}>
                <Plus size={12} /> Agregar
              </button>
            </div>

            {ingredientes.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--text-xmuted)' }}>
                Agregá ingredientes para calcular el costo
              </p>
            )}

            {ingredientes.map((ing, idx) => {
              let ingCosto = 0
              let stock = null
              let subr = null
              const isSub = ing.tipo === 'subreceta'

              if (!isSub) {
                stock = stockItems.find(s => s.id === ing.id)
                if (stock) ingCosto = costoIngrediente({ stock, cantidad: parseFloat(ing.cantidad) || 0 })
              } else {
                subr = recetas.find(r => r.id === ing.id)
                if (subr) ingCosto = costoIngrediente({ subreceta_id: ing.id, cantidad: parseFloat(ing.cantidad) || 0 })
              }

              const valSelect = ing.id ? `${ing.tipo}:${ing.id}` : ''
              const usedIds = ingredientes.map(i => i.id ? `${i.tipo}:${i.id}` : '').filter(Boolean)
              const subRecetasDisponibles = recetas.filter(r => r.es_subreceta && r.id !== receta?.id)

              return (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-lg"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                  {/* Selector de ingrediente */}
                  <select value={valSelect} onChange={e => {
                      const v = e.target.value
                      if (!v) { updateIng(idx, 'id', ''); updateIng(idx, 'tipo', 'stock'); return }
                      const [t, id] = v.split(':')
                      updateIng(idx, 'id', id)
                      updateIng(idx, 'tipo', t)
                    }}
                    className="flex-1 px-2 py-1.5 rounded text-xs outline-none min-w-0"
                    style={{ background: 'transparent', color: 'var(--text-primary)', border: 'none' }}>
                    <option value="">Seleccionar…</option>
                    <optgroup label="Stock">
                      {stockItems.map(s => (
                        <option key={`stock:${s.id}`} value={`stock:${s.id}`} disabled={usedIds.includes(`stock:${s.id}`) && valSelect !== `stock:${s.id}`}>
                          {s.nombre} ({s.unidad})
                        </option>
                      ))}
                    </optgroup>
                    {subRecetasDisponibles.length > 0 && (
                      <optgroup label="Sub-recetas">
                        {subRecetasDisponibles.map(r => (
                          <option key={`subreceta:${r.id}`} value={`subreceta:${r.id}`} disabled={usedIds.includes(`subreceta:${r.id}`) && valSelect !== `subreceta:${r.id}`}>
                            {r.nombre} (por {r.porciones})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {/* Cantidad */}
                  <input type="number" step="0.001" min="0" value={ing.cantidad}
                    onChange={e => updateIng(idx, 'cantidad', e.target.value)}
                    placeholder="Cant"
                    className="w-20 px-2 py-1.5 rounded text-xs text-right outline-none"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                  <span className="text-[10px] w-6 flex-shrink-0" style={{ color: 'var(--text-xmuted)' }}>
                    {isSub ? 'porc.' : (stock?.unidad || '')}
                  </span>

                  {/* Costo parcial */}
                  <span className="text-[11px] font-semibold w-16 text-right tabular-nums flex-shrink-0"
                    style={{ color: ingCosto > 0 ? 'var(--accent)' : 'var(--text-xmuted)' }}>
                    {ingCosto > 0 ? `$${ingCosto.toFixed(0)}` : '—'}
                  </span>

                  {/* Remove */}
                  <button type="button" onClick={() => removeIng(idx)}
                    className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{ color: 'var(--text-xmuted)' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}>
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
          </div>

          {/* ═══════ RESUMEN DE COSTOS ═══════ */}
          {ingredientes.length > 0 && costoTotal > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>Costo total receta</span>
                  <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    ${costoTotal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>
                {parseInt(porciones) > 1 && (
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-muted)' }}>Costo por porción ({porciones})</span>
                    <span className="font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                      ${costoPorPorcion.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                )}
                {precioVenta && (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--text-muted)' }}>Precio de venta</span>
                      <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                        ${precioVenta.toLocaleString('es-AR')}
                      </span>
                    </div>
                    <div
                      className="flex items-center justify-between text-xs px-3 py-2 rounded-lg -mx-1"
                      style={{
                        background: margen !== null && margen < 30
                          ? 'rgba(239,68,68,0.08)'
                          : 'rgba(34,197,94,0.06)',
                        border: `1px solid ${margen !== null && margen < 30 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.15)'}`,
                      }}
                    >
                      <span className="font-semibold" style={{
                        color: margen !== null && margen < 30 ? '#ef4444' : '#22c55e',
                      }}>
                        Margen: {margen !== null ? `${margen.toFixed(1)}%` : '—'}
                      </span>
                      {margen !== null && margen < 30 && (
                        <span className="text-[10px] font-medium" style={{ color: '#ef4444' }}>
                          ⚠️ Bajo
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Notas */}
          <div className="space-y-1.5">
            <label style={labelStyle}>Notas <span style={{ color: 'var(--text-xmuted)' }}>(opcional)</span></label>
            <input value={notas} onChange={e => setNotas(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle} placeholder="Observaciones, variantes, etc." />
          </div>

          {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 16px rgba(124,58,237,0.2)' }}>
              {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Guardar receta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
