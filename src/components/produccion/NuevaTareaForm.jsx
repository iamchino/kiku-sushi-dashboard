import { useState } from 'react'
import { Plus, Search, AlertTriangle } from 'lucide-react'
import { normalizeSearch } from '../../utils/normalize'

export default function NuevaTareaForm({ subRecetas, onAdd }) {
  const [open, setOpen] = useState(false)
  const [modo, setModo] = useState('receta') // 'receta' | 'libre'
  const [recetaId, setRecetaId] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [descripcionLibre, setDescripcionLibre] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const recetasFiltradas = subRecetas.filter(r =>
    !busqueda.trim() || normalizeSearch(r.nombre).includes(normalizeSearch(busqueda))
  )

  const recetaSeleccionada = subRecetas.find(r => r.id === recetaId)
  const sinIngredientes = recetaSeleccionada &&
    (!recetaSeleccionada.receta_ingredientes || recetaSeleccionada.receta_ingredientes.length === 0)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (modo === 'receta') {
      if (!recetaId) { setError('Seleccioná una sub-receta'); return }
      const cant = parseFloat(cantidad)
      if (!cant || cant <= 0) { setError('Ingresá una cantidad válida'); return }

      setSaving(true)
      setError(null)
      const result = await onAdd({
        receta_id: recetaId,
        descripcion: recetaSeleccionada?.nombre || 'Tarea',
        cantidad: cant,
      })
      if (result?.error) { setError(result.error.message || 'Error al agregar'); setSaving(false); return }
    } else {
      if (!descripcionLibre.trim()) { setError('Escribí una descripción'); return }

      setSaving(true)
      setError(null)
      const result = await onAdd({
        receta_id: null,
        descripcion: descripcionLibre.trim(),
        cantidad: 1,
      })
      if (result?.error) { setError(result.error.message || 'Error al agregar'); setSaving(false); return }
    }

    // Reset
    setRecetaId('')
    setCantidad('1')
    setDescripcionLibre('')
    setBusqueda('')
    setSaving(false)
    setError(null)
    // No cerrar el form para permitir agregar varias seguidas
  }

  const inputStyle = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
        style={{
          border: '2px dashed var(--accent-border)',
          color: 'var(--accent)',
          background: 'var(--accent-soft)',
        }}
      >
        <Plus size={16} /> Agregar tarea
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl p-4 space-y-3"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>

      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-xmuted)' }}>
        Nueva tarea de producción
      </p>

      {/* Toggle: Receta vs Libre */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
        <button type="button" onClick={() => { setModo('receta'); setError(null) }}
          className="flex-1 py-2 rounded-md text-xs font-semibold transition-all"
          style={modo === 'receta'
            ? { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }
            : { color: 'var(--text-muted)', background: 'transparent', border: '1px solid transparent' }
          }>
          🔗 Con receta
        </button>
        <button type="button" onClick={() => { setModo('libre'); setError(null) }}
          className="flex-1 py-2 rounded-md text-xs font-semibold transition-all"
          style={modo === 'libre'
            ? { background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.25)' }
            : { color: 'var(--text-muted)', background: 'transparent', border: '1px solid transparent' }
          }>
          📝 Tarea libre
        </button>
      </div>

      {modo === 'receta' ? (
        <>
          {/* Buscador de recetas */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Sub-receta *
            </label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xmuted)' }} />
              <input
                value={busqueda}
                onChange={e => { setBusqueda(e.target.value); setRecetaId('') }}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
                placeholder="Buscar sub-receta..."
              />
            </div>

            {/* Lista de recetas */}
            {(busqueda || !recetaId) && (
              <div className="max-h-36 overflow-y-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                {recetasFiltradas.length === 0 ? (
                  <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>
                    No hay sub-recetas{busqueda ? ` para "${busqueda}"` : ''}
                  </p>
                ) : (
                  recetasFiltradas.map(r => {
                    const sel = r.id === recetaId
                    const vacia = !r.receta_ingredientes || r.receta_ingredientes.length === 0
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => { setRecetaId(r.id); setBusqueda('') }}
                        className="w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors"
                        style={{
                          background: sel ? 'var(--accent-soft)' : 'transparent',
                          color: sel ? 'var(--accent)' : 'var(--text-primary)',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <span className="flex items-center gap-2">
                          {r.nombre}
                          {r.porciones > 1 && (
                            <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-xmuted)' }}>
                              rinde {r.porciones}
                            </span>
                          )}
                        </span>
                        {vacia && <AlertTriangle size={12} style={{ color: '#f59e0b' }} />}
                      </button>
                    )
                  })
                )}
              </div>
            )}

            {/* Receta seleccionada */}
            {recetaId && recetaSeleccionada && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                  🔗 {recetaSeleccionada.nombre}
                </span>
                <button type="button" onClick={() => setRecetaId('')}
                  className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Cambiar
                </button>
              </div>
            )}

            {sinIngredientes && (
              <p className="text-[11px] flex items-center gap-1 px-2 py-1 rounded"
                style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                <AlertTriangle size={10} /> Esta receta no tiene ingredientes cargados
              </p>
            )}
          </div>

          {/* Cantidad */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Cantidad <span style={{ color: 'var(--text-xmuted)' }}>(porciones de la receta)</span>
            </label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </div>
        </>
      ) : (
        /* ── Modo tarea libre ── */
        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Descripción de la tarea *
          </label>
          <input
            value={descripcionLibre}
            onChange={e => setDescripcionLibre(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={inputStyle}
            placeholder="Ej: Limpiar camarones, preparar mise en place..."
            autoFocus
          />
          <p className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
            Esta tarea no descuenta inventario. Queda como registro de trabajo.
          </p>
        </div>
      )}

      {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}

      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => { setOpen(false); setError(null) }}
          className="flex-1 py-2.5 rounded-xl text-xs font-medium"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          Cerrar
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
          {saving ? '...' : '+ Agregar'}
        </button>
      </div>
    </form>
  )
}
