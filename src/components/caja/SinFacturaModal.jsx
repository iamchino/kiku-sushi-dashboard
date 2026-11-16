import { useState } from 'react'
import { FileX2, Loader2, X } from 'lucide-react'
import { formatMoney } from '../../lib/printing'
import { MOTIVOS_SUGERIDOS, MOTIVO_MAX, validarMotivo } from '../../lib/sinFactura'

// Marca un pedido como "no se factura". Pide el motivo (obligatorio): es lo
// que después permite distinguir un canje o una invitación de un olvido.
// No cambia totales: el pedido sigue contando como vendido y como no
// facturado; solo sale de Pendientes de facturación.
export default function SinFacturaModal({ pedido, motivoInicial = '', onClose, onConfirm }) {
  const [motivo, setMotivo] = useState(motivoInicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  if (!pedido) return null
  const shortId = String(pedido.id || '').slice(-4).toUpperCase()

  const confirmar = async () => {
    const problema = validarMotivo(motivo)
    if (problema) { setError(problema); return }
    setGuardando(true); setError(null)
    try {
      await onConfirm(motivo.trim())
    } catch (err) {
      setError(err.message || 'No se pudo marcar el pedido.')
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-label="No se factura">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={guardando ? undefined : onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <FileX2 size={16} style={{ color: 'var(--accent-lift)' }} />
            <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>No se factura</p>
          </div>
          <button type="button" onClick={onClose} disabled={guardando} aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-50" style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Pedido #{shortId}{pedido.mesa ? ` · Mesa ${pedido.mesa}` : ''} · ${formatMoney(pedido.total)}
          </p>

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Motivo (obligatorio)
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {MOTIVOS_SUGERIDOS.map(m => (
                <button key={m} type="button" onClick={() => { setMotivo(m); setError(null) }}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
                  style={motivo.trim() === m
                    ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                    : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  {m}
                </button>
              ))}
            </div>
            <input
              autoFocus
              value={motivo}
              maxLength={MOTIVO_MAX}
              onChange={e => { setMotivo(e.target.value); setError(null) }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmar() } }}
              placeholder="Elegí uno de arriba o escribí el motivo"
              aria-label="Motivo"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
          </div>

          {error && <p className="text-xs" style={{ color: '#F2708C' }}>{error}</p>}

          <p className="text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
            El pedido sale de «Pendientes de facturación» y pasa a «No se facturan». Sigue contando como vendido
            y como no facturado en los totales y en el Excel. Queda registrado quién lo marcó, y se puede volver
            atrás o facturar igual más adelante.
          </p>
        </div>

        <div className="flex justify-end gap-2 p-5 pt-0">
          <button type="button" onClick={onClose} disabled={guardando}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={guardando}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--cta)' }}>
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <FileX2 size={14} />}
            Marcar como no se factura
          </button>
        </div>
      </div>
    </div>
  )
}
