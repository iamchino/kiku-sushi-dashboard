import { useEffect, useState } from 'react'
import { AlertTriangle, FileMinus2, Loader2, X } from 'lucide-react'
import { formatReceiptNumber, nombreComprobante } from '../../lib/fiscal'
import { formatMoney } from '../../lib/printing'

export function NotaCreditoModal({ open, pedido, comprobante, busy, onClose, onConfirm }) {
  const [total, setTotal] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || !comprobante) return
    setTotal(String(Number(comprobante.importe_total || pedido?.total || 0)))
    setMotivo('')
    setError(null)
  }, [open, comprobante, pedido])

  if (!open || !comprobante) return null

  const totalOriginal = Number(comprobante.importe_total || 0)
  const totalNc = Number(total || 0)
  const excede = totalNc > totalOriginal
  const recibo = formatReceiptNumber(comprobante.punto_venta, comprobante.numero)

  const submit = (e) => {
    e.preventDefault()
    setError(null)
    if (!Number.isFinite(totalNc) || totalNc <= 0) {
      setError('Ingresá un total mayor a cero.')
      return
    }
    if (excede) {
      setError('La Nota de Crédito no puede superar el total del comprobante original.')
      return
    }
    onConfirm({ total: totalNc, motivo: motivo.trim() })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <form
        onSubmit={submit}
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-lg"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
      >
        <header className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Emitir Nota de Crédito</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Sobre {nombreComprobante(comprobante.tipo_cbte)} N° {recibo}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-50"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <section
            className="rounded-lg p-3"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Receptor</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {comprobante.receptor_nombre || 'Consumidor Final'}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Total original</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                ${formatMoney(totalOriginal)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}>CAE</span>
              <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                {comprobante.cae}
              </span>
            </div>
          </section>

          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Total a creditear
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={total}
              onChange={e => setTotal(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: `1px solid ${excede ? '#f87171' : 'var(--border)'}`,
              }}
            />
            <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Dejá el monto completo para anular, o un monto parcial para creditear sólo una porción.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Motivo (opcional, queda en arca_request_log)
            </label>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              placeholder="Devolución, error de carga, anulación..."
            />
          </div>

          {error && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <footer className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            La NC quedará asociada al comprobante original.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy || excede || totalNc <= 0}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#dc2626' }}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <FileMinus2 size={15} />}
              Emitir NC
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}

export default NotaCreditoModal
