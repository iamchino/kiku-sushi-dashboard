// IVA de las ventas: cuánto de lo facturado es IVA (se le debe a ARCA) y
// cuánto queda sin IVA (es del negocio). Lógica pura, sin supabase ni React:
// se prueba con `npm run verificar:iva`.
//
// El dato ya existe: cada factura y nota de crédito guarda su neto, su IVA y
// su total (los mismos importes que se le mandan a ARCA). Lo que faltaba era
// mostrarlo sumado en los controles.
//
// Reglas, las mismas que usa el resto de la facturación (lib/fiscal.js):
//   · Facturas (y notas de débito) suman. Cuentan las 'autorizado' y también
//     las 'anulado': una factura anulada lo está porque una nota de crédito la
//     cubre, y esa nota de crédito es la que resta.
//   · Notas de crédito autorizadas restan.
//   · Un comprobante A o B que no tenga el desglose guardado (neto e IVA en
//     cero con total mayor a cero) se calcula con la alícuota configurada y se
//     cuenta en `estimados`, para poder avisarlo.
import {
  esNotaCredito, esNotaDebito, formatReceiptNumber, getFacturasAutorizadas, getNotasCredito,
  letraFromTipo, nombreComprobante, splitTax,
} from './fiscal'

const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100

/** 'factura' | 'nota_credito' | 'nota_debito' */
export function claseComprobante(c) {
  if (esNotaCredito(c?.tipo_cbte)) return 'nota_credito'
  if (esNotaDebito(c?.tipo_cbte)) return 'nota_debito'
  return 'factura'
}

/** ¿Entra en el IVA de ventas? (los rechazados, pendientes o con error, no) */
export function cuentaParaIva(c) {
  if (!c) return false
  if (claseComprobante(c) === 'nota_credito') return c.estado === 'autorizado'
  return c.estado === 'autorizado' || c.estado === 'anulado'
}

/**
 * Neto, IVA y total de UN comprobante, siempre en positivo.
 * `estimado: true` si no tenía el desglose guardado y hubo que calcularlo.
 */
export function importesDe(c, alicuota = 21) {
  const total = r2(c?.importe_total)
  let neto = r2(c?.importe_neto)
  let iva = r2(c?.importe_iva)
  let estimado = false
  const letra = c?.letra || letraFromTipo(c?.tipo_cbte)
  if (total > 0 && neto === 0 && iva === 0) {
    if (letra === 'C') {
      // Comprobante C (emisor monotributista): no lleva IVA, todo es neto.
      neto = total
    } else {
      const t = splitTax(total, alicuota)
      neto = t.importeNeto; iva = t.importeIva; estimado = true
    }
  }
  return { neto, iva, total, estimado }
}

const vacio = () => ({ cantidad: 0, neto: 0, iva: 0, total: 0 })

/**
 * Suma una lista de comprobantes.
 * → { facturas, notasCredito, notasDebito: { cantidad, neto, iva, total },
 *     neto, iva, total (ya restadas las notas de crédito), estimados }
 */
export function desgloseIva(comprobantes, alicuota = 21) {
  const d = { facturas: vacio(), notasCredito: vacio(), notasDebito: vacio(), neto: 0, iva: 0, total: 0, estimados: 0 }
  for (const c of comprobantes || []) {
    if (!cuentaParaIva(c)) continue
    const imp = importesDe(c, alicuota)
    const clase = claseComprobante(c)
    const grupo = clase === 'nota_credito' ? d.notasCredito : clase === 'nota_debito' ? d.notasDebito : d.facturas
    grupo.cantidad += 1
    grupo.neto += imp.neto; grupo.iva += imp.iva; grupo.total += imp.total
    if (imp.estimado) d.estimados += 1
  }
  for (const g of [d.facturas, d.notasCredito, d.notasDebito]) {
    g.neto = r2(g.neto); g.iva = r2(g.iva); g.total = r2(g.total)
  }
  d.neto = r2(d.facturas.neto + d.notasDebito.neto - d.notasCredito.neto)
  d.iva = r2(d.facturas.iva + d.notasDebito.iva - d.notasCredito.iva)
  d.total = r2(d.facturas.total + d.notasDebito.total - d.notasCredito.total)
  return d
}

/** Los comprobantes que cuentan de una lista de pedidos (los que trae Caja). */
export function comprobantesDePedidos(pedidos) {
  return (pedidos || []).flatMap(p => [...getFacturasAutorizadas(p), ...getNotasCredito(p)])
}

/** Desglose de lo facturado en una lista de pedidos (los Totales de Caja). */
export const desgloseIvaDePedidos = (pedidos, alicuota = 21) => desgloseIva(comprobantesDePedidos(pedidos), alicuota)

/** Desglose de UN pedido, ya restadas sus notas de crédito (la tarjeta de la orden). */
export const desgloseIvaDePedido = (pedido, alicuota = 21) => desgloseIvaDePedidos([pedido], alicuota)

/**
 * Arma el mismo desglose a partir de lo que devuelve iva_ventas_resumen()
 * (una fila por letra y clase, ya sumada en la base).
 */
export function desgloseDesdeResumen(filas) {
  const d = { facturas: vacio(), notasCredito: vacio(), notasDebito: vacio(), neto: 0, iva: 0, total: 0, estimados: 0 }
  for (const f of filas || []) {
    const grupo = f.clase === 'nota_credito' ? d.notasCredito : f.clase === 'nota_debito' ? d.notasDebito : d.facturas
    grupo.cantidad += Number(f.cantidad) || 0
    grupo.neto = r2(grupo.neto + (Number(f.neto) || 0))
    grupo.iva = r2(grupo.iva + (Number(f.iva) || 0))
    grupo.total = r2(grupo.total + (Number(f.total) || 0))
    d.estimados += Number(f.estimados) || 0
  }
  d.neto = r2(d.facturas.neto + d.notasDebito.neto - d.notasCredito.neto)
  d.iva = r2(d.facturas.iva + d.notasDebito.iva - d.notasCredito.iva)
  d.total = r2(d.facturas.total + d.notasDebito.total - d.notasCredito.total)
  return d
}

/** "IVA 21%" · "IVA 10,5%" */
export function etiquetaIva(alicuota = 21) {
  const a = Number(alicuota) || 21
  return `IVA ${a.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`
}

const fechaCorta = (s) => {
  const [y, m, d] = String(s || '').slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

const DOC = { 80: 'CUIT', 86: 'CUIL', 96: 'DNI' }

/**
 * Filas de la hoja "IVA ventas" del Excel: una por comprobante emitido, en el
 * orden en que se emitieron. Las notas de crédito van en negativo, así la
 * suma de cada columna es lo que corresponde al período.
 *   comprobantes   filas de comprobantes_fiscales
 *   numeroPedido   Map pedido_id → número de pedido (opcional)
 */
export function filasLibroIva(comprobantes, { alicuota = 21, numeroPedido = null } = {}) {
  const lista = (comprobantes || []).filter(cuentaParaIva)
  const porId = new Map(lista.map(c => [c.id, c]))
  const numero = (c) => `${c.letra || letraFromTipo(c.tipo_cbte)} ${formatReceiptNumber(c.punto_venta, c.numero)}`
  const filas = [...lista]
    .sort((a, b) => String(a.fecha_emision || '').localeCompare(String(b.fecha_emision || ''))
      || Number(a.tipo_cbte) - Number(b.tipo_cbte)
      || Number(a.numero || 0) - Number(b.numero || 0))
    .map(c => {
      const imp = importesDe(c, alicuota)
      const clase = claseComprobante(c)
      const s = clase === 'nota_credito' ? -1 : 1
      const asociado = c.cbte_asociado_id ? porId.get(c.cbte_asociado_id) : null
      const docTipo = DOC[Number(c.doc_tipo)] || ''
      const docNro = String(c.doc_nro || '').trim()
      return {
        'Fecha de emisión': fechaCorta(c.fecha_emision),
        'Comprobante': nombreComprobante(c.tipo_cbte),
        'Número': formatReceiptNumber(c.punto_venta, c.numero),
        'Cliente': c.receptor_nombre || 'Consumidor Final',
        'Documento': docTipo && docNro && docNro !== '0' ? `${docTipo} ${docNro}` : '',
        'Condición IVA': c.receptor_condicion_iva || '',
        'Neto gravado': r2(s * imp.neto),
        [etiquetaIva(alicuota)]: r2(s * imp.iva),
        'Total': r2(s * imp.total),
        'CAE': c.cae || '',
        'Pedido': numeroPedido?.get(c.pedido_id) ?? '',
        'Observación': clase === 'nota_credito'
          ? (asociado ? `Anula o descuenta la ${numero(asociado)}` : 'Nota de crédito')
          : c.estado === 'anulado' ? 'Anulada por nota de crédito'
          : imp.estimado ? 'Sin desglose guardado: IVA calculado' : '',
      }
    })
  if (filas.length > 0) {
    const d = desgloseIva(lista, alicuota)
    filas.push({
      'Fecha de emisión': 'TOTAL', 'Comprobante': '', 'Número': '', 'Cliente': '', 'Documento': '', 'Condición IVA': '',
      'Neto gravado': d.neto, [etiquetaIva(alicuota)]: d.iva, 'Total': d.total,
      'CAE': '', 'Pedido': '', 'Observación': '',
    })
  }
  return filas
}

/**
 * Bloque del IVA para la hoja Resumen del Excel (filas de [título, valor, nota]).
 *   porEmision  true: comprobantes emitidos entre `desde` y `hasta` (lo normal)
 *               false: los de los pedidos del período (si no se pudo leer la lista)
 */
export function bloqueResumenIva(desglose, { alicuota = 21, desde, hasta, porEmision = true } = {}) {
  const d = desglose
  const plural = (n, uno, muchos) => `${n} ${n === 1 ? uno : muchos}`
  const filas = [
    ['IVA DE LAS VENTAS'],
    [porEmision
      ? `Comprobantes emitidos del ${fechaCorta(desde)} al ${fechaCorta(hasta)} (por fecha de emisión)`
      : 'Comprobantes de los pedidos del período'],
    ['Facturas emitidas', d.facturas.total, plural(d.facturas.cantidad, 'factura', 'facturas')],
    ['Notas de crédito', d.notasCredito.total ? -d.notasCredito.total : 0, plural(d.notasCredito.cantidad, 'nota de crédito', 'notas de crédito')],
  ]
  if (d.notasDebito.cantidad > 0) {
    filas.push(['Notas de débito', d.notasDebito.total, plural(d.notasDebito.cantidad, 'nota de débito', 'notas de débito')])
  }
  filas.push(
    ['Total facturado (restadas las notas de crédito)', d.total],
    ['Neto gravado · sin IVA, queda en el negocio', d.neto],
    [`${etiquetaIva(alicuota)} · débito fiscal, va a ARCA`, d.iva],
  )
  if (d.estimados > 0) {
    filas.push([`${plural(d.estimados, 'comprobante no tenía', 'comprobantes no tenían')} el desglose guardado: su IVA se calculó con la alícuota.`])
  }
  filas.push(['Lo que se paga a ARCA lo calcula el contador: a este IVA de las ventas se le resta el IVA de las compras.'])
  return filas
}
