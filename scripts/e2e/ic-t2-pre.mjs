// El dashboard nuevo contra una base que todavía NO tiene el SQL 61: Registrar
// pago no ofrece el IVA, Finanzas no muestra el recuadro, el Excel sale sin la
// hoja "IVA compras" y nada se rompe.
import { abrir, BASE, sql as sqlBase, check, resumen } from './lib.mjs'
import { createRequire } from 'node:module'
const XLSX = createRequire(new URL('../../package.json', import.meta.url))('xlsx')
const DB = process.env.DB || 'kkpreic'
const sql = (q) => sqlBase(q, DB)
const xp = (label) => `xpath=.//label[starts-with(normalize-space(.), "${label}")]/following-sibling::*[1]/descendant-or-self::*[self::input or self::select or self::textarea][1] | .//label[starts-with(normalize-space(.), "${label}")]/following-sibling::select[1]`
check('la base no tiene el SQL 61', sql("select to_regprocedure('public.iva_compras_resumen(date,date)') is null") === 't'
  && sql("select count(*) from information_schema.columns where table_name = 'egresos' and column_name = 'iva_credito'") === '0')

const { browser, page, errores } = await abrir('finanzas', { viewport: { width: 1360, height: 1300 } })
await page.goto(BASE + '/caja', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /^Pagos$/ }).click()
const modal = page.locator('.fixed.inset-0').filter({ has: page.getByRole('heading', { name: /Registrar pago/ }) })
await page.getByRole('button', { name: /Registrar pago/ }).first().click()
await modal.waitFor()
const campo = (label) => modal.locator(xp(label)).first()
await campo('Categoría').selectOption('mercaderia')
await campo('Medio de pago').selectOption('transferencia')
await campo('Descripción').fill('Pago sin el SQL 61')
await campo('Monto').fill('16644.03')
await page.waitForTimeout(800)
check('Registrar pago: sin el SQL 61 no ofrece el IVA', await modal.locator('[data-abrir-iva]').count() === 0 && await modal.locator('[data-iva-factura]').count() === 0)
await modal.locator('button.w-full').last().click()
await modal.waitFor({ state: 'hidden' })
check('el pago se guarda como siempre', sql("select monto from egresos where descripcion = 'Pago sin el SQL 61'") === '16644.03')
await page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
await page.locator('[data-iva-ventas]').waitFor({ timeout: 15000 })
await page.waitForTimeout(800)
check('Finanzas: el IVA de las ventas está, el de las compras no', await page.locator('[data-iva-compras]').count() === 0)
check('Finanzas: sin errores en pantalla', await page.getByText(/Could not find|schema cache|No se pudo leer|does not exist/i).count() === 0)
check('sin errores de consola (finanzas)', errores.length === 0, errores.join(' || '))
await browser.close()

const adm = await abrir('admin', { viewport: { width: 1360, height: 1100 } })
await adm.page.goto(BASE + '/caja', { waitUntil: 'networkidle' })
await adm.page.getByRole('button', { name: 'Últ. 30 días', exact: true }).click()
await adm.page.waitForTimeout(800)
const dl = adm.page.waitForEvent('download', { timeout: 30000 })
await adm.page.getByRole('button', { name: 'Exportar Excel' }).click()
await (await dl).saveAs('shots/ic-reporte-pre.xlsx')
const wb = XLSX.readFile('shots/ic-reporte-pre.xlsx')
check('Excel: sale sin la hoja «IVA compras» y con las de siempre', !wb.SheetNames.includes('IVA compras') && wb.SheetNames.includes('Resumen') && wb.SheetNames.includes('IVA ventas'), wb.SheetNames.join(' | '))
check('Excel: el Resumen no habla del IVA de las compras', !XLSX.utils.sheet_to_json(wb.Sheets['Resumen'], { header: 1 }).some(r => String(r[0] || '') === 'IVA DE LAS COMPRAS'))
check('sin errores de consola (admin)', adm.errores.length === 0, adm.errores.join(' || '))
await adm.browser.close()
process.exit(resumen() ? 1 : 0)
