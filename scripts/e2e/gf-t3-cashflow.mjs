// Gastos fijos en el Cash flow (pedido de administración del 18/11: "no veo
// en los meses siguientes los gastos fijos que ya fui cargando"). El mes en
// curso los tiene como pendientes (se crean el día 1); los meses que vienen
// los suman ya, aunque todavía no se hayan creado, sin contarlos dos veces.
import { abrir, BASE, sql as sqlBase, check, resumen } from './lib.mjs'
const DB = process.env.DB || 'kkgf3'
const sql = (q) => sqlBase(q, DB)
async function hasta(fn, ms = 8000) {
  const fin = Date.now() + ms
  for (;;) { const v = await fn(); if (v || Date.now() > fin) return v; await new Promise(r => setTimeout(r, 200)) }
}
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ')
const plata = (n) => `$${Math.round(Number(n)).toLocaleString('es-AR')}`
const sig = (p) => { const [y, m] = p.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}` }
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

const HOY = sql("select to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM-DD')")
const MES = HOY.slice(0, 7), M1 = sig(MES), M2 = sig(M1), M3 = sig(M2), M4 = sig(M3)
// Lo pendiente ya cargado (del seed) de un mes y unas categorías.
const pend = (mes, cats) => Number(sql(`select coalesce(sum(monto), 0) from egresos where estado = 'pendiente'
  and to_char(vencimiento, 'YYYY-MM') = '${mes}' and categoria in (${cats.map(c => `'${c}'`).join(',')})`))

// Tres gastos fijos: alquiler (el 10), autónomos (el 5) y uno pausado.
sql(`insert into gastos_fijos (descripcion, categoria, monto, medio_pago, dia_vencimiento, desde) values
  ('Alquiler Local', 'alquiler', 1150000, 'transferencia', 10, '${MES}'),
  ('Autónomos', 'impuestos', 45000, 'transferencia', 5, '${MES}'),
  ('Pausado', 'servicios', 99999, 'transferencia', 15, '${MES}')`)
sql("update gastos_fijos set activo = false where descripcion = 'Pausado'")
// Uno que arranca más adelante: solo desde M2.
sql(`insert into gastos_fijos (descripcion, categoria, monto, medio_pago, dia_vencimiento, desde) values ('Seguro nuevo', 'otros', 30000, 'transferencia', 20, '${M2}')`)

const { browser, page, errores } = await abrir('finanzas', { viewport: { width: 1500, height: 1500 } })
await page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Cash flow' }).click()
const tabla = page.getByRole('table')
await tabla.waitFor()
const fila = (label) => tabla.locator('tr', { has: page.locator('th', { hasText: new RegExp(`^${label}`) }) }).first()
const celdas = async (label) => (await fila(label).locator('td').allInnerTexts()).map(t => t.trim().split('\n')[0])
await hasta(async () => sql("select count(*) from egresos where gasto_fijo_id is not null") === '2')

console.log('— el mes en curso: los pendientes que se crearon el día 1')
check('al abrir el Cash flow se crearon los 2 del mes (no el pausado ni el que arranca después)',
  sql("select string_agg(descripcion, ' | ' order by descripcion) from egresos where gasto_fijo_id is not null") === `Alquiler Local · ${sql(`select public.gasto_fijo_mes_texto('${MES}')`)} | Autónomos · ${sql(`select public.gasto_fijo_mes_texto('${MES}')`)}`,
  sql("select string_agg(descripcion, ' | ') from egresos where gasto_fijo_id is not null"))
// Columnas: 0 = mes pasado, 1 = en curso, 2..5 = los cuatro que vienen.
const local = await celdas('Local y servicios'), imp = await celdas('Impuestos y tasas'), otros = await celdas('Inversiones y otros')
const pagadoMes = (cats) => Number(sql(`select coalesce(sum(monto), 0) from egresos where estado = 'pagado' and to_char(fecha, 'YYYY-MM') = '${MES}' and categoria in (${cats.map(c => `'${c}'`).join(',')})`))
const vencidoImpago = (cats) => Number(sql(`select coalesce(sum(monto), 0) from egresos where estado = 'pendiente' and vencimiento < '${MES}-01' and categoria in (${cats.map(c => `'${c}'`).join(',')})`))
const esperadoLocal1 = pagadoMes(['alquiler', 'servicios']) + pend(MES, ['alquiler', 'servicios']) + vencidoImpago(['alquiler', 'servicios'])
check('en curso: el alquiler cuenta una sola vez (como pendiente cargado)', local[1] === plata(esperadoLocal1), `${local[1]} vs ${plata(esperadoLocal1)}`)

console.log('— los meses que vienen')
// Una celda sin nada muestra «—».
const esperado = (mes, cats, fijo) => { const v = pend(mes, cats) + fijo; return v ? plata(v) : '—' }
check('Local y servicios: el alquiler en los 4 meses que vienen (+ lo cargado)',
  local.slice(2, 6).join() === [M1, M2, M3, M4].map(m => esperado(m, ['alquiler', 'servicios'], 1150000)).join(), local.slice(2, 6).join())
check('Impuestos y tasas: los autónomos en los 4 meses',
  imp.slice(2, 6).join() === [M1, M2, M3, M4].map(m => esperado(m, ['impuestos'], 45000)).join(), imp.slice(2, 6).join())
check('el que arranca más adelante, recién desde su mes',
  otros[2] === esperado(M1, ['otros'], 0) && otros[3] === esperado(M2, ['otros'], 30000), `${otros[2]} | ${otros[3]}`)
const filaFijos = await celdas('Gastos fijos de los meses que vienen')
check('fila «Gastos fijos de los meses que vienen»: vacía en el pasado y en curso; $1.195.000 y después $1.225.000',
  filaFijos[0] === '—' && filaFijos[1] === '—' && filaFijos[2] === '$1.195.000' && filaFijos.slice(3, 6).every(v => v === '$1.225.000'), filaFijos.join(' | '))
check('el pausado no aparece', !(await txt(tabla)).includes('99.999'))
await page.getByLabel('Mostrar de qué está hecho cada número').check()
check('con el detalle: «fijos $1.150.000» en la celda', (await txt(fila('Local y servicios').locator('td').nth(2))).includes('fijos $1.150.000'), await txt(fila('Local y servicios').locator('td').nth(2)))
await page.screenshot({ path: 'shots/gf-3-cashflow.png' })

console.log('— el detalle de una celda del mes que viene')
await fila('Local y servicios').locator('td').nth(2).getByRole('button', { name: /Ver los pagos/ }).click()
const modal = page.locator('div.fixed', { hasText: 'Local y servicios ·' }).last()
await modal.locator('[data-detalle-fijos]').waitFor()
const det = await txt(modal.locator('[data-detalle-fijos]'))
check('lista el alquiler con su vencimiento (el 10 de ese mes)', /GASTOS FIJOS \(SE CREAN EL DÍA 1\) \(1\)/i.test(det) && det.includes('Alquiler Local') && det.includes(ddmm(`${M1}-10`)) && det.includes('$1.150.000'), det)
check('y el recuadro de arriba dice «Gastos fijos $1.150.000»', /GASTOS FIJOS \$1\.150\.000/i.test(await txt(modal)))
await page.screenshot({ path: 'shots/gf-3-detalle.png' })
await modal.getByRole('button', { name: '×' }).click()

console.log('— pausar uno lo saca de la proyección')
sql("update gastos_fijos set activo = false where descripcion = 'Autónomos'")
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Cash flow' }).click()
await tabla.waitFor()
check('sin los autónomos: la fila baja a $1.150.000 / $1.180.000', await hasta(async () => {
  const f = await celdas('Gastos fijos de los meses que vienen'); return f[2] === '$1.150.000' && f[3] === '$1.180.000'
}), (await celdas('Gastos fijos de los meses que vienen')).join(' | '))
check('y el del mes en curso, ya creado, sigue como pendiente', sql(`select count(*) from egresos where descripcion like 'Autónomos ·%' and estado = 'pendiente'`) === '1')

check('sin errores de consola', errores.length === 0, errores.join(' || '))
await browser.close()
process.exit(resumen() ? 1 : 0)
