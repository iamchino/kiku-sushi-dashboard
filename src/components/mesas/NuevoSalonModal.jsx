import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'

export default function NuevoSalonModal({ open, onClose, onSave }) {
  const [nombre, setNombre] = useState('')
  const [ancho,  setAncho]  = useState('1200')
  const [alto,   setAlto]   = useState('800')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  useEffect(() => {
    if (open) {
      setNombre(''); setAncho('1200'); setAlto('800'); setError(null)
    }
  }, [open])

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) { setError('Nombre requerido'); return }
    setSaving(true); setError(null)
    const { error: err } = await onSave?.({
      nombre: nombre.trim(),
      ancho: parseInt(ancho) || 1200,
      alto: parseInt(alto) || 800,
    }) || {}
    setSaving(false)
    if (err) { setError(err.message || 'Error al guardar'); return }
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
          <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Nuevo salón</p>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Nombre *</label>
            <input
              type="text" required autoFocus
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Terraza, VIP, Patio…"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Ancho canvas (px)</label>
              <input
                type="number" min={400} max={4000}
                value={ancho}
                onChange={e => setAncho(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Alto canvas (px)</label>
              <input
                type="number" min={400} max={4000}
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

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Creando…</>
                : 'Crear salón'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
