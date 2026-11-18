// El dashboard nuevo contra una base que todavía NO tiene el SQL 60: no
// aparecen ni el botón «Gastos fijos» ni la casilla «Se repite todos los
// meses», y todo lo demás sigue igual (registrar, corregir, Proyección).
import { abrir, BASE, sql as sqlBase, check, resumen } from './lib.mjs'
const DB = process.env.DB || 'kkpregf'
const sql = (q) => sqlBase(q, DB)
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ')

check('la base de esta prueba no tiene el SQL 60', sql("select (to_regclass('public.gastos_fijos') is null)::text") === 'true')

const { browser, page, errores } = await abrir('finanzas', { viewport: { width: 1360, height: 1200 } })
await page.goto(BASE + '/caja', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /^Pagos$/ }).click()
const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Pagos' }) }).first()
await page.getByText('QUESOS').first().waitFor({ timeout: 15000 })
check('Pagos no muestra el botón «Gastos fijos»', await panel.getByRole('button', { name: /Gastos fijos/ }).count() === 0)

const modal = page.locator('.fixed.inset-0').filter({ has: page.getByRole('heading', { name: /Registrar pago|Editar pago/ }) })
const campo = (label) => modal.locator(`xpath=.//label[starts-with(normalize-space(.), "${label}")]/following-sibling::*[1]/descendant-or-self::*[self::input or self::select or self::textarea][1] | .//label[starts-with(normalize-space(.), "${label}")]/following-sibling::select[1]`).first()
await page.getByRole('button', { name: /Registrar pago/ }).first().click()
await modal.waitFor()
await campo('Categoría').selectOption('alquiler')
await campo('Medio de pago').selectOption('transferencia')
await campo('Descripción').fill('Alquiler noviembre')
await campo('Monto').fill('800000')
await page.waitForTimeout(600)
check('Registrar pago no ofrece «Se repite todos los meses»', await modal.locator('[data-repetir]').count() === 0)
await modal.locator('button.w-full').last().click()
await modal.waitFor({ state: 'hidden' })
check('el pago se registra como siempre', sql("select monto || '|' || estado from egresos where descripcion = 'Alquiler noviembre'") === '800000.00|pagado')

// Corregir un pendiente: pasar a pagado pone la fecha de hoy (no depende del SQL 60).
const fila = panel.locator('div.rounded-xl', { hasText: 'VINOS factura 1201' }).last()
await fila.getByTitle('Corregir este pago').click()
await modal.waitFor()
check('al corregir no aparece la nota de gasto fijo', await modal.locator('[data-es-gasto-fijo]').count() === 0)
const hoy = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
const antes = await campo('Fecha').inputValue()
await campo('Estado').selectOption('pagado')
check('al marcar pagado un pendiente cargado otro día, la fecha pasa a hoy', antes !== hoy && await campo('Fecha').inputValue() === hoy, `${antes} → ${await campo('Fecha').inputValue()}`)
await modal.getByRole('button', { name: '×' }).click()
await modal.waitFor({ state: 'hidden' })

await page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Proyección de pagos/ }).click()
await page.getByText('LECHE Y CREMA').first().waitFor({ timeout: 15000 })
check('Proyección no muestra el botón «Gastos fijos» y carga los pendientes', await page.getByRole('button', { name: /Gastos fijos/ }).count() === 0
  && /Deuda/.test(await txt(page.locator('main'))))
check('sin errores de consola', errores.length === 0, errores.join(' || '))
await browser.close()
process.exit(resumen() ? 1 : 0)
