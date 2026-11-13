// El dashboard nuevo contra una base que todavía NO tiene el SQL 57: Caja y
// el Excel muestran el IVA igual (no dependen de él); en Finanzas el recuadro
// no aparece y nada se rompe.
import { abrir, BASE, sql as sqlBase, check, resumen } from './lib.mjs'
import { createRequire } from 'node:module'
const XLSX = createRequire(new URL('../../package.json', import.meta.url))('xlsx')
const DB = process.env.DB || 'kkpre57'
const sql = (q) => sqlBase(q, DB)
async function hasta(fn, ms = 8000) {
  const fin = Date.now() + ms
  for (;;) { const v = await fn(); if (v || Date.now() > fin) return v; await new Promise(r => setTimeout(r, 200)) }
}
check('la base no tiene la función', sql("select to_regprocedure('public.iva_ventas_resumen(date,date)') is null") === 't')

const fin = await abrir('finanzas', { viewport: { width: 1360, height: 1100 } })
await fin.page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
await fin.page.getByRole('button', { name: 'Día', exact: true }).click()
await hasta(async () => /ENTRÓ \$373\.680/i.test((await fin.page.locator('main').innerText()).replace(/\s+/g, ' ')))
await fin.page.waitForTimeout(800)
check('Finanzas: el Resumen carga como siempre', /ENTRÓ \$373\.680/i.test((await fin.page.locator('main').innerText()).replace(/\s+/g, ' ')) && await fin.page.getByText('¿A dónde se va la plata?').count() === 1)
check('Finanzas: sin el SQL 57 el recuadro del IVA no aparece', await fin.page.locator('[data-iva-ventas]').count() === 0 && await fin.page.getByText(/IVA de las ventas/).count() === 0)
check('Finanzas: sin errores en pantalla', await fin.page.getByText(/Could not find|schema cache|No se pudo leer/i).count() === 0 && fin.errores.length === 0, fin.errores.join(' || '))
await fin.browser.close()

const { browser, page, errores } = await abrir('admin', { viewport: { width: 1360, height: 1100 } })
await page.goto(BASE + '/caja', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Hoy', exact: true }).click()
const totales = page.locator('div.rounded-lg', { has: page.getByText('Totales', { exact: true }) }).last()
await hasta(async () => /\$64\.853,55/.test(await totales.innerText()), 15000)
const t = (await totales.innerText()).replace(/\s+/g, ' ')
check('Caja: el IVA de los Totales no depende del SQL', /↳ IVA 21% va a ARCA \$64\.853,55/.test(t) && /↳ Sin IVA queda en el negocio \$308\.826,45/.test(t), t)
await page.getByRole('button', { name: /^Todos/ }).first().click()
check('Caja: el IVA de cada orden tampoco', (await page.locator('article', { hasText: 'Mesa 21' }).first().locator('[data-iva-orden]').innerText()).replace(/\s+/g, ' ') === 'IVA 21%: $21.000,00 · sin IVA: $100.000,00')
const dl = page.waitForEvent('download', { timeout: 30000 })
await page.getByRole('button', { name: 'Exportar Excel' }).click()
await (await dl).saveAs('shots/iva-reporte-pre.xlsx')
const wb = XLSX.readFile('shots/iva-reporte-pre.xlsx')
const filas = XLSX.utils.sheet_to_json(wb.Sheets['IVA ventas'] || {})
check('Excel: la hoja "IVA ventas" sale igual', filas.length === 9 && filas.at(-1)['IVA 21%'] === 71153.55, `${filas.length} filas`)
check('Caja: sin errores de consola', errores.length === 0, errores.join(' || '))
await browser.close()
process.exit(resumen() ? 1 : 0)
