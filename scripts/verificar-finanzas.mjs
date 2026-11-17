// ────────────────────────────────────────────────────────────────────────────
// Verifica la lógica pura de tres cosas que pidió administración el 17/11:
//   · pagar con canje (el pago queda pagado, pero no es plata que salió),
//   · el margen de recetas y combos contra el precio de carta SIN IVA,
//   · el recuadro "Disponible hoy" (caja + caja fuerte + saldo de los bancos).
// Y el aviso de la boleta cuando la diferencia con el monto es justo el IVA.
//
// Uso:  npm run verificar:finanzas
// ────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import * as fin from '../src/lib/finanzas.js'
import * as margen from '../src/lib/margen.js'
import * as compras from '../src/lib/compras.js'
import * as disp from '../src/lib/disponible.js'
import { armarHojas, resumenEgresos } from '../src/lib/reporteContable.js'

const cerca = (a, b, eps = 0.005) => Math.abs(a - b) <= eps

// ══ 1) Canje ═════════════════════════════════════════════════════════════════
assert.ok(fin.MEDIOS_PAGO.some(m => m.id === 'canje'), 'Canje está en la lista de medios de pago')
assert.equal(fin.medioLabel('canje'), 'Canje')

// Las dos facturas de vinos que se canjearon por una cata + pagos comunes.
const egresos = [
  { id: 'e1', fecha: '2026-11-10', categoria: 'mercaderia', monto: 120000, medio_pago: 'efectivo', estado: 'pagado', pagado_desde: 'caja' },
  { id: 'e2', fecha: '2026-11-11', categoria: 'servicios', monto: 80000.5, medio_pago: 'transferencia', estado: 'pagado', pagado_desde: 'banco', cuenta: { nombre: 'Banco Galicia' } },
  { id: 'e3', fecha: '2026-11-12', categoria: 'mercaderia', monto: 310000, medio_pago: 'canje', estado: 'pagado', comprobante_nro: 'A 0004-00001201', descripcion: 'Vinos', proveedor: { razon_social: 'Bodega Los Aromos' } },
  { id: 'e4', fecha: '2026-11-12', categoria: 'mercaderia', monto: 190000, medio_pago: 'canje', estado: 'pagado', comprobante_nro: 'A 0004-00001202', descripcion: 'Vinos', proveedor: { razon_social: 'Bodega Los Aromos' } },
  { id: 'e5', fecha: '2026-11-13', categoria: 'alquiler', monto: 900000, medio_pago: 'transferencia', estado: 'pendiente', vencimiento: '2026-11-01' },
]
assert.equal(fin.esCanje(egresos[2]), true)
assert.equal(fin.esCanje(egresos[0]), false)
assert.equal(fin.esCanje(null), false)
assert.deepEqual(fin.sinCanjes(egresos).map(e => e.id), ['e1', 'e2', 'e5'])
assert.deepEqual(fin.totalCanjes(egresos), { total: 500000, cantidad: 2 })
assert.deepEqual(fin.totalCanjes([]), { total: 0, cantidad: 0 })
assert.deepEqual(fin.totalCanjes(null), { total: 0, cantidad: 0 })

// Totales de Caja: lo pagado es plata; el canje va aparte y no resta.
const pagados = egresos.filter(e => e.estado === 'pagado')
const r = resumenEgresos(pagados)
assert.ok(cerca(r.total, 200000.5), `total pagado ${r.total}`)
assert.equal(r.cantidad, 2, 'los canjes no cuentan como pagos de plata')
assert.deepEqual(r.canje, { total: 500000, cantidad: 2 })
assert.equal(r.porMedio.has('canje'), false)
assert.equal(r.porMedio.get('efectivo'), 120000)
// Sin canjes todo queda como antes.
const r0 = resumenEgresos(pagados.filter(e => !fin.esCanje(e)))
assert.ok(cerca(r0.total, 200000.5)); assert.equal(r0.cantidad, 2); assert.deepEqual(r0.canje, { total: 0, cantidad: 0 })

// Proveedor → Facturas y pagos: pagado con plata, canjeado y pendiente, cada uno por su lado.
const rp = fin.resumenPagosProveedor(egresos, '2026-11-17')
assert.equal(rp.pagado, 200000.5); assert.equal(rp.cantPagados, 2)
assert.equal(rp.canjeado, 500000); assert.equal(rp.cantCanjeados, 2)
assert.equal(rp.pendiente, 900000); assert.equal(rp.vencido, 900000)

// Excel del contador: las facturas canjeadas figuran en Pagos, pero no suman.
const hojas = armarHojas({ pedidos: [], egresos: pagados, desde: '2026-11-01', hasta: '2026-11-30', negocio: 'Kiku' })
assert.equal(hojas.pagos.length, 4, 'las cuatro filas, canjes incluidos')
const filaCanje = hojas.pagos.find(f => f['Comprobante'] === 'A 0004-00001201')
assert.equal(filaCanje['Medio de pago'], 'Canje')
assert.equal(filaCanje['Salió de'], 'Canje (sin plata)')
assert.ok(cerca(hojas.totales.totalPagado, 200000.5), 'el total pagado es solo plata')
assert.equal(hojas.totales.pagadoConCanje, 500000)
const texto = (fila) => String(fila?.[0] ?? '')
const valor = (c) => (c && typeof c === 'object' && 'v' in c ? c.v : c)
const filaResumenCanje = hojas.resumen.find(f => texto(f).startsWith('Pagado con canje'))
assert.ok(filaResumenCanje, 'el resumen informa lo pagado con canje')
assert.match(texto(filaResumenCanje), /2 pagos: no es dinero/)
assert.equal(valor(filaResumenCanje[3]), 500000)
assert.ok(hojas.resumen.some(f => texto(f).startsWith('Aparte, pagado con canje')), 'y lo aclara en pagos por categoría')
const filaMercaderia = hojas.resumen.find(f => texto(f) === 'Mercadería')
assert.equal(valor(filaMercaderia[1]), 120000, 'Mercadería suma solo lo pagado con plata')
assert.equal(hojas.resumen.some(f => texto(f) === 'Canje'), false, 'no hay un renglón "Canje" entre los medios')
// Sin canjes, ni rastro.
const hojas0 = armarHojas({ pedidos: [], egresos: pagados.filter(e => !fin.esCanje(e)), desde: '2026-11-01', hasta: '2026-11-30' })
assert.equal(hojas0.resumen.some(f => /canje/i.test(texto(f)) && /Pagado con|Aparte/.test(texto(f))), false)
assert.equal(hojas0.totales.pagadoConCanje, 0)

// La base vieja rechaza 'canje' con el nombre del check: se traduce.
assert.match(fin.errorDeCanje('new row for relation "egresos" violates check constraint "egresos_medio_pago_check"'), /SQL 59/)
assert.equal(fin.errorDeCanje('El monto tiene que ser mayor a cero.'), 'El monto tiene que ser mayor a cero.')

// ══ 2) Margen sin IVA ════════════════════════════════════════════════════════
assert.ok(cerca(margen.precioSinIva(12100), 10000))
assert.equal(margen.precioSinIva(0), null)
assert.equal(margen.precioSinIva(null), null)
assert.equal(margen.precioSinIva('x'), null)
// Costo del 30 % del precio de carta: antes marcaba 70 %, sin IVA es 63,7 %.
assert.ok(cerca(margen.margenSinIva(10000, 3000), 63.7, 0.01), String(margen.margenSinIva(10000, 3000)))
// Precio $12.100 (= $10.000 + IVA) y costo $4.000 → 60 %.
assert.ok(cerca(margen.margenSinIva(12100, 4000), 60))
// Un costo igual al precio sin IVA deja margen cero; más caro, negativo.
assert.ok(cerca(margen.margenSinIva(12100, 10000), 0))
assert.ok(margen.margenSinIva(12100, 11000) < 0)
assert.equal(margen.margenSinIva(0, 100), null)
assert.equal(margen.margenSinIva(null, 100), null)
assert.ok(cerca(margen.margenSinIva(12100, 0), 100), 'sin costo cargado el margen es 100 %')
// Con otra alícuota (o sin IVA) la cuenta acompaña.
assert.ok(cerca(margen.margenSinIva(11050, 5000, 10.5), 50))
assert.ok(cerca(margen.margenSinIva(10000, 3000, 0), 70))
assert.equal(margen.esMargenBajo(29.9), true)
assert.equal(margen.esMargenBajo(30), false)
assert.equal(margen.esMargenBajo(null), false)
assert.equal(margen.textoSinIva(12100), '$10.000')
assert.equal(margen.textoSinIva(0), '')

// ══ 3) La boleta: el precio va sin IVA ═══════════════════════════════════════
// La captura de Yamile: 10 u a $1.375,54 = $13.755,40 y el pago de $16.644,03.
const filasTapas = [{ stock_id: 's1', nombre: 'Tapas Empanadas Copetín', cantidad: '10', precio_unitario: '1375.54' }]
assert.equal(compras.totalProductos(filasTapas), 13755.4)
assert.equal(compras.diferenciaBoleta('16644.03', filasTapas), 2888.63)
assert.equal(compras.diferenciaEsIva('16644.03', filasTapas), true, 'esa diferencia es el IVA')
assert.equal(compras.diferenciaEsIva('16644', filasTapas), true, 'con el monto redondeado también')
assert.equal(compras.diferenciaEsIva('13755.40', filasTapas), false, 'sin diferencia no hay nada que explicar')
assert.equal(compras.diferenciaEsIva('18000', filasTapas), false, 'flete u otra cosa: no es el IVA')
assert.equal(compras.diferenciaEsIva('12000', filasTapas), false, 'si los productos se pasan, tampoco')
assert.equal(compras.diferenciaEsIva('16644.03', []), false)
// El campo Monto: un punto solo es decimal, y se avisa cuando tiene pinta de miles.
assert.equal(compras.numero('16644.03'), 16644.03)
assert.equal(compras.numero('16.644,03'), 16644.03)
assert.equal(compras.numero('16644,03'), 16644.03)
assert.equal(compras.numero('16.644'), 16.644, 'con punto solo, decimal (como siempre)')
assert.equal(compras.pareceMiles('16.644'), 16644)
assert.equal(compras.pareceMiles('1.250.000'), 1250000)
assert.equal(compras.pareceMiles('$ 500.000'), 500000)
assert.equal(compras.pareceMiles('16644.03'), null)
assert.equal(compras.pareceMiles('16.644,03'), null)
assert.equal(compras.pareceMiles('1375.54'), null)
assert.equal(compras.pareceMiles('12.5'), null)
assert.equal(compras.pareceMiles(''), null)
assert.equal(fin.fmtPlata(16644.03), '$16.644,03')
assert.equal(fin.fmtPlata(16.644), '$16,64')
assert.equal(fin.fmtPlata(500000), '$500.000')

// La misma boleta cargada por unidad suelta (240 tapas) da lo mismo.
const filas240 = [{ stock_id: 's1', nombre: 'Tapas', cantidad: '240', precio_unitario: '57.3142' }]
assert.equal(compras.diferenciaEsIva('16644.03', filas240), true)
// Con IVA del 10,5 %.
assert.equal(compras.diferenciaEsIva('11050', [{ stock_id: 's2', cantidad: '1', precio_unitario: '10000' }], 10.5), true)

// ══ 4) Disponible hoy ════════════════════════════════════════════════════════
assert.equal(disp.diasEntre('2026-11-10', '2026-11-17'), 7)
assert.equal(disp.diasEntre('2026-11-17', '2026-11-17'), 0)
assert.equal(disp.diasEntre('2026-10-31', '2026-11-01'), 1)
assert.equal(disp.diasEntre(null, '2026-11-01'), null)

const HOY = '2026-11-17'
const galicia = { cuenta_id: 'c1', nombre: 'Banco Galicia', tipo: 'banco', activa: true, saldo: 500000, fecha: '2026-11-17', usuario_nombre: 'Yamile', pagado_despues: 0, pagos_despues: 0 }
const mp = { cuenta_id: 'c2', nombre: 'Mercado Pago KIKU SUSHI', tipo: 'billetera', activa: true, saldo: null, fecha: null, pagado_despues: 0, pagos_despues: 0 }

const fg = disp.filaCuenta(galicia, HOY)
assert.equal(fg.monto, 500000); assert.equal(fg.viejo, false); assert.equal(fg.aviso, null)
assert.match(fg.detalle, /Saldo del 17\/11\/2026 \(hoy\) · lo cargó Yamile/)
const fm = disp.filaCuenta(mp, HOY)
assert.equal(fm.monto, null); assert.equal(fm.sinSaldo, true); assert.match(fm.detalle, /Sin saldo cargado/)
// Un saldo de hace una semana, o con pagos posteriores, avisa.
const viejo = disp.filaCuenta({ ...galicia, fecha: '2026-11-10' }, HOY)
assert.equal(viejo.dias, 7); assert.equal(viejo.viejo, true); assert.match(viejo.aviso, /más de una semana/)
assert.match(viejo.detalle, /hace 7 días/)
const conPagos = disp.filaCuenta({ ...galicia, fecha: '2026-11-16', pagado_despues: 120000, pagos_despues: 2 }, HOY)
assert.match(conPagos.detalle, /\(ayer\)/)
assert.match(conPagos.aviso, /se pagaron \$120\.000 por transferencia desde esta cuenta \(2 pagos\)/)
assert.match(disp.filaCuenta({ ...galicia, pagado_despues: 5000, pagos_despues: 1 }, HOY).aviso, /se pagó \$5\.000/)
// Descubierto: el saldo puede ser negativo.
assert.equal(disp.filaCuenta({ ...galicia, saldo: -35000 }, HOY).monto, -35000)

// El caso de Yamile: $600.000 en la caja y $500.000 en Galicia.
const modelo = disp.armarDisponible({
  caja: { visible: true, abierta: true, monto: 600000 },
  cajaFuerte: { visible: true, saldo: 250000 },
  cuentas: { disponible: true, filas: [galicia, mp] },
  hoyISO: HOY,
})
assert.deepEqual(modelo.filas.map(f => f.nombre), ['Caja del día', 'Caja fuerte', 'Banco Galicia', 'Mercado Pago KIKU SUSHI'])
assert.equal(modelo.total, 1350000)
assert.equal(modelo.parcial, true, 'falta el saldo de Mercado Pago')
assert.deepEqual(modelo.faltan, ['Mercado Pago KIKU SUSHI'])
assert.equal(disp.textoFaltan(modelo.faltan), 'Sin contar Mercado Pago KIKU SUSHI')
assert.equal(disp.textoFaltan(['A', 'B', 'C']), 'Sin contar A, B y C')
assert.equal(disp.textoFaltan([]), '')
// Con todo cargado, el total es completo.
const completo = disp.armarDisponible({
  caja: { visible: true, abierta: false, monto: 20000, fecha: '2026-11-16' },
  cajaFuerte: { visible: true, saldo: 0 },
  cuentas: { disponible: true, filas: [galicia] }, hoyISO: HOY,
})
assert.equal(completo.total, 520000); assert.equal(completo.parcial, false)
assert.match(completo.filas[0].detalle, /Caja cerrada · lo que quedó en el cajón del cierre del 16\/11\/2026/)
// Sin permiso de Caja ni de caja fuerte: se dice, y no suma un cero mentiroso.
const sinPermisos = disp.armarDisponible({ caja: { visible: false }, cajaFuerte: { visible: false }, cuentas: { disponible: true, filas: [galicia] }, hoyISO: HOY })
assert.equal(sinPermisos.total, 500000)
assert.deepEqual(sinPermisos.faltan, ['Caja del día', 'Caja fuerte'])
assert.equal(sinPermisos.filas[0].sinAcceso, true)
// Base sin el SQL 59: solo las cajas, y avisa.
const sinSql = disp.armarDisponible({ caja: { visible: true, abierta: true, monto: 600000 }, cajaFuerte: { visible: true, saldo: 250000 }, cuentas: { disponible: false, filas: [] } })
assert.equal(sinSql.filas.length, 2); assert.equal(sinSql.total, 850000)
assert.equal(sinSql.cuentasDisponible, false); assert.equal(sinSql.parcial, true)
// Todavía cargando (sin datos): no explota.
assert.equal(disp.armarDisponible({}).total, 0)
assert.equal(disp.armarDisponible().filas.length, 2)

// La plata se muestra con centavos solo si los tiene.
assert.equal(disp.fmtSaldo(500000), '$500.000')
assert.equal(disp.fmtSaldo(1250000.5), '$1.250.000,50')
assert.equal(disp.fmtSaldo(-35000.5), '-$35.000,50')
assert.equal(disp.fmtSaldo(0), '$0')
assert.equal(disp.fmtSaldo(null), '$0')
assert.equal(disp.fmtSaldo(99.999), '$100')

// Lo que se tipea al cargar un saldo. "500.000" son quinientos mil, como lo
// muestra el banco (en la primera prueba se guardaba como $500).
assert.equal(disp.leerSaldo('500.000'), 500000)
assert.equal(disp.leerSaldo('1.250.000'), 1250000)
assert.equal(disp.leerSaldo('1.250.000,50'), 1250000.5)
assert.equal(disp.leerSaldo('1,250,000.50'), 1250000.5)
assert.equal(disp.leerSaldo('500000.75'), 500000.75)
assert.equal(disp.leerSaldo('500000,75'), 500000.75)
assert.equal(disp.leerSaldo('1.5'), 1.5)
assert.equal(disp.leerSaldo('12.50'), 12.5)
assert.equal(disp.leerSaldo('1,250,000'), 1250000)
assert.equal(disp.leerSaldo('-35.000'), -35000)
assert.equal(disp.leerSaldo(' $ 500.000,00 '), 500000)
assert.equal(disp.leerSaldo('0'), 0)
for (const malo of ['', '   ', 'abc', '12.34.56', '5e3', '--5', '1 000a', null, undefined]) {
  assert.equal(disp.leerSaldo(malo), null, `"${malo}" no es un saldo`)
}
assert.deepEqual(disp.validarSaldo({ saldo: '500.000', fecha: HOY }, HOY), { ok: true, saldo: 500000, fecha: HOY, nota: null })
assert.deepEqual(disp.validarSaldo({ saldo: '500000', fecha: HOY }, HOY), { ok: true, saldo: 500000, fecha: HOY, nota: null })
assert.equal(disp.validarSaldo({ saldo: '1.250.000,50' }, HOY).saldo, 1250000.5)
assert.equal(disp.validarSaldo({ saldo: '$ 500.000,00' }, HOY).saldo, 500000)
assert.equal(disp.validarSaldo({ saldo: '-35000', fecha: HOY }, HOY).saldo, -35000)
assert.equal(disp.validarSaldo({ saldo: '0' }, HOY).saldo, 0, 'cero es un saldo válido')
assert.equal(disp.validarSaldo({ saldo: '500000', nota: '  antes de las tarjetas ' }, HOY).nota, 'antes de las tarjetas')
assert.equal(disp.validarSaldo({ saldo: '500000' }, HOY).fecha, HOY, 'sin fecha, hoy')
assert.match(disp.validarSaldo({ saldo: '' }, HOY).error, /Escribí el saldo/)
assert.match(disp.validarSaldo({ saldo: 'abc' }, HOY).error, /no es un número/)
assert.match(disp.validarSaldo({ saldo: '500000', fecha: '2026-11-18' }, HOY).error, /futura/)
assert.match(disp.validarSaldo({ saldo: '9999999999999' }, HOY).error, /demasiado grande/)
assert.match(disp.validarSaldo({ saldo: '1', nota: 'x'.repeat(201) }, HOY).error, /muy larga/)

console.log('✓ Finanzas: canje (pagado, pero no es plata: Caja, proveedor y Excel), margen contra el precio sin IVA, aviso de IVA en la boleta y recuadro "Disponible hoy".')
