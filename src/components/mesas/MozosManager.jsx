import { useState } from 'react'
import { Plus, Loader2, Trash2, RotateCcw } from 'lucide-react'
import { useMozos } from '../../hooks/useMozos'

const COLORS = [
  '#9b87f5', '#3b82f6', '#22c55e', '#f97316',
  '#facc15', '#ec4899', '#06b6d4', '#a855f7',
]

/**
 * Panel para administrar camareros/mozos.
 * Lista todos (activos + inactivos), permite agregar, cambiar color, desactivar/reactivar.
 */
export default function MozosManager() {
  const { mozos, loading, createMozo, updateMozo, desactivarMozo, activarMozo } = useMozos({ onlyActive: false })

  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoColor,  setNuevoColor]  = useState(COLORS[0])
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!nuevoNombre.trim()) return
    setSaving(true); setError(null)
    const { error: err } = await createMozo({ nombre: nuevoNombre, color: nuevoColor })
    setSaving(false)
    if (err) { setError(err.message || 'Error al crear'); return }
    setNuevoNombre('')
    setNuevoColor(COLORS[Math.floor(Math.random() * COLORS.length)])
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="rounded-xl p-4 space-y-3"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Agregar camarero
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={nuevoNombre}
            onChange={e => setNuevoNombre(e.target.value)}
            placeholder="Nombre del camarero…"
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          <button
            type="submit"
            disabled={saving || !nuevoNombre.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Agregar
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Color:</span>
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setNuevoColor(c)}
              className="w-6 h-6 rounded-full transition-transform"
              style={{
                background: c,
                border: nuevoColor === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                transform: nuevoColor === c ? 'scale(1.1)' : 'scale(1)',
              }}
            />
          ))}
        </div>
        {error && (
          <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>
        )}
      </form>

      <div className="rounded-xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Camareros ({mozos.length})
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent-lift)' }} />
          </div>
        ) : mozos.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'var(--text-xmuted)' }}>
            Aún no hay camareros cargados.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {mozos.map(m => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: m.color || '#9b87f5', opacity: m.activo ? 1 : 0.4 }}
                >
                  {(m.nombre || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)', opacity: m.activo ? 1 : 0.5 }}>
                    {m.nombre}
                  </p>
                  {!m.activo && (
                    <p className="text-[10px]" style={{ color: '#f87171' }}>Inactivo</p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateMozo(m.id, { color: c })}
                      className="w-3 h-3 rounded-full"
                      style={{
                        background: c,
                        border: m.color === c ? '2px solid var(--text-primary)' : 'none',
                        opacity: m.color === c ? 1 : 0.6,
                      }}
                    />
                  ))}
                </div>

                {m.activo ? (
                  <button
                    type="button"
                    onClick={() => desactivarMozo(m.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                    style={{ color: '#f87171' }}
                    title="Desactivar"
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Trash2 size={12} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => activarMozo(m.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                    style={{ color: '#22c55e' }}
                    title="Reactivar"
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
