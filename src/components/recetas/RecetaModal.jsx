import { useState, useEffect, useMemo } from 'react'
import { X, Loader2, Plus, Trash2 } from 'lucide-react'
import { TIPOS_RECETA, tipoReceta, normTipoStock } from '../../lib/stockNiveles'

export default function RecetaModal({
  open, onClose, receta, mode = receta ? 'edit' : 'create', recetas = [], stockItems, menuItems, onSave, costoIngrediente,
  defaultTipo = 'final',
}) {
  const isDuplicate = mode === 'duplicate'
  const [nombre,      setNombre]      = useState('')
  const [menuItemId,  setMenuItemId]  = useState('')
  const [porciones,   setPorciones]   = useState('1')
  const [notas,       setNotas]       = useState('')
  const [tipo,        setTipo]        = useState('final')
  const [llevaStock,  setLlevaStock]  = useState(false)
  const [ingredientes, setIngredientes] = useState([]) // [{id, tipo: 'stock'|'subreceta', cantidad}]
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState(null)

  // Reset on open
  useEffect(() => {
    if (!open) return
    setError(null)
    if (receta) {
      setNombre(isDuplicate ? `Copia de ${receta.nombre || ''}` : (receta.nombre || ''))
      setMenuItemId(isDuplicate ? '' : (receta.menu_item_id || ''))
      setPorciones(String(receta.porciones || 1))
      setNotas(receta.notas || '')
      setTipo(tipoReceta(receta))
      setLlevaStock(!!receta.lleva_stock)
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
      setTipo(defaultTipo)
      setLlevaStock(false)
      setIngredientes([])
    }
  }, [open, receta, isDuplicate, defaultTipo])

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
  const materiaPrimaItems = stockItems.filter(s => normTipoStock(s) === 'materia_prima')
  // Los ítems elaborados que son "la cara de stock" de una receta se eligen por
  // la receta (grupo Producción intermedia / Rolls de servicio). Acá quedan solo
  // los sueltos, o los que esta receta ya usaba.
  const usadosPorStock = new Set(ingredientes.filter(i => i.tipo === 'stock').map(i => i.id))
  const produccionItems = stockItems.filter(s =>
    normTipoStock(s) !== 'materia_prima' && (!s.receta_id || usadosPorStock.has(s.id)))
  const recetasIntermedias = recetas.filter(r => tipoReceta(r) === 'intermedia' && r.id !== receta?.id)
  const recetasServicio = recetas.filter(r => tipoReceta(r) === 'servicio' && r.id !== receta?.id)
  const esFinal = tipo === 'final'

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

    const err = await onSave(isDuplicate ? null : receta?.id, {
      nombre: nombre.trim(),
      menu_item_id: esFinal ? (menuItemId || null) : null,
      porciones: parseInt(porciones) || 1,
      notas: notas.trim() || null,
      tipo,
      lleva_stock: esFinal ? llevaStock : true,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
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
            {isDuplicate ? 'Duplicar receta' : receta ? 'Editar receta' : 'Nueva receta'}
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

          {/* Nivel de la receta */}
          <div className="space-y-1.5">
            <label style={labelStyle}>Tipo de receta</label>
            <div className="grid grid-cols-3 gap-2">
              {TIPOS_RECETA.map(t => {
                const active = tipo === t.id
                return (
                  <button key={t.id} type="button" onClick={() => setTipo(t.id)}
                    className="py-2 px-1 rounded-lg text-[11px] font-semibold transition-all leading-tight"
                    style={active
                      ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                      : { background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {t.singular}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
              {TIPOS_RECETA.find(t => t.id === tipo)?.ayuda}
              {!esFinal && ' Tiene su propio stock: se suma al producirla y se descuenta cuando se usa.'}
            </p>
            {esFinal && (
              <label className="flex items-start gap-2 cursor-pointer pt-1">
                <input type="checkbox" checked={llevaStock} onChange={e => setLlevaStock(e.target.checked)}
                  className="w-4 h-4 rounded mt-0.5" style={{ accentColor: 'var(--accent)' }} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Lleva stock: se produce antes y se guarda (ej. gyozas armadas, postres).
                  La venta descuenta este stock y no sus ingredientes.
                </span>
              </label>
            )}
          </div>

          {/* Producto vinculado + porciones */}
          <div className="grid grid-cols-3 gap-3">
            {esFinal ? (
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
            ) : (
              <div className="col-span-2 text-[11px] self-end pb-2" style={{ color: 'var(--text-xmuted)' }}>
                {tipo === 'servicio'
                  ? 'Rinde en rolls: 1 = un roll entero. En el producto final, un roll de 10 piezas lleva "1" de este roll y rinde 10.'
                  : 'El stock de esta receta se cuenta en porciones de lo que rinde.'}
              </div>
            )}
            <div className="space-y-1.5">
              <label style={labelStyle}>{tipo === 'servicio' ? 'Rinde (rolls)' : esFinal ? 'Rinde (porciones / piezas)' : 'Rinde (porciones)'}</label>
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
                style={{ color: 'var(--accent-lift)', background: 'var(--accent-soft)' }}>
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
              const isSub = ing.tipo === 'subreceta'

              if (!isSub) {
                stock = stockItems.find(s => s.id === ing.id)
                if (stock) ingCosto = costoIngrediente({ stock, cantidad: parseFloat(ing.cantidad) || 0 })
              } else {
                const subr = recetas.find(r => r.id === ing.id)
                if (subr) ingCosto = costoIngrediente({ subreceta_id: ing.id, cantidad: parseFloat(ing.cantidad) || 0 })
              }

              const valSelect = ing.id ? `${ing.tipo}:${ing.id}` : ''
              const usedIds = ingredientes.map(i => i.id ? `${i.tipo}:${i.id}` : '').filter(Boolean)

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
                    <optgroup label="Materia prima">
                      {materiaPrimaItems.map(s => (
                        <option key={`stock:${s.id}`} value={`stock:${s.id}`} disabled={usedIds.includes(`stock:${s.id}`) && valSelect !== `stock:${s.id}`}>
                          {s.nombre} ({s.unidad})
                        </option>
                      ))}
                    </optgroup>
                    {produccionItems.length > 0 && (
                      <optgroup label="Stock elaborado suelto">
                        {produccionItems.map(s => (
                          <option key={`stock:${s.id}`} value={`stock:${s.id}`} disabled={(usedIds.includes(`stock:${s.id}`) && valSelect !== `stock:${s.id}`) || s.receta_id === receta?.id}>
                            {s.nombre} ({s.unidad})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {[['Producción intermedia', recetasIntermedias], ['Rolls de servicio', recetasServicio]].map(([label, lista]) => lista.length > 0 && (
                      <optgroup key={label} label={label}>
                        {lista.map(r => (
                          <option key={`subreceta:${r.id}`} value={`subreceta:${r.id}`} disabled={usedIds.includes(`subreceta:${r.id}`) && valSelect !== `subreceta:${r.id}`}>
                            {r.nombre} ({tipoReceta(r) === 'servicio' ? 'rolls' : `rinde ${r.porciones}`})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {/* Una subreceta vieja que quedó como "final" pero ya estaba cargada */}
                    {isSub && ing.id && !recetasIntermedias.some(r => r.id === ing.id) && !recetasServicio.some(r => r.id === ing.id) && (
                      <option value={`subreceta:${ing.id}`}>{recetas.find(r => r.id === ing.id)?.nombre || 'Receta'}</option>
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
                    {isSub ? (tipoReceta(recetas.find(r => r.id === ing.id)) === 'servicio' ? 'roll' : 'porc.') : (stock?.unidad || '')}
                  </span>

                  {/* Costo parcial */}
                  <span className="text-[11px] font-semibold w-16 text-right tabular-nums flex-shrink-0"
                    style={{ color: ingCosto > 0 ? 'var(--accent-lift)' : 'var(--text-xmuted)' }}>
                    {ingCosto > 0 ? `$${ingCosto.toFixed(0)}` : '—'}
                  </span>

                  {/* Remove */}
                  <button type="button" onClick={() => removeIng(idx)}
                    className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{ color: 'var(--text-xmuted)' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#E34D6B'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}>
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
          </div>

          {/* ═══════ RESUMEN DE COSTOS ═══════ */}
          {ingredientes.length > 0 && costoTotal > 0 && (() => {
            // Buscar variantes del menu_item vinculado
            const variantes = menuItem?.menu_item_variantes || []

            return (
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
                    <span className="font-bold tabular-nums" style={{ color: 'var(--accent-lift)' }}>
                      ${costoPorPorcion.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                )}

                {/* ── Márgenes por VARIANTE ── */}
                {variantes.length > 0 ? (
                  <div className="space-y-1.5 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>
                      Margen por tamaño
                    </p>
                    {variantes.map(v => {
                      const piezasVar = parseFloat(v.piezas) || 1
                      const precioVar = parseFloat(v.precio) || 0
                      const costoVar = costoPorPorcion * piezasVar
                      const margenVar = precioVar > 0 ? ((precioVar - costoVar) / precioVar) * 100 : null
                      const bajo = margenVar !== null && margenVar < 30

                      return (
                        <div
                          key={v.id}
                          className="flex items-center justify-between text-xs px-3 py-2 rounded-lg"
                          style={{
                            background: bajo ? 'rgba(227,77,107,0.06)' : 'rgba(63,191,138,0.04)',
                            border: `1px solid ${bajo ? 'rgba(227,77,107,0.15)' : 'rgba(63,191,138,0.1)'}`,
                          }}
                        >
                          <div>
                            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {v.nombre}
                            </span>
                            <span className="ml-2" style={{ color: 'var(--text-xmuted)' }}>
                              Costo: ${costoVar.toFixed(0)} · Venta: ${precioVar.toLocaleString('es-AR')}
                            </span>
                          </div>
                          <span className="font-bold" style={{ color: bajo ? '#E34D6B' : '#3FBF8A' }}>
                            {margenVar !== null ? `${margenVar.toFixed(1)}%` : '—'}
                            {bajo && ' ⚠️'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : precioVenta ? (
                  /* ── Margen único (sin variantes, backwards compatible) ── */
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
                          ? 'rgba(227,77,107,0.08)'
                          : 'rgba(63,191,138,0.06)',
                        border: `1px solid ${margen !== null && margen < 30 ? 'rgba(227,77,107,0.2)' : 'rgba(63,191,138,0.15)'}`,
                      }}
                    >
                      <span className="font-semibold" style={{
                        color: margen !== null && margen < 30 ? '#E34D6B' : '#3FBF8A',
                      }}>
                        Margen: {margen !== null ? `${margen.toFixed(1)}%` : '—'}
                      </span>
                      {margen !== null && margen < 30 && (
                        <span className="text-[10px] font-medium" style={{ color: '#E34D6B' }}>
                          ⚠️ Bajo
                        </span>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            )
          })()}

          {/* Notas */}
          <div className="space-y-1.5">
            <label style={labelStyle}>Notas <span style={{ color: 'var(--text-xmuted)' }}>(opcional)</span></label>
            <input value={notas} onChange={e => setNotas(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle} placeholder="Observaciones, variantes, etc." />
          </div>

          {error && <p className="text-xs" style={{ color: '#E34D6B' }}>{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--cta)', boxShadow: 'var(--cta-shadow)' }}>
              {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : isDuplicate ? 'Crear copia' : 'Guardar receta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
