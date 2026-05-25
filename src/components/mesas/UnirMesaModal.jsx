import { useState } from 'react'
import { X, Link2, Loader2, AlertCircle } from 'lucide-react'

/**
 * Modal para unir la mesa actual (líder) con otra mesa libre del mismo salón.
 * Lista solo mesas libres y que no estén ya en otro grupo.
 */
export default function UnirMesaModal({ open, leaderMesa, mesasDisponibles = [], onClose, onUnir }) {
  const [selected, setSelected] = useState(null)
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState(null)

  if (!open || !leaderMesa) return null

  const handleConfirm = async () => {
    if (!selected) return
    setBusy(true); setError(null)
    const { error: err } = await onUnir?.(leaderMesa.id, selected) || {}
    setBusy(false)
    if (err) { setError(err.message || 'Error al unir mesas'); return }
    setSelected(null)
    onClose?.()
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-md max-h-[85vh] flex flex-col rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex-shrink-0 flex items-start justify-between px-5 py-4 gap-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Unir mesa
            </p>
            <p className="font-bold text-base mt-0.5" style={{ color: 'var(--text-primary)' }}>
              Mesa {leaderMesa.numero} se unirá con…
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              La mesa elegida pasa a compartir el mismo pedido. Se desagrupan al cobrar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {error && (
            <div className="rounded-lg p-2.5 text-xs flex items-start gap-2 mb-3 mx-2"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {mesasDisponibles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
              <Link2 size={26} style={{ color: 'var(--text-xmuted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                No hay mesas disponibles para unir
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Necesitás otra mesa libre y sin agrupar en este salón.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {mesasDisponibles.map(m => {
                const isSel = selected === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelected(m.id)}
                    className="flex flex-col items-center justify-center py-3 rounded-lg transition-all"
                    style={{
                      background: isSel ? 'var(--accent-soft)' : 'var(--bg-input)',
                      border: isSel ? '2px solid var(--accent)' : '1px solid var(--border)',
                      color: isSel ? 'var(--accent-lift)' : 'var(--text-primary)',
                    }}
                  >
                    <span className="font-bold text-lg leading-none">{m.numero}</span>
                    <span className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                      {m.capacidad}p
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex gap-2 p-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || busy}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            Unir mesa
          </button>
        </div>
      </div>
    </div>
  )
}
