import { useEffect, useState } from 'react'
import { Download, FileText, Loader2, Printer, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Field, ModalShell } from '../finanzas/fields'
import { formatReceiptNumber, nombreComprobante } from '../../lib/fiscal'

// Datos del cliente que van impresos en el comprobante (razón social / nombre
// y domicilio). Se pueden corregir DESPUÉS de facturar: ARCA autoriza con el
// tipo y número de documento, el nombre y el domicilio son solo lo que se
// imprime, así que editarlos no toca el CAE. El CUIT/DNI no se edita acá: ese
// sí viajó a ARCA.
//
// Guarda en comprobantes_fiscales (receptor_nombre, receptor_domicilio) y
// devuelve el comprobante ya actualizado para descargar o imprimir.

const docLabel = (tipo) => ({ 80: 'CUIT', 86: 'CUIL', 96: 'DNI' }[Number(tipo)] || 'Doc.')

export default function ComprobanteDatosModal({ open, pedido, comprobante, onClose, onDescargar, onImprimir, onGuardado }) {
  const [nombre, setNombre] = useState('')
  const [domicilio, setDomicilio] = useState('')
  const [busy, setBusy] = useState(null)      // 'guardar' | 'pdf' | 'ticket'
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || !comprobante) return
    setNombre(comprobante.receptor_nombre || '')
    setDomicilio(comprobante.receptor_domicilio || '')
    setError(null)
    setBusy(null)
  }, [open, comprobante])

  if (!open || !comprobante) return null

  const nro = formatReceiptNumber(comprobante.punto_venta, comprobante.numero)
  const conDoc = Number(comprobante.doc_tipo || 99) !== 99 && comprobante.doc_nro && comprobante.doc_nro !== '0'
  const cambio = nombre.trim() !== (comprobante.receptor_nombre || '')
    || domicilio.trim() !== (comprobante.receptor_domicilio || '')

  // Guarda si hace falta y devuelve el comprobante con los datos nuevos.
  const guardar = async () => {
    const nombreFinal = nombre.trim() || 'Consumidor Final'
    const domicilioFinal = domicilio.trim() || null
    if (!cambio) return comprobante
    const { data, error: err } = await supabase
      .from('comprobantes_fiscales')
      .update({ receptor_nombre: nombreFinal, receptor_domicilio: domicilioFinal, updated_at: new Date().toISOString() })
      .eq('id', comprobante.id)
      .select('id')
    if (err) throw new Error(err.message)
    // RLS no da error cuando bloquea: actualiza cero filas.
    if (!data || data.length === 0) throw new Error('No se pudo guardar: tu usuario no tiene permiso para editar comprobantes.')
    const actualizado = { ...comprobante, receptor_nombre: nombreFinal, receptor_domicilio: domicilioFinal }
    onGuardado?.(actualizado)
    return actualizado
  }

  const correr = async (accion, fn) => {
    setBusy(accion); setError(null)
    try {
      const actualizado = await guardar()
      await fn(actualizado)
    } catch (err) {
      setError(err.message || 'No se pudo completar.')
    } finally {
      setBusy(null)
    }
  }

  const btn = (color, fondo) => ({ background: fondo, color, border: fondo ? 'none' : '1px solid var(--border)' })

  return (
    <ModalShell title={`${nombreComprobante(comprobante.tipo_cbte)} ${nro}`} icon={FileText} onClose={busy ? () => {} : onClose} maxW="max-w-md">
      <div className="p-5 space-y-4">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Así va a salir el cliente en el PDF y en el ticket. Se puede corregir ahora: el CAE no cambia,
          ARCA autorizó con el documento{conDoc ? ` (${docLabel(comprobante.doc_tipo)} ${comprobante.doc_nro})` : ' "sin identificar"'}.
        </p>

        <Field label="Razón social / nombre" value={nombre} onChange={setNombre}
          placeholder="Consumidor Final" maxLength={120} />
        <Field label="Domicilio (opcional)" value={domicilio} onChange={setDomicilio}
          placeholder="Calle 123, Rosario" maxLength={160} />

        {conDoc && (
          <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
            {docLabel(comprobante.doc_tipo)} {comprobante.doc_nro} · {comprobante.receptor_condicion_iva || ''} — ese dato viajó a ARCA y no se edita acá.
          </p>
        )}

        {error && <p className="text-xs" style={{ color: 'var(--bad)' }}>{error}</p>}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" disabled={Boolean(busy)} onClick={onClose}
            className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
            style={btn('var(--text-muted)', null)}>
            Cancelar
          </button>
          <button type="button" disabled={Boolean(busy) || !cambio}
            onClick={() => correr('guardar', async () => onClose())}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
            style={btn('var(--text-secondary)', null)}>
            {busy === 'guardar' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
          </button>
          <button type="button" disabled={Boolean(busy)}
            onClick={() => correr('ticket', async (c) => { await onImprimir(pedido, c); onClose() })}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            style={btn('#fff', '#2563eb')}>
            {busy === 'ticket' ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} Imprimir ticket
          </button>
          <button type="button" disabled={Boolean(busy)}
            onClick={() => correr('pdf', async (c) => { await onDescargar(pedido, c); onClose() })}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 btn-cta"
            style={{ background: 'var(--cta)', color: 'var(--cta-text)' }}>
            {busy === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Descargar PDF
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
