// IVA de las compras (crédito fiscal, SQL 61). Pedido de administración del
// 18/11: al cargar la factura de un proveedor, poner su IVA para que el
// sistema vaya sumando el crédito fiscal al lado del IVA de las ventas.
//
// Se guarda el IVA de la factura (un número), su alícuota (21, 10,5, 27 o
// "varias") y la fecha de la factura: el IVA cuenta en el mes de la factura,
// no en el del pago. Lo que no es IVA (neto y otros conceptos) es el monto
// menos el IVA. Lógica pura: se prueba con `npm run verificar:ivacompras`.

import { fmtPlata, localDateISO } from './finanzas'
import { leerSaldo } from './disponible'

export const ALICUOTAS_COMPRA = [
  { id: '21', label: '21 %', tasa: 21 },
  { id: '10.5', label: '10,5 %', tasa: 10.5 },
  { id: '27', label: '27 %', tasa: 27 },
  { id: 'mixto', label: 'Varias', tasa: null },
]

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/** El IVA que lleva adentro un total con IVA: total − total / (1 + tasa). */
export function ivaDesdeTotal(total, tasa) {
  const t = Number(total)
  const a = Number(tasa)
  if (!(t > 0) || !(a > 0)) return 0
  return r2(t - t / (1 + a / 100))
}

/** La alícuota que corresponde a un IVA sobre un total, si es una de las conocidas (±$1). */
export function alicuotaDe(total, iva) {
  for (const a of ALICUOTAS_COMPRA) {
    if (a.tasa && Math.abs(ivaDesdeTotal(total, a.tasa) - Number(iva)) <= 1) return a.id
  }
  return 'mixto'
}

/** "IVA 21 %" / "IVA 10,5 %" / "IVA (varias alícuotas)". */
export function etiquetaAlicuota(id) {
  const a = ALICUOTAS_COMPRA.find(x => x.id === String(id))
  if (!a || !a.tasa) return 'IVA (varias alícuotas)'
  return `IVA ${a.label}`
}

/**
 * Valida el IVA tipeado (formato argentino: "2.888,63" o "2888.63").
 * @returns {{ ok, iva?, sinIva?, error? }}
 */
export function validarIva({ monto, iva, fechaFactura }, hoyISO = localDateISO()) {
  const texto = String(iva ?? '').trim()
  if (!texto) return { ok: false, error: 'Escribí el IVA de la factura (o elegí la alícuota).' }
  const v = leerSaldo(texto)
  if (v === null) return { ok: false, error: 'El IVA no es un número.' }
  if (v < 0) return { ok: false, error: 'El IVA no puede ser negativo.' }
  const m = Number(monto) || 0
  if (m > 0 && v > m) return { ok: false, error: `El IVA (${fmtPlata(v)}) no puede ser mayor que el monto del pago (${fmtPlata(m)}).` }
  const f = String(fechaFactura || '').slice(0, 10)
  if (f && f > hoyISO) return { ok: false, error: 'La fecha de la factura no puede ser futura.' }
  return { ok: true, iva: r2(v), sinIva: r2(m - v) }
}

/** Suma el IVA de una lista de pagos (los que lo tienen cargado). */
export function resumenIvaCompras(egresos = []) {
  const con = egresos.filter(e => e.iva_credito !== null && e.iva_credito !== undefined)
  const total = r2(con.reduce((s, e) => s + (Number(e.monto) || 0), 0))
  const iva = r2(con.reduce((s, e) => s + (Number(e.iva_credito) || 0), 0))
  return { facturas: con.length, total, iva, sinIva: r2(total - iva) }
}

/**
 * IVA de las ventas menos el de las compras, como lo ve el sistema. No incluye
 * percepciones, retenciones ni saldos de meses anteriores: el número que se
 * paga lo calcula el contador.
 */
export function saldoIva(ivaVentas, ivaCompras) {
  const d = r2((Number(ivaVentas) || 0) - (Number(ivaCompras) || 0))
  return { diferencia: d, aPagar: d > 0 ? d : 0, aFavor: d < 0 ? -d : 0 }
}

const fechaCorta = (s) => {
  const [y, m, d] = String(s || '').slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

/**
 * Filas de la hoja "IVA compras" del Excel: una por factura con IVA cargado,
 * por fecha de la factura, con la fila de total al final.
 */
export function filasLibroIvaCompras(egresos = []) {
  const con = egresos
    .filter(e => e.iva_credito !== null && e.iva_credito !== undefined)
    .sort((a, b) => String(a.factura_fecha || a.fecha || '').localeCompare(String(b.factura_fecha || b.fecha || ''))
      || String(a.descripcion || '').localeCompare(String(b.descripcion || '')))
  const filas = con.map(e => ({
    'Fecha de la factura': fechaCorta(e.factura_fecha || e.fecha),
    'Proveedor': e.proveedor?.razon_social || '',
    'CUIT': e.proveedor?.cuit_cuil || e.proveedor?.cuit || '',
    'Comprobante': e.comprobante_nro || '',
    'Descripción': e.descripcion || '',
    'Alícuota': etiquetaAlicuota(e.iva_alicuota).replace(/^IVA /, ''),
    'Sin IVA (neto y otros)': r2(Number(e.monto) - Number(e.iva_credito)),
    'IVA (crédito fiscal)': r2(e.iva_credito),
    'Total': r2(e.monto),
    'Estado': e.estado === 'pendiente' ? 'Pendiente de pago' : e.medio_pago === 'canje' ? 'Pagada con canje' : 'Pagada',
  }))
  if (filas.length > 0) {
    const r = resumenIvaCompras(con)
    filas.push({
      'Fecha de la factura': 'TOTAL', 'Proveedor': '', 'CUIT': '', 'Comprobante': '', 'Descripción': '', 'Alícuota': '',
      'Sin IVA (neto y otros)': r.sinIva, 'IVA (crédito fiscal)': r.iva, 'Total': r.total, 'Estado': '',
    })
  }
  return filas
}

/** Bloque para la hoja Resumen del Excel (filas de [título, valor, nota]). */
export function bloqueResumenIvaCompras(egresos = [], { ivaVentas = null } = {}) {
  const r = resumenIvaCompras(egresos)
  const filas = [
    ['IVA DE LAS COMPRAS'],
    ['Facturas de proveedores con el IVA cargado (por fecha de la factura)', r.total, `${r.facturas} ${r.facturas === 1 ? 'factura' : 'facturas'}`],
    ['IVA de las compras · crédito fiscal', r.iva],
  ]
  if (ivaVentas !== null) {
    const s = saldoIva(ivaVentas, r.iva)
    filas.push([s.aFavor > 0 ? 'Saldo estimado de IVA a favor (compras − ventas)' : 'Saldo estimado de IVA (ventas − compras)', s.aFavor > 0 ? s.aFavor : s.aPagar])
  }
  filas.push(['Solo cuentan las facturas que tienen el IVA cargado. No incluye percepciones ni retenciones: el número final lo calcula el contador.'])
  return filas
}
