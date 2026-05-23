import { useState, useEffect } from 'react'
import { X, Loader2, Minus, RotateCcw, Truck } from 'lucide-react'
import { CATEGORIAS_STOCK } from '../../hooks/useStock'

const TIPOS = [
  { id: 'entrada', label: 'Entrada', icon: Truck, color: '#22c55e', desc: 'Suma stock al item' },
  { id: 'ajuste', label: 'Ajuste', icon: RotateCcw, color: '#3b82f6', desc: 'Setea el stock exacto contado' },
  { id: 'merma', label: 'Merma', icon: Minus, color: '#ef4444', desc: 'Resta stock por uso, perdida o ajuste' },
]

const emptyForm = (tipoStock = 'materia_prima') => ({
  nombre: '',
  stock_actual: '',
  stock_minimo: '',
  unidad: 'kg',
  proveedor: '',
  precio_unitario: '',
  rendimiento: '1',
  categoria: 'Almacen',
  tipo_stock: tipoStock,
  receta_id: '',
  notas: '',
})

export default function MovimientoModal({
  open,
  onClose,
  item,
  recetas = [],
  defaultTipoStock = 'materia_prima',
  onSaveItem,
  onSaveMovimiento,
}) {
  const [form, setForm] = useState(emptyForm(defaultTipoStock))
  const [registrarMov, setRegistrarMov] = useState(false)
  const [tipoMov, setTipoMov] = useState('entrada')
  const [cantidadMov, setCantidadMov] = useState('')
  const [notasMov, setNotasMov] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return

    setError(null)
    setRegistrarMov(false)
    setTipoMov('entrada')
    setCantidadMov('')
    setNotasMov('')

    setForm(item ? {
      nombre: item.nombre || '',
      stock_actual: item.stock_actual ?? '',
      stock_minimo: item.stock_minimo ?? '',
      unidad: item.unidad || 'kg',
      proveedor: item.proveedor || '',
      precio_unitario: item.precio_unitario ?? '',
      rendimiento: item.rendimiento ?? '1',
      categoria: item.categoria || 'Almacen',
      tipo_stock: item.tipo_stock === 'produccion' ? 'produccion' : 'materia_prima',
      receta_id: item.receta_id || '',
      notas: item.notas || '',
    } : emptyForm(defaultTipoStock))
  }, [open, item, defaultTipoStock])

  if (!open) return null

  const isProduccion = form.tipo_stock === 'produccion'
  const actual = parseFloat(form.stock_actual || 0)
  const cant = parseFloat(cantidadMov) || 0
  const preview = tipoMov === 'ajuste'
    ? cant
    : tipoMov === 'entrada'
      ? actual + cant
      : Math.max(0, actual - cant)

  const inputStyle = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  }

  const labelStyle = { color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500 }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    if (registrarMov && (!cantidadMov || isNaN(cant) || cant <= 0)) {
      setError('Ingresa una cantidad valida para el movimiento.')
      setSaving(false)
      return
    }

    const finalStock = registrarMov ? preview : actual
    const stockForItemSave = item && registrarMov ? actual : finalStock

    const errItem = await onSaveItem({
      ...form,
      tipo_stock: isProduccion ? 'produccion' : 'materia_prima',
      receta_id: isProduccion ? (form.receta_id || null) : null,
      proveedor: isProduccion ? null : (form.proveedor || null),
      categoria: isProduccion ? null : (form.categoria || 'Almacen'),
      precio_unitario: isProduccion ? 0 : (parseFloat(form.precio_unitario) || 0),
      rendimiento: isProduccion ? 1 : (parseFloat(form.rendimiento) || 1),
      stock_actual: stockForItemSave,
      stock_minimo: parseFloat(form.stock_minimo) || 0,
    })

    if (errItem) {
      setError(errItem.message || 'Error al guardar el item.')
      setSaving(false)
      return
    }

    if (item && registrarMov) {
      const errMov = await onSaveMovimiento({
        stockId: item.id,
        tipo: tipoMov,
        cantidad: cant,
        notas: notasMov,
      })
      if (errMov) {
        setError(errMov.message || 'Item guardado, pero fallo el historial.')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-2xl flex flex-col max-h-[90vh]"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.3)',
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
            {item
              ? (isProduccion ? 'Editar produccion' : 'Editar materia prima')
              : (isProduccion ? 'Nueva produccion' : 'Nueva materia prima')}
          </p>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-1.5">
            <label style={labelStyle}>Nombre *</label>
            <input
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              required
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle}
              placeholder={isProduccion ? 'Ej: Shari preparado' : 'Ej: Salmon rosado'}
            />
          </div>

          <div className="space-y-1.5">
            <label style={labelStyle}>Tipo de stock</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'materia_prima', label: 'Materia prima' },
                { id: 'produccion', label: 'Produccion' },
              ].map(t => {
                const active = form.tipo_stock === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, tipo_stock: t.id, receta_id: t.id === 'produccion' ? f.receta_id : '' }))}
                    className="py-2 rounded-lg text-xs font-semibold transition-all"
                    style={active
                      ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                      : { background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label style={labelStyle}>Stock actual</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={form.stock_actual}
                onChange={e => setForm(f => ({ ...f, stock_actual: e.target.value }))}
                disabled={registrarMov}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none disabled:opacity-50"
                style={inputStyle}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <label style={labelStyle}>Minimo</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={form.stock_minimo}
                onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <label style={labelStyle}>Unidad</label>
              <select
                value={form.unidad}
                onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
              >
                {['kg', 'g', 'u', 'l', 'ml', 'caja', 'paq'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {!isProduccion && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label style={labelStyle}>Precio / unidad ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.precio_unitario}
                    onChange={e => setForm(f => ({ ...f, precio_unitario: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={inputStyle}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <label style={labelStyle}>Rendimiento (%)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={Math.round((parseFloat(form.rendimiento) || 1) * 100)}
                      onChange={e => setForm(f => ({ ...f, rendimiento: String((parseInt(e.target.value) || 100) / 100) }))}
                      className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                      style={inputStyle}
                      placeholder="100"
                    />
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>%</span>
                  </div>
                </div>
              </div>

              {parseFloat(form.precio_unitario) > 0 && (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Costo real / {form.unidad}</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--accent-lift)' }}>
                    ${((parseFloat(form.precio_unitario) || 0) / (parseFloat(form.rendimiento) || 1)).toFixed(2)}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label style={labelStyle}>Categoria</label>
                  <select
                    value={form.categoria}
                    onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={inputStyle}
                  >
                    {CATEGORIAS_STOCK.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label style={labelStyle}>Proveedor</label>
                  <input
                    value={form.proveedor}
                    onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={inputStyle}
                    placeholder="Nombre del proveedor"
                  />
                </div>
              </div>
            </>
          )}

          {isProduccion && (
            <div className="space-y-1.5">
              <label style={labelStyle}>Receta vinculada</label>
              <select
                value={form.receta_id}
                onChange={e => setForm(f => ({ ...f, receta_id: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
              >
                <option value="">Sin vincular</option>
                {recetas.map(r => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label style={labelStyle}>Notas (opcional)</label>
            <textarea
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
              style={inputStyle}
              placeholder="Observaciones"
            />
          </div>

          {item && (
            <div className="pt-4 mt-2 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>
              <label className="flex items-center gap-2 cursor-pointer group w-fit">
                <input
                  type="checkbox"
                  checked={registrarMov}
                  onChange={e => setRegistrarMov(e.target.checked)}
                  className="rounded w-4 h-4 cursor-pointer"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span className="text-sm font-medium transition-colors" style={{ color: registrarMov ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  Registrar entrada / movimiento en historial
                </span>
              </label>

              {registrarMov && (
                <div className="p-4 rounded-xl space-y-4" style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border)' }}>
                  <div className="grid grid-cols-3 gap-2">
                    {TIPOS.map(t => {
                      const TIcon = t.icon
                      const active = tipoMov === t.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTipoMov(t.id)}
                          className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl transition-all"
                          style={{
                            background: active ? `${t.color}15` : 'var(--bg-input)',
                            border: `1px solid ${active ? t.color + '40' : 'var(--border)'}`,
                            color: active ? t.color : 'var(--text-muted)',
                          }}
                        >
                          <TIcon size={14} />
                          <span className="text-[10px] font-semibold">{t.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
                    {TIPOS.find(t => t.id === tipoMov)?.desc}
                  </p>

                  <div className="space-y-1.5">
                    <label style={labelStyle}>
                      {tipoMov === 'ajuste' ? 'Nuevo stock exacto' : 'Cantidad a sumar/restar'}
                      <span className="ml-1" style={{ color: 'var(--text-xmuted)' }}>({form.unidad})</span>
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={cantidadMov}
                      onChange={e => setCantidadMov(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg text-sm outline-none text-center text-lg font-semibold"
                      style={inputStyle}
                      placeholder="0"
                      autoFocus={registrarMov}
                    />
                  </div>

                  {cantidadMov && !isNaN(cant) && (
                    <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                      <div className="text-center flex-1">
                        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Actual</p>
                        <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{actual} {form.unidad}</p>
                      </div>
                      <div className="text-2xl font-light" style={{ color: 'var(--text-xmuted)' }}>-</div>
                      <div className="text-center flex-1">
                        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Nuevo</p>
                        <p className="text-base font-bold" style={{ color: preview < parseFloat(form.stock_minimo || 0) ? '#ef4444' : '#22c55e' }}>
                          {preview.toFixed(2)} {form.unidad}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label style={labelStyle}>Notas del movimiento <span style={{ color: 'var(--text-xmuted)' }}>(opcional)</span></label>
                    <input
                      value={notasMov}
                      onChange={e => setNotasMov(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}

          <div className="flex gap-3 pt-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))', boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.25)' }}
            >
              {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : (item ? 'Guardar cambios' : 'Crear item')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
