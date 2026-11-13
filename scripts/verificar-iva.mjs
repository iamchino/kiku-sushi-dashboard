// ────────────────────────────────────────────────────────────────────────────
// Verifica la lógica pura del IVA de las ventas (src/lib/ivaVentas.js).
//
// El caso principal es el mismo que carga la batería SQL (scripts/e2e/
// iva-sql.sql): el dashboard y la base tienen que dar los mismos números.
//
// Uso:  npm run verificar:iva
// ────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import * as iva from '../src/lib/ivaVentas.js'

const c = (id, estado, letra, tipo, numero, neto, ivaImp, total, extra = {}) => ({
  id, estado, letra, tipo_cbte: tipo, punto_venta: 2, numero, fecha_emision: '2026-11-13',
  importe_neto: neto, importe_iva: ivaImp, importe_total: total, cae: `cae-${id}`, pedido_id: `p-${id}`,
  receptor_nombre: 'Consumidor Final', receptor_condicion_iva: 'Consumidor Final', doc_tipo: 99, doc_nro: '0', ...extra,
})
const fB1 = c('1', 'autorizado', 'B', 6, 101, 100000, 21000, 121000)
const fA  = c('2', 'autorizado', 'A', 1, 11, 200000, 42000, 242000, { receptor_nombre: 'Revista SA', receptor_condicion_iva: 'Responsable Inscripto', doc_tipo: 80, doc_nro: '30712345678' })
const fAnulada = c('3', 'anulado', 'B', 6, 102, 50000, 10500, 60500)
const fB2 = c('4', 'autorizado', 'B', 6, 103, 10000, 2100, 12100)
const fSinDesglose = c('5', 'autorizado', 'B', 6, 104, 0, 0, 1000)
const rechazada = c('6', 'rechazado', 'B', 6, null, 82643.8, 17355.2, 99999)
const conError = c('16', 'error', 'B', 6, null, 82643.8, 17355.2, 99999)
const pendiente = c('26', 'pendiente', 'B', 6, null, 82643.8, 17355.2, 99999)
const ncTotal = c('13', 'autorizado', 'B', 8, 1, 50000, 10500, 60500, { cbte_asociado_id: '3' })
const ncParcial = c('14', 'autorizado', 'B', 8, 2, 2000, 420, 2420, { cbte_asociado_id: '4' })
const ncRechazada = c('24', 'rechazado', 'B', 8, null, 2000, 420, 2420, { cbte_asociado_id: '4' })
const todos = [fB1, fA, fAnulada, fB2, fSinDesglose, rechazada, conError, pendiente, ncTotal, ncParcial, ncRechazada]

// ── Qué cuenta y cómo se clasifica ──────────────────────────────────────────
assert.equal(iva.claseComprobante(fB1), 'factura'); assert.equal(iva.claseComprobante(ncTotal), 'nota_credito')
assert.equal(iva.claseComprobante({ tipo_cbte: 7 }), 'nota_debito')
assert.ok(iva.cuentaParaIva(fB1)); assert.ok(iva.cuentaParaIva(fAnulada), 'la anulada cuenta: su nota de crédito es la que resta')
assert.ok(iva.cuentaParaIva(ncTotal))
for (const x of [rechazada, conError, pendiente, ncRechazada, null]) assert.ok(!iva.cuentaParaIva(x))
assert.ok(!iva.cuentaParaIva({ ...ncTotal, estado: 'anulado' }), 'una nota de crédito solo cuenta autorizada')

// ── Importes de un comprobante ──────────────────────────────────────────────
assert.deepEqual(iva.importesDe(fB1), { neto: 100000, iva: 21000, total: 121000, estimado: false })
assert.deepEqual(iva.importesDe(fSinDesglose), { neto: 826.45, iva: 173.55, total: 1000, estimado: true }, 'sin desglose: se calcula al 21%')
assert.deepEqual(iva.importesDe(fSinDesglose, 10.5), { neto: 904.98, iva: 95.02, total: 1000, estimado: true }, 'usa la alícuota configurada')
assert.deepEqual(iva.importesDe({ letra: 'C', tipo_cbte: 11, importe_total: 500 }), { neto: 500, iva: 0, total: 500, estimado: false }, 'comprobante C: todo neto')
assert.deepEqual(iva.importesDe({ tipo_cbte: 6, importe_neto: '100000.00', importe_iva: '21000.00', importe_total: '121000.00' }),
  { neto: 100000, iva: 21000, total: 121000, estimado: false }, 'los numeric de la base llegan como texto')
assert.deepEqual(iva.importesDe(null), { neto: 0, iva: 0, total: 0, estimado: false })

// ── Desglose del período: los mismos números que iva_ventas_resumen() ──────
const d = iva.desgloseIva(todos)
assert.deepEqual(d.facturas, { cantidad: 5, neto: 360826.45, iva: 75773.55, total: 436600 })
assert.deepEqual(d.notasCredito, { cantidad: 2, neto: 52000, iva: 10920, total: 62920 })
assert.deepEqual(d.notasDebito, { cantidad: 0, neto: 0, iva: 0, total: 0 })
assert.equal(d.neto, 308826.45); assert.equal(d.iva, 64853.55); assert.equal(d.total, 373680)
assert.equal(Math.round((d.neto + d.iva) * 100) / 100, d.total, 'neto + IVA = total')
assert.equal(d.estimados, 1)
assert.deepEqual(iva.desgloseIva([]), { facturas: { cantidad: 0, neto: 0, iva: 0, total: 0 }, notasCredito: { cantidad: 0, neto: 0, iva: 0, total: 0 },
  notasDebito: { cantidad: 0, neto: 0, iva: 0, total: 0 }, neto: 0, iva: 0, total: 0, estimados: 0 })
// Una nota de débito suma.
assert.equal(iva.desgloseIva([fB1, c('nd', 'autorizado', 'B', 7, 1, 1000, 210, 1210)]).iva, 21210)

// Lo que devuelve la base (una fila por letra y clase) arma el mismo desglose.
const delRpc = iva.desgloseDesdeResumen([
  { letra: 'A', clase: 'factura', cantidad: 1, neto: '200000.00', iva: '42000.00', total: '242000.00', estimados: 0 },
  { letra: 'B', clase: 'factura', cantidad: 4, neto: '160826.45', iva: '33773.55', total: '194600.00', estimados: 1 },
  { letra: 'B', clase: 'nota_credito', cantidad: 2, neto: '52000.00', iva: '10920.00', total: '62920.00', estimados: 0 },
])
assert.deepEqual(delRpc, d, 'base y navegador coinciden')
assert.equal(iva.desgloseDesdeResumen(null).total, 0)

// ── Desde los pedidos de Caja ───────────────────────────────────────────────
const pedidos = [
  { id: 'p1', numero: 9701, total: 121000, comprobantes_fiscales: [fB1] },
  { id: 'p2', numero: 9702, total: 242000, comprobantes_fiscales: [fA] },
  { id: 'p3', numero: 9703, total: 60500, comprobantes_fiscales: [fAnulada, ncTotal] },
  { id: 'p4', numero: 9704, total: 12100, comprobantes_fiscales: [fB2, ncParcial, ncRechazada] },
  { id: 'p5', numero: 9705, total: 1000, comprobantes_fiscales: [fSinDesglose] },
  { id: 'p6', numero: 9706, total: 99999, comprobantes_fiscales: [rechazada, conError, pendiente] },
  { id: 'p7', numero: 9707, total: 5000, comprobantes_fiscales: [] },
  { id: 'p8', numero: 9708, total: 5000 },
]
assert.deepEqual(iva.desgloseIvaDePedidos(pedidos), d, 'los Totales de Caja dan lo mismo')
// Tiene que cerrar con el "Neto facturado" que Caja ya mostraba (facturado − NC).
const facturadoCaja = 121000 + 242000 + 60500 + 12100 + 1000, ncCaja = 60500 + 2420
assert.equal(iva.desgloseIvaDePedidos(pedidos).total, facturadoCaja - ncCaja)
// La tarjeta de cada orden.
assert.deepEqual(pick(iva.desgloseIvaDePedido(pedidos[0])), { neto: 100000, iva: 21000, total: 121000 })
assert.deepEqual(pick(iva.desgloseIvaDePedido(pedidos[3])), { neto: 8000, iva: 1680, total: 9680 }, 'con nota de crédito parcial, ya restada')
assert.deepEqual(pick(iva.desgloseIvaDePedido(pedidos[2])), { neto: 0, iva: 0, total: 0 }, 'factura anulada por el total: no queda IVA')
assert.deepEqual(pick(iva.desgloseIvaDePedido(pedidos[5])), { neto: 0, iva: 0, total: 0 }, 'sin factura autorizada')
assert.deepEqual(pick(iva.desgloseIvaDePedido(pedidos[7])), { neto: 0, iva: 0, total: 0 })
function pick(x) { return { neto: x.neto, iva: x.iva, total: x.total } }

// ── Etiqueta ────────────────────────────────────────────────────────────────
assert.equal(iva.etiquetaIva(21), 'IVA 21%'); assert.equal(iva.etiquetaIva(10.5), 'IVA 10,5%'); assert.equal(iva.etiquetaIva(), 'IVA 21%')
assert.equal(iva.etiquetaIva('21.00'), 'IVA 21%')

// ── Hoja "IVA ventas" del Excel ─────────────────────────────────────────────
const numeroPedido = new Map([['p-1', 9701], ['p-2', 9702], ['p-13', 9703]])
const filas = iva.filasLibroIva([...todos, c('7', 'autorizado', 'B', 6, 100, 30000, 6300, 36300, { fecha_emision: '2026-11-12' })], { numeroPedido })
assert.equal(filas.length, 9, '8 comprobantes que cuentan + la fila TOTAL')
assert.deepEqual(Object.keys(filas[0]), ['Fecha de emisión', 'Comprobante', 'Número', 'Cliente', 'Documento', 'Condición IVA', 'Neto gravado', 'IVA 21%', 'Total', 'CAE', 'Pedido', 'Observación'])
assert.deepEqual(filas.map(f => f['Número']).slice(0, 8),
  ['00002-00000100', '00002-00000011', '00002-00000101', '00002-00000102', '00002-00000103', '00002-00000104', '00002-00000001', '00002-00000002'],
  'por fecha de emisión, después por tipo y número')
const filaA = filas[1]
assert.deepEqual([filaA['Fecha de emisión'], filaA.Comprobante, filaA.Cliente, filaA.Documento, filaA['Condición IVA'], filaA['Neto gravado'], filaA['IVA 21%'], filaA.Total, filaA.Pedido],
  ['13/11/2026', 'Factura A', 'Revista SA', 'CUIT 30712345678', 'Responsable Inscripto', 200000, 42000, 242000, 9702])
assert.equal(filas[2].Documento, '', 'consumidor final sin documento')
assert.equal(filas[3]['Observación'], 'Anulada por nota de crédito')
assert.equal(filas[5]['Observación'], 'Sin desglose guardado: IVA calculado'); assert.equal(filas[5]['IVA 21%'], 173.55)
const filaNc = filas[6]
assert.deepEqual([filaNc.Comprobante, filaNc['Neto gravado'], filaNc['IVA 21%'], filaNc.Total, filaNc['Observación'], filaNc.Pedido],
  ['Nota de Crédito B', -50000, -10500, -60500, 'Anula o descuenta la B 00002-00000102', 9703], 'las notas de crédito van en negativo')
const total = filas.at(-1)
assert.deepEqual([total['Fecha de emisión'], total['Neto gravado'], total['IVA 21%'], total.Total], ['TOTAL', 338826.45, 71153.55, 409980])
assert.equal(Math.round(filas.slice(0, -1).reduce((a, f) => a + f['IVA 21%'], 0) * 100) / 100, total['IVA 21%'], 'la fila TOTAL es la suma de la columna')
assert.deepEqual(iva.filasLibroIva([]), [], 'sin comprobantes no hay ni fila de total')
assert.ok('IVA 10,5%' in iva.filasLibroIva([fB1], { alicuota: 10.5 })[0], 'el título de la columna sigue a la alícuota')

// ── Bloque del Resumen del Excel ────────────────────────────────────────────
const NOTA_CONTADOR = 'Lo que se paga a ARCA lo calcula el contador: a este IVA de las ventas se le resta el IVA de las compras.'
const bloque = iva.bloqueResumenIva(d, { desde: '2026-11-01', hasta: '2026-11-13' })
assert.deepEqual(bloque, [
  ['IVA DE LAS VENTAS'],
  ['Comprobantes emitidos del 01/11/2026 al 13/11/2026 (por fecha de emisión)'],
  ['Facturas emitidas', 436600, '5 facturas'],
  ['Notas de crédito', -62920, '2 notas de crédito'],
  ['Total facturado (restadas las notas de crédito)', 373680],
  ['Neto gravado · sin IVA, queda en el negocio', 308826.45],
  ['IVA 21% · débito fiscal, va a ARCA', 64853.55],
  ['1 comprobante no tenía el desglose guardado: su IVA se calculó con la alícuota.'],
  [NOTA_CONTADOR],
])
const bloqueSimple = iva.bloqueResumenIva(iva.desgloseIva([fB1]), { porEmision: false })
assert.deepEqual(bloqueSimple, [
  ['IVA DE LAS VENTAS'],
  ['Comprobantes de los pedidos del período'],
  ['Facturas emitidas', 121000, '1 factura'],
  ['Notas de crédito', 0, '0 notas de crédito'],
  ['Total facturado (restadas las notas de crédito)', 121000],
  ['Neto gravado · sin IVA, queda en el negocio', 100000],
  ['IVA 21% · débito fiscal, va a ARCA', 21000],
  [NOTA_CONTADOR],
])
assert.ok(Object.is(bloqueSimple[3][1], 0), 'sin notas de crédito va 0, no -0')
const conNd = iva.bloqueResumenIva(iva.desgloseIva([fB1, c('nd', 'autorizado', 'B', 7, 1, 1000, 210, 1210)]), {})
assert.deepEqual(conNd[4], ['Notas de débito', 1210, '1 nota de débito'])
assert.equal(conNd[5][1], 122210)

console.log('✓ IVA de ventas: qué comprobantes cuentan, desglose del período (igual que la base), tarjeta de la orden, hoja del Excel y bloque del resumen.')
