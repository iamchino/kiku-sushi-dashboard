import { calculateDiscountAmount, calculateOrderSubtotal, clampDiscount } from './orders'

const ARCA_QR_BASE_URL = 'https://www.arca.gob.ar/fe/qr/'

export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

export function formatReceiptNumber(pointOfSale, number) {
  const pv = String(pointOfSale || 0).padStart(5, '0')
  const nro = String(number || 0).padStart(8, '0')
  return `${pv}-${nro}`
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
  return comprobantes.find(c => c.estado === 'autorizado') || null
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

export function buildFiscalRequest(pedido, config) {
  const tax = splitTax(pedido?.total, config?.alicuota_iva)
  const puntoVenta = Number(config?.punto_venta || 0)
  const items = pedido.pedido_items || []
  const descuento = clampDiscount(pedido?.descuento_porcentaje)
  const subtotal = calculateOrderSubtotal(items)

  return {
    pedido_id: pedido.id,
    punto_venta: puntoVenta,
    tipo_cbte: 6,
    letra: 'B',
    concepto: 1,
    fecha_emision: new Date().toISOString().slice(0, 10),
    receptor: {
      condicion_iva: 'Consumidor Final',
      doc_tipo: 99,
      doc_nro: '0',
      nombre: 'Consumidor Final',
    },
    moneda: 'PES',
    cotizacion: 1,
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
  }
}

export function normalizeComprobanteResponse(result, pedido, config) {
  const raw = result?.comprobante || result?.data || result || {}
  const tax = splitTax(pedido?.total, config?.alicuota_iva)

  return {
    pedido_id: pedido.id,
    estado: raw.estado || 'autorizado',
    letra: raw.letra || 'B',
    tipo_cbte: Number(raw.tipo_cbte ?? raw.tipoCbte ?? 6),
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
