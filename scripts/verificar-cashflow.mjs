// ────────────────────────────────────────────────────────────────────────────
// Verifica la lógica pura del cash flow mensual (src/lib/cashflow.js).
//
// El primer caso reproduce, número por número, la planilla de administración
// (captura del 10/11/2026): si el dashboard no da lo mismo que su Excel, no
// sirve como reemplazo.
//
// Uso:  npm run verificar:cashflow
// ────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import * as cf from '../src/lib/cashflow.js'

// ── Meses ───────────────────────────────────────────────────────────────────
assert.equal(cf.mesDe('2026-11-12'), '2026-11-01')
assert.equal(cf.sumarMeses('2026-11-01', 2), '2027-01-01')
assert.equal(cf.sumarMeses('2027-01-01', -3), '2026-10-01')
assert.equal(cf.sumarMeses('2026-12-01', 12), '2027-12-01')
assert.equal(cf.diferenciaMeses('2026-11-01', '2027-03-01'), 4)
assert.deepEqual(cf.listaMeses('2026-11-01', 3), ['2026-11-01', '2026-12-01', '2027-01-01'])
assert.equal(cf.finDeMes('2027-02-01'), '2027-02-28'); assert.equal(cf.finDeMes('2028-02-01'), '2028-02-29')
assert.equal(cf.finDeMes('2026-12-01'), '2026-12-31')
assert.equal(cf.labelMes('2026-11-01'), 'nov 2026'); assert.equal(cf.labelMes('2027-03-01', { largo: true }), 'marzo 2027')
assert.equal(cf.tipoDeMes('2026-10-01', '2026-11-01'), 'pasado')
assert.equal(cf.tipoDeMes('2026-11-01', '2026-11-01'), 'curso')
assert.equal(cf.tipoDeMes('2027-01-01', '2026-11-01'), 'futuro')
assert.equal(cf.primerMesDeCalculo('2026-10-01', '2026-11-01', null), '2026-08-01')
assert.equal(cf.primerMesDeCalculo('2026-10-01', '2026-11-01', '2026-01-01'), '2026-01-01')

// ── Grupos ──────────────────────────────────────────────────────────────────
assert.equal(cf.grupoDeCategoria('proveedores'), 'mercaderia')
assert.equal(cf.grupoDeCategoria('sueldos'), 'personal')
assert.equal(cf.grupoDeCategoria('alquiler'), 'local_servicios')
assert.equal(cf.grupoDeCategoria('marketing'), 'operativos')
assert.equal(cf.grupoDeCategoria('comisiones'), 'comisiones')
assert.equal(cf.grupoDeCategoria('algo_nuevo'), 'inversiones_otros', 'una categoría desconocida no se pierde')
const todas = cf.GRUPOS.flatMap(g => g.categorias)
assert.equal(new Set(todas).size, todas.length, 'ninguna categoría en dos grupos')
for (const c of ['mercaderia', 'sueldos', 'proveedores', 'alquiler', 'servicios', 'impuestos', 'mantenimiento', 'marketing', 'comisiones', 'otros']) {
  assert.ok(todas.includes(c), `la categoría ${c} tiene grupo`)
}

// ── 1) La planilla de administración ────────────────────────────────────────
const MESES = cf.listaMeses('2026-11-01', 5)
const planilla = {
  ingresos:   [7000000, 7700000, 8470000, 9317000, 10248700],
  mercaderia: [5500000, 5775000, 6063750, 6366938, 6685284],
  personal:   [8780000, 6594000, 6923700, 7269885, 7633379],
}
const estimados = Object.entries(planilla).flatMap(([concepto, vals]) => vals.map((monto, i) => ({ mes: MESES[i], concepto, monto })))
const m = cf.armarCashflow({
  meses: MESES, filas: [], estimados, mesActual: '2026-11-01',
  config: { saldo_inicial: 2800000, saldo_desde: '2026-11-01', saldo_minimo: 500000 },
})
assert.deepEqual(m.columnas.map(c => c.totalEgresos), [14280000, 12369000, 12987450, 13636823, 14318663])
assert.deepEqual(m.columnas.map(c => c.flujo), [-7280000, -4669000, -4517450, -4319823, -4069963])
assert.deepEqual(m.columnas.map(c => c.saldoFinal), [-4480000, -9149000, -13666450, -17986273, -22056236])
assert.deepEqual(m.columnas.map(c => c.acumulado), [-7280000, -11949000, -16466450, -20786273, -24856236])
assert.deepEqual(m.columnas.map(c => c.estado), ['negativo', 'negativo', 'negativo', 'negativo', 'negativo'])
assert.equal(m.total.ingresos, 42735700); assert.equal(m.total.grupos.mercaderia, 30390972)
assert.equal(m.total.totalEgresos, 67591936); assert.equal(m.total.flujo, -24856236)
assert.equal(cf.fmtPct(m.columnas[0].indicadores.mercaderia), '78,6%')
assert.equal(cf.fmtPct(m.columnas[0].indicadores.personal), '125,4%')
assert.equal(cf.fmtPct(m.columnas[0].indicadores.flujo), '-104,0%')
assert.equal(cf.fmtPct(m.total.indicadores.mercaderia), '71,1%')
assert.equal(cf.fmtPct(m.total.indicadores.personal), '87,0%')
assert.equal(cf.fmtPct(m.total.indicadores.flujo), '-58,2%')
assert.deepEqual(m.mesesEnAlerta, MESES)
assert.ok(m.columnas.every(c => c.ingresos.origen === 'estimado' && c.grupos.personal.origen === 'estimado'))

// ── 2) Real, en curso y futuro mezclados ────────────────────────────────────
const filas = [
  // octubre (pasado): todo real
  { mes: '2026-10-01', concepto: 'ingresos',    pagado: 9000, pendiente: 0, cantidad: 30 },
  { mes: '2026-10-01', concepto: 'mercaderia',  pagado: 3000, pendiente: 0, cantidad: 2 },
  { mes: '2026-10-01', concepto: 'proveedores', pagado: 500,  pendiente: 0, cantidad: 1 },   // mismo grupo
  { mes: '2026-10-01', concepto: 'sueldos',     pagado: 4000, pendiente: 0, cantidad: 3 },
  // noviembre (en curso)
  { mes: '2026-11-01', concepto: 'ingresos',    pagado: 2000, pendiente: 0, cantidad: 8 },
  { mes: '2026-11-01', concepto: 'mercaderia',  pagado: 1000, pendiente: 400, cantidad: 3 },
  { mes: '2026-11-01', concepto: 'alquiler',    pagado: 0,    pendiente: 800, cantidad: 1 },
  { mes: '2026-11-01', concepto: 'sueldos',     pagado: 2500, pendiente: 2000, cantidad: 4 },
  // diciembre (futuro): solo un pendiente cargado
  { mes: '2026-12-01', concepto: 'impuestos',   pagado: 0,    pendiente: 600, cantidad: 1 },
  { mes: '2026-12-01', concepto: 'mercaderia',  pagado: 0,    pendiente: 5000, cantidad: 1 },
  // pendiente sin vencimiento
  { mes: null,         concepto: 'otros',       pagado: 0,    pendiente: 77,  cantidad: 2 },
]
const est2 = [
  { mes: '2026-10-01', concepto: 'mercaderia', monto: 3200 },   // referencia del mes pasado
  { mes: '2026-11-01', concepto: 'ingresos',   monto: 10000 },
  { mes: '2026-11-01', concepto: 'mercaderia', monto: 3500 },   // > 1000 + 400 → manda el estimado
  { mes: '2026-11-01', concepto: 'personal',   monto: 4000 },   // < 2500 + 2000 → manda lo cargado
  { mes: '2026-12-01', concepto: 'ingresos',   monto: 11000 },
  { mes: '2026-12-01', concepto: 'mercaderia', monto: 3600 },   // < 5000 pendiente → manda lo cargado
  { mes: '2026-12-01', concepto: 'viejo_grupo', monto: 999999 },// grupo que ya no existe: se ignora
]
const m2 = cf.armarCashflow({ meses: ['2026-10-01', '2026-11-01', '2026-12-01'], filas, estimados: est2, mesActual: '2026-11-01', config: null })
const [oct, nov, dic] = m2.columnas
assert.equal(oct.tipo, 'pasado'); assert.equal(nov.tipo, 'curso'); assert.equal(dic.tipo, 'futuro')
// pasado: real, aunque haya estimado
assert.deepEqual([oct.ingresos.valor, oct.grupos.mercaderia.valor, oct.grupos.mercaderia.estimado, oct.grupos.mercaderia.origen], [9000, 3500, 3200, 'real'])
assert.equal(oct.totalEgresos, 7500); assert.equal(oct.flujo, 1500)
// en curso
assert.deepEqual([nov.ingresos.valor, nov.ingresos.origen, nov.ingresos.real], [10000, 'estimado', 2000])
assert.deepEqual([nov.grupos.mercaderia.valor, nov.grupos.mercaderia.origen], [3500, 'estimado'])
assert.deepEqual([nov.grupos.personal.valor, nov.grupos.personal.origen], [4500, 'cargado'])
assert.deepEqual([nov.grupos.local_servicios.valor, nov.grupos.local_servicios.origen], [800, 'cargado'])
assert.equal(nov.grupos.impuestos.origen, 'vacio')
assert.equal(nov.totalEgresos, 8800); assert.equal(nov.flujo, 1200); assert.equal(nov.pendienteCargado, 3200)
// futuro
assert.deepEqual([dic.ingresos.valor, dic.grupos.mercaderia.valor, dic.grupos.mercaderia.origen, dic.grupos.impuestos.valor], [11000, 5000, 'cargado', 600])
assert.equal(dic.flujo, 11000 - 5600)
// sin saldo configurado: no hay saldo final y el estado sale del flujo del mes
assert.deepEqual(m2.columnas.map(c => c.saldoFinal), [null, null, null])
assert.deepEqual(m2.columnas.map(c => c.estado), ['ok', 'ok', 'ok'])
assert.equal(m2.saldo.configurado, false)
assert.deepEqual(m2.sinFecha, { monto: 77, cantidad: 2 })
assert.deepEqual(m2.columnas.map(c => c.acumulado), [1500, 2700, 8100])
assert.equal(m2.total.flujo, 8100)
// promedio real de los meses cerrados (solo octubre tiene datos)
assert.equal(m2.promedios.ingresos, 9000); assert.equal(m2.promedios.mercaderia, 3500); assert.equal(m2.promedios.impuestos, null)

// ── 3) Saldo: arranca en un mes fuera de la vista, y mes sin saldo todavía ──
const m3 = cf.armarCashflow({
  meses: ['2026-11-01', '2026-12-01'], filas, estimados: est2, mesActual: '2026-11-01',
  config: { saldo_inicial: 1000, saldo_desde: '2026-10-01', saldo_minimo: 4000 },
})
// saldo = 1000 + flujo oct (1500) + nov (1200) = 3700 → bajo el mínimo de 4000; dic 3700 + 5400 = 9100 → ok
assert.deepEqual(m3.columnas.map(c => c.saldoFinal), [3700, 9100])
assert.deepEqual(m3.columnas.map(c => c.estado), ['bajo', 'ok'])
assert.deepEqual(m3.columnas.map(c => c.acumulado), [1200, 6600], 'el acumulado es solo de lo que se ve')
assert.deepEqual(m3.mesesEnAlerta, ['2026-11-01'])
const m4 = cf.armarCashflow({
  meses: ['2026-10-01', '2026-11-01', '2026-12-01'], filas, estimados: est2, mesActual: '2026-11-01',
  config: { saldo_inicial: -500, saldo_desde: '2026-11-01', saldo_minimo: 0 },
})
assert.deepEqual(m4.columnas.map(c => c.saldoFinal), [null, 700, 6100], 'antes de saldo_desde no hay saldo')
// mes sin nada
const m5 = cf.armarCashflow({ meses: ['2027-06-01'], filas: [], estimados: [], mesActual: '2026-11-01', config: null })
assert.equal(m5.columnas[0].estado, 'sin_datos'); assert.equal(m5.columnas[0].indicadores.mercaderia, null)
assert.deepEqual(cf.armarCashflow({ meses: [], mesActual: '2026-11-01' }).columnas, [])

// ── 4) Completar una fila con aumento mensual (como su planilla: 10 % y 5 %) ─
const serie = cf.serieEstimados({ concepto: 'ingresos', desde: '2026-11-01', hasta: '2027-03-01', monto: 7000000, aumentoPct: 10 })
assert.deepEqual(serie.map(s => s.monto), planilla.ingresos)
assert.deepEqual(cf.serieEstimados({ concepto: 'mercaderia', desde: '2026-11-01', hasta: '2027-03-01', monto: 5500000, aumentoPct: 5 }).map(s => s.monto),
  [5500000, 5775000, 6063750, 6366938, 6685284])
assert.equal(serie[4].mes, '2027-03-01'); assert.equal(serie[0].concepto, 'ingresos')
assert.deepEqual(cf.serieEstimados({ concepto: 'x', desde: '2027-03-01', hasta: '2026-11-01', monto: 1 }), [])
assert.deepEqual(cf.serieEstimados({ concepto: 'x', desde: '2026-11-01', hasta: '2026-11-01', monto: 0 }).map(s => s.monto), [0])

// ── 5) Formato ──────────────────────────────────────────────────────────────
assert.equal(cf.fmtPlata(7280000), '$7.280.000'); assert.equal(cf.fmtPlata(-7280000), '-$7.280.000'); assert.equal(cf.fmtPlata(0), '$0')
assert.equal(cf.fmtPlataCorta(-7280000), '-$7,3M'); assert.equal(cf.fmtPlataCorta(22056236), '$22M'); assert.equal(cf.fmtPlataCorta(850000), '$850K')
assert.equal(cf.fmtPct(null), '—')

// ── 6) Hoja de Excel: mismas cifras que la pantalla ─────────────────────────
const hoja = cf.matrizParaExcel(m, { negocio: 'Kiku Sushi' })
const filaDe = (t) => hoja.find(r => r[0] === t)
assert.deepEqual(filaDe('Concepto'), ['Concepto', 'nov 2026', 'dic 2026', 'ene 2027', 'feb 2027', 'mar 2027', 'Total'])
assert.deepEqual(filaDe('Total egresos').slice(1), [14280000, 12369000, 12987450, 13636823, 14318663, 67591936])
assert.deepEqual(filaDe('SALDO FINAL').slice(1), [-4480000, -9149000, -13666450, -17986273, -22056236, -22056236])
assert.equal(filaDe('Estado')[1], 'NEGATIVO'); assert.equal(filaDe('Mercadería como % de ingresos')[1], 78.6)
assert.deepEqual(cf.matrizParaExcel(m2).find(r => r[0] === 'SALDO FINAL').slice(1), ['', '', '', ''], 'sin saldo configurado las celdas quedan vacías')

console.log('✓ Cash flow: reproduce la planilla de administración; real / en curso / futuro, saldo, estados, series y Excel.')
