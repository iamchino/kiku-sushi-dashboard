// Permisos: mozo no ve la sección; finanzas sí, y edita. Finanzas no cuenta los canjes como ingreso.
import { abrir, BASE, sql, check, resumen } from './lib.mjs'
{
  const { browser, page, errores } = await abrir('mozo')
  await page.goto(BASE + '/cuentas-corrientes', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  check('mozo: la URL directa lo devuelve a Mesas', new URL(page.url()).pathname === '/mesas', page.url())
  check('mozo: no hay "Cuentas corrientes" en su menú', await page.getByText('Cuentas corrientes').count() === 0)
  check('mozo: sin errores', errores.length === 0, errores.join(' | '))
  await browser.close()
}
{
  const { browser, page, errores } = await abrir('finanzas')
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  check('finanzas: su pantalla por defecto sigue siendo Finanzas', new URL(page.url()).pathname === '/finanzas', page.url())
  const fin = await page.locator('main').innerText()
  console.log('   finanzas:', fin.replace(/\s+/g, ' ').slice(0, 420))
  check('finanzas: ingresos = solo plata (152.200), sin los 382.300 de canjes', /152\.200/.test(fin) && !/534\.500/.test(fin))
  await page.goto(BASE + '/cuentas-corrientes', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Revista Punto Biz/ }).first().click()
  await page.getByRole('heading', { name: 'Revista Punto Biz' }).waitFor()
  check('finanzas: ve la sección', true)
  check('finanzas: puede editar', await page.getByRole('button', { name: 'Nueva cuenta' }).count() === 1)
  const tabla = await page.locator('table').innerText()
  check('finanzas: ve los 4 consumos con su saldo corrido', (tabla.match(/Cobro en caja/g) || []).length === 3 && /Cargado a mano/.test(tabla) && /\$0,00/.test(tabla))
  check('consumos de cobro no se editan acá', await page.getByText('desde Caja').count() === 3)
  await page.screenshot({ path: 'shots/13-cuenta-agotada.png', fullPage: true })
  // Renovación: sube el acordado a 800.000 → vuelve a tener saldo
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.locator('label:has-text("Monto acordado")').locator('xpath=..').locator('input').fill('800000')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await page.waitForTimeout(700)
  check('finanzas: amplía el acuerdo', sql("select monto_acordado||'|'||saldo from cuentas_corrientes_saldos where nombre = 'Revista Punto Biz'") === '800000.00|300000.00')
  check('finanzas: sin errores', errores.length === 0, errores.join(' | '))
  await browser.close()
}
// Celular
{
  const { browser, page, errores } = await abrir('admin', { viewport: { width: 390, height: 844 } })
  await page.goto(BASE + '/cuentas-corrientes', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Revista Punto Biz/ }).first().click()
  await page.getByRole('heading', { name: 'Revista Punto Biz' }).waitFor()
  const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  check('celular: sin scroll horizontal de página', !desborda)
  await page.screenshot({ path: 'shots/14-celular.png', fullPage: true })
  check('celular: sin errores', errores.length === 0, errores.join(' | '))
  await browser.close()
}
process.exit(resumen() ? 1 : 0)
