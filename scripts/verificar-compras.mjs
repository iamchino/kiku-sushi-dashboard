// ────────────────────────────────────────────────────────────────────────────
// Verifica la lógica pura de "la boleta con sus productos" y del reporte de
// faltantes (src/lib/compras.js).
//
// Uso:  npm run verificar:compras
// ────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import * as c from '../src/lib/compras.js'

// ── Números tipeados ────────────────────────────────────────────────────────
assert.equal(c.numero('10'), 10)
assert.equal(c.numero('1,5'), 1.5, 'coma decimal')
assert.equal(c.numero('1.5'), 1.5, 'punto decimal (igual que el campo Monto)')
assert.equal(c.numero('12.500,50'), 12500.5, 'formato argentino completo')
assert.equal(c.numero(' $ 3.000,00 '), 3000)
assert.equal(c.numero(7.25), 7.25)
assert.equal(c.numero(''), null); assert.equal(c.numero('abc'), null); assert.equal(c.numero(null), null)
assert.equal(c.numero(0), 0)

// ── Qué categorías llevan productos ─────────────────────────────────────────
assert.ok(c.puedeLlevarProductos('mercaderia')); assert.ok(c.puedeLlevarProductos('proveedores'))
assert.ok(!c.puedeLlevarProductos('sueldos')); assert.ok(!c.puedeLlevarProductos('alquiler'))

// ── Filas, subtotales y total ───────────────────────────────────────────────
const salmon = { key: 'a', stock_id: 's1', nombre: 'Salmón', unidad: 'kg', cantidad: '10', precio_unitario: '12000' }
const palta  = { key: 'b', stock_id: 's2', nombre: 'Palta', unidad: 'kg', cantidad: '2,5', precio_unitario: '4000' }
const vacia  = { key: 'c', stock_id: 's3', nombre: 'Arroz', unidad: 'kg', cantidad: '', precio_unitario: '2000' }
const sinProducto = { key: 'd', stock_id: '', nombre: '', cantidad: '3', precio_unitario: '10' }
assert.equal(c.subtotalFila(salmon), 120000)
assert.equal(c.subtotalFila(palta), 10000)
assert.equal(c.subtotalFila(vacia), 0)
assert.ok(c.filaCargada(salmon)); assert.ok(!c.filaCargada(vacia)); assert.ok(!c.filaCargada(sinProducto))
assert.ok(!c.filaCargada({ ...salmon, cantidad: '0' })); assert.ok(!c.filaCargada({ ...salmon, cantidad: '-2' }))
const filas = [salmon, palta, vacia, sinProducto]
assert.equal(c.filasCargadas(filas).length, 2, 'los habituales sin cantidad no cuentan')
assert.equal(c.totalProductos(filas), 130000)
assert.equal(c.subtotalFila({ cantidad: '0,333', precio_unitario: '1000' }), 330, 'la cantidad va a 2 decimales, como en la base')
assert.equal(c.subtotalFila({ cantidad: '3', precio_unitario: '33,335' }), 100.01, 'redondea a centavos')

// ── La boleta tiene que cerrar con el monto ────────────────────────────────
assert.equal(c.diferenciaBoleta('130000', filas), 0)
assert.ok(c.boletaCierra('130000', filas))
assert.ok(c.boletaCierra('130000.80', filas), 'tolera redondeos de hasta $1')
assert.ok(!c.boletaCierra('135000', filas))
assert.equal(c.diferenciaBoleta('135000', filas), 5000)
assert.equal(c.problemaBoleta({ filas, monto: '130000' }), null)
assert.match(c.problemaBoleta({ filas, monto: '135000' }), /les faltan \$5\.000/)
assert.match(c.problemaBoleta({ filas, monto: '100000' }), /se pasan \$30\.000/)
assert.equal(c.problemaBoleta({ filas, monto: '135000', permitirDiferencia: true }), null, 'impuestos / envío aceptados')
assert.match(c.problemaBoleta({ filas, monto: '' }), /Falta el monto/)
assert.equal(c.problemaBoleta({ filas: [vacia], monto: '' }), null, 'sin productos cargados no hay nada que validar')
assert.match(c.problemaBoleta({ filas: [salmon, { ...salmon, key: 'z' }], monto: '240000' }), /dos veces/)
assert.match(c.problemaBoleta({ filas: [{ ...salmon, precio_unitario: '' }], monto: '1' }), /Falta el precio de Salmón/)
assert.match(c.problemaBoleta({ filas: [{ ...salmon, precio_unitario: '-1' }], monto: '1' }), /no puede ser negativo/)
assert.equal(c.problemaBoleta({ filas: [{ ...salmon, precio_unitario: '0' }], monto: '500', permitirDiferencia: true }), null, 'precio 0 = bonificado')

// ── Lo que viaja a la base ──────────────────────────────────────────────────
assert.deepEqual(c.itemsParaGuardar(filas), [
  { stock_id: 's1', cantidad: 10, precio_unitario: 12000 },
  { stock_id: 's2', cantidad: 2.5, precio_unitario: 4000 },
])
assert.deepEqual(c.itemsParaGuardar([{ stock_id: 'x', cantidad: '1,005', precio_unitario: '0,12345' }]),
  [{ stock_id: 'x', cantidad: 1.01, precio_unitario: 0.1235 }], 'cantidad a 2 decimales, precio a 4')

const originales = [
  { stock_id: 's1', cantidad: '10.00', precio_unitario: '12000.0000' },
  { stock_id: 's2', cantidad: '2.50', precio_unitario: '4000.0000' },
]
assert.ok(!c.cambioLaBoleta(originales, filas), 'misma boleta = sin cambios')
assert.ok(c.cambioLaBoleta(originales, [salmon]), 'sacar un producto es un cambio')
assert.ok(c.cambioLaBoleta(originales, [{ ...salmon, cantidad: '8' }, palta]))
assert.ok(c.cambioLaBoleta(originales, [{ ...salmon, precio_unitario: '12500' }, palta]))
assert.ok(c.cambioLaBoleta([], filas)); assert.ok(!c.cambioLaBoleta([], [vacia]))

assert.deepEqual(c.pagoParaRpc({
  categoria: 'mercaderia', descripcion: 'Boleta', monto: '130000', medio_pago: 'efectivo', estado: 'pagado',
  fecha: '2026-11-13', proveedor_id: 'p1', empleado_id: '', subtipo: '', periodo: '', vencimiento: '',
  comprobante_nro: 'A-1', notas: '', origen: 'caja', cuenta_id: '',
}), {
  categoria: 'mercaderia', descripcion: 'Boleta', monto: 130000, medio_pago: 'efectivo', estado: 'pagado',
  fecha: '2026-11-13', proveedor_id: 'p1', empleado_id: null, subtipo: null, periodo: null, vencimiento: null,
  comprobante: 'A-1', notas: null, origen: 'caja', cuenta_id: null,
})

// ── Armado de filas: existentes + habituales, sin pisar lo tipeado ─────────
const productos = [
  { stock_id: 's1', nombre: 'Salmón', unidad: 'kg', precio_actual: 12000, habitual: true, ultimo_precio: 11500, ultima_cantidad: 8, ultima_compra: '2026-11-05' },
  { stock_id: 's2', nombre: 'Palta', unidad: 'kg', precio_actual: 4000, habitual: false, ultimo_precio: null },
  { stock_id: 's3', nombre: 'Arroz', unidad: 'kg', precio_actual: 0, habitual: true, ultimo_precio: null },
]
// Alta: solo los habituales, cantidad vacía y el último precio como sugerencia.
let f = c.armarFilas({ productos })
assert.deepEqual(f.map(x => x.nombre), ['Salmón', 'Arroz'])
assert.equal(f[0].cantidad, ''); assert.equal(f[0].precio_unitario, '11500'); assert.equal(f[0].precio_sugerido, 11500)
assert.equal(f[1].precio_unitario, '', 'sin precio cargado queda vacío')
assert.equal(c.totalProductos(f), 0, 'nada cuenta hasta que se pone una cantidad')
// Edición: lo que el pago tenía va primero, con su cantidad y precio.
f = c.armarFilas({ productos, existentes: [{ stock_id: 's2', nombre: 'Palta', unidad: 'kg', cantidad: '5.00', precio_unitario: '3900.0000' }] })
assert.deepEqual(f.map(x => [x.nombre, x.cantidad, x.precio_unitario]), [['Palta', '5', '3900'], ['Salmón', '', '11500'], ['Arroz', '', '']])
assert.ok(f[0].existente)
// Un producto que ya no está en Inventario (sin ficha) se arma con su nombre guardado.
f = c.armarFilas({ productos: [], existentes: [{ stock_id: 'viejo', nombre: 'Kanikama', unidad: 'kg', cantidad: 1, precio_unitario: 900 }] })
assert.deepEqual([f[0].nombre, f[0].cantidad, f[0].precio_unitario], ['Kanikama', '1', '900'])
// Cambia el proveedor: se conserva lo tipeado y lo agregado a mano; los
// habituales sin tocar del proveedor anterior se van.
const tipeada = { key: 'k1', stock_id: 's1', nombre: 'Salmón', unidad: 'kg', cantidad: '4', precio_unitario: '13000', habitual: true }
const manual = { key: 'k2', stock_id: 's2', nombre: 'Palta', unidad: 'kg', cantidad: '', precio_unitario: '', manual: true }
const sinTocar = { key: 'k3', stock_id: 's3', nombre: 'Arroz', unidad: 'kg', cantidad: '', precio_unitario: '', habitual: true }
const otros = [{ stock_id: 's9', nombre: 'Wasabi', unidad: 'kg', precio_actual: 500, habitual: true }, ...productos.map(p => ({ ...p, habitual: false }))]
f = c.armarFilas({ productos: otros, actuales: [tipeada, manual, sinTocar] })
assert.deepEqual(f.map(x => x.nombre), ['Salmón', 'Palta', 'Wasabi'])
assert.equal(f[0].cantidad, '4'); assert.equal(f[0].precio_unitario, '13000')
// El buscador de "Agregar" no repite lo que ya está en la lista.
assert.deepEqual(c.productosDisponibles(productos, [tipeada]).map(p => p.nombre), ['Palta', 'Arroz'])

// ── Formato ─────────────────────────────────────────────────────────────────
assert.equal(c.plata(1234567.4), '$1.234.567'); assert.equal(c.plata(0), '$0')
assert.equal(c.cantidadTxt(2.5, 'kg'), '2,5 kg'); assert.equal(c.cantidadTxt(10, ''), '10')

// ── Períodos del reporte ────────────────────────────────────────────────────
const hoy = new Date(2026, 10, 13) // 13/11/2026
assert.deepEqual(c.rangoPeriodo('mes', hoy), { desde: '2026-11-01', hasta: '2026-11-13' })
assert.deepEqual(c.rangoPeriodo('mes_anterior', hoy), { desde: '2026-10-01', hasta: '2026-10-31' })
assert.deepEqual(c.rangoPeriodo('semana', hoy), { desde: '2026-11-07', hasta: '2026-11-13' })
assert.deepEqual(c.rangoPeriodo('mes_anterior', new Date(2027, 0, 5)), { desde: '2026-12-01', hasta: '2026-12-31' }, 'cruza el año')
assert.deepEqual(c.rangoPeriodo('mes_anterior', new Date(2028, 2, 31)), { desde: '2028-02-01', hasta: '2028-02-29' }, 'febrero bisiesto')

// ── Reporte de faltantes ────────────────────────────────────────────────────
const crudo = [
  { stock_id: 's1', nombre: 'Salmón', unidad: 'kg', tipo_stock: 'materia_prima', precio_unitario: '12000', stock_inicial: '5', comprado: '9', otras_entradas: '0',
    vendido: '3', otras_salidas: '0', merma: '1', conteos: 1, faltante: '1.5', sobrante: '0', valor_faltante: '18000', valor_sobrante: '0', valor_merma: '12000',
    stock_final: '8.5', detalle: [{ id: 'm1', tipo: 'ajuste', diferencia: -1.5 }] },
  { stock_id: 's2', nombre: 'Palta', unidad: 'kg', tipo_stock: 'materia_prima', precio_unitario: '4000', stock_inicial: '4', comprado: '5', otras_entradas: '1',
    vendido: '2', otras_salidas: '0.5', merma: '0', conteos: 0, faltante: '0', sobrante: '0', valor_faltante: '0', valor_sobrante: '0', valor_merma: '0', stock_final: '7.5', detalle: null },
  { stock_id: 's5', nombre: 'Roll Kiku', unidad: 'roll', tipo_stock: 'servicio', precio_unitario: '0', stock_inicial: '6', comprado: '0', otras_entradas: '10',
    vendido: '12', otras_salidas: '0', merma: '0', conteos: 2, faltante: '2', sobrante: '1', valor_faltante: '0', valor_sobrante: '0', valor_merma: '0', stock_final: '3', detalle: [] },
  { stock_id: 's3', nombre: 'Arroz', unidad: 'kg', tipo_stock: 'materia_prima', precio_unitario: '2000', stock_inicial: '20', comprado: '0', otras_entradas: '0',
    vendido: '0', otras_salidas: '0', merma: '0', conteos: 1, faltante: '0', sobrante: '2', valor_faltante: '0', valor_sobrante: '4000', valor_merma: '0', stock_final: '22', detalle: [] },
]
const rep = crudo.map(c.filaFaltante)
assert.equal(rep[0].entro, 9); assert.equal(rep[0].salio, 3); assert.equal(rep[0].neto, -1.5)
assert.equal(rep[1].entro, 6); assert.equal(rep[1].salio, 2.5); assert.deepEqual(rep[1].detalle, [])
assert.ok(!rep[0].sin_precio); assert.ok(rep[2].sin_precio, 'faltó en unidades pero no tiene costo'); assert.ok(!rep[1].sin_precio)
assert.ok(c.tieneDiferencia(rep[0])); assert.ok(!c.tieneDiferencia(rep[1])); assert.ok(c.tieneDiferencia(rep[3]))
assert.deepEqual(c.resumenFaltantes(rep), { faltante: 18000, sobrante: 4000, merma: 12000, comprado: 0, productosConFaltante: 2, productosContados: 3, sinPrecio: 1 })
assert.deepEqual(c.filtrarFaltantes(rep).map(x => x.nombre), ['Salmón', 'Roll Kiku', 'Arroz'], 'ordena por pesos faltantes, después por unidades')
assert.deepEqual(c.filtrarFaltantes(rep, { soloDiferencias: false }).map(x => x.nombre), ['Salmón', 'Roll Kiku', 'Arroz', 'Palta'])
assert.deepEqual(c.filtrarFaltantes(rep, { tipo: 'servicio' }).map(x => x.nombre), ['Roll Kiku'])
assert.deepEqual(c.filtrarFaltantes(rep, { texto: 'salmon' }).map(x => x.nombre), ['Salmón'], 'busca sin acentos')

const hoja = c.matrizFaltantes(c.filtrarFaltantes(rep), { desde: '2026-11-01', hasta: '2026-11-13' })
assert.equal(hoja[0][0], 'Kiku Sushi · Faltantes de stock'); assert.equal(hoja[1][0], 'Del 01/11/2026 al 13/11/2026')
assert.deepEqual(hoja[3], ['Faltante en conteos ($)', 18000]); assert.deepEqual(hoja[5], ['Merma declarada ($)', 12000])
const titulos = hoja.find(r => r[0] === 'Producto')
assert.equal(titulos.length, 16); assert.equal(titulos[12], 'Faltante ($)')
assert.deepEqual(hoja.find(r => r[0] === 'Salmón'), ['Salmón', 'kg', 5, 9, 0, 3, 0, 1, 1.5, 0, 8.5, 12000, 18000, 0, 12000, 1])

console.log('✓ Compras: números tipeados, total contra el monto, armado de filas, lo que viaja a la base, períodos y reporte de faltantes.')
