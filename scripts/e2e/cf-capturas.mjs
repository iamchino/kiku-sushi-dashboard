// Capturas del cash flow para mostrar (usa la base que dejó cf-t1-cashflow.mjs:
// datos de ejemplo + estimados + saldo). Uso: node cf-capturas.mjs [carpeta]
import { abrir, BASE } from './lib.mjs'
const dir = process.argv[2] || 'shots'
for (const [tema, sufijo] of [['dark', 'oscuro'], ['light', 'claro']]) {
  const { browser, page } = await abrir('finanzas', { viewport: { width: 1440, height: 1960 }, tema })
  await page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Cash flow' }).click()
  await page.getByRole('table').waitFor(); await page.waitForTimeout(500)
  await page.screenshot({ path: `${dir}/cashflow-6-meses-${sufijo}.png` })
  if (tema === 'dark') {
    await page.getByLabel('Mostrar de qué está hecho cada número').check(); await page.waitForTimeout(200)
    await page.screenshot({ path: `${dir}/cashflow-con-detalle.png` })
    await page.getByLabel('Mostrar de qué está hecho cada número').uncheck()
    await page.getByRole('button', { name: '12 meses' }).click(); await page.waitForTimeout(800)
    await page.screenshot({ path: `${dir}/cashflow-12-meses.png` })
  }
  await browser.close()
}
{
  const { browser, page } = await abrir('finanzas', { viewport: { width: 390, height: 2300 } })
  await page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Cash flow' }).click()
  await page.getByRole('table').waitFor(); await page.waitForTimeout(500)
  await page.screenshot({ path: `${dir}/cashflow-celular.png` })
  await browser.close()
}
console.log('capturas en', dir)
