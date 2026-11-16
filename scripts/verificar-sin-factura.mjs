// ────────────────────────────────────────────────────────────────────────────
// Verifica la lógica pura de la marca "no se factura" (src/lib/sinFactura.js).
//
// Uso:  npm run verificar:sinfactura
// ────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import * as sf from '../src/lib/sinFactura.js'

const factura = (estado, tipo = 6) => ({ id: `c-${estado}-${tipo}`, estado, tipo_cbte: tipo, letra: 'B', importe_total: 1000 })
const pedidos = [
  { id: 'p1', total: 50000, comprobantes_fiscales: [] },                                         // pendiente
  { id: 'p2', total: 36500, comprobantes_fiscales: [factura('autorizado')] },                     // facturado
  { id: 'p3', total: 28000 },                                                                      // marcado
  { id: 'p4', total: 12000, comprobantes_fiscales: [factura('anulado'), factura('autorizado', 8)] }, // anulada por NC → pendiente otra vez
  { id: 'p5', total: 9000, comprobantes_fiscales: [factura('rechazado')] },                        // marcado
  { id: 'p6', total: 7000, comprobantes_fiscales: [factura('autorizado')] },                       // facturado, con una marca vieja
]
const marcas = new Map([
  ['p3', { pedido_id: 'p3', motivo: 'Canje / cuenta corriente', usuario_nombre: 'Yamile' }],
  ['p5', { pedido_id: 'p5', motivo: 'Pedido de prueba', usuario_nombre: 'Noe' }],
  ['p6', { pedido_id: 'p6', motivo: 'Consumo interno', usuario_nombre: 'Noe' }],
])

// ── Estado de cada pedido ───────────────────────────────────────────────────
assert.deepEqual(pedidos.map(p => sf.estadoFacturacion(p, marcas)),
  ['pendiente', 'facturado', 'sin_factura', 'pendiente', 'sin_factura', 'facturado'])
assert.equal(sf.estadoFacturacion(pedidos[5], marcas), 'facturado', 'si se facturó igual, la factura manda')
assert.equal(sf.marcaDe(pedidos[5], marcas), null, 'y la marca vieja no se muestra')
assert.equal(sf.marcaDe(pedidos[2], marcas).motivo, 'Canje / cuenta corriente')
assert.equal(sf.marcaDe(pedidos[0], marcas), null)
// Sin marcas (base sin el SQL 58, o todavía cargando) todo sigue como antes.
for (const vacio of [null, undefined, new Map()]) {
  assert.deepEqual(pedidos.map(p => sf.estadoFacturacion(p, vacio)),
    ['pendiente', 'facturado', 'pendiente', 'pendiente', 'pendiente', 'facturado'])
}

// ── Resumen para las tarjetas ───────────────────────────────────────────────
assert.deepEqual(sf.resumenFacturacion(pedidos, marcas),
  { pendientes: 2, sinFactura: 2, facturados: 2, montoPendiente: 62000, montoSinFactura: 37000 })
const sinMarcas = sf.resumenFacturacion(pedidos, null)
assert.deepEqual(sinMarcas, { pendientes: 4, sinFactura: 0, facturados: 2, montoPendiente: 99000, montoSinFactura: 0 })
// Marcar no cambia el total sin facturar: solo lo reparte entre dos listas.
const r = sf.resumenFacturacion(pedidos, marcas)
assert.equal(r.montoPendiente + r.montoSinFactura, sinMarcas.montoPendiente)
assert.equal(r.pendientes + r.sinFactura, sinMarcas.pendientes)
assert.deepEqual(sf.resumenFacturacion([], marcas), { pendientes: 0, sinFactura: 0, facturados: 0, montoPendiente: 0, montoSinFactura: 0 })
assert.deepEqual(sf.resumenFacturacion(null, null), { pendientes: 0, sinFactura: 0, facturados: 0, montoPendiente: 0, montoSinFactura: 0 })
assert.equal(sf.resumenFacturacion([{ id: 'x', total: '1234.56' }, { id: 'y', total: 0.1 }, { id: 'z', total: 0.2 }], null).montoPendiente, 1234.86, 'totales como texto y sin errores de coma flotante')

// ── Qué ids consultar ───────────────────────────────────────────────────────
assert.deepEqual(sf.idsSinFacturaVigente(pedidos), ['p1', 'p3', 'p4', 'p5'])
assert.deepEqual(sf.idsSinFacturaVigente(null), [])

// ── Motivo ──────────────────────────────────────────────────────────────────
assert.equal(sf.validarMotivo('Canje / cuenta corriente'), null)
assert.equal(sf.validarMotivo('  abc  '), null)
assert.match(sf.validarMotivo(''), /motivo/)
assert.match(sf.validarMotivo('  ab '), /motivo/)
assert.match(sf.validarMotivo(null), /motivo/)
assert.match(sf.validarMotivo('a'.repeat(201)), /muy largo/)
assert.equal(sf.validarMotivo('a'.repeat(200)), null)
assert.ok(sf.MOTIVOS_SUGERIDOS.every(m => sf.validarMotivo(m) === null), 'los motivos sugeridos son válidos')

console.log('✓ Sin factura: estado de cada pedido, resumen para las tarjetas (marcar no cambia totales), ids a consultar y motivo.')
