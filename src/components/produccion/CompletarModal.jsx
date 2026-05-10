import { useState, useEffect } from 'react'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import { calcularIngredientesCrudos, mergeIngredientes } from '../../hooks/useProduccion'

export default function CompletarModal({ open, onClose, tarea, receta, recetas, onConfirm }) {
  const [nombre, setNombre] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Recordar último nombre usado
  useEffect(() => {
    if (open) {
      const saved = localStorage.getItem('kiku_produccion_nombre') || ''
      setNombre(saved)
      setCantidad(String(tarea?.cantidad || 1))
      setNotas('')
      setError(null)
    }
  }, [open, tarea])

  if (!open || !tarea) return null

  const cantNum = parseFloat(cantidad) || 0

  // Calcular preview de descuento
  let ingredientesPreview = []
  let alertas = []
  if (receta && cantNum > 0) {
    const crudos = calcularIngredientesCrudos(receta, cantNum, recetas)
    ingredientesPreview = mergeIngredientes(crudos)
    alertas = ingredientesPreview.filter(i => i.cantidad > i.stock_actual)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) { setError('Escribí tu nombre'); return }
    if (!cantNum || cantNum <= 0) { setError('Ingresá la cantidad producida'); return }

    setSaving(true)
    setError(null)
    localStorage.setItem('kiku_produccion_nombre', nombre.trim())

    const result = await onConfirm(tarea.id, nombre.trim(), cantNum, notas.trim())
    if (result?.error) {
      setError(result.error.message || 'Error al completar')
      setSaving(false)
      return
    }

    // Vibración de feedback
    if (navigator.vibrate) navigator.vibrate(100)
    setSaving(false)
    onClose()
  }

  const inputStyle = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl flex flex-col max-h-[90vh]"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
              ✅ Completar tarea
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {tarea.descripcion}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Nombre */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              ¿Quién lo hizo? *
            </label>
            <input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ ...inputStyle, fontSize: '16px' }}
              placeholder="Tu nombre"
              autoComplete="off"
            />
          </div>

          {/* Cantidad */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Cantidad producida <span style={{ color: 'var(--text-xmuted)' }}>(porciones)</span>
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-sm outline-none text-center font-semibold"
              style={{ ...inputStyle, fontSize: '20px' }}
              inputMode="decimal"
            />
            {tarea.cantidad && cantNum !== parseFloat(tarea.cantidad) && (
              <p className="text-[11px]" style={{ color: '#f59e0b' }}>
                Objetivo era {parseFloat(tarea.cantidad)} porc. — estás cargando {cantNum}
              </p>
            )}
          </div>

          {/* Preview de descuento de stock */}
          {ingredientesPreview.length > 0 && (
            <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(0,0,0,0.08)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-xmuted)' }}>
                Se descontará del inventario:
              </p>
              <div className="space-y-1">
                {ingredientesPreview.map((ing, i) => {
                  const insuficiente = ing.cantidad > ing.stock_actual
                  return (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span style={{ color: insuficiente ? '#f59e0b' : 'var(--text-primary)' }}>
                        {insuficiente && <AlertTriangle size={10} className="inline mr-1" />}
                        {ing.nombre}
                      </span>
                      <span className="font-semibold tabular-nums" style={{ color: '#ef4444' }}>
                        -{ing.cantidad.toFixed(2)} {ing.unidad}
                      </span>
                    </div>
                  )
                })}
              </div>
              {alertas.length > 0 && (
                <p className="text-[10px] mt-1 px-2 py-1 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                  ⚠️ Hay ingredientes con stock insuficiente. Se descontará hasta 0.
                </p>
              )}
            </div>
          )}

          {/* Notas */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Notas <span style={{ color: 'var(--text-xmuted)' }}>(opcional)</span>
            </label>
            <input
              value={notas}
              onChange={e => setNotas(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={inputStyle}
              placeholder="Alguna observación..."
            />
          </div>

          {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-medium"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', boxShadow: '0 4px 16px rgba(34,197,94,0.3)' }}>
              {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : '✅ Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
