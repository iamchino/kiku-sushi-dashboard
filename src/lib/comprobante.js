import {
  COND_IVA_RECEPTOR,
  COND_IVA_RECEPTOR_LABEL,
  CONDICIONES_FACTURA_A,
  DOC_TIPO,
  RECEPTOR_CONSUMIDOR_FINAL,
  TIPO_CBTE,
  buildReceptor,
  validateCuit,
} from './fiscal'

/**
 * Selector Factura B (consumidor final) / Factura A (con CUIT) con los datos
 * del receptor. Se usa en Cobrar mesa, Cerrar pedido y Facturar pedido.
 *
 * Estado (lo maneja el padre):
 *   { tipo: 'B' | 'A', cuit, nombre, condicion, domicilio }
 */

export function comprobanteInicial(pedido) {
  return {
    tipo: 'B',
    cuit: '',
    nombre: pedido?.cliente_nombre || '',
    condicion: COND_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO,
    domicilio: '',
  }
}

/** Devuelve el error a mostrar, o null si se puede facturar. */
export function validarComprobante(c) {
  if (!c || c.tipo !== 'A') return null
  if (!validateCuit(c.cuit)) return 'Para Factura A hace falta un CUIT válido del cliente.'
  if (!String(c.nombre || '').trim()) return 'Para Factura A falta la razón social del cliente.'
  if (!CONDICIONES_FACTURA_A.includes(Number(c.condicion))) {
    return 'Factura A solo va a Responsable Inscripto o Monotributo.'
  }
  return null
}

/** Opciones para facturarEImprimir: { tipo_cbte, receptor }. */
export function opcionesFactura(c) {
  if (!c || c.tipo !== 'A') {
    return { tipo_cbte: TIPO_CBTE.FACTURA_B, receptor: RECEPTOR_CONSUMIDOR_FINAL }
  }
  const condicion = Number(c.condicion)
  return {
    tipo_cbte: TIPO_CBTE.FACTURA_A,
    receptor: buildReceptor({
      nombre: String(c.nombre).trim(),
      cuit: c.cuit,
      doc_tipo: DOC_TIPO.CUIT,
      condicion_iva_id: condicion,
      condicion_iva: COND_IVA_RECEPTOR_LABEL[condicion],
      domicilio: String(c.domicilio || '').trim(),
    }),
  }
}
