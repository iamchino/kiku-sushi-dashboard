import { useEffect, useState } from 'react'
import { X, Link2, Loader2, AlertCircle, Check } from 'lucide-react'

/**
 * Modal para unir la mesa actual (líder) con UNA O MÁS mesas libres del mismo
 * salón. Muestra grilla de mesas libres disponibles; el usuario puede tocar
 * varias y las une todas al confirmar (loop sobre onUnir).
 */
export default function UnirMesaModal({ open, leaderMesa, mesasDisponibles = [], onClose, onUnir }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [busy, setBusy]               = useState(false)
  const [error, setError]             = useState(null)

  // Reset selección al abrir/cerrar
  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set())
      setError(null)
      setBusy(false)
    }
  }, [open])

  if (!open || !leaderMesa) return null

  const toggle = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(mesasDisponibles.map(m => m.id)))
  }

  const clearAll = () => setSelectedIds(new Set())

  const selectedCount = selectedIds.size

  const handleConfirm = async () => {
    if (selectedCount === 0) return
    setBusy(true); setError(null)

    // Unir una por una. Si alguna falla, abortamos y mostramos el error.
    for (const memberId of selectedIds) {
      const { error: err } = await onUnir?.(leaderMesa.id, memberId) || {}
      if (err) {
        setBusy(false)
        setError(err.message || 'Error al unir una de las mesas')
        return
      }
    }

    setBusy(false)
    setSelectedIds(new Set())
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
              Unir mesas
            </p>
            <p className="font-bold text-base mt-0.5" style={{ color: 'var(--text-primary)' }}>
              Mesa {leaderMesa.numero} se unirá con…
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Elegí una o varias mesas. Todas pasarán a compartir el mismo pedido.
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

        {/* Toolbar: contador + select all/clear */}
        {mesasDisponibles.length > 0 && (
          <div
            className="flex-shrink-0 flex items-center justify-between px-4 py-2 text-xs"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-app)' }}
          >
            <span style={{ color: 'var(--text-muted)' }}>
              {selectedCount > 0
                ? <><strong style={{ color: 'var(--accent-lift)' }}>{selectedCount}</strong> seleccionada{selectedCount === 1 ? '' : 's'} de {mesasDisponibles.length}</>
                : <>{mesasDisponibles.length} mesa{mesasDisponibles.length === 1 ? '' : 's'} disponible{mesasDisponibles.length === 1 ? '' : 's'}</>}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={selectAll}
                disabled={selectedCount === mesasDisponibles.length}
                className="px-2 py-1 rounded text-[11px] font-medium transition-colors disabled:opacity-40"
                style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={selectedCount === 0}
                className="px-2 py-1 rounded text-[11px] font-medium transition-colors disabled:opacity-40"
                style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Limpiar
              </button>
            </div>
          </div>
        )}

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
                const isSel = selectedIds.has(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    className="relative flex flex-col items-center justify-center py-3 rounded-lg transition-all"
                    style={{
                      background: isSel ? 'var(--accent-soft)' : 'var(--bg-input)',
                      border: isSel ? '2px solid var(--accent)' : '1px solid var(--border)',
                      color: isSel ? 'var(--accent-lift)' : 'var(--text-primary)',
                    }}
                  >
                    {isSel && (
                      <span
                        className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                      >
                        <Check size={10} strokeWidth={3} />
                      </span>
                    )}
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
            disabled={selectedCount === 0 || busy}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
          >
            {busy
              ? <><Loader2 size={14} className="animate-spin" /> Uniendo…</>
              : <><Link2 size={14} /> {selectedCount > 1 ? `Unir ${selectedCount} mesas` : 'Unir mesa'}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
