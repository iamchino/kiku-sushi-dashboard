import { useState, useEffect, useMemo } from 'react'
import { X, Loader2, Plus, Trash2, Package } from 'lucide-react'
import { precioVentaDe } from '../../utils/precio'
import Buscador from '../ui/Buscador'
import { unidadesDeItem } from '../../hooks/useCombos'

// Piezas por unidad sugeridas para una receta: si rinde más de 1, ya está
// expresada por pieza; si es un roll entero, 10 piezas por defecto.
const piezasSugeridas = (receta) => (parseFloat(receta?.porciones) > 1 ? 1 : 10)

export default function ComboModal({
  open, onClose, combo, recetasDisponibles, menuItems, onSave,
}) {
  const [nombre,     setNombre]     = useState('')
  const [menuItemId, setMenuItemId] = useState('')
  const [precio,     setPrecio]     = useState('')
  const [notas,      setNotas]      = useState('')
  const [items,      setItems]      = useState([]) // [{receta_id, cantidad}]
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState(null)

  // Reset on open
  useEffect(() => {
    if (!open) return
    setError(null)
    if (combo) {
      setNombre(combo.nombre || '')
      setMenuItemId(combo.menu_item_id || '')
      setPrecio(combo.precio ? String(combo.precio) : '')
      setNotas(combo.notas || '')
      setItems(
        (combo.combo_items || []).map(ci => ({
          receta_id: ci.receta_id,
          cantidad: String(ci.cantidad || 1),
          por_piezas: parseFloat(ci.piezas_por_unidad) > 0,
          piezas_por_unidad: parseFloat(ci.piezas_por_unidad) > 0 ? String(ci.piezas_por_unidad) : '',
        }))
      )
    } else {
      setNombre('')
      setMenuItemId('')
      setPrecio('')
      setNotas('')
      setItems([])
    }
  }, [open, combo])

  // Lo que se guarda: piezas_por_unidad solo si la fila está en modo piezas.
  const itemEfectivo = (item) => ({
    ...item,
    piezas_por_unidad: item.por_piezas ? item.piezas_por_unidad : null,
  })

  // ── Cálculos en vivo ──────────────────────────────────────────────────────
  const costoTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const receta = recetasDisponibles.find(r => r.id === item.receta_id)
      if (!receta) return sum
      const costoPorcion = receta._costoPorcion || 0
      return sum + costoPorcion * unidadesDeItem(itemEfectivo(item))
    }, 0)
  }, [items, recetasDisponibles])

  const menuItem = menuItems.find(m => m.id === menuItemId)
  const precioMenuVinculado = precioVentaDe(menuItem)

  const precioVentaFinal = parseFloat(precio) > 0
    ? parseFloat(precio)
    : (precioMenuVinculado && !isNaN(precioMenuVinculado) ? precioMenuVinculado : null)

  const margen = precioVentaFinal && precioVentaFinal > 0 && costoTotal > 0
    ? ((precioVentaFinal - costoTotal) / precioVentaFinal) * 100
    : null

  // Piezas del combo (lo que se muestra en el resumen): la cantidad de cada fila.
  const totalPiezas = items.reduce((s, i) => s + (parseFloat(i.cantidad) || 0), 0)

  // ── Items CRUD ────────────────────────────────────────────────────────────
  const addItem = () => {
    setItems(prev => [...prev, { receta_id: '', cantidad: '1', por_piezas: false, piezas_por_unidad: '' }])
  }

  const togglePiezas = (idx) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const receta = recetasDisponibles.find(r => r.id === item.receta_id)
      const activar = !item.por_piezas
      return {
        ...item,
        por_piezas: activar,
        piezas_por_unidad: activar ? (item.piezas_por_unidad || String(piezasSugeridas(receta))) : item.piezas_por_unidad,
      }
    }))
  }

  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    ))
  }

  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) { setError('Nombre del combo requerido.'); return }
    if (items.length === 0) { setError('Agregá al menos una receta al combo.'); return }

    const valid = items
      .filter(i => i.receta_id && parseFloat(i.cantidad) > 0)
      .map(itemEfectivo)
    if (valid.length === 0) { setError('Completá las recetas con cantidad válida.'); return }
    if (valid.some(i => i.piezas_por_unidad !== null && !(parseFloat(i.piezas_por_unidad) > 0))) {
      setError('En las filas por piezas, indicá cuántas piezas trae una unidad de la receta.'); return
    }

    setSaving(true); setError(null)

    const err = await onSave(combo?.id, {
      nombre: nombre.trim(),
      menu_item_id: menuItemId || null,
      precio: precio || null,
      notas: notas.trim() || null,
      items: valid,
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
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(234,88,12,0.1))' }}>
              <Package size={15} style={{ color: '#f97316' }} />
            </div>
            <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
              {combo ? 'Editar combo' : 'Nuevo combo'}
            </p>
          </div>
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
            <label style={labelStyle}>Nombre del combo *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)}
              required className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle} placeholder='Ej: Combo Fusión 12 piezas' />
          </div>

          {/* Producto vinculado + precio */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label style={labelStyle}>Producto del menú (opcional)</label>
              <Buscador
                value={menuItemId}
                onChange={setMenuItemId}
                placeholder="Buscar producto del menú…"
                opciones={menuItems.map(mi => ({ value: mi.id, label: mi.nombre, detalle: mi.precio || '' }))}
              />
            </div>
            <div className="space-y-1.5">
              <label style={labelStyle}>Precio $</label>
              <input type="number" min="0" step="0.01" value={precio}
                onChange={e => setPrecio(e.target.value)}
                placeholder={precioMenuVinculado ? String(precioMenuVinculado) : 'Precio'}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle} />
            </div>
          </div>

          {precioMenuVinculado && !precio && (
            <p className="text-[10px]" style={{ color: 'var(--text-xmuted)', marginTop: '-8px' }}>
              Se usará el precio del menú: ${precioMenuVinculado.toLocaleString('es-AR')}
            </p>
          )}

          {/* ═══════ RECETAS DEL COMBO ═══════ */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label style={labelStyle}>
                Recetas del combo
                {totalPiezas > 0 && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316', border: '1px solid rgba(249,115,22,0.2)' }}>
                    {totalPiezas} {totalPiezas === 1 ? 'pieza' : 'piezas'} total
                  </span>
                )}
              </label>
              <button type="button" onClick={addItem}
                className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
                style={{ color: '#f97316', background: 'rgba(249,115,22,0.1)' }}>
                <Plus size={12} /> Agregar
              </button>
            </div>

            {items.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--text-xmuted)' }}>
                Agregá recetas para armar el combo
              </p>
            )}

            {items.map((item, idx) => {
              const receta = recetasDisponibles.find(r => r.id === item.receta_id)
              const costoPorcion = receta?._costoPorcion || 0
              const costoLinea = costoPorcion * unidadesDeItem(itemEfectivo(item))

              return (
                <div key={idx} className="flex items-center gap-2 p-2.5 rounded-lg flex-wrap"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                  {/* Selector de receta: ocupa la primera línea entera; abajo cantidad, unidad y costo */}
                  <div className="basis-full min-w-0">
                    <Buscador
                      compact
                      allowEmpty={false}
                      value={item.receta_id}
                      placeholder="Buscar receta…"
                      onChange={v => updateItem(idx, 'receta_id', v)}
                      opciones={recetasDisponibles.map(r => ({ value: r.id, label: r.nombre, detalle: `$${r._costoPorcion?.toFixed(0) || '?'}/u` }))}
                    />
                  </div>

                  {/* Cantidad */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>×</span>
                    <input type="number" min="0.001" step="any" value={item.cantidad}
                      onChange={e => updateItem(idx, 'cantidad', e.target.value)}
                      className="w-14 px-2 py-1.5 rounded text-xs text-center outline-none"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                    {/* Unidad de la cantidad: unidades de la receta o piezas */}
                    <button type="button" onClick={() => togglePiezas(idx)}
                      title={item.por_piezas ? 'Cantidad en piezas. Click para contar unidades enteras de la receta.' : 'Cantidad en unidades enteras de la receta. Click para contar piezas.'}
                      className="px-2 py-1.5 rounded text-[11px] font-semibold whitespace-nowrap"
                      style={item.por_piezas
                        ? { background: 'rgba(249,115,22,0.12)', color: '#f97316', border: '1px solid rgba(249,115,22,0.35)' }
                        : { background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      {item.por_piezas ? 'piezas' : 'unid.'}
                    </button>
                    {item.por_piezas && (
                      <span className="flex items-center gap-1 text-[10px] whitespace-nowrap" style={{ color: 'var(--text-xmuted)' }}>
                        de
                        <input type="number" min="1" step="any" value={item.piezas_por_unidad}
                          onChange={e => updateItem(idx, 'piezas_por_unidad', e.target.value)}
                          title="Cuántas piezas trae una unidad de la receta"
                          className="w-12 px-1.5 py-1.5 rounded text-xs text-center outline-none"
                          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                        />
                        por unidad
                      </span>
                    )}
                  </div>

                  {/* Costo parcial */}
                  <span className="text-[11px] font-semibold flex-1 text-right tabular-nums"
                    style={{ color: costoLinea > 0 ? '#f97316' : 'var(--text-xmuted)' }}>
                    {costoLinea > 0 ? `$${costoLinea.toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'}
                  </span>

                  {/* Remove */}
                  <button type="button" onClick={() => removeItem(idx)}
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
          {items.length > 0 && costoTotal > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>
                    Costo total combo ({totalPiezas} {totalPiezas === 1 ? 'pieza' : 'piezas'})
                  </span>
                  <span className="font-bold tabular-nums" style={{ color: '#f97316' }}>
                    ${costoTotal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>
                {precioVentaFinal && (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--text-muted)' }}>Precio de venta</span>
                      <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                        ${precioVentaFinal.toLocaleString('es-AR')}
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
              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', boxShadow: '0 4px 16px rgba(249,115,22,0.2)' }}>
              {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Guardar combo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
