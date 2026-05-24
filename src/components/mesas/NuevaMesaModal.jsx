import { useEffect, useState } from 'react'
import { X, Loader2, Square, Circle, Trash2 } from 'lucide-react'

/**
 * Modal para crear o editar una mesa (en el editor de salón).
 */
export default function NuevaMesaModal({ open, mesa, onClose, onSave, onDelete, suggestedNumero = 1 }) {
  const isEdit = Boolean(mesa?.id)

  const [numero,    setNumero]    = useState('')
  const [nombre,    setNombre]    = useState('')
  const [capacidad, setCapacidad] = useState('4')
  const [ancho,     setAncho]     = useState('80')
  const [alto,      setAlto]      = useState('80')
  const [forma,     setForma]     = useState('rect')
  const [saving, setSaving]       = useState(false)
  const [error,  setError]        = useState(null)
  const [deleting, setDeleting]   = useState(false)

  useEffect(() => {
    if (!open) return
    setNumero(String(mesa?.numero ?? suggestedNumero ?? ''))
    setNombre(mesa?.nombre || '')
    setCapacidad(String(mesa?.capacidad || 4))
    setAncho(String(mesa?.ancho || 80))
    setAlto(String(mesa?.alto || 80))
    setForma(mesa?.forma || 'rect')
    setError(null)
  }, [open, mesa, suggestedNumero])

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    const num = parseInt(numero)
    if (!num || num < 1) { setError('Número inválido'); return }
    setSaving(true); setError(null)
    const { error: err } = await onSave?.({
      numero:    num,
      nombre:    nombre.trim() || null,
      capacidad: parseInt(capacidad) || 4,
      ancho:     parseInt(ancho) || 80,
      alto:      parseInt(alto) || 80,
      forma,
    }) || {}
    setSaving(false)
    if (err) { setError(err.message || 'Error al guardar'); return }
    onClose?.()
  }

  const handleDelete = async () => {
    if (!isEdit) return
    if (!confirm(`¿Eliminar mesa ${mesa.numero}? Esta acción no se puede deshacer.`)) return
    setDeleting(true)
    const { error: err } = await onDelete?.(mesa.id) || {}
    setDeleting(false)
    if (err) { setError(err.message || 'Error al eliminar'); return }
    onClose?.()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-md rounded-2xl flex flex-col"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
            {isEdit ? `Editar mesa ${mesa.numero}` : 'Nueva mesa'}
          </p>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Número *</label>
              <input
                type="number" min={1} required autoFocus
                value={numero}
                onChange={e => setNumero(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Capacidad</label>
              <input
                type="number" min={1}
                value={capacidad}
                onChange={e => setCapacidad(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Nombre <span style={{ color: 'var(--text-xmuted)' }}>(opcional)</span>
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Barra 1, VIP, Ventana…"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Forma</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'rect',   label: 'Rectangular', Icon: Square },
                { id: 'circle', label: 'Redonda',     Icon: Circle },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id} type="button"
                  onClick={() => setForma(id)}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
                  style={forma === id
                    ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                    : { background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                  }
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Ancho (px)</label>
              <input
                type="number" min={40} max={400}
                value={ancho}
                onChange={e => setAncho(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Alto (px)</label>
              <input
                type="number" min={40} max={400}
                value={alto}
                onChange={e => setAlto(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {error && (
            <div
              className="rounded-lg px-3 py-2 text-xs"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
            >
              {error}
            </div>
          )}

          <div className="flex justify-between gap-3 pt-2">
            {isEdit && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'transparent', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Eliminar
              </button>
            )}
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
                {saving
                  ? <><Loader2 size={14} className="animate-spin" /> Guardando…</>
                  : isEdit ? 'Guardar cambios' : 'Crear mesa'
                }
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
