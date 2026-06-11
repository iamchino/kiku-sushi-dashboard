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
  Receipt,
  Send,
  X,
} from 'lucide-react'
import { useFacturacion } from '../../hooks/useFacturacion'
import { getAuthorizedComprobante } from '../../lib/fiscal'
import { formatMoney } from '../../lib/printing'

/**
 * Modal de cobro de mesa.
 *
 * Flujo:
 *  1) El mozo elige medio de pago (efectivo / transferencia / crédito / débito).
 *     Si es tarjeta, ingresa el nro de operación del posnet.
 *  2) Una vez cargado el medio, se habilitan las acciones:
 *      - Ticket no fiscal       (imprime + registra pago + cierra mesa)
 *      - Facturar + ticket      (ARCA + imprime + registra pago + cierra mesa)
 *      - Cerrar sin imprimir    (registra pago + cierra mesa)
 *  3) Si la mesa ya tenía factura emitida, el botón de facturar pasa a "Re-imprimir".
 */

const MEDIOS_PAGO = [
  { id: 'efectivo',         label: 'Efectivo',          icon: Banknote,   color: '#34d399' },
  { id: 'tarjeta_credito',  label: 'Tarjeta Crédito',   icon: CreditCard, color: '#f59e0b' },
  { id: 'tarjeta_debito',   label: 'Tarjeta Débito',    icon: CreditCard, color: '#a78bfa' },
  { id: 'transferencia',    label: 'Transferencia',     icon: Send,       color: '#60a5fa' },
  { id: 'sin_pago',         label: 'Sin pago',           icon: Ban,        color: '#94a3b8' },
]

const TARJETAS = new Set(['tarjeta_credito', 'tarjeta_debito'])

export default function CobrarMesaModal({ open, onClose, pedido, onCerrarMesa }) {
  const {
    config, arcaReady,
    facturarEImprimir, imprimirTicketNoFiscal, imprimirTicket,
    registrarPago,
  } = useFacturacion()

  const [medio, setMedio] = useState(null)
  const [nroOp, setNroOp] = useState('')
  const [loadingAction, setLoadingAction] = useState(null) // 'ticket' | 'factura' | 'cerrar' | null
  const [error, setError] = useState(null)

  // Reset al abrir
  useEffect(() => {
    if (!open) return
    setMedio(null)
    setNroOp('')
    setError(null)
    setLoadingAction(null)
  }, [open, pedido?.id])

  const comprobanteAutorizado = useMemo(
    () => (pedido ? getAuthorizedComprobante(pedido) : null),
    [pedido],
  )

  if (!open || !pedido) return null

  const needsNroOp = medio && TARJETAS.has(medio)
  const nroOpOk = needsNroOp ? String(nroOp).trim().length > 0 : true
  const medioOk = Boolean(medio) && nroOpOk

  // Wrapper para correr una acción con loading + error + cierre mesa + cierre modal.
  const runAction = async (kind, fn) => {
    if (!medioOk) {
      setError('Elegí un medio de pago antes de continuar.')
      return
    }
    setError(null)
    setLoadingAction(kind)
    try {
      const comprobanteUsado = await fn()

      // 1) Registrar el pago en la BD (para arqueo). "Sin pago" cierra sin sumar caja.
      if (medio !== 'sin_pago') {
        await registrarPago({
          pedido,
          comprobante: comprobanteUsado || comprobanteAutorizado,
          medio_pago: medio,
          numero_operacion: needsNroOp ? nroOp.trim() : null,
          monto: pedido.total,
        })
      }

      // 2) Cerrar la mesa (RPC)
      if (onCerrarMesa) {
        const { error: cerrarErr } = (await onCerrarMesa()) || {}
        if (cerrarErr) {
          setError(`Pago y/o factura registrados, pero la mesa no se cerró: ${cerrarErr.message || cerrarErr}`)
          return
        }
      }

      onClose?.()
    } catch (e) {
      setError(e.message || 'Algo falló en la acción.')
    } finally {
      setLoadingAction(null)
    }
  }

  const handleTicketNoFiscal = () => runAction('ticket', async () => {
    await imprimirTicketNoFiscal(pedido, medio)
    return null
  })

  const handleFacturar = () => runAction('factura', async () => {
    if (comprobanteAutorizado) {
      await imprimirTicket(pedido, comprobanteAutorizado, medio)
      return comprobanteAutorizado
    }
    return await facturarEImprimir(pedido, { medio_pago: medio })
  })

  const handleCerrarSinImprimir = () => runAction('cerrar', async () => null)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={loadingAction ? undefined : onClose} />

      <div
        className="relative w-full max-w-md rounded-2xl flex flex-col max-h-[92vh] overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Cobrar mesa</p>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(loadingAction)}
            className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-50"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Resumen */}
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
          >
            <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: 'var(--text-muted)' }}>Total</p>
            <p className="text-3xl font-bold mt-1" style={{ color: 'var(--accent-lift)' }}>
              ${formatMoney(pedido.total || 0)}
            </p>
            {pedido.mesa && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Mesa {pedido.mesa} · {pedido.personas || 1} personas
              </p>
            )}
          </div>

          {/* Estado factura */}
          {comprobanteAutorizado && (
            <div
              className="rounded-lg p-3 text-xs flex items-start gap-2"
              style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent-lift)' }}
            >
              <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Ya se facturó</p>
                <p className="mt-0.5 opacity-90">
                  Factura {comprobanteAutorizado.letra} {comprobanteAutorizado?.punto_venta?.toString().padStart(5,'0')}-
                  {comprobanteAutorizado?.numero?.toString().padStart(8,'0')} · CAE {comprobanteAutorizado.cae}
                </p>
              </div>
            </div>
          )}

          {/* Estado ARCA */}
          {!arcaReady && !comprobanteAutorizado && (
            <div
              className="rounded-lg p-3 text-xs flex items-start gap-2"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}
            >
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">ARCA no configurado</p>
                <p className="mt-0.5 opacity-90">
                  Falta CUIT / punto de venta o el backend WSFE. Podés imprimir solo ticket no fiscal.
                </p>
              </div>
            </div>
          )}

          {/* Selector de medio de pago */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
              Medio de pago *
            </p>
            <div className="grid grid-cols-2 gap-2">
              {MEDIOS_PAGO.map(opt => {
                const Icon = opt.icon
                const active = medio === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => { setMedio(opt.id); setError(null) }}
                    disabled={Boolean(loadingAction)}
                    className="rounded-lg px-3 py-3 text-left flex items-center gap-2 transition-colors disabled:opacity-50"
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

            {needsNroOp && (
              <div className="mt-3">
                <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Nro. operación (posnet) *
                </label>
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
                {!nroOpOk && (
                  <p className="text-[10px] mt-1" style={{ color: '#f87171' }}>Obligatorio para tarjetas.</p>
                )}
              </div>
            )}
          </div>

          {error && (
            <div
              className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
            >
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleTicketNoFiscal}
              disabled={!medioOk || Boolean(loadingAction)}
              className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              {loadingAction === 'ticket'
                ? <><Loader2 size={14} className="animate-spin" /> Imprimiendo y cerrando…</>
                : <><FileText size={14} /> Ticket no fiscal + cerrar mesa</>
              }
            </button>

            <button
              type="button"
              onClick={handleFacturar}
              disabled={!medioOk || Boolean(loadingAction) || (!arcaReady && !comprobanteAutorizado)}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 hover:scale-[1.01]"
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
                boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.35)',
              }}
            >
              {loadingAction === 'factura'
                ? <><Loader2 size={14} className="animate-spin" /> Procesando…</>
                : comprobanteAutorizado
                  ? <><Receipt size={14} /> Re-imprimir factura + cerrar mesa</>
                  : <><Receipt size={14} /> Facturar + ticket fiscal + cerrar mesa</>
              }
            </button>
          </div>

          <button
            type="button"
            onClick={handleCerrarSinImprimir}
            disabled={!medioOk || Boolean(loadingAction)}
            className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40"
            style={{
              background: 'var(--bg-input)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            {loadingAction === 'cerrar'
              ? <Loader2 size={11} className="animate-spin" />
              : <Lock size={11} />
            }
            Cerrar mesa sin imprimir
          </button>

          {!config?.cuit && (
            <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
              Configurá tus datos fiscales en Caja para habilitar facturación.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
