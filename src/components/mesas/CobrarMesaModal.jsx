import { useState } from 'react'
import { X, Loader2, Receipt, FileText, CheckCircle2, AlertCircle, Lock } from 'lucide-react'
import { useFacturacion } from '../../hooks/useFacturacion'
import { getAuthorizedComprobante } from '../../lib/fiscal'
import { formatMoney } from '../../lib/printing'

/**
 * Modal de cobro de mesa.
 * Reusa useFacturacion para:
 *  - Imprimir ticket no fiscal (sin disparar ARCA)
 *  - Facturar (ARCA) + imprimir
 *  - Cerrar mesa (marca pedido como entregado)
 *
 * MVP: no incluye selector de medio de pago.
 */
export default function CobrarMesaModal({ open, onClose, pedido, onCerrarMesa }) {
  const {
    config, arcaReady,
    facturarEImprimir, imprimirTicketNoFiscal, imprimirTicket,
  } = useFacturacion()

  const [loadingTicket, setLoadingTicket] = useState(false)
  const [loadingFactura, setLoadingFactura] = useState(false)
  const [loadingCierre, setLoadingCierre] = useState(false)
  const [error, setError] = useState(null)

  if (!open || !pedido) return null

  const comprobanteAutorizado = getAuthorizedComprobante(pedido)

  const handleTicketNoFiscal = async () => {
    setError(null); setLoadingTicket(true)
    try {
      await imprimirTicketNoFiscal(pedido)
    } catch (e) {
      setError(e.message || 'Error al imprimir')
    } finally {
      setLoadingTicket(false)
    }
  }

  const handleFacturar = async () => {
    setError(null); setLoadingFactura(true)
    try {
      if (comprobanteAutorizado) {
        await imprimirTicket(pedido, comprobanteAutorizado)
      } else {
        await facturarEImprimir(pedido)
      }
    } catch (e) {
      setError(e.message || 'Error al facturar')
    } finally {
      setLoadingFactura(false)
    }
  }

  const handleCerrar = async () => {
    setError(null); setLoadingCierre(true)
    const { error: err } = await onCerrarMesa?.() || {}
    setLoadingCierre(false)
    if (err) { setError(err.message || 'Error al cerrar mesa'); return }
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
          <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Cobrar mesa</p>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
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
                  Factura B {comprobanteAutorizado?.punto_venta?.toString().padStart(5,'0')}-
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

          {error && (
            <div
              className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
            >
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {/* Acciones de impresión */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleTicketNoFiscal}
              disabled={loadingTicket}
              className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              {loadingTicket
                ? <><Loader2 size={14} className="animate-spin" /> Imprimiendo…</>
                : <><FileText size={14} /> Ticket no fiscal</>
              }
            </button>

            <button
              type="button"
              onClick={handleFacturar}
              disabled={loadingFactura || (!arcaReady && !comprobanteAutorizado)}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 hover:scale-[1.01]"
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
                boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.35)',
              }}
            >
              {loadingFactura
                ? <><Loader2 size={14} className="animate-spin" /> Procesando…</>
                : comprobanteAutorizado
                  ? <><Receipt size={14} /> Re-imprimir factura</>
                  : <><Receipt size={14} /> Facturar + ticket fiscal</>
              }
            </button>
          </div>

          {/* Cerrar mesa */}
          <button
            type="button"
            onClick={handleCerrar}
            disabled={loadingCierre}
            className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
            style={{
              background: comprobanteAutorizado ? '#ef4444' : 'var(--bg-input)',
              color: comprobanteAutorizado ? '#ffffff' : 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            {loadingCierre
              ? <Loader2 size={11} className="animate-spin" />
              : <Lock size={11} />
            }
            {comprobanteAutorizado ? 'Cerrar mesa y liberar' : 'Cerrar mesa sin facturar'}
          </button>

          {!config?.cuit && (
            <p className="text-[10px] text-center" style={{ color: 'var(--text-xmuted)' }}>
              Configurá tus datos fiscales en Caja para habilitar facturación.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
