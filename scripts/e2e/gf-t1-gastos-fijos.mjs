// Gastos fijos (SQL 60), de punta a punta en el navegador:
//   · el F931 de la captura de administración, con "Se repite todos los meses";
//   · la lista: alta, pausa, corrección y borrado;
//   · los pendientes de cada mes se crean solos al abrir Pagos;
//   · al pagarlo con otro monto, los meses que vienen toman ese monto;
//   · Proyección de pagos (fecha de pago = hoy al marcarlo pagado) y el rol de
//     solo lectura.
import { abrir, BASE, sql as sqlBase, check, resumen } from './lib.mjs'
const DB = process.env.DB || 'kkgf'
const sql = (q) => sqlBase(q, DB)
async function hasta(fn, ms = 8000) {
  const fin = Date.now() + ms
  for (;;) { const v = await fn(); if (v || Date.now() > fin) return v; await new Promise(r => setTimeout(r, 200)) }
}
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ')

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const mesTexto = (p) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`
const sig = (p) => { const [y, m] = p.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}` }
const ant = (p) => { const [y, m] = p.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}` }
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

const HOY = sql("select to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM-DD')")
const MES = HOY.slice(0, 7), SIG = sig(MES), SIG2 = sig(SIG), ANT2 = ant(ant(MES))
const DIA = Number(HOY.slice(8, 10))

const { browser, page, errores } = await abrir('finanzas', { viewport: { width: 1360, height: 1350 } })
await page.goto(BASE + '/caja', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /^Pagos$/ }).click()
const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Pagos' }) }).first()
const xp = (label) => `xpath=.//label[starts-with(normalize-space(.), "${label}")]/following-sibling::*[1]/descendant-or-self::*[self::input or self::select or self::textarea][1] | .//label[starts-with(normalize-space(.), "${label}")]/following-sibling::select[1]`
const modal = page.locator('.fixed.inset-0').filter({ has: page.getByRole('heading', { name: /Registrar pago|Editar pago/ }) })
const campo = (label) => modal.locator(xp(label)).first()

console.log('— el F931 de la captura, con "Se repite todos los meses"')
await panel.getByRole('button', { name: /Gastos fijos/ }).waitFor({ timeout: 15000 })
check('Pagos tiene el botón «Gastos fijos»', true)
await page.getByRole('button', { name: /Registrar pago/ }).first().click()
await modal.waitFor()
await campo('Categoría').selectOption('impuestos')
await campo('Medio de pago').selectOption('transferencia')
await campo('Descripción').fill('F931 NV NOVIEMBRE26')
await campo('Monto').fill('122000')
await campo('Estado').selectOption('pendiente')
const VENC = `${SIG}-09`
await campo('Vencimiento').fill(VENC)
const rep = modal.locator('[data-repetir]')
check('ofrece «Se repite todos los meses»', /Alquiler, autónomos, F931…: se carga una vez/.test(await txt(rep)))
await rep.getByLabel(/Se repite todos los meses/).check()
const campoRep = (label) => rep.locator(xp(label)).first()
check('propone el día del vencimiento (9) y el nombre sin el mes («F931 NV»)',
  await campoRep('Vence el día').inputValue() === '9' && await campoRep('Nombre para los próximos meses').inputValue() === 'F931 NV',
  `${await campoRep('Vence el día').inputValue()} | ${await campoRep('Nombre para los próximos meses').inputValue()}`)
await campoRep('Nombre para los próximos meses').fill('F931')
const explica = await txt(rep.locator('[data-explica-repeticion]'))
check('explica de qué mes es este pago y desde cuándo se carga solo',
  explica.includes(`Este pago queda como el de ${mesTexto(SIG)}. Desde ${mesTexto(SIG2)} se carga solo como pendiente («F931 · ${mesTexto(SIG2)}», vence el ${ddmm(`${SIG2}-09`)}).`), explica)
await campoRep('Vence el día').fill('40')
check('un día inválido no deja guardar', await modal.locator('button.w-full').last().isDisabled() && /Completá el día/.test(await txt(rep)))
await campoRep('Vence el día').fill('9')
await modal.locator('[data-repetir]').scrollIntoViewIfNeeded()
await page.screenshot({ path: 'shots/gf-1-registrar-repite.png' })
await modal.locator('button.w-full').last().click()
await modal.waitFor({ state: 'hidden' })
check('avisa que quedó como gasto fijo', await hasta(async () => new RegExp(`Quedó como gasto fijo: desde ${mesTexto(SIG2)} se carga solo como pendiente`).test(await txt(panel))), (await txt(panel)).slice(0, 400))
check('la base: el gasto fijo arranca el mes del vencimiento, el 9, por $122.000',
  sql("select descripcion || '|' || dia_vencimiento || '|' || desde || '|' || monto || '|' || categoria from gastos_fijos where descripcion = 'F931'") === `F931|9|${SIG}|122000.00|impuestos`)
check('y el pago quedó atado a él, como el de ese mes',
  sql("select (e.gasto_fijo_id = g.id)::text || '|' || e.recurrente || '|' || e.periodo || '|' || m.origen from egresos e join gastos_fijos g on g.descripcion = 'F931' join gastos_fijos_meses m on m.egreso_id = e.id where e.descripcion = 'F931 NV NOVIEMBRE26'") === `true|true|${SIG}|pago`)
const filaF931 = panel.locator('div.rounded-xl', { hasText: 'F931 NV NOVIEMBRE26' }).last()
check('en la lista de Pagos lleva la marca «fijo»', await hasta(async () => (await filaF931.locator('[data-gasto-fijo-chip]').count()) === 1))

console.log('— la lista de gastos fijos')
await panel.getByRole('button', { name: /Gastos fijos/ }).click()
const gm = page.locator('[data-gastos-fijos]')
await gm.waitFor()
const fila = (d) => gm.locator(`[data-gasto-fijo="${d}"]`)
await fila('F931').waitFor()
check('F931: vence el 9 de cada mes, próximo el 9 del mes que viene, $122.000',
  /Vence el 9 de cada mes/.test(await txt(fila('F931'))) && (await txt(fila('F931'))).includes(`próximo: ${ddmm(VENC)}`) && /\$122\.000/.test(await txt(fila('F931'))), await txt(fila('F931')))

// Alta: el alquiler, el 28.
await gm.getByRole('button', { name: /Nuevo gasto fijo/ }).click()
const form = gm.locator('[data-form-gasto-fijo]')
await form.waitFor()
const cf = (label) => form.locator(xp(label)).first()
await cf('Descripción').fill('Alquiler')
await cf('Monto').fill('800.000')
await cf('Vence el día').fill('28')
const desdeAlq = DIA <= 28 ? MES : SIG
check('el monto con puntos de miles se lee bien y se repite', (await txt(form.locator('[data-eco-monto-fijo]'))) === 'Cada mes por $800.000', await txt(form.locator('[data-eco-monto-fijo]')))
check('dice cuándo vence', (await txt(form.locator('[data-texto-dia]'))) === 'Vence el 28 de cada mes')
check(`propone arrancar en ${mesTexto(desdeAlq)} (el 28 ${DIA <= 28 ? 'todavía no pasó' : 'ya pasó'})`, await cf('Primer mes').inputValue() === desdeAlq)
await cf('Notas').fill('Contrato hasta 2028')
await page.screenshot({ path: 'shots/gf-3-nuevo.png' })
await form.getByRole('button', { name: 'Guardar gasto fijo' }).click()
const aviso = gm.locator('[data-aviso-gastos-fijos]')
await aviso.waitFor()
const vencAlq = `${desdeAlq}-28`
if (desdeAlq === MES) {
  check('se creó el pendiente de este mes y lo dice', (await txt(aviso)).includes(`El de ${mesTexto(MES)} ya está en pendientes, vence el ${ddmm(vencAlq)}`), await txt(aviso))
  check('la base: «Alquiler · mes» pendiente por $800.000, vence el 28, con las notas',
    sql(`select estado || '|' || monto || '|' || vencimiento || '|' || notas || '|' || recurrente from egresos where descripcion = 'Alquiler · ${mesTexto(MES)}'`) === `pendiente|800000.00|${vencAlq}|Contrato hasta 2028|true`)
} else {
  check('avisa cuándo aparece el primero', (await txt(aviso)).includes(`El primero aparece en pendientes el 1 de ${mesTexto(SIG)}`), await txt(aviso))
}

// Alta: autónomos, el 5.
await gm.getByRole('button', { name: /Nuevo gasto fijo/ }).click()
await form.waitFor()
await cf('Descripción').fill('Autónomos')
await cf('Categoría').selectOption('impuestos')
await cf('Monto').fill('120000')
await cf('Vence el día').fill('5')
const desdeAut = DIA <= 5 ? MES : SIG
check(`autónomos el 5: propone ${mesTexto(desdeAut)}`, await cf('Primer mes').inputValue() === desdeAut)
await form.getByRole('button', { name: 'Guardar gasto fijo' }).click()
await hasta(async () => (await fila('Autónomos').count()) === 1)
check('el resumen suma los activos: 3 gastos fijos · $1.042.000 por mes',
  (await txt(gm.locator('[data-resumen-gastos-fijos]'))) === '3 gastos fijos · $1.042.000 por mes', await txt(gm.locator('[data-resumen-gastos-fijos]')))
await page.screenshot({ path: 'shots/gf-2-lista.png' })

// Pausar y reanudar.
await gm.getByRole('button', { name: 'Pausar Autónomos' }).click()
await hasta(async () => /PAUSADO/.test(await txt(fila('Autónomos'))))
check('pausado: se marca, sale del total y la base lo deja inactivo',
  /quedó pausado/.test(await txt(aviso)) && (await txt(gm.locator('[data-resumen-gastos-fijos]'))) === '2 gastos fijos · $922.000 por mes · 1 pausado'
  && sql("select activo from gastos_fijos where descripcion = 'Autónomos'") === 'f')
await gm.getByRole('button', { name: 'Reanudar Autónomos' }).click()
await hasta(async () => /reanudado/.test(await txt(aviso)))
check('reanudado', sql("select activo from gastos_fijos where descripcion = 'Autónomos'") === 't')

// Corregir: vale para los meses que vienen.
await gm.getByRole('button', { name: 'Corregir Alquiler' }).click()
await form.waitFor()
check('al corregir, explica que vale para los meses que vienen', /El cambio vale para los meses que vienen/.test(await txt(form)))
await cf('Monto').fill('850000')
await form.getByRole('button', { name: 'Guardar cambios' }).click()
await hasta(async () => /Alquiler» actualizado/.test(await txt(gm)))
check('el gasto fijo pasa a $850.000; el pendiente que ya estaba, no',
  sql("select monto from gastos_fijos where descripcion = 'Alquiler'") === '850000.00'
  && (desdeAlq !== MES || sql(`select monto from egresos where descripcion = 'Alquiler · ${mesTexto(MES)}'`) === '800000.00'))

// Borrar.
await gm.getByRole('button', { name: 'Borrar Autónomos' }).click()
await page.getByRole('button', { name: 'Eliminar' }).click()
await hasta(async () => (await fila('Autónomos').count()) === 0)
check('borrado', sql("select count(*) from gastos_fijos where descripcion = 'Autónomos'") === '0' && /borrado/.test(await txt(aviso)))
await page.locator('.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'Gastos fijos' }) }).getByRole('button', { name: '×' }).click().catch(async () => { await page.keyboard.press('Escape') })
await gm.waitFor({ state: 'hidden' }).catch(() => {})
if (desdeAlq === MES) {
  const filaAlq = panel.locator('div.rounded-xl', { hasText: `Alquiler · ${mesTexto(MES)}` }).last()
  check('Pagos ya muestra el pendiente del alquiler, con la marca «fijo»',
    await hasta(async () => (await filaAlq.count()) > 0) && await filaAlq.locator('[data-gasto-fijo-chip]').count() === 1 && /pendiente · vence/.test(await txt(filaAlq)))
}
await page.screenshot({ path: 'shots/gf-4-pagos.png' })

console.log('— al abrir Pagos se crean solos los meses que faltan')
sql(`insert into gastos_fijos (descripcion, categoria, monto, medio_pago, dia_vencimiento, desde) values ('Luz', 'servicios', 50000, 'transferencia', 15, '${ANT2}')`)
check('antes de abrir no hay pendientes de la luz', sql("select count(*) from egresos where descripcion like 'Luz ·%'") === '0')
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: /^Pagos$/ }).click()
const filaLuz = panel.locator('div.rounded-xl', { hasText: `Luz · ${mesTexto(MES)}` }).last()
await filaLuz.waitFor({ timeout: 15000 })
check('se crearon los 3 meses (dos atrás y el actual) y la lista los muestra',
  sql("select count(*) from egresos where descripcion like 'Luz ·%'") === '3' && await filaLuz.locator('[data-gasto-fijo-chip]').count() === 1)
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: /^Pagos$/ }).click()
await filaLuz.waitFor()
check('volver a abrir no duplica nada', sql("select count(*) from egresos where descripcion like 'Luz ·%'") === '3')

console.log('— pagarlo con otro monto: los meses que vienen toman ese monto')
await filaLuz.getByTitle('Corregir este pago').click()
await modal.waitFor()
check('el formulario avisa que es de un gasto fijo', /Es de un gasto fijo/.test(await txt(modal.locator('[data-es-gasto-fijo]'))))
check('al corregir no ofrece «Se repite»', await modal.locator('[data-repetir]').count() === 0)
await campo('Estado').selectOption('pagado')
check('al pasarlo a pagado, la fecha es hoy', await campo('Fecha').inputValue() === HOY, await campo('Fecha').inputValue())
await campo('Monto').fill('55000')
await modal.locator('button.w-full').last().click()
await modal.waitFor({ state: 'hidden' })
check('el pago quedó pagado por $55.000 y la luz pasa a $55.000 para los meses que vienen',
  sql(`select estado || '|' || monto || '|' || fecha from egresos where descripcion = 'Luz · ${mesTexto(MES)}'`) === `pagado|55000.00|${HOY}`
  && sql("select monto from gastos_fijos where descripcion = 'Luz'") === '55000.00')
check('sin errores de consola (finanzas, Caja)', errores.length === 0, errores.join(' || '))

console.log('— Finanzas → Proyección de pagos')
await page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Proyección de pagos/ }).click()
const filaVieja = page.locator('div.rounded-lg', { hasText: `Luz · ${mesTexto(ANT2)}` }).last()
await filaVieja.waitFor({ timeout: 15000 })
check('los pendientes de la luz están, con la marca «fijo»', await filaVieja.locator('[data-gasto-fijo-chip]').count() === 1)
check('tiene el botón «Gastos fijos»', await page.getByRole('button', { name: /Gastos fijos/ }).count() === 1)
await filaVieja.getByTitle('Editar / marcar pagado').click()
const em = page.locator('.fixed.inset-0').filter({ has: page.getByRole('heading', { name: /Editar/ }) }).last()
await em.waitFor()
const ce = (label) => em.locator(xp(label)).first()
const fechaAntes = await ce('Fecha').inputValue()
await ce('Estado').selectOption('pagado')
check('al marcarlo pagado, la fecha pasa de la de carga a hoy', fechaAntes === `${ANT2}-01` && await ce('Fecha').inputValue() === HOY, `${fechaAntes} → ${await ce('Fecha').inputValue()}`)
await ce('Estado').selectOption('pendiente')
check('y si vuelve a pendiente, recupera la fecha', await ce('Fecha').inputValue() === `${ANT2}-01`)
await ce('Estado').selectOption('pagado')
await ce('Nro. comprobante').fill('B 0001-00004321')
await em.getByRole('button', { name: /Guardar/ }).click()
await em.waitFor({ state: 'hidden' })
check('pagado hoy; conserva su mes; un mes viejo no pisa el monto del más nuevo',
  sql(`select estado || '|' || fecha || '|' || periodo from egresos where descripcion = 'Luz · ${mesTexto(ANT2)}'`) === `pagado|${HOY}|${ANT2}`
  && sql("select monto from gastos_fijos where descripcion = 'Luz'") === '55000.00',
  sql(`select estado || '|' || fecha || '|' || periodo from egresos where descripcion = 'Luz · ${mesTexto(ANT2)}'`))
check('sin errores de consola (finanzas)', errores.length === 0, errores.join(' || '))
await browser.close()

console.log('— rol de solo lectura de Finanzas')
const lec = await abrir('administracion', { viewport: { width: 1360, height: 1100 } })
await lec.page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
await lec.page.getByRole('button', { name: /Proyección de pagos/ }).click()
await lec.page.getByRole('button', { name: /Gastos fijos/ }).click()
const gl = lec.page.locator('[data-gastos-fijos]')
await gl.locator('[data-gasto-fijo="Luz"]').waitFor({ timeout: 15000 })
check('ve la lista, pero sin «Nuevo gasto fijo» ni botones para cambiarla',
  await gl.locator('[data-gasto-fijo]').count() === 3 && await gl.getByRole('button', { name: /Nuevo gasto fijo|Corregir|Pausar|Borrar/ }).count() === 0)
check('sin errores de consola (solo lectura)', lec.errores.length === 0, lec.errores.join(' || '))
await lec.browser.close()

console.log('— en el celular')
const cel = await abrir('finanzas', { viewport: { width: 390, height: 844 } })
await cel.page.goto(BASE + '/caja', { waitUntil: 'networkidle' })
await cel.page.getByRole('button', { name: /^Pagos$/ }).click()
await cel.page.getByRole('button', { name: /Gastos fijos/ }).click()
await cel.page.locator('[data-gasto-fijo="F931"]').waitFor({ timeout: 15000 })
const anchoDoc = await cel.page.evaluate(() => document.documentElement.scrollWidth)
check('la lista entra en el ancho del celular', anchoDoc <= 390, String(anchoDoc))
await cel.page.screenshot({ path: 'shots/gf-5-celular.png' })
await cel.browser.close()
process.exit(resumen() ? 1 : 0)
