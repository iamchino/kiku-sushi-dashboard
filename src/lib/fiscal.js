import { calculateDiscountAmount, calculateOrderSubtotal, clampDiscount } from './orders'

const ARCA_QR_BASE_URL = 'https://www.arca.gob.ar/fe/qr/'

// ─────────────────────────────────────────────────────────────────────────────
// Catálogos ARCA
// ─────────────────────────────────────────────────────────────────────────────

export const TIPO_CBTE = {
  FACTURA_A: 1,
  NOTA_DEBITO_A: 2,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_DEBITO_B: 7,
  NOTA_CREDITO_B: 8,
  FACTURA_C: 11,
  NOTA_DEBITO_C: 12,
  NOTA_CREDITO_C: 13,
}

export const DOC_TIPO = {
  CUIT: 80,
  CUIL: 86,
  DNI: 96,
  SIN_IDENTIFICAR: 99,
}

// Códigos CondicionIVAReceptorId (RG 5616/2024)
export const COND_IVA_RECEPTOR = {
  RESPONSABLE_INSCRIPTO: 1,
  IVA_SUJETO_EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTO: 6,
  SUJETO_NO_CATEGORIZADO: 7,
  PROVEEDOR_EXTERIOR: 8,
  CLIENTE_EXTERIOR: 9,
  IVA_LIBERADO: 10,
  MONOTRIBUTISTA_SOCIAL: 13,
  IVA_NO_ALCANZADO: 15,
  MONOTRIBUTO_PROMOVIDO: 16,
}

export const COND_IVA_RECEPTOR_LABEL = {
  [COND_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO]: 'Responsable Inscripto',
  [COND_IVA_RECEPTOR.IVA_SUJETO_EXENTO]: 'IVA Sujeto Exento',
  [COND_IVA_RECEPTOR.CONSUMIDOR_FINAL]: 'Consumidor Final',
  [COND_IVA_RECEPTOR.MONOTRIBUTO]: 'Monotributo',
  [COND_IVA_RECEPTOR.SUJETO_NO_CATEGORIZADO]: 'Sujeto No Categorizado',
}

/** Devuelve la letra ('A'|'B'|'C') a partir del tipo numérico. */
export function letraFromTipo(tipoCbte) {
  const t = Number(tipoCbte)
  if ([1, 2, 3].includes(t)) return 'A'
  if ([6, 7, 8].includes(t)) return 'B'
  if ([11, 12, 13].includes(t)) return 'C'
  return 'B'
}

/** Devuelve true si el tipo es una Nota de Crédito. */
export function esNotaCredito(tipoCbte) {
  return [3, 8, 13].includes(Number(tipoCbte))
}

/** Devuelve true si el tipo es una Nota de Débito. */
export function esNotaDebito(tipoCbte) {
  return [2, 7, 12].includes(Number(tipoCbte))
}

/** Nombre legible del comprobante. */
export function nombreComprobante(tipoCbte) {
  const t = Number(tipoCbte)
  const mapa = {
    1: 'Factura A',
    2: 'Nota de Débito A',
    3: 'Nota de Crédito A',
    6: 'Factura B',
    7: 'Nota de Débito B',
    8: 'Nota de Crédito B',
    11: 'Factura C',
    12: 'Nota de Débito C',
    13: 'Nota de Crédito C',
  }
  return mapa[t] || `Comprobante ${t}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

export function formatReceiptNumber(pointOfSale, number) {
  const pv = String(pointOfSale || 0).padStart(5, '0')
  const nro = String(number || 0).padStart(8, '0')
  return `${pv}-${nro}`
}

/** Valida un CUIT con dígito verificador. */
export function validateCuit(value) {
  const digits = onlyDigits(value)
  if (digits.length !== 11) return false
  const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const sum = digits
    .slice(0, 10)
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * factors[i], 0)
  const mod = sum % 11
  const expected = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod
  return expected === Number(digits[10])
}

export function splitTax(total, ivaRate = 21) {
  const importeTotal = Number(total || 0)
  const rate = Number(ivaRate || 21)
  const divisor = 1 + (rate / 100)
  const importeNeto = Math.round((importeTotal / divisor) * 100) / 100
  const importeIva = Math.round((importeTotal - importeNeto) * 100) / 100

  return {
    importeNeto,
    importeIva,
    importeTotal,
  }
}

export function getAuthorizedComprobante(pedido) {
  const comprobantes = pedido?.comprobantes_fiscales || []
  // Sólo facturas (tipos 1, 6, 11), no notas de crédito
  return comprobantes.find(
    c => c.estado === 'autorizado' && [1, 6, 11].includes(Number(c.tipo_cbte)),
  ) || null
}

export function getNotasCredito(pedido) {
  const comprobantes = pedido?.comprobantes_fiscales || []
  return comprobantes.filter(
    c => c.estado === 'autorizado' && esNotaCredito(c.tipo_cbte),
  )
}

export function buildArcaQrUrl(comprobante, config) {
  const cuit = onlyDigits(config?.cuit)
  const cae = onlyDigits(comprobante?.cae)
  const puntoVenta = Number(comprobante?.punto_venta || config?.punto_venta || 0)
  const numero = Number(comprobante?.numero || 0)

  if (!cuit || !cae || !puntoVenta || !numero) return comprobante?.qr_url || ''

  const payload = {
    ver: 1,
    fecha: String(comprobante.fecha_emision || '').slice(0, 10),
    cuit: Number(cuit),
    ptoVta: puntoVenta,
    tipoCmp: Number(comprobante.tipo_cbte || 6),
    nroCmp: numero,
    importe: Number(comprobante.importe_total || 0),
    moneda: comprobante.moneda || 'PES',
    ctz: Number(comprobante.cotizacion || 1),
    tipoDocRec: Number(comprobante.doc_tipo || 99),
    nroDocRec: Number(onlyDigits(comprobante.doc_nro) || 0),
    tipoCodAut: 'E',
    codAut: Number(cae),
  }

  const json = JSON.stringify(payload)
  const base64 = window.btoa(json)
  return `${ARCA_QR_BASE_URL}?p=${encodeURIComponent(base64)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Receptor por defecto
// ─────────────────────────────────────────────────────────────────────────────

export const RECEPTOR_CONSUMIDOR_FINAL = {
  condicion_iva: 'Consumidor Final',
  condicion_iva_id: COND_IVA_RECEPTOR.CONSUMIDOR_FINAL,
  doc_tipo: DOC_TIPO.SIN_IDENTIFICAR,
  doc_nro: '0',
  nombre: 'Consumidor Final',
  domicilio: '',
}

/** Construye un receptor genérico a partir de inputs del front. */
export function buildReceptor(input = {}) {
  const tipoDoc = input.doc_tipo ?? (input.cuit ? DOC_TIPO.CUIT : DOC_TIPO.SIN_IDENTIFICAR)
  const condId = input.condicion_iva_id ?? (
    input.cuit
      ? COND_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO
      : COND_IVA_RECEPTOR.CONSUMIDOR_FINAL
  )
  return {
    condicion_iva: input.condicion_iva || COND_IVA_RECEPTOR_LABEL[condId] || 'Consumidor Final',
    condicion_iva_id: condId,
    doc_tipo: Number(tipoDoc),
    doc_nro: onlyDigits(input.doc_nro || input.cuit || '0') || '0',
    nombre: String(input.nombre || 'Consumidor Final').trim(),
    domicilio: String(input.domicilio || '').trim(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Armado de payload para WSFE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye el payload que se envía al backend ARCA.
 *
 * @param {object}  pedido   Pedido con items y total.
 * @param {object}  config   facturacion_config row.
 * @param {object}  options  Opciones de facturación.
 * @param {number}  [options.tipo_cbte]   Tipo de comprobante (default 6 = Factura B).
 * @param {object}  [options.receptor]    Datos del receptor (default Consumidor Final).
 * @param {Array}   [options.cbtes_asociados]  Comprobantes asociados (para NC).
 * @param {number}  [options.concepto]    1 productos, 2 servicios, 3 ambos. Default 1.
 */
export function buildFiscalRequest(pedido, config, options = {}) {
  const tipoCbte = Number(options.tipo_cbte || TIPO_CBTE.FACTURA_B)
  const letra = letraFromTipo(tipoCbte)
  const receptor = options.receptor || RECEPTOR_CONSUMIDOR_FINAL
  const concepto = Number(options.concepto || 1)
  const cbtesAsociados = options.cbtes_asociados || []

  const puntoVenta = Number(options.punto_venta || config?.punto_venta || 0)
  const items = pedido.pedido_items || pedido.items || []
  const descuento = clampDiscount(pedido?.descuento_porcentaje)
  const subtotal = calculateOrderSubtotal(items)
  const tax = splitTax(pedido?.total, config?.alicuota_iva)

  return {
    pedido_id: pedido.id,
    punto_venta: puntoVenta,
    tipo_cbte: tipoCbte,
    letra,
    concepto,
    fecha_emision: options.fecha_emision || new Date().toISOString().slice(0, 10),
    receptor: {
      condicion_iva: receptor.condicion_iva,
      condicion_iva_id: receptor.condicion_iva_id,
      doc_tipo: receptor.doc_tipo,
      doc_nro: receptor.doc_nro,
      nombre: receptor.nombre,
      domicilio: receptor.domicilio || '',
    },
    moneda: options.moneda || 'PES',
    cotizacion: Number(options.cotizacion || 1),
    descuento_porcentaje: descuento,
    subtotal,
    descuento_importe: calculateDiscountAmount(subtotal, descuento),
    importes: tax,
    items: items.map(item => ({
      nombre: item.nombre,
      cantidad: Number(item.cantidad || 1),
      precio_unitario: Number(item.precio_unitario || 0),
      total: Number(item.precio_unitario || 0) * Number(item.cantidad || 1),
      notas: item.notas || null,
    })),
    cbtes_asociados: cbtesAsociados,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalizar respuesta del backend
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeComprobanteResponse(result, pedido, config, options = {}) {
  // El backend nuevo devuelve { ok: true, comprobante: {...} }
  // Mantenemos compatibilidad con respuestas legacy { comprobante: {...} } o { data: {...} }.
  const raw = result?.comprobante || result?.data || result || {}
  const tax = splitTax(pedido?.total, config?.alicuota_iva)
  const tipoCbte = Number(raw.tipo_cbte ?? raw.tipoCbte ?? options.tipo_cbte ?? 6)

  return {
    pedido_id: pedido.id,
    estado: raw.estado || 'autorizado',
    letra: raw.letra || letraFromTipo(tipoCbte),
    tipo_cbte: tipoCbte,
    punto_venta: Number(raw.punto_venta ?? raw.pto_vta ?? raw.ptoVta ?? config?.punto_venta ?? 0),
    numero: Number(raw.numero ?? raw.nro_cbte ?? raw.nroCmp ?? raw.cbte_nro ?? 0),
    fecha_emision: raw.fecha_emision || raw.fecha || new Date().toISOString().slice(0, 10),
    concepto: Number(raw.concepto || 1),
    doc_tipo: Number(raw.doc_tipo ?? raw.tipo_doc_rec ?? 99),
    doc_nro: String(raw.doc_nro ?? raw.nro_doc_rec ?? '0'),
    receptor_nombre: raw.receptor_nombre || raw.cliente || 'Consumidor Final',
    receptor_condicion_iva: raw.receptor_condicion_iva || 'Consumidor Final',
    importe_neto: Number(raw.importe_neto ?? raw.imp_neto ?? tax.importeNeto),
    importe_iva: Number(raw.importe_iva ?? raw.imp_iva ?? tax.importeIva),
    importe_total: Number(raw.importe_total ?? raw.imp_total ?? pedido.total ?? 0),
    moneda: raw.moneda || 'PES',
    cotizacion: Number(raw.cotizacion || 1),
    cae: String(raw.cae || raw.CAE || ''),
    cae_vto: raw.cae_vto || raw.CAEFchVto || raw.vencimiento_cae || null,
    qr_url: raw.qr_url || '',
    qr_data_url: raw.qr_data_url || raw.qr_image || null,
    arca_request: result?.request || null,
    arca_response: result,
    error_mensaje: raw.error_mensaje || result?.error || null,
  }
}
