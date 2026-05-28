import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Receipt, X } from 'lucide-react'
import {
  COND_IVA_RECEPTOR,
  COND_IVA_RECEPTOR_LABEL,
  DOC_TIPO,
  RECEPTOR_CONSUMIDOR_FINAL,
  TIPO_CBTE,
  buildReceptor,
  nombreComprobante,
  validateCuit,
} from '../../lib/fiscal'
import { formatMoney } from '../../lib/printing'

const TIPOS_DISPONIBLES = [
  { id: TIPO_CBTE.FACTURA_B, label: 'Factura B', detail: 'Consumidor Final' },
  { id: TIPO_CBTE.FACTURA_A, label: 'Factura A', detail: 'Responsable Inscripto' },
]

const CONDICIONES_RECEPTOR_A = [
  COND_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO,
  COND_IVA_RECEPTOR.MONOTRIBUTO,
  COND_IVA_RECEPTOR.IVA_SUJETO_EXENTO,
  COND_IVA_RECEPTOR.SUJETO_NO_CATEGORIZADO,
]

export function FacturarModal({ open, pedido, busy, permiteFacturaA = true, onClose, onConfirm }) {
  const [tipo, setTipo] = useState(TIPO_CBTE.FACTURA_B)
  const [receptorNombre, setReceptorNombre] = useState('')
  const [receptorCuit, setReceptorCuit] = useState('')
  const [receptorCondicion, setReceptorCondicion] = useState(COND_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO)
  const [receptorDomicilio, setReceptorDomicilio] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setTipo(TIPO_CBTE.FACTURA_B)
    setReceptorNombre(pedido?.cliente_nombre || '')
    setReceptorCuit('')
    setReceptorCondicion(COND_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO)
    setReceptorDomicilio(pedido?.cliente_direccion || '')
    setError(null)
  }, [open, pedido])

  const cuitOk = useMemo(() => !receptorCuit || validateCuit(receptorCuit), [receptorCuit])
  const esFacturaA = tipo === TIPO_CBTE.FACTURA_A

  const submit = (e) => {
    e.preventDefault()
    setError(null)

    if (esFacturaA) {
      if (!validateCuit(receptorCuit)) {
        setError('Para Factura A es obligatorio un CUIT válido del receptor.')
        return
      }
      if (!receptorNombre.trim()) {
        setError('Falta la razón social del receptor.')
        return
      }
    }

    const receptor = esFacturaA
      ? buildReceptor({
          nombre: receptorNombre.trim(),
          cuit: receptorCuit,
          doc_tipo: DOC_TIPO.CUIT,
          condicion_iva_id: receptorCondicion,
          condicion_iva: COND_IVA_RECEPTOR_LABEL[receptorCondicion],
          domicilio: receptorDomicilio.trim(),
        })
      : RECEPTOR_CONSUMIDOR_FINAL

    onConfirm({ tipo_cbte: tipo, receptor })
  }

  if (!open || !pedido) return null

  const total = Number(pedido.total || 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <form
        onSubmit={submit}
        className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-lg"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
      >
        <header className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Facturar pedido</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total a facturar: ${formatMoney(total)}</p>
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

        <div className="flex-1 overflow-y-auto p-5">
          <section>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Tipo de comprobante</p>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_DISPONIBLES.map(opt => {
                const disabled = opt.id === TIPO_CBTE.FACTURA_A && !permiteFacturaA
                const active = tipo === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setTipo(opt.id)}
                    className="rounded-lg px-3 py-3 text-left disabled:opacity-40 disabled:cursor-not-allowed"
                    style={active
                      ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                      : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    <p className="text-sm font-semibold">{opt.label}</p>
                    <p className="text-[10px] mt-0.5">{opt.detail}</p>
                  </button>
                )
              })}
            </div>
            {!permiteFacturaA && (
              <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                Para habilitar Factura A activá <code>permite_factura_a</code> en facturacion_config.
              </p>
            )}
          </section>

          {esFacturaA && (
            <section className="mt-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Datos del receptor
              </p>

              <div>
                <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Razón social</label>
                <input
                  value={receptorNombre}
                  onChange={e => setReceptorNombre(e.target.value)}
                  placeholder="Empresa SRL"
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>CUIT</label>
                  <input
                    inputMode="numeric"
                    value={receptorCuit}
                    onChange={e => setReceptorCuit(e.target.value)}
                    placeholder="20XXXXXXXXX"
                    className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{
                      background: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      border: `1px solid ${cuitOk ? 'var(--border)' : '#f87171'}`,
                    }}
                  />
                  {!cuitOk && (
                    <p className="mt-1 text-[10px]" style={{ color: '#f87171' }}>CUIT inválido (dígito verificador).</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Condición IVA</label>
                  <select
                    value={receptorCondicion}
                    onChange={e => setReceptorCondicion(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  >
                    {CONDICIONES_RECEPTOR_A.map(id => (
                      <option key={id} value={id}>{COND_IVA_RECEPTOR_LABEL[id]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Domicilio (opcional)</label>
                <input
                  value={receptorDomicilio}
                  onChange={e => setReceptorDomicilio(e.target.value)}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
              </div>
            </section>
          )}

          {error && (
            <div
              className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <footer className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Va a emitirse {nombreComprobante(tipo)} por ${formatMoney(total)} y enviar al WSFE de ARCA.
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
              disabled={busy || (esFacturaA && !cuitOk)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Receipt size={15} />}
              Confirmar y facturar
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}

export default FacturarModal
