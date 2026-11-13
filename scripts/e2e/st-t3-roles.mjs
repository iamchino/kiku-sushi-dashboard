// Permisos: finanzas carga la boleta sin tener Inventario; el mozo ve
// Inventario y el reporte pero no carga compras.
import { abrir, BASE, sql as sqlBase, check, resumen } from './lib.mjs'
const DB = process.env.DB || 'kkst'
const sql = (q) => sqlBase(q, DB)
const ARR = 'c0000000-0000-0000-0000-000000000002'

// En la matriz de fábrica finanzas tiene Pagos pero no la pantalla de Caja,
// que es donde vive Pagos: se le da "ver" como estaría configurado en el local.
sql("insert into rol_permisos (rol_id, recurso_id, ver, editar) values ('finanzas','caja',true,false) on conflict (rol_id, recurso_id) do update set ver = true")

console.log('— finanzas (Pagos sí, Inventario no)')
const f = await abrir('finanzas', { viewport: { width: 1360, height: 1100 } })
await f.page.goto(BASE + '/caja', { waitUntil: 'networkidle' })
const tabPagos = f.page.getByRole('button', { name: /^Pagos$/ })
check('finanzas llega a Pagos', await tabPagos.count() === 1)
await tabPagos.click()
await f.page.getByRole('button', { name: /Registrar pago/ }).first().click()
const modal = f.page.locator('.fixed.inset-0').filter({ has: f.page.getByRole('heading', { name: 'Registrar pago' }) })
const campo = (label) => modal.locator(`xpath=.//label[starts-with(normalize-space(.), "${label}")]/following-sibling::*[1]/descendant-or-self::*[self::input or self::select or self::textarea][1] | .//label[starts-with(normalize-space(.), "${label}")]/following-sibling::select[1]`).first()
await modal.getByRole('button', { name: /Cargar los productos de la boleta/ }).click()
const seccion = modal.getByRole('region', { name: 'Productos de la boleta' })
await campo('Proveedor').selectOption({ label: 'Almacén Sur' })
await seccion.locator('[data-fila="Arroz para sushi"]').waitFor()
check('ve los productos aunque no tenga Inventario (habituales por el proveedor anotado)', await seccion.locator('[data-fila]').count() === 2)
await seccion.getByLabel('Cantidad de Arroz para sushi').fill('25')
await campo('Descripción').fill('Arroz por bolsa')
await campo('Medio de pago').selectOption('transferencia')
await seccion.getByRole('button', { name: 'Usar $50.000 como monto' }).click()
await modal.locator('button.w-full').last().click()
await modal.waitFor({ state: 'detached' })
await f.page.getByText(/Entró 1 producto al stock/).waitFor()
check('la boleta entra al stock y queda a nombre de finanzas (sin empleado: el mail)', sql(`select s.stock_actual || '|' || m.usuario_nombre from stock s join stock_movimientos m on m.stock_id = s.id where s.id = '${ARR}' and m.origen = 'compra'`) === '45.00|finanzas')
// Finanzas → Proyección de pagos usa el mismo formulario en "modo proyección":
// ahí no se cargan productos (todavía no llegó nada) y el pago queda pendiente.
await f.page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
await f.page.getByRole('button', { name: 'Proyección de pagos' }).click()
await f.page.getByRole('button', { name: /Nueva proyección de pago|Cargar la primera/ }).first().click()
const modalProy = f.page.locator('.fixed.inset-0').filter({ has: f.page.getByRole('heading', { name: 'Nueva proyección de pago' }) })
const campoP = (label) => modalProy.locator(`xpath=.//label[starts-with(normalize-space(.), "${label}")]/following-sibling::*[1]/descendant-or-self::*[self::input or self::select or self::textarea][1] | .//label[starts-with(normalize-space(.), "${label}")]/following-sibling::select[1]`).first()
await campoP('Categoría').selectOption('mercaderia')
await campoP('Descripción').fill('Pescadería, a 30 días')
await campoP('Monto').fill('80000')
await f.page.waitForTimeout(800)
check('en una proyección no se ofrecen productos', await modalProy.getByRole('button', { name: /Cargar los productos de la boleta/ }).count() === 0)
await modalProy.getByRole('button', { name: 'Agregar a la proyección' }).click()
await modalProy.waitFor({ state: 'detached' })
check('la proyección se guarda como siempre (pendiente, sin productos)', sql("select estado || '|' || (select count(*) from compra_items ci where ci.egreso_id = e.id) from egresos e where descripcion = 'Pescadería, a 30 días'") === 'pendiente|0')

await f.page.goto(BASE + '/stock', { waitUntil: 'networkidle' })
check('finanzas no entra a Inventario (no lo tiene en la matriz)', !/\/stock$/.test(f.page.url()), f.page.url())
check('sin errores de consola', f.errores.length === 0, f.errores.join(' | '))
await f.browser.close()

console.log('— mozo (Inventario sí, Pagos no)')
const m = await abrir('mozo', { viewport: { width: 1360, height: 1000 } })
await m.page.goto(BASE + '/stock', { waitUntil: 'networkidle' })
await m.page.getByRole('button', { name: 'Faltantes' }).click()
const rep = m.page.getByRole('dialog', { name: 'Faltantes de stock' })
await rep.getByLabel(/Solo los que tuvieron faltante/).waitFor()
await rep.getByLabel(/Solo los que tuvieron faltante/).uncheck()
check('el mozo ve el reporte (tiene Inventario)', await rep.locator('tr[data-faltante="Arroz para sushi"]').count() === 1)
const r = await m.page.evaluate(async () => {
  const ses = JSON.parse(localStorage.getItem('sb-127-auth-token'))
  const res = await fetch('http://127.0.0.1:54321/rest/v1/rpc/registrar_compra', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ses.access_token}` },
    body: JSON.stringify({ p_pago: { categoria: 'mercaderia', descripcion: 'x', monto: 1 }, p_items: [], p_permitir_diferencia: false }),
  })
  return { status: res.status, body: await res.text() }
})
check('el mozo no puede cargar compras por la API', r.status === 400 && /No tenés permiso/.test(r.body), JSON.stringify(r))
check('sin errores de consola', m.errores.length === 0, m.errores.join(' | '))
await m.browser.close()
process.exit(resumen() ? 1 : 0)
