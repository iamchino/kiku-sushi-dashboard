// ────────────────────────────────────────────────────────────────────────────
// Verifica la lógica pura de los gastos con tarjeta de crédito (18/11): qué va
// a la sección "Tarjeta de crédito" de Proyección, su total, la comparación
// con el total del resumen y lo que se manda al marcar el resumen pagado.
//
// Uso:  npm run verificar:tarjeta
// ────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import * as t from '../src/lib/tarjeta.js'

const HOY = '2026-11-18'
const pendientes = [
  { id: 'a', descripcion: 'POLIZA LA SEGUNDA · noviembre 2026', monto: 49358, medio_pago: 'tarjeta_credito', estado: 'pendiente', vencimiento: '2026-11-14', fecha: '2026-11-01', categoria: 'otros', gasto_fijo_id: 'g1', periodo: '2026-11' },
  { id: 'b', descripcion: 'Meta publicidad', monto: '120000.50', medio_pago: 'tarjeta_credito', estado: 'pendiente', vencimiento: null, fecha: '2026-11-10', categoria: 'marketing', proveedor_id: 'p9', comprobante_nro: 'FB-1', notas: 'campaña' },
  { id: 'c', descripcion: 'Alquiler Local · noviembre 2026', monto: 1150000, medio_pago: 'transferencia', estado: 'pendiente', vencimiento: '2026-11-10', fecha: '2026-11-01', categoria: 'alquiler' },
  { id: 'd', descripcion: 'Compra pagada', monto: 5000, medio_pago: 'tarjeta_credito', estado: 'pagado', fecha: '2026-11-05', categoria: 'otros' },
]

// ══ 1) Qué es de la tarjeta ═════════════════════════════════════════════════
assert.ok(t.esDeTarjeta(pendientes[0]))
assert.ok(t.esDeTarjeta(pendientes[1]))
assert.ok(!t.esDeTarjeta(pendientes[2]), 'una transferencia pendiente no es de la tarjeta')
assert.ok(!t.esDeTarjeta(pendientes[3]), 'lo ya pagado no va')
assert.ok(!t.esDeTarjeta(null))
assert.equal(t.fechaDelCargo(pendientes[0]), '2026-11-14', 'el vencimiento manda')
assert.equal(t.fechaDelCargo(pendientes[1]), '2026-11-10', 'sin vencimiento, la fecha')

const { tarjeta, resto } = t.separarPendientes(pendientes.slice(0, 3))
assert.deepEqual(tarjeta.map(e => e.id), ['b', 'a'], 'ordenados por fecha del cargo')
assert.deepEqual(resto.map(e => e.id), ['c'])
assert.deepEqual(t.separarPendientes([]), { tarjeta: [], resto: [] })

// ══ 2) Total ════════════════════════════════════════════════════════════════
assert.deepEqual(t.resumenTarjeta(tarjeta), { total: 169358.5, cantidad: 2, desde: '2026-11-10', hasta: '2026-11-14' })
assert.deepEqual(t.resumenTarjeta([]), { total: 0, cantidad: 0, desde: null, hasta: null })
assert.equal(t.textoCompras(1), '1 compra')
assert.equal(t.textoCompras(3), '3 compras')

// ══ 3) Comparar con el total del resumen ════════════════════════════════════
assert.equal(t.compararConResumen(169358.5, '').estado, 'sin_dato')
assert.equal(t.compararConResumen(169358.5, 'abc').estado, 'invalido')
assert.equal(t.compararConResumen(169358.5, '169.358,50').estado, 'coincide', 'formato argentino')
assert.equal(t.compararConResumen(169358.5, '169358.9').estado, 'coincide', 'menos de $1 de diferencia: coincide')
const falta = t.compararConResumen(169358.5, '180.000')
assert.equal(falta.estado, 'falta')
assert.equal(falta.diferencia, 10641.5)
assert.match(falta.texto, /faltan \$10\.641,50.*intereses/)
const sobra = t.compararConResumen(169358.5, '120.000,50')
assert.equal(sobra.estado, 'sobra')
assert.match(sobra.texto, /de más.*Destildá/)

// ══ 4) Fecha del pago ═══════════════════════════════════════════════════════
assert.equal(t.validarFechaPago(HOY, HOY), null)
assert.equal(t.validarFechaPago('2026-11-05', HOY), null)
assert.match(t.validarFechaPago('2026-11-19', HOY), /futura/)
assert.match(t.validarFechaPago('', HOY), /fecha/)

// ══ 5) Lo que se manda por cada gasto del resumen ═══════════════════════════
assert.deepEqual(t.pagoDelResumen(pendientes[1], HOY), {
  categoria: 'marketing', descripcion: 'Meta publicidad', monto: 120000.5, medio_pago: 'tarjeta_credito', estado: 'pagado',
  fecha: HOY, proveedor_id: 'p9', empleado_id: null, subtipo: null, periodo: null, vencimiento: null,
  comprobante_nro: 'FB-1', notas: 'campaña', origen: 'ninguno',
})
assert.equal(t.pagoDelResumen(pendientes[0], HOY).periodo, '2026-11', 'el gasto fijo conserva su mes')
assert.equal(t.pagoDelResumen(pendientes[0], HOY).vencimiento, '2026-11-14')
assert.equal(t.textoFilaTarjeta(pendientes[0]), 'en la tarjeta desde el 14/11/2026')

console.log('✓ Tarjeta de crédito: qué va aparte en Proyección, total, comparación con el resumen, fecha y lo que se marca pagado.')
