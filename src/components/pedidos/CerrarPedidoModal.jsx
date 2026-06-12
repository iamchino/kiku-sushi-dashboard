import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Banknote,
  Ban,
  CheckCircle2,
  CreditCard,
  FileText,
  Loader2,
  Lock,
  Printer,
  Receipt,
  Send,
  X,
} from 'lucide-react'
import { useFacturacion } from '../../hooks/useFacturacion'
import { getAuthorizedComprobante } from '../../lib/fiscal'
import { formatMoney } from '../../lib/printing'
import SplitPagoLines, { nuevaLinea, lineasValidas, lineasAPagos, resumenMedios } from './SplitPagoLines'

const MEDIOS_PAGO = [
  { id: 'efectivo',         label: 'Efectivo',          icon: Banknote,   color: '#34d399' },
  { id: 'tarjeta_credito',  label: 'Tarjeta credito',   icon: CreditCard, color: '#f59e0b' },
  { id: 'tarjeta_debito',   label: 'Tarjeta debito',    icon: CreditCard, color: '#a78bfa' },
  { id: 'transferencia',    label: 'Transferencia',     icon: Send,       color: '#60a5fa' },
  { id: 'sin_pago',         label: 'Sin pago',          icon: Ban,        color: '#94a3b8' },
]

const TICKET_OPTIONS = [
  { id: 'fiscal', label: 'Ticket fiscal', icon: Receipt },
  { id: 'no_fiscal', label: 'Ticket no fiscal', icon: FileText },
  { id: 'no_imprimir', label: 'No imprimir', icon: Printer },
]

const TARJETAS = new Set(['tarjeta_credito', 'tarjeta_debito'])

export default function CerrarPedidoModal({ open, pedido, onClose, onCerrarPedido, title = 'Cerrar pedido' }) {
  const {
    arcaReady,
    facturarEImprimir,
    imprimirTicket,
    imprimirTicketNoFiscal,
    registrarPago,
  } = useFacturacion()

  const [medio, setMedio] = useState('efectivo')
  const [ticket, setTicket] = useState('no_fiscal')
  const [nroOp, setNroOp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dividir, setDividir] = useState(false)
  const [lineas, setLineas] = useState([])

  const comprobanteAutorizado = useMemo(
    () => (pedido ? getAuthorizedComprobante(pedido) : null),
    [pedido],
  )

  useEffect(() => {
    if (!open) return
    setMedio('efectivo')
    setTicket('no_fiscal')
    setNroOp('')
    setLoading(false)
    setError(null)
    setDividir(false)
    setLineas([nuevaLinea('efectivo', Math.round(Number(pedido?.total || 0)))])
  }, [open, pedido?.id, pedido?.total])

  if (!open || !pedido) return null

  const needsNroOp = TARJETAS.has(medio)
  const nroOpOk = needsNroOp ? String(nroOp).trim().length > 0 : true
  const fiscalDisponible = Boolean(arcaReady || comprobanteAutorizado)
  const pagoOk = dividir ? lineasValidas(lineas, pedido.total) : nroOpOk
  const canSubmit = !loading && pagoOk && (ticket !== 'fiscal' || fiscalDisponible)
  const medioTicket = dividir ? resumenMedios(lineas) : medio

  const submit = async () => {
    if (!pagoOk) {
      setError(dividir
        ? 'El total dividido tiene que coincidir con el monto a cobrar.'
        : 'Ingresa el numero de operacion del posnet.')
      return
    }
    if (ticket === 'fiscal' && !fiscalDisponible) {
      setError('ARCA no esta configurado para emitir ticket fiscal.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      let comprobanteUsado = comprobanteAutorizado

      if (ticket === 'fiscal') {
        if (comprobanteAutorizado) {
          await imprimirTicket(pedido, comprobanteAutorizado, medioTicket)
        } else {
          comprobanteUsado = await facturarEImprimir(pedido, { medio_pago: medioTicket })
        }
      } else if (ticket === 'no_fiscal') {
        await imprimirTicketNoFiscal(pedido, medioTicket)
      }

      if (dividir) {
        await registrarPago({
          pedido,
          comprobante: comprobanteUsado,
          pagos: lineasAPagos(lineas),
        })
      } else if (medio !== 'sin_pago') {
        await registrarPago({
          pedido,
          comprobante: comprobanteUsado,
          medio_pago: medio,
          numero_operacion: needsNroOp ? nroOp.trim() : null,
          monto: pedido.total,
        })
      }

      const err = await onCerrarPedido?.(pedido.id)
      if (err) {
        setError(err.message || 'El pago se registro, pero no se pudo cerrar el pedido.')
        return
      }

      onClose?.({ closed: true })
    } catch (e) {
      setError(e.message || 'No se pudo cerrar el pedido.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={loading ? undefined : () => onClose?.()} />

      <div
        className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
      >
        <header className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>Total ${formatMoney(pedido.total || 0)}</p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-50"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto p-5">
          {comprobanteAutorizado && (
            <div
              className="flex items-start gap-2 rounded-lg p-3 text-xs"
              style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent-lift)' }}
            >
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              <span>Ya tiene factura autorizada. Si elegis fiscal, se reimprime.</span>
            </div>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Medio de pago
              </p>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer" style={{ color: dividir ? 'var(--accent-lift)' : 'var(--text-muted)' }}>
                <input type="checkbox" checked={dividir} onChange={e => { setDividir(e.target.checked); setError(null) }} disabled={loading} className="h-3.5 w-3.5 accent-[var(--accent)]" />
                Dividir pago
              </label>
            </div>

            {dividir ? (
              <SplitPagoLines total={pedido.total} lineas={lineas} setLineas={setLineas} />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {MEDIOS_PAGO.map(opt => {
                    const Icon = opt.icon
                    const active = medio === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => { setMedio(opt.id); setError(null) }}
                        disabled={loading}
                        className="flex items-center gap-2 rounded-lg px-3 py-3 text-left transition-colors disabled:opacity-50"
                        style={active
                          ? { background: 'var(--accent-soft)', border: `1px solid ${opt.color}`, color: opt.color }
                          : { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                      >
                        <Icon size={16} style={{ color: opt.color }} />
                        <span className="text-xs font-semibold">{opt.label}</span>
                      </button>
                    )
                  })}
                </div>

                {medio === 'sin_pago' && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    Cierra el pedido sin sumar importes al arqueo.
                  </p>
                )}

                {needsNroOp && (
                  <label className="mt-3 block">
                    <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                      Nro. operacion
                    </span>
                    <input
                      inputMode="numeric"
                      autoFocus
                      value={nroOp}
                      onChange={e => setNroOp(e.target.value)}
                      placeholder="Ej: 0123456789"
                      className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{
                        background: 'var(--bg-input)',
                        border: `1px solid ${nroOpOk ? 'var(--border)' : '#f87171'}`,
                        color: 'var(--text-primary)',
                      }}
                    />
                  </label>
                )}
              </>
            )}
          </section>

          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Ticket
            </p>
            <div className="space-y-2">
              {TICKET_OPTIONS.map(opt => {
                const Icon = opt.icon
                const active = ticket === opt.id
                const disabled = loading || (opt.id === 'fiscal' && !fiscalDisponible)
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => { setTicket(opt.id); setError(null) }}
                    disabled={disabled}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors disabled:opacity-40"
                    style={active
                      ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                      : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    <Icon size={15} />
                    <span className="text-sm font-semibold">{opt.label}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {error && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
            >
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <footer className="p-5 pt-0">
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-45"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
            Cerrar pedido
          </button>
        </footer>
      </div>
    </div>
  )
}
