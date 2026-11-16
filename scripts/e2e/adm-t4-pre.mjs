// El dashboard nuevo contra una base que todavía NO tiene el SQL 58: Caja es
// la de siempre (sin la marca "no se factura") y nada se rompe. Lo demás del
// parche (comprobante en Pagos, facturas por proveedor, avisos del cierre) no
// depende de ningún SQL.
import { abrir, BASE, sql as sqlBase, check, resumen } from './lib.mjs'
const DB = process.env.DB || 'kkpre58'
const sql = (q) => sqlBase(q, DB)
async function hasta(fn, ms = 8000) {
  const fin = Date.now() + ms
  for (;;) { const v = await fn(); if (v || Date.now() > fin) return v; await new Promise(r => setTimeout(r, 200)) }
}
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ')
check('la base no tiene la tabla', sql("select to_regclass('public.pedidos_sin_factura') is null") === 't')

const { browser, page, errores } = await abrir('admin', { viewport: { width: 1360, height: 1100 } })
await page.goto(BASE + '/caja', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Hoy', exact: true }).click()
const tarjeta = (titulo) => page.locator('div.rounded-lg', { has: page.getByText(titulo, { exact: true }) }).last()
await hasta(async () => /Pedidos 5/.test(await txt(tarjeta('Facturación'))))
const f = await txt(tarjeta('Facturación'))
check('Facturación como siempre: sin la fila "No se facturan"', /Pendientes facturación 4/.test(f) && /Facturados 1/.test(f) && !/No se facturan/.test(f), f)
check('sin la lista "No se facturan"', await page.getByRole('button', { name: 'No se facturan', exact: true }).count() === 0)
await page.locator('article', { hasText: 'Mesa 7' }).first().waitFor()
check('las órdenes no ofrecen la marca', await page.getByRole('button', { name: 'No se factura', exact: true }).count() === 0 && await page.locator('article').count() === 4)
check('los totales no cambian', /No facturado \$534\.500,00/.test(await txt(tarjeta('Totales'))) && !/Marcado/.test(await txt(tarjeta('Totales'))))

await page.getByRole('button', { name: /^Pagos$/ }).click()
await page.getByText('QUESOS').first().waitFor()
check('el N° de comprobante en Pagos no depende del SQL', await page.locator('[data-comprobante]').count() === 3)
await page.goto(BASE + '/proveedores', { waitUntil: 'networkidle' })
const prov = page.locator('div.rounded-xl.overflow-hidden', { hasText: 'La Serenísima S.A.' }).first()
await prov.waitFor()
await prov.locator('button').first().click()
await prov.locator('[data-pagos-proveedor]').waitFor()
check('"Facturas y pagos" del proveedor tampoco', /Pagado \$127\.686/.test(await txt(prov.locator('[data-pagos-proveedor]'))))
check('sin errores en pantalla ni en consola', await page.getByText(/Could not find|schema cache|SQL 58/i).count() === 0 && errores.length === 0, errores.join(' || '))
await browser.close()
process.exit(resumen() ? 1 : 0)
