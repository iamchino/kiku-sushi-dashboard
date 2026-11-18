// ────────────────────────────────────────────────────────────────────────────
// Verifica la lógica pura de los gastos fijos (SQL 60): vencimientos de cada
// mes (iguales a los de la base), el texto del día, el primer mes que se
// propone, el próximo vencimiento, el nombre sin el mes y las validaciones.
//
// Uso:  npm run verificar:gastosfijos
// ────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import * as gf from '../src/lib/gastosFijos.js'

// ══ 1) Meses y vencimientos (los mismos casos que la batería de SQL) ═══════
assert.equal(gf.vencimientoDelMes('2027-02', 31), '2027-02-28', 'febrero común: el 31 cae el 28')
assert.equal(gf.vencimientoDelMes('2028-02', 30), '2028-02-29', 'febrero bisiesto: el 30 cae el 29')
assert.equal(gf.vencimientoDelMes('2026-11', 31), '2026-11-30', 'noviembre tiene 30')
assert.equal(gf.vencimientoDelMes('2026-12', 5), '2026-12-05')
assert.equal(gf.vencimientoDelMes('2026-12', 0), '2026-12-01', 'un día inválido no rompe: va el 1')
assert.equal(gf.mesTexto('2026-09'), 'septiembre 2026')
assert.equal(gf.mesTexto(''), '')
assert.equal(gf.periodoSiguiente('2026-12'), '2027-01')
assert.equal(gf.periodoSiguiente('2026-11'), '2026-12')
assert.equal(gf.periodoDe('2026-11-18'), '2026-11')
assert.equal(gf.periodoDe(''), null)
assert.equal(gf.diasDelMes('2026-02'), 28)
assert.equal(gf.descripcionDelMes('Alquiler ', '2026-12'), 'Alquiler · diciembre 2026')

// ══ 2) El texto del día ═════════════════════════════════════════════════════
assert.equal(gf.textoDia(10), 'el 10 de cada mes')
assert.equal(gf.textoDia('5'), 'el 5 de cada mes')
assert.equal(gf.textoDia(31), 'el último día de cada mes')
assert.equal(gf.textoDia(30), 'el 30 de cada mes (en febrero, el último día)')
assert.equal(gf.textoDia(32), '')
assert.equal(gf.textoDia(''), '')

// ══ 3) Primer mes que se propone y opciones ═════════════════════════════════
const HOY = '2026-11-18'
assert.equal(gf.primerMesSugerido(10, HOY), '2026-12', 'el 10 ya pasó: arranca el mes que viene')
assert.equal(gf.primerMesSugerido(20, HOY), '2026-11', 'el 20 no pasó: arranca este mes')
assert.equal(gf.primerMesSugerido(18, HOY), '2026-11', 'vence hoy: este mes')
assert.equal(gf.primerMesSugerido(5, '2026-12-28'), '2027-01', 'pasa de año')
assert.deepEqual(gf.mesesParaElegir(HOY).map(m => m.value), ['2026-11', '2026-12'])
assert.equal(gf.mesesParaElegir(HOY)[0].label, 'noviembre 2026 (este mes)')

// ══ 4) Próximo vencimiento ══════════════════════════════════════════════════
assert.equal(gf.proximoVencimiento({ dia_vencimiento: 10, desde: '2026-11', activo: true }, HOY), '2026-12-10')
assert.equal(gf.proximoVencimiento({ dia_vencimiento: 25, desde: '2026-11', activo: true }, HOY), '2026-11-25')
assert.equal(gf.proximoVencimiento({ dia_vencimiento: 25, desde: '2027-01', activo: true }, HOY), '2027-01-25', 'no antes de su primer mes')
assert.equal(gf.proximoVencimiento({ dia_vencimiento: 31, desde: '2026-11', activo: true }, HOY), '2026-11-30')
assert.equal(gf.proximoVencimiento({ dia_vencimiento: 31, desde: '2026-11', activo: true }, '2027-01-31'), '2027-01-31')
assert.equal(gf.proximoVencimiento({ dia_vencimiento: 31, desde: '2026-11', activo: true }, '2027-02-01'), '2027-02-28')
assert.equal(gf.proximoVencimiento({ dia_vencimiento: 10, desde: '2026-11', activo: false }, HOY), null, 'pausado: no tiene')

// ══ 5) El nombre sin el mes (para proponer al tildar "Se repite") ═════════════
assert.equal(gf.limpiarMes('F931 NV NOVIEMBRE26'), 'F931 NV')
assert.equal(gf.limpiarMes('Alquiler octubre 2026'), 'Alquiler')
assert.equal(gf.limpiarMes('Luz 10/2026'), 'Luz')
assert.equal(gf.limpiarMes('Autónomos - nov 26'), 'Autónomos')
assert.equal(gf.limpiarMes('Gas Dic.'), 'Gas')
assert.equal(gf.limpiarMes('Marketing redes'), 'Marketing redes', 'no confunde palabras que empiezan como un mes')
assert.equal(gf.limpiarMes('Mayorista Junín'), 'Mayorista Junín')
assert.equal(gf.limpiarMes('Noviembre'), 'Noviembre', 'si no queda nada, la deja como está')
assert.equal(gf.limpiarMes('  Expensas  '), 'Expensas')

// ══ 6) Resumen de la lista ══════════════════════════════════════════════════
const lista = [
  { monto: 800000, activo: true }, { monto: '120000.50', activo: true }, { monto: 45000, activo: false },
]
assert.deepEqual(gf.resumenGastosFijos(lista), { activos: 2, pausados: 1, total: 920000.5 })
assert.deepEqual(gf.resumenGastosFijos([]), { activos: 0, pausados: 0, total: 0 })

// ══ 7) Validaciones (mismos mensajes que la base) ════════════════════════════
const base = { descripcion: 'Alquiler', categoria: 'alquiler', monto: '800000', dia_vencimiento: '10', medio_pago: 'transferencia', desde: '2026-11', nuevo: true }
const ok = gf.validarGastoFijo(base, HOY)
assert.ok(ok.ok)
assert.deepEqual(ok.datos, { descripcion: 'Alquiler', categoria: 'alquiler', monto: 800000, dia_vencimiento: 10, medio_pago: 'transferencia', proveedor_id: null, notas: null, desde: '2026-11' })
assert.equal(gf.validarGastoFijo({ ...base, monto: '16644,03' }, HOY).datos.monto, 16644.03, 'acepta coma decimal')
assert.equal(gf.validarGastoFijo({ ...base, monto: '800.000' }, HOY).datos.monto, 800000, 'los puntos de a tres cifras son miles')
assert.equal(gf.validarGastoFijo({ ...base, monto: '1.375,54' }, HOY).datos.monto, 1375.54)
assert.equal(gf.validarGastoFijo({ ...base, monto: '16644.03' }, HOY).datos.monto, 16644.03)
assert.match(gf.validarGastoFijo({ ...base, descripcion: '  ' }, HOY).error, /Falta la descripción/)
assert.match(gf.validarGastoFijo({ ...base, categoria: 'sueldos' }, HOY).error, /Liquidación/)
assert.match(gf.validarGastoFijo({ ...base, monto: '0' }, HOY).error, /mayor a cero/)
assert.match(gf.validarGastoFijo({ ...base, monto: 'abc' }, HOY).error, /mayor a cero/)
assert.match(gf.validarGastoFijo({ ...base, dia_vencimiento: '32' }, HOY).error, /entre 1 y 31/)
assert.match(gf.validarGastoFijo({ ...base, dia_vencimiento: '1.5' }, HOY).error, /entre 1 y 31/)
assert.match(gf.validarGastoFijo({ ...base, medio_pago: 'canje' }, HOY).error, /canje/)
assert.match(gf.validarGastoFijo({ ...base, notas: 'x'.repeat(301) }, HOY).error, /muy largas/)
assert.match(gf.validarGastoFijo({ ...base, desde: '2026-10' }, HOY).error, /anterior al mes actual/)
assert.ok(gf.validarGastoFijo({ ...base, desde: '2026-10', nuevo: false }, HOY).ok, 'al corregir, el primer mes viejo se respeta')
assert.ok(!gf.CATEGORIAS_FIJAS.some(c => c.id === 'sueldos'))
assert.ok(!gf.MEDIOS_FIJOS.some(m => m.id === 'canje'))

// ══ 8) Lo que se explica al tildar "Se repite todos los meses" ══════════════
const e1 = gf.explicarRepeticion({ estado: 'pendiente', fecha: '2026-11-18', vencimiento: '2026-12-09', dia: 9, nombre: 'F931' })
assert.equal(e1.periodo, '2026-12', 'un pendiente es del mes en que vence')
assert.equal(e1.siguiente, '2027-01')
assert.match(e1.texto, /Este pago queda como el de diciembre 2026\. Desde enero 2027 se carga solo como pendiente \(«F931 · enero 2027», vence el 09\/01\/2027\)\./)
const e2 = gf.explicarRepeticion({ estado: 'pagado', fecha: '2026-11-10', vencimiento: '', dia: 10, nombre: 'Alquiler' })
assert.equal(e2.periodo, '2026-11', 'un pago hecho es del mes de su fecha')
assert.match(e2.texto, /Desde diciembre 2026 .*vence el 10\/12\/2026/)

console.log('✓ Gastos fijos: vencimientos (iguales a la base), día, primer mes, próximo vencimiento, nombre sin el mes, resumen y validaciones.')
