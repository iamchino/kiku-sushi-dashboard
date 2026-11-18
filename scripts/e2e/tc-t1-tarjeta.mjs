// Gastos con tarjeta de crédito (18/11): en Proyección de pagos van aparte
// (no como deuda vencida), con su total, y "Pagar el resumen" los marca
// pagados juntos con la fecha del pago. Registrar pago explica qué hacer.
import { abrir, BASE, sql as sqlBase, check, resumen } from './lib.mjs'
const DB = process.env.DB || 'kktc'
const sql = (q) => sqlBase(q, DB)
async function hasta(fn, ms = 8000) {
  const fin = Date.now() + ms
  for (;;) { const v = await fn(); if (v || Date.now() > fin) return v; await new Promise(r => setTimeout(r, 200)) }
}
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ')
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const xp = (label) => `xpath=.//label[starts-with(normalize-space(.), "${label}")]/following-sibling::*[1]/descendant-or-self::*[self::input or self::select or self::textarea][1] | .//label[starts-with(normalize-space(.), "${label}")]/following-sibling::select[1]`

const HOY = sql("select to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM-DD')")
const MES = HOY.slice(0, 7)
const HACE8 = sql(`select to_char('${HOY}'::date - 8, 'YYYY-MM-DD')`)
// Meta: cargada con la tarjeta hace 8 días, sin vencimiento. La póliza: un gasto
// fijo con medio "Tarjeta crédito" (se crea solo al abrir Finanzas).
sql(`insert into egresos (fecha, categoria, descripcion, monto, medio_pago, estado) values ('${HACE8}', 'marketing', 'Meta publicidad', 120000.50, 'tarjeta_credito', 'pendiente')`)
sql(`insert into gastos_fijos (descripcion, categoria, monto, medio_pago, dia_vencimiento, desde) values ('POLIZA LA SEGUNDA (LOCAL)', 'otros', 49358, 'tarjeta_credito', 1, '${MES}')`)
const VENC_POLIZA = `${MES}-01`

const { browser, page, errores } = await abrir('finanzas', { viewport: { width: 1360, height: 1500 } })
await page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Proyección de pagos/ }).click()
const seccion = page.locator('[data-seccion-tarjeta]')
await seccion.waitFor({ timeout: 15000 })
const main = page.locator('main')

console.log('— Proyección: la tarjeta va aparte')
// Como Deuda y Proyección, el número grande va redondeado al peso.
check('el total de la tarjeta: $169.359 en 2 compras', /TARJETA DE CRÉDITO \$169\.359 2 compras sin pagar · se pagan con el resumen/i.test(await txt(page.locator('[data-total-tarjeta]'))), await txt(page.locator('[data-total-tarjeta]')))
// Del seed: LECHE Y CREMA vence en 2 días (deuda); los vinos, en 5 y 9 (proyección).
check('Deuda y Proyección no cuentan lo de la tarjeta ($80.000 y $500.000)', /DEUDA \$80\.000 1 pago/i.test(await txt(main)) && /PROYECCIÓN \$500\.000 2 pagos/i.test(await txt(main)), (await txt(main)).slice(0, 400))
const filaPoliza = seccion.locator('div.rounded-lg', { hasText: 'POLIZA LA SEGUNDA (LOCAL)' }).last()
check('la póliza (gasto fijo con tarjeta) está en la sección, no como vencida',
  /en la tarjeta desde el/.test(await txt(filaPoliza)) && (await txt(filaPoliza)).includes(ddmm(VENC_POLIZA)) && !/venció/.test(await txt(filaPoliza))
  && await filaPoliza.locator('[data-gasto-fijo-chip]').count() === 1
  && await page.locator('div.rounded-xl', { hasText: 'Deuda · vencidos' }).filter({ hasText: 'POLIZA' }).count() === 0, await txt(filaPoliza))
check('Meta, con la fecha de la compra', (await txt(seccion)).includes(`Meta publicidad`) && (await txt(seccion)).includes(`en la tarjeta desde el ${ddmm(HACE8)}`))
await page.screenshot({ path: 'shots/tc-1-proyeccion.png' })

console.log('— pagar el resumen')
await seccion.getByRole('button', { name: 'Pagar el resumen' }).click()
const pm = page.locator('[data-pagar-resumen]')
await pm.waitFor()
const cm = (label) => pm.locator(xp(label)).first()
check('arranca con todo tildado', (await txt(pm.locator('[data-total-resumen]'))) === '2 compras tildadas · $169.358,50')
await cm('Total del resumen').fill('180.000')
check('compara con el total del resumen: faltan $10.641,50', /faltan \$10\.641,50/.test(await txt(pm.locator('[data-comparacion]'))) && await pm.locator('[data-comparacion="falta"]').count() === 1)
await pm.getByLabel('Incluir POLIZA LA SEGUNDA (LOCAL) · ' + sql(`select public.gasto_fijo_mes_texto('${MES}')`)).uncheck()
check('al destildar la póliza: 1 compra, $120.000,50', (await txt(pm.locator('[data-total-resumen]'))) === '1 compra tildada · $120.000,50')
await cm('Total del resumen').fill('120000,50')
check('y ahora coincide', await pm.locator('[data-comparacion="coincide"]').count() === 1)
const MANIANA = sql(`select to_char('${HOY}'::date + 1, 'YYYY-MM-DD')`)
await cm('Fecha del pago').fill(MANIANA)
await pm.getByRole('button', { name: /Marcar 1 como pagado/ }).click()
check('una fecha futura no se acepta', /no puede ser futura/.test(await txt(pm.locator('[data-error-resumen]'))))
await cm('Fecha del pago').fill(HOY)
await page.screenshot({ path: 'shots/tc-2-pagar-resumen.png' })
await pm.getByRole('button', { name: /Marcar 1 como pagado \(\$120\.000,50\)/ }).click()
await pm.waitFor({ state: 'hidden' })
check('avisa lo que quedó pagado', await hasta(async () => new RegExp(`quedó pagado 1 gasto del resumen de la tarjeta, el ${ddmm(HOY).replace(/\//g, '\\/')}, por \\$120\\.000,50`).test(await txt(main))), (await txt(main)).slice(0, 300))
check('la base: Meta pagada hoy, con tarjeta, sin caja; con el motivo en el historial',
  sql("select estado || '|' || fecha || '|' || medio_pago || '|' || coalesce(pagado_desde, 'sin origen') || '|' || coalesce(caja_turno_id::text, 'sin turno') from egresos where descripcion = 'Meta publicidad'") === `pagado|${HOY}|tarjeta_credito|sin origen|sin turno`
  && sql("select a.motivo from egresos_auditoria a join egresos e on e.id = a.egreso_id where e.descripcion = 'Meta publicidad' and a.evento = 'editado' order by a.created_at desc limit 1") === 'Pago del resumen de la tarjeta')
check('en la sección queda solo la póliza', await hasta(async () => /TARJETA DE CRÉDITO \$49\.358 1 compra sin pagar/i.test(await txt(page.locator('[data-total-tarjeta]')))) && !(await txt(seccion)).includes('Meta publicidad'))

// La póliza también, y la sección desaparece.
await seccion.getByRole('button', { name: 'Pagar el resumen' }).click()
await pm.waitFor()
await pm.getByRole('button', { name: /Marcar 1 como pagado \(\$49\.358\)/ }).click()
await pm.waitFor({ state: 'hidden' })
check('sin nada en la tarjeta, la sección y su total desaparecen', await hasta(async () => (await seccion.count()) === 0 && (await page.locator('[data-total-tarjeta]').count()) === 0))
check('la póliza (gasto fijo) quedó pagada; su monto sigue igual', sql("select estado from egresos where descripcion like 'POLIZA LA SEGUNDA (LOCAL) ·%'") === 'pagado' && sql("select monto from gastos_fijos where descripcion = 'POLIZA LA SEGUNDA (LOCAL)'") === '49358.00')

console.log('— Resumen: ahora sí cuenta como plata que salió')
await page.getByRole('button', { name: /^Resumen$/ }).click()
await hasta(async () => /Salió/i.test(await txt(main)))
// Del seed: QUESOS $117.686 + Hielo $10.000; más Meta y la póliza, pagadas hoy.
check('«Salió» suma los gastos del resumen el día que se pagó la tarjeta', await hasta(async () => /Salió \$297\.045/i.test(await txt(main))), (await txt(main)).match(/Salió.{0,40}/i)?.[0])

console.log('— Registrar pago con tarjeta de crédito')
await page.goto(BASE + '/caja', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /^Pagos$/ }).click()
await page.getByRole('button', { name: /Registrar pago/ }).first().click()
const modal = page.locator('.fixed.inset-0').filter({ has: page.getByRole('heading', { name: /Registrar pago/ }) })
await modal.waitFor()
const campo = (label) => modal.locator(xp(label)).first()
await campo('Categoría').selectOption('marketing')
await campo('Medio de pago').selectOption('tarjeta_credito')
await campo('Descripción').fill('Meta diciembre')
await campo('Monto').fill('95000')
check('con «Pagado» sugiere dejarlo pendiente hasta pagar la tarjeta', /Si todavía no lo pagaste, guardalo como Pendiente/.test(await txt(modal)))
await campo('Estado').selectOption('pendiente')
check('con «Pendiente» dice dónde queda', /queda en Finanzas → Proyección de pagos → «Tarjeta de crédito» y se marca pagado junto con el resumen/.test(await txt(modal)))
await modal.locator('button.w-full').last().click()
await modal.waitFor({ state: 'hidden' })
const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Pagos' }) }).first()
const filaMeta = panel.locator('div.rounded-xl', { hasText: 'Meta diciembre' }).last()
check('en Pagos figura «en la tarjeta, se paga con el resumen»', await hasta(async () => (await filaMeta.count()) > 0 && /pendiente · en la tarjeta, se paga con el resumen/.test(await txt(filaMeta))))
check('sin errores de consola (finanzas)', errores.length === 0, errores.join(' || '))
await browser.close()

console.log('— rol de solo lectura y celular')
const lec = await abrir('administracion', { viewport: { width: 1360, height: 1100 } })
await lec.page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
await lec.page.getByRole('button', { name: /Proyección de pagos/ }).click()
await lec.page.locator('[data-seccion-tarjeta]').waitFor({ timeout: 15000 })
check('solo lectura: ve la sección, sin «Pagar el resumen»', await lec.page.getByRole('button', { name: 'Pagar el resumen' }).count() === 0)
check('sin errores de consola (solo lectura)', lec.errores.length === 0, lec.errores.join(' || '))
await lec.browser.close()
const cel = await abrir('finanzas', { viewport: { width: 390, height: 844 } })
await cel.page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
await cel.page.getByRole('button', { name: /Proyección de pagos/ }).click()
await cel.page.locator('[data-seccion-tarjeta]').waitFor({ timeout: 15000 })
const ancho = await cel.page.evaluate(() => document.documentElement.scrollWidth)
check('en el celular entra en el ancho', ancho <= 390, String(ancho))
await cel.page.locator('[data-seccion-tarjeta]').scrollIntoViewIfNeeded()
await cel.page.screenshot({ path: 'shots/tc-3-celular.png' })
await cel.browser.close()
process.exit(resumen() ? 1 : 0)
