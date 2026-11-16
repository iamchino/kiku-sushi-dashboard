// Pedidos que NO se van a facturar: una marca con motivo que los saca de la
// lista de "Pendientes de facturación". Lógica pura, sin supabase ni React:
// se prueba con `npm run verificar:sinfactura`.
//
// La marca no cambia ningún total: el pedido sigue contando como vendido y
// como no facturado, en pantalla y en el Excel. Lo único que cambia es en qué
// lista aparece, para que "Pendientes" muestre solo lo que de verdad falta
// facturar. Si después se factura igual, la factura manda y la marca se ignora.
import { getAuthorizedComprobante } from './fiscal'

export const MOTIVOS_SUGERIDOS = [
  'Canje / cuenta corriente',
  'Invitación de la casa',
  'Consumo interno',
  'Pedido de prueba',
]

export const MOTIVO_MIN = 3
export const MOTIVO_MAX = 200

/** null si el motivo sirve; si no, el mensaje para mostrar. */
export function validarMotivo(texto) {
  const t = String(texto ?? '').trim()
  if (t.length < MOTIVO_MIN) return 'Escribí el motivo (por qué no se factura).'
  if (t.length > MOTIVO_MAX) return `El motivo es muy largo (máximo ${MOTIVO_MAX} letras).`
  return null
}

const tieneMarca = (marcas, id) => Boolean(marcas && typeof marcas.has === 'function' && marcas.has(id))

/** 'facturado' | 'sin_factura' | 'pendiente' */
export function estadoFacturacion(pedido, marcas) {
  if (getAuthorizedComprobante(pedido)) return 'facturado'
  return tieneMarca(marcas, pedido?.id) ? 'sin_factura' : 'pendiente'
}

/** La marca vigente de un pedido (null si no tiene, o si ya se facturó). */
export function marcaDe(pedido, marcas) {
  return estadoFacturacion(pedido, marcas) === 'sin_factura' ? marcas.get(pedido.id) : null
}

/** Cantidades y montos para la tarjeta de Facturación y la de Totales. */
export function resumenFacturacion(pedidos, marcas) {
  const r = { pendientes: 0, sinFactura: 0, facturados: 0, montoPendiente: 0, montoSinFactura: 0 }
  for (const p of pedidos || []) {
    const estado = estadoFacturacion(p, marcas)
    const total = Number(p?.total) || 0
    if (estado === 'facturado') r.facturados += 1
    else if (estado === 'sin_factura') { r.sinFactura += 1; r.montoSinFactura += total }
    else { r.pendientes += 1; r.montoPendiente += total }
  }
  r.montoPendiente = Math.round(r.montoPendiente * 100) / 100
  r.montoSinFactura = Math.round(r.montoSinFactura * 100) / 100
  return r
}

/** Los ids que vale la pena consultar: los pedidos sin factura vigente. */
export function idsSinFacturaVigente(pedidos) {
  return (pedidos || []).filter(p => p?.id && !getAuthorizedComprobante(p)).map(p => p.id)
}
