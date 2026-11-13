// Capturas para mostrar stock + compras (se corre sobre una base recién
// preparada con seed-stock.sql). Uso: DB=kkst node st-capturas.mjs <carpeta>
import { abrir, BASE, sql as sqlBase, USERS } from './lib.mjs'
const DB = process.env.DB || 'kkst'
const DIR = process.argv[2] || 'shots'
const sql = (q) => sqlBase(q, DB)
const SAL = 'c0000000-0000-0000-0000-000000000001'
const ARR = 'c0000000-0000-0000-0000-000000000002'
const QUE = 'c0000000-0000-0000-0000-000000000004'
const como = (rol, q) => {
  const u = USERS[rol]
  const claims = JSON.stringify({ sub: u.id, role: 'authenticated', email: u.email, app_metadata: { role: u.role } })
  return sql(`select set_config('request.jwt.claim.sub', '${u.id}', false), set_config('request.jwt.claim.role', 'authenticated', false), set_config('request.jwt.claims', '${claims}', false); ${q}`)
}

async function llenarBoleta(page, { tema }) {
  await page.goto(BASE + '/caja', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /^Pagos$/ }).click()
  await page.getByRole('button', { name: /Registrar pago/ }).first().click()
  const modal = page.locator('.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'Registrar pago' }) })
  const campo = (label) => modal.locator(`xpath=.//label[starts-with(normalize-space(.), "${label}")]/following-sibling::*[1]/descendant-or-self::*[self::input or self::select or self::textarea][1] | .//label[starts-with(normalize-space(.), "${label}")]/following-sibling::select[1]`).first()
  const seccion = modal.getByRole('region', { name: 'Productos de la boleta' })
  await campo('Categoría').selectOption('mercaderia')
  await modal.getByRole('button', { name: /Cargar los productos de la boleta/ }).click()
  await campo('Proveedor').selectOption({ label: 'Pescadería Mar' })
  await seccion.locator('[data-fila="Salmón rosado"]').waitFor()
  await seccion.getByLabel('Cantidad de Salmón rosado').fill('10')
  await seccion.getByLabel(/^Precio por .* de Salmón rosado$/).fill('12000')
  await seccion.getByRole('button', { name: /Agregar otro producto/ }).click()
  await page.keyboard.type('langos'); await page.waitForTimeout(150); await page.keyboard.press('Enter')
  await seccion.getByLabel('Cantidad de Langostinos').fill('2,5')
  await campo('Descripción').fill('Boleta pescadería')
  await campo('Medio de pago').selectOption('transferencia')
  await campo('Comprobante').fill('A-0001-00004521')
  await seccion.getByRole('button', { name: /como monto/ }).click()
  await page.waitForTimeout(300)
  return { modal, tema }
}

// 1) La boleta con sus productos (oscuro), guardada → la lista con la marca.
const a = await abrir('admin', { viewport: { width: 1360, height: 1180 } })
const { modal } = await llenarBoleta(a.page, { tema: 'dark' })
await a.page.screenshot({ path: `${DIR}/stock-1-boleta.png` })
await modal.locator('button.w-full').last().click()
await modal.waitFor({ state: 'detached' })
await a.page.getByText(/Entraron 2 productos al stock/).waitFor()
await a.page.getByText('2 productos al stock').waitFor()
await a.page.setViewportSize({ width: 1360, height: 820 })
await a.page.screenshot({ path: `${DIR}/stock-2-pagos.png` })

// 2) La próxima boleta al mismo proveedor: los habituales aparecen solos.
await a.page.setViewportSize({ width: 1360, height: 1180 })
await a.page.getByRole('button', { name: /Registrar pago/ }).first().click()
const modal2 = a.page.locator('.fixed.inset-0').filter({ has: a.page.getByRole('heading', { name: 'Registrar pago' }) })
const campo2 = (label) => modal2.locator(`xpath=.//label[starts-with(normalize-space(.), "${label}")]/following-sibling::select[1]`).first()
await campo2('Categoría').selectOption('mercaderia')
await modal2.getByRole('button', { name: /Cargar los productos de la boleta/ }).click()
await campo2('Proveedor').selectOption({ label: 'Pescadería Mar' })
await modal2.locator('[data-fila="Langostinos"]').waitFor()
await a.page.screenshot({ path: `${DIR}/stock-3-habituales.png` })
await a.browser.close()

// 3) Movimientos de la semana: ventas, una merma y el conteo del encargado.
sql(`insert into pedidos (id, numero, canal, estado, total) values ('10000000-0000-0000-0000-00000000f001', 9911, 'salon', 'entregado', 1);
     update stock set stock_actual = 11 where id = '${SAL}';
     insert into stock_movimientos (stock_id, tipo, cantidad, stock_antes, stock_despues, notas, pedido_id) values ('${SAL}', 'salida', 4, 15, 11, 'Venta pedido 9911', '10000000-0000-0000-0000-00000000f001');
     update stock set stock_actual = 14 where id = '${ARR}';
     insert into stock_movimientos (stock_id, tipo, cantidad, stock_antes, stock_despues, notas, pedido_id) values ('${ARR}', 'salida', 6, 20, 14, 'Venta pedido 9911', '10000000-0000-0000-0000-00000000f001')`)
como('admin', `select public.registrar_movimiento_stock('${QUE}', 'merma', 1, 'pote abierto vencido');
               select public.registrar_conteo_stock(jsonb_build_array(
                 jsonb_build_object('stock_id', '${SAL}', 'contado', 9.5),
                 jsonb_build_object('stock_id', '${ARR}', 'contado', 15),
                 jsonb_build_object('stock_id', '${QUE}', 'contado', 4.2)), 'Conteo de inventario')`)

const b = await abrir('admin', { viewport: { width: 1440, height: 1400 } })
await b.page.goto(BASE + '/stock', { waitUntil: 'networkidle' })
await b.page.locator('tbody tr', { has: b.page.getByText('Salmón rosado', { exact: true }) }).first().getByTitle('Ver detalles').click()
await b.page.waitForTimeout(300)
await b.page.screenshot({ path: `${DIR}/stock-4-historial.png` })
await b.page.getByRole('button', { name: 'Faltantes' }).click()
const rep = b.page.getByRole('dialog', { name: 'Faltantes de stock' })
await rep.getByRole('table').waitFor()
await rep.getByRole('button', { name: /Ver el detalle de Salmón rosado/ }).click()
await b.page.waitForTimeout(300)
await b.page.screenshot({ path: `${DIR}/stock-5-faltantes.png` })
await b.browser.close()

// 4) Tema claro y celular.
const c = await abrir('admin', { viewport: { width: 1360, height: 1180 }, tema: 'light' })
await llenarBoleta(c.page, { tema: 'light' })
await c.page.screenshot({ path: `${DIR}/stock-6-boleta-claro.png` })
await c.browser.close()
const d = await abrir('admin', { viewport: { width: 390, height: 844 } })
const { modal: modalCel } = await llenarBoleta(d.page, { tema: 'dark' })
await modalCel.getByRole('region', { name: 'Productos de la boleta' }).scrollIntoViewIfNeeded()
await d.page.screenshot({ path: `${DIR}/stock-7-boleta-celular.png` })
const desborda = await d.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
await d.browser.close()
if (desborda) { console.log('✗ en el celular la boleta se sale de la pantalla'); process.exit(1) }
console.log('capturas listas')
