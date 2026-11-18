// ────────────────────────────────────────────────────────────────────────────
// Verifica la lógica pura del IVA de las compras (crédito fiscal, 18/11): el
// IVA que lleva adentro un total, la validación de lo tipeado, el saldo contra
// el IVA de las ventas y la hoja "IVA compras" del Excel del contador.
//
// Uso:  npm run verificar:ivacompras
// ────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import * as ic from '../src/lib/ivaCompras.js'
import { armarHojas } from '../src/lib/reporteContable.js'

// ══ 1) El IVA adentro de un total ═══════════════════════════════════════════
// La factura de Yamile: total $16.644,03, neto $13.755,40, IVA 21 % $2.888,63.
assert.equal(ic.ivaDesdeTotal(16644.03, 21), 2888.63)
assert.equal(ic.ivaDesdeTotal(110500, 10.5), 10500)
assert.equal(ic.ivaDesdeTotal(127000, 27), 27000)
assert.equal(ic.ivaDesdeTotal(0, 21), 0)
assert.equal(ic.ivaDesdeTotal(1000, null), 0, 'sin tasa ("varias") no se calcula')
assert.equal(ic.alicuotaDe(16644.03, 2888.63), '21')
assert.equal(ic.alicuotaDe(110500, 10500), '10.5')
assert.equal(ic.alicuotaDe(16644.03, 2000), 'mixto', 'un IVA que no es de ninguna alícuota es "varias"')
assert.equal(ic.etiquetaAlicuota('10.5'), 'IVA 10,5 %')
assert.equal(ic.etiquetaAlicuota('mixto'), 'IVA (varias alícuotas)')
assert.equal(ic.etiquetaAlicuota(null), 'IVA (varias alícuotas)')
assert.deepEqual(ic.ALICUOTAS_COMPRA.map(a => a.id), ['21', '10.5', '27', 'mixto'])

// ══ 2) Lo tipeado ═══════════════════════════════════════════════════════════
const HOY = '2026-11-18'
assert.deepEqual(ic.validarIva({ monto: 16644.03, iva: '2.888,63', fechaFactura: '2026-11-01' }, HOY),
  { ok: true, iva: 2888.63, sinIva: 13755.4 }, 'formato argentino')
assert.equal(ic.validarIva({ monto: 16644.03, iva: '2888.63' }, HOY).iva, 2888.63, 'con punto decimal')
assert.equal(ic.validarIva({ monto: 16644.03, iva: '2888,63' }, HOY).iva, 2888.63, 'con coma decimal')
assert.equal(ic.validarIva({ monto: 100000, iva: '0' }, HOY).ok, true, 'IVA cero se puede (factura exenta)')
assert.match(ic.validarIva({ monto: 1000, iva: '' }, HOY).error, /Escribí el IVA/)
assert.match(ic.validarIva({ monto: 1000, iva: 'abc' }, HOY).error, /no es un número/)
assert.match(ic.validarIva({ monto: 1000, iva: '-5' }, HOY).error, /negativo/)
assert.match(ic.validarIva({ monto: 1000, iva: '1200' }, HOY).error, /no puede ser mayor que el monto/)
assert.match(ic.validarIva({ monto: 1000, iva: '100', fechaFactura: '2026-11-19' }, HOY).error, /futura/)
assert.equal(ic.validarIva({ monto: 1000, iva: '100', fechaFactura: HOY }, HOY).ok, true, 'hoy sí')

// ══ 3) Resumen y saldo ══════════════════════════════════════════════════════
const egresos = [
  { id: 'a', descripcion: 'Tapas', monto: 16644.03, iva_credito: 2888.63, iva_alicuota: '21', factura_fecha: '2026-11-03', estado: 'pagado', medio_pago: 'transferencia', comprobante_nro: 'A-0003-00012345', proveedor: { razon_social: 'La Salteña', cuit_cuil: '30-11111111-1' } },
  { id: 'b', descripcion: 'Verdulería', monto: '110500', iva_credito: '10500', iva_alicuota: '10.5', factura_fecha: '2026-11-01', estado: 'pendiente', medio_pago: 'transferencia', proveedor: null },
  { id: 'c', descripcion: 'Vinos', monto: 121000, iva_credito: 21000, iva_alicuota: '21', factura_fecha: '2026-11-10', estado: 'pagado', medio_pago: 'canje', proveedor: { razon_social: 'Bodega' } },
  { id: 'd', descripcion: 'Sin IVA', monto: 5000, iva_credito: null, estado: 'pagado' },
]
assert.deepEqual(ic.resumenIvaCompras(egresos), { facturas: 3, total: 248144.03, iva: 34388.63, sinIva: 213755.4 })
assert.deepEqual(ic.resumenIvaCompras([]), { facturas: 0, total: 0, iva: 0, sinIva: 0 })
assert.deepEqual(ic.saldoIva(100000, 34388.63), { diferencia: 65611.37, aPagar: 65611.37, aFavor: 0 })
assert.deepEqual(ic.saldoIva(20000, 34388.63), { diferencia: -14388.63, aPagar: 0, aFavor: 14388.63 })
assert.deepEqual(ic.saldoIva(null, 0), { diferencia: 0, aPagar: 0, aFavor: 0 })

// ══ 4) La hoja "IVA compras" ════════════════════════════════════════════════
const filas = ic.filasLibroIvaCompras(egresos)
assert.equal(filas.length, 4, '3 facturas + total (el pago sin IVA no va)')
assert.deepEqual(filas.map(f => f['Fecha de la factura']), ['01/11/2026', '03/11/2026', '10/11/2026', 'TOTAL'], 'por fecha de la factura')
assert.deepEqual(Object.keys(filas[0]), ['Fecha de la factura', 'Proveedor', 'CUIT', 'Comprobante', 'Descripción', 'Alícuota',
  'Sin IVA (neto y otros)', 'IVA (crédito fiscal)', 'Total', 'Estado'])
assert.equal(filas[1]['Proveedor'], 'La Salteña')
assert.equal(filas[1]['CUIT'], '30-11111111-1')
assert.equal(filas[1]['Comprobante'], 'A-0003-00012345')
assert.equal(filas[1]['Alícuota'], '21 %')
assert.equal(filas[1]['Sin IVA (neto y otros)'], 13755.4)
assert.equal(filas[0]['Estado'], 'Pendiente de pago')
assert.equal(filas[2]['Estado'], 'Pagada con canje')
assert.equal(filas[3]['IVA (crédito fiscal)'], 34388.63)
assert.equal(filas[3]['Total'], 248144.03)
assert.deepEqual(ic.filasLibroIvaCompras([]), [], 'sin facturas, sin filas (ni total)')

const bloque = ic.bloqueResumenIvaCompras(egresos, { ivaVentas: 100000 })
assert.equal(bloque[0][0], 'IVA DE LAS COMPRAS')
assert.equal(bloque[2][1], 34388.63)
assert.match(bloque[3][0], /ventas − compras/)
assert.equal(bloque[3][1], 65611.37)
assert.match(ic.bloqueResumenIvaCompras(egresos, { ivaVentas: 1000 })[3][0], /a favor/)
assert.equal(ic.bloqueResumenIvaCompras(egresos).length, 4, 'sin IVA de ventas no hay saldo')

// ══ 5) El Excel del contador ════════════════════════════════════════════════
const base = { pedidos: [], egresos: [], desde: '2026-11-01', hasta: '2026-11-30', negocio: 'Kiku' }
const sin = armarHojas(base)
assert.equal(sin.ivaCompras, null, 'sin el SQL 61 no hay hoja')
assert.ok(!sin.resumen.some(f => f[0] === 'IVA DE LAS COMPRAS'))
const con = armarHojas({ ...base, comprasConIva: egresos.slice(0, 3) })
assert.equal(con.ivaCompras.length, 4)
const i = con.resumen.findIndex(f => f[0] === 'IVA DE LAS COMPRAS')
assert.ok(i > 0, 'el resumen trae el bloque')
assert.equal(con.resumen[i + 2][1].v, 34388.63, 'con el IVA de las compras, como número')
assert.match(con.resumen[i + 3][0], /a favor/, 'sin facturas de venta, el saldo es a favor')
assert.deepEqual(armarHojas({ ...base, comprasConIva: [] }).ivaCompras, [], 'con el SQL pero sin facturas: hoja vacía')

console.log('IVA de las compras: lógica OK')
