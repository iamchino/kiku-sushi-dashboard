import { useState, useEffect } from 'react'
import { X, Loader2, Package, Minus, Plus, RotateCcw, Truck } from 'lucide-react'

const TIPOS = [
  { id: 'entrada', label: 'Entrada',  icon: Truck,     color: '#34d399', desc: 'Llegó mercadería del proveedor' },
  { id: 'ajuste',  label: 'Ajuste',   icon: RotateCcw, color: '#4f8ef7', desc: 'Conteo físico — setear stock exacto' },
  { id: 'merma',   label: 'Merma',    icon: Minus,     color: '#f87171', desc: 'Pérdida, vencimiento o error' },
]

export default function MovimientoModal({ open, onClose, item, onSave, modoEdicion, onSaveItem }) {
  const [modo,    setModo]    = useState('entrada')      // 'entrada'|'ajuste'|'merma'|'item'
  const [cantidad,setCantidad]= useState('')
  const [notas,   setNotas]   = useState('')
  const [form,    setForm]    = useState({ nombre:'', stock_actual:'', stock_minimo:'', unidad:'kg', proveedor:'' })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (open) {
      setModo(modoEdicion ? 'item' : 'entrada')
      setCantidad(''); setNotas(''); setError(null)
      setForm(item ? {
        nombre:       item.nombre       || '',
        stock_actual: item.stock_actual ?? '',
        stock_minimo: item.stock_minimo ?? '',
        unidad:       item.unidad       || 'kg',
        proveedor:    item.proveedor    || '',
      } : { nombre:'', stock_actual:'', stock_minimo:'', unidad:'kg', proveedor:'' })
    }
  }, [open, item, modoEdicion])

  if (!open) return null

  // Calcula preview del nuevo stock
  const actual  = parseFloat(item?.stock_actual || 0)
  const cant    = parseFloat(cantidad) || 0
  const preview = modo === 'ajuste' ? cant
                : modo === 'entrada' ? actual + cant
                : Math.max(0, actual - cant)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setError(null)

    let err
    if (modo === 'item') {
      err = await onSaveItem(form)
    } else {
      if (!cantidad || isNaN(parseFloat(cantidad))) { setError('Ingresá una cantidad válida.'); setSaving(false); return }
      err = await onSave({ stockId: item.id, tipo: modo, cantidad, notas, stockActual: item.stock_actual })
    }

    setSaving(false)
    if (err) setError(err.message || 'Error al guardar.')
    else onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: '#1c1c1f', border: '1px solid #2a2a2e', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #2a2a2e' }}>
          <div>
            <p className="font-semibold text-white text-base">
              {modoEdicion ? (item ? 'Editar ingrediente' : 'Nuevo ingrediente') : item?.nombre}
            </p>
            {!modoEdicion && item && (
              <p className="text-xs mt-0.5" style={{ color: '#52525b' }}>
                Stock actual: <span className="text-white/70">{item.stock_actual} {item.unidad}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: '#71717a' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* ── MODO ITEM (create/edit) ── */}
          {modo === 'item' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: '#a1a1aa' }}>Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  required className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                  style={{ background: '#111113', border: '1px solid #2a2a2e' }}
                  onFocus={e => e.target.style.border = '1px solid rgba(232,103,58,0.4)'}
                  onBlur={e => e.target.style.border = '1px solid #2a2a2e'}
                  placeholder="Ej: Salmón rosado" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: '#a1a1aa' }}>Stock actual</label>
                  <input type="number" step="0.1" min="0" value={form.stock_actual}
                    onChange={e => setForm(f => ({ ...f, stock_actual: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                    style={{ background: '#111113', border: '1px solid #2a2a2e' }}
                    placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: '#a1a1aa' }}>Mínimo</label>
                  <input type="number" step="0.1" min="0" value={form.stock_minimo}
                    onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                    style={{ background: '#111113', border: '1px solid #2a2a2e' }}
                    placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: '#a1a1aa' }}>Unidad</label>
                  <select value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                    style={{ background: '#111113', border: '1px solid #2a2a2e' }}>
                    {['kg','g','u','l','ml','caja','paq'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: '#a1a1aa' }}>Proveedor</label>
                <input value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                  style={{ background: '#111113', border: '1px solid #2a2a2e' }}
                  onFocus={e => e.target.style.border = '1px solid rgba(232,103,58,0.4)'}
                  onBlur={e => e.target.style.border = '1px solid #2a2a2e'}
                  placeholder="Nombre del proveedor" />
              </div>
            </>
          )}

          {/* ── MODO MOVIMIENTO ── */}
          {modo !== 'item' && (
            <>
              {/* Tipo selector */}
              <div className="grid grid-cols-3 gap-2">
                {TIPOS.map(t => {
                  const TIcon = t.icon
                  const active = modo === t.id
                  return (
                    <button key={t.id} type="button" onClick={() => setModo(t.id)}
                      className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all"
                      style={{
                        background: active ? `${t.color}15` : '#111113',
                        border: `1px solid ${active ? t.color + '40' : '#2a2a2e'}`,
                        color: active ? t.color : '#52525b',
                      }}>
                      <TIcon size={16} />
                      <span className="text-[11px] font-semibold">{t.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-center" style={{ color: '#52525b' }}>
                {TIPOS.find(t => t.id === modo)?.desc}
              </p>

              {/* Cantidad */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: '#a1a1aa' }}>
                  {modo === 'ajuste' ? 'Nuevo stock exacto' : 'Cantidad'}
                  <span className="ml-1" style={{ color: '#3f3f46' }}>({item?.unidad})</span>
                </label>
                <input type="number" step="0.1" min="0" value={cantidad}
                  onChange={e => setCantidad(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none text-center text-lg font-semibold"
                  style={{ background: '#111113', border: '1px solid #2a2a2e' }}
                  onFocus={e => e.target.style.border = '1px solid rgba(232,103,58,0.4)'}
                  onBlur={e => e.target.style.border = '1px solid #2a2a2e'}
                  placeholder="0" autoFocus />
              </div>

              {/* Preview */}
              {cantidad && !isNaN(cant) && (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{ background: '#111113', border: '1px solid #2a2a2e' }}>
                  <div className="text-center flex-1">
                    <p className="text-xs mb-1" style={{ color: '#52525b' }}>Actual</p>
                    <p className="text-base font-bold text-white">{actual} {item?.unidad}</p>
                  </div>
                  <div className="text-2xl font-light" style={{ color: '#3f3f46' }}>→</div>
                  <div className="text-center flex-1">
                    <p className="text-xs mb-1" style={{ color: '#52525b' }}>Nuevo</p>
                    <p className="text-base font-bold"
                      style={{ color: preview < parseFloat(item?.stock_minimo || 0) ? '#f87171' : '#34d399' }}>
                      {preview.toFixed(2)} {item?.unidad}
                    </p>
                  </div>
                </div>
              )}

              {/* Notas */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: '#a1a1aa' }}>
                  Notas <span style={{ color: '#3f3f46' }}>(opcional)</span>
                </label>
                <input value={notas} onChange={e => setNotas(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                  style={{ background: '#111113', border: '1px solid #2a2a2e' }}
                  placeholder={modo === 'entrada' ? 'Ej: Proveedor Los Andes, factura 001' : ''}
                  onFocus={e => e.target.style.border = '1px solid rgba(232,103,58,0.4)'}
                  onBlur={e => e.target.style.border = '1px solid #2a2a2e'} />
              </div>
            </>
          )}

          {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium hover:bg-white/5"
              style={{ color: '#71717a', border: '1px solid #2a2a2e' }}>Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #E8673A, #C4501F)', boxShadow: '0 4px 16px rgba(232,103,58,0.2)' }}>
              {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
