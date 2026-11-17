// El dashboard nuevo contra una base que todavía NO tiene el SQL 59: todo lo
// anterior sigue andando, "Canje" avisa que falta el SQL en vez de romper, y
// "Disponible hoy" muestra la caja y la caja fuerte.
import { abrir, BASE, sql as sqlBase, check, resumen } from './lib.mjs'
const DB = process.env.DB || 'kkprefz'
const sql = (q) => sqlBase(q, DB)
async function hasta(fn, ms = 8000) {
  const fin = Date.now() + ms
  for (;;) { const v = await fn(); if (v || Date.now() > fin) return v; await new Promise(r => setTimeout(r, 200)) }
}
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ')
const F1201 = 'e2000000-0000-0000-0000-000000000001'

check('la base de esta prueba no tiene el SQL 59', sql("select (to_regclass('public.cuentas_negocio_saldos') is null)::text || '|' || (pg_get_constraintdef(oid) not like '%canje%')::text from pg_constraint where conname = 'egresos_medio_pago_check'") === 'true|true')

const { browser, page, errores } = await abrir('admin', { viewport: { width: 1360, height: 1200 } })
await page.goto(BASE + '/caja', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /^Pagos$/ }).click()
const fila = (texto) => page.locator('div.rounded-xl', { hasText: texto }).last()
const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Pagos' }) }).first()
const modal = page.locator('.fixed.inset-0').filter({ has: page.getByRole('heading', { name: /Registrar pago|Editar pago/ }) })
const campo = (label) => modal.locator(`xpath=.//label[starts-with(normalize-space(.), "${label}")]/following-sibling::*[1]/descendant-or-self::*[self::input or self::select or self::textarea][1] | .//label[starts-with(normalize-space(.), "${label}")]/following-sibling::select[1]`).first()

console.log('— Pagos sigue igual')
await page.getByText('VINOS factura 1201').first().waitFor()
check('la lista y el total, como siempre', /Total pagado: \$127\.686/.test(await txt(panel)) && await panel.locator('[data-total-canje]').count() === 0 && await panel.locator('[data-canje]').count() === 0)

console.log('— pagar con canje sin el SQL 59')
await fila('VINOS factura 1201').getByTitle('Corregir este pago').click()
await modal.waitFor()
await campo('Medio de pago').selectOption('canje')
await modal.locator('button.w-full').last().click()
await hasta(async () => /SQL 59/.test(await txt(modal)))
check('avisa que falta correr el SQL 59, en criollo', /Para pagar con canje falta correr el SQL 59 en Supabase\. Mientras tanto, guardalo con otro medio de pago/.test(await txt(modal)), (await txt(modal)).slice(-300))
check('no guardó nada: la factura sigue pendiente', sql(`select estado || '|' || medio_pago from egresos where id = '${F1201}'`) === 'pendiente|transferencia')
await modal.getByRole('button', { name: '×' }).click()
await modal.waitFor({ state: 'hidden' })
await page.getByRole('button', { name: /Registrar pago/ }).first().click()
await modal.waitFor()
await campo('Descripción').fill('Hielo extra')
await campo('Monto').fill('5.000,50')
await campo('Medio de pago').selectOption('transferencia')
await modal.locator('button.w-full').last().click()
await modal.waitFor({ state: 'hidden' })
check('un pago común se registra igual, con el monto en formato argentino', sql("select monto || '|' || medio_pago || '|' || estado from egresos where descripcion = 'Hielo extra'") === '5000.50|transferencia|pagado', sql("select monto || '|' || medio_pago from egresos where descripcion = 'Hielo extra'"))
check('y Totales se refresca solo al registrarlo', await hasta(async () => /Pagado \(egresos\) 3 pagos -\$132\.686,50/.test(await txt(page.locator('main')))), (await txt(page.locator('main'))).match(/Pagado \(egresos\)[^C]*/)?.[0])
check('sin renglón de canje en Totales', !/Pagado con canje/.test(await txt(page.locator('main'))))

console.log('— Recetas: el margen sin IVA no depende del SQL')
await page.goto(BASE + '/recetas', { waitUntil: 'networkidle' })
const filaR = page.locator('tr', { has: page.locator('td', { hasText: 'Roll Kiku' }) }).first()
await filaR.waitFor({ timeout: 15000 })
check('Roll Kiku 60,0 %', await txt(filaR.locator('[data-margen]')) === '60.0%')
check('sin errores de consola (admin)', errores.length === 0, errores.join(' || '))
await browser.close()

console.log('— Finanzas: "Disponible hoy" sin los bancos')
const fin = await abrir('finanzas', { viewport: { width: 1360, height: 1300 } })
await fin.page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
const card = fin.page.locator('[data-disponible]')
await card.waitFor({ timeout: 15000 })
await hasta(async () => /\$170\.000/.test(await txt(card)))
const t = await txt(card)
check('muestra la caja y la caja fuerte', /Caja del día Turno abierto · efectivo esperado \$170\.000/.test(t) && /Caja fuerte Efectivo guardado \$250\.000/.test(t) && await card.locator('[data-disponible-total]').innerText() === '$420.000', t.slice(0, 300))
check('dice que para los bancos falta el SQL 59', /Para sumar el saldo de los bancos falta correr el SQL 59 en Supabase/.test(await txt(card.locator('[data-disponible-sin-sql]'))) && /Total cargado/i.test(t))
check('no ofrece cargar saldos', await card.getByRole('button', { name: /Cargar saldo|^Actualizar$/ }).count() === 0 && await card.locator('[data-disponible-fila]').count() === 2)
check('el Resumen y sus números, como siempre', /Salió \$132\.687 Gastos pagados del período/i.test(await txt(fin.page.locator('main'))), (await txt(fin.page.locator('main'))).match(/Salió.{0,60}/i)?.[0])
await fin.page.screenshot({ path: 'shots/fz-13-disponible-sin-sql.png' })
await fin.page.getByRole('button', { name: 'Cash flow' }).click()
await fin.page.getByRole('table').waitFor()
check('el cash flow carga (con la función anterior)', /Mercadería/.test(await txt(fin.page.getByRole('table'))))
check('sin errores de consola (finanzas)', fin.errores.length === 0, fin.errores.join(' || '))
await fin.browser.close()
process.exit(resumen() ? 1 : 0)
