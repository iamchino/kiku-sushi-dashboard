// ────────────────────────────────────────────────────────────────────────────
// Verifica la lógica pura de las cuentas corrientes (canjes): validación del
// cobro contra el saldo, estados, saldo corrido y que lo cargado a cuenta
// NUNCA se sume a la plata cobrada.
//
// Uso:  npm run verificar:cuentas
// Lo que depende de la base (triggers, RLS, saldo real) se prueba aparte
// contra Postgres; acá va lo que decide el front antes de mandar nada.
// ────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import * as cc from '../src/lib/cuentasCorrientes.js'
import * as pp from '../src/lib/pagosPedido.js'
import { medioPagoLabel } from '../src/lib/escposFormatter.js'

const A = { id: 'a', nombre: 'Revista', saldo: 100000, vencida: false, cuit: '30712345671', razon_social: 'R SA', condicion_iva: 1 }
const V = { id: 'v', nombre: 'Vieja', saldo: 50000, vencida: true }
const pago = (monto, id = 'a') => ({ medio_pago: 'cuenta_corriente', monto, cuenta_corriente_id: id })
assert.equal(cc.problemaCuentaCorriente([{ medio_pago: 'efectivo', monto: 999999 }], []), null)
assert.match(cc.problemaCuentaCorriente([{ medio_pago: 'cuenta_corriente', monto: 10 }], [A]), /Elegí a qué cuenta/)
assert.equal(cc.problemaCuentaCorriente([pago(100000)], [A]), null)
assert.equal(cc.problemaCuentaCorriente([pago(100001)], [A]), null, 'tolerancia de $1')
assert.match(cc.problemaCuentaCorriente([pago(100002)], [A]), /no alcanza/)
assert.match(cc.problemaCuentaCorriente([pago(60000), pago(60000)], [A]), /no alcanza/, 'dos líneas a la misma cuenta se suman')
assert.equal(cc.problemaCuentaCorriente([pago(150000)], [A], [{ cuenta_corriente_id: 'a', monto: 50000 }]), null, 're-cobro: lo previo vuelve al saldo')
assert.match(cc.problemaCuentaCorriente([pago(10, 'v')], [A, V]), /vencida/)
assert.match(cc.problemaCuentaCorriente([pago(10, 'x')], [A]), /ya no está disponible/)
assert.equal(cc.cuentaUsable(A), true); assert.equal(cc.cuentaUsable(V), false); assert.equal(cc.cuentaUsable({ ...A, saldo: 0 }), false)
assert.equal(cc.cuentaTieneDatosFiscales(A), true)
assert.equal(cc.cuentaTieneDatosFiscales({ ...A, cuit: '30712345678' }), false)
assert.equal(cc.cuentaTieneDatosFiscales({ ...A, condicion_iva: 5 }), false, 'consumidor final no admite Factura A')
assert.deepEqual(cc.facturaDesdeCuenta(A), { tipo: 'A', cuit: '30712345671', nombre: 'R SA', condicion: 1, domicilio: '', autoCuenta: true })
const filas = cc.conSaldoCorrido([
  { id: 2, fecha: '2026-11-11', created_at: '2026-11-11T22:00:00Z', monto: 50000 },
  { id: 1, fecha: '2026-10-20', created_at: '2026-11-12T10:00:00Z', monto: 117700 },
  { id: 3, fecha: '2026-11-11', created_at: '2026-11-11T23:00:00Z', monto: -5000 },
], 500000)
assert.deepEqual(filas.map(f => [f.id, f.saldo_despues]), [[3, 337300], [2, 332300], [1, 382300]])
assert.equal(cc.estadoCuenta({ activa: true, saldo: 10, vigencia_hasta: '2026-10-31' }, '2026-11-12').id, 'vencida')
assert.equal(cc.estadoCuenta({ activa: true, saldo: 10, vigencia_hasta: '2026-11-12' }, '2026-11-12').id, 'vigente', 'vence el día siguiente al "hasta"')
assert.equal(cc.estadoCuenta({ activa: true, saldo: 0 }, '2026-11-12').id, 'agotada')
assert.equal(cc.estadoCuenta({ activa: true, saldo: -500 }, '2026-11-12').id, 'excedida')
assert.equal(cc.estadoCuenta({ activa: false, saldo: 10 }, '2026-11-12').id, 'inactiva')
assert.equal(cc.porcentajeConsumido({ monto_acordado: 0, consumido: 0 }), 0)
assert.equal(cc.porcentajeConsumido({ monto_acordado: 100, consumido: 250 }), 100)
assert.equal(cc.fechaCorta('2026-10-20'), '20/10/2026'); assert.equal(cc.fechaCorta(null), '')
const r = pp.resumenMediosPago([
  { pagos: [{ id: 'p1', medio_pago: 'cuenta_corriente', monto: 295800, created_at: '2026-11-12T01:00:00Z' }, { id: 'p2', medio_pago: 'efectivo', monto: 124200, created_at: '2026-11-12T01:00:01Z' }] },
  { pagos: [{ id: 'p3', medio_pago: 'cuenta_corriente', monto: 50000, created_at: '2026-11-12T02:00:00Z' }] },
  { pagos: [], medio_pago: null, total: 10 },
])
assert.equal(r.totalCobrado, 124200); assert.deepEqual(r.cuentaCorriente, { monto: 345800, cobros: 2 })
assert.equal(r.medios.length, 4); assert.equal(r.sinRegistrar, 1)
assert.equal(pp.etiquetaMedioPago('cuenta_corriente'), 'Cuenta corriente')
assert.equal(pp.colorMedioPago('cuenta_corriente'), cc.COLOR_CUENTA_CORRIENTE)
assert.equal(pp.MEDIOS_PAGO_ORDEN.some(m => m.id === 'cuenta_corriente'), false, 'cuenta corriente no es un medio de plata')
// Ticket impreso
assert.equal(medioPagoLabel('cuenta_corriente'), 'Cuenta corriente')

console.log('✓ Cuentas corrientes: validación de saldo, estados, saldo corrido y totales sin canjes.')
