// Inventario: quién hizo cada movimiento, conteo y reporte de faltantes,
// como admin (vinculado al empleado "Ana Encargada").
import { abrir, BASE, sql as sqlBase, check, resumen, USERS } from './lib.mjs'
import { createRequire } from 'node:module'
import fs from 'node:fs'
const XLSX = createRequire(new URL('../../package.json', import.meta.url))('xlsx')
const DB = process.env.DB || 'kkst'
const sql = (q) => sqlBase(q, DB)
const SAL = 'c0000000-0000-0000-0000-000000000001'
const ARR = 'c0000000-0000-0000-0000-000000000002'
const P1 = 'b0000000-0000-0000-0000-000000000001'
// SQL "como" un usuario: mismos claims que manda el navegador.
const como = (rol, q) => {
  const u = USERS[rol]
  const claims = JSON.stringify({ sub: u.id, role: 'authenticated', email: u.email, app_metadata: { role: u.role } })
  return sql(`select set_config('request.jwt.claim.sub', '${u.id}', false), set_config('request.jwt.claim.role', 'authenticated', false), set_config('request.jwt.claims', '${claims}', false); ${q}`).split('\n').pop()
}

// Una boleta (finanzas, sin empleado vinculado → se ve el mail), una venta y
// un conteo de AYER que no tiene que entrar en "hoy".
como('finanzas', `select public.registrar_compra(
  jsonb_build_object('categoria','mercaderia','descripcion','Boleta pescadería','monto',126000,'medio_pago','transferencia','proveedor_id','${P1}','comprobante','A-0009','origen','ninguno'),
  jsonb_build_array(jsonb_build_object('stock_id','${SAL}','cantidad',10,'precio_unitario',12000),
                    jsonb_build_object('stock_id','c0000000-0000-0000-0000-000000000003','cantidad',2,'precio_unitario',3000)))`)
sql(`insert into pedidos (id, numero, canal, estado, total) values ('10000000-0000-0000-0000-00000000f001', 9911, 'salon', 'entregado', 1);
     update stock set stock_actual = 12 where id = '${SAL}';
     insert into stock_movimientos (stock_id, tipo, cantidad, stock_antes, stock_despues, notas, pedido_id) values ('${SAL}', 'salida', 3, 15, 12, 'Venta pedido 9911', '10000000-0000-0000-0000-00000000f001');
     insert into stock_movimientos (stock_id, tipo, cantidad, stock_antes, stock_despues, notas, created_at) values ('${ARR}', 'ajuste', 20, 25, 20, 'Conteo de inventario: diferencia -5', now() - interval '40 days')`)

const { browser, page, errores } = await abrir('admin', { viewport: { width: 1440, height: 1100 } })
await page.goto(BASE + '/stock', { waitUntil: 'networkidle' })
const filaItem = (nombre) => page.locator('tbody tr', { has: page.getByText(nombre, { exact: true }) }).first()
await filaItem('Salmón rosado').waitFor()

console.log('— el historial dice quién')
check('Inventario carga con los movimientos', await page.locator('tbody tr').count() >= 6)
await filaItem('Salmón rosado').getByTitle('Ver detalles').click()
const historial = page.locator('tr', { has: page.getByText('Historial de movimientos') })
check('la compra figura con su boleta y con quién la cargó', await historial.getByText('Compra: Pescadería Mar · comp. A-0009').count() === 1 && await historial.getByText('finanzas', { exact: true }).count() === 1)
check('los movimientos viejos (sin usuario) no muestran nombre', await historial.locator('div.flex.items-center.gap-3').filter({ hasText: 'Venta pedido 9911' }).getByTitle('Quién hizo este movimiento').count() === 0)

console.log('— merma a mano y conteo, desde la pantalla')
await filaItem('Salmón rosado').getByRole('button', { name: 'Entrada' }).click()
const modalMov = page.locator('.fixed.inset-0').filter({ hasText: 'Cantidad a sumar/restar' })
await modalMov.waitFor()
check('la entrada a mano avisa que las boletas van por Pagos', await modalMov.getByText(/Si hay boleta, cargala en Caja → Pagos/).count() === 1)
await modalMov.getByRole('button', { name: 'Merma' }).click()
await modalMov.locator('input[type="number"]').first().fill('1')
await modalMov.getByPlaceholder(/bonificación del proveedor/).fill('se cayó una bandeja')
await modalMov.locator('button[type="submit"]').click()
await modalMov.waitFor({ state: 'detached' })
check('la merma queda con el nombre del empleado y el costo del momento', sql(`select usuario_nombre || '|' || usuario_id || '|' || costo_unitario::numeric(14,2) || '|' || stock_antes || '>' || stock_despues from stock_movimientos where stock_id = '${SAL}' and tipo = 'merma'`) === `Ana Encargada|${USERS.admin.id}|12000.00|12.00>11.00`)

await page.getByRole('button', { name: 'Contar' }).click()
const modalConteo = page.locator('.fixed.inset-0').filter({ hasText: 'Cargá lo que contaste' })
await modalConteo.waitFor()
const filaConteo = (nombre) => modalConteo.locator('div.flex.items-center.gap-3', { has: page.getByText(nombre, { exact: true }) })
await filaConteo('Salmón rosado').locator('input').fill('9.5')
await filaConteo('Arroz para sushi').locator('input').fill('22')
await modalConteo.getByRole('button', { name: /Guardar conteo \(2\)/ }).click()
await page.waitForTimeout(900)
await page.keyboard.press('Escape')
const cerrar = modalConteo.getByRole('button', { name: /Listo|Cerrar|Entendido/ })
if (await cerrar.count()) await cerrar.first().click()
check('el conteo deja el ajuste con quién contó', sql(`select string_agg(s.nombre || ' ' || m.stock_antes || '>' || m.stock_despues || ' ' || m.usuario_nombre, ' / ' order by s.nombre) from stock_movimientos m join stock s on s.id = m.stock_id where m.tipo = 'ajuste' and m.created_at > now() - interval '1 minute'`)
  === 'Arroz para sushi 20.00>22.00 Ana Encargada / Salmón rosado 11.00>9.50 Ana Encargada')

console.log('— reporte de faltantes')
await page.goto(BASE + '/stock', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Faltantes' }).click()
const rep = page.getByRole('dialog', { name: 'Faltantes de stock' })
await rep.getByRole('table').waitFor()
const kpi = async (label) => (await rep.locator('div.rounded-xl', { has: page.getByText(label, { exact: true }) }).last().locator('p').nth(1).innerText()).trim()
check('faltó $18.000 (1,5 kg de salmón a $12.000)', await kpi('Faltó en los conteos') === '$18.000', await kpi('Faltó en los conteos'))
check('sobró $4.000 (2 kg de arroz a $2.000)', await kpi('Sobró en los conteos') === '$4.000', await kpi('Sobró en los conteos'))
check('merma anotada $12.000', await kpi('Merma anotada') === '$12.000', await kpi('Merma anotada'))
check('2 productos contados', await kpi('Productos contados') === '2')
const filaRep = (nombre) => rep.locator(`tr[data-faltante="${nombre}"]`)
const celdas = async (nombre) => (await filaRep(nombre).locator('td').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim())
const sal = await celdas('Salmón rosado')
check('salmón: había 5, entró 10, salió 3, merma 1, faltó 1,5, quedó 9,5', sal[2] === '5 kg' && sal[3] === '+10' && sal[4] === '−3' && sal[5] === '−1' && sal[6] === 'faltó 1,5 kg' && sal[7] === '−$18.000' && sal[8] === '9,5 kg', sal.join(' | '))
const arr = await celdas('Arroz para sushi')
check('arroz: sobró 2 kg (+$4.000)', arr[6] === 'sobró 2 kg' && arr[7] === '+$4.000', arr.join(' | '))
check('por defecto solo muestra los que tuvieron diferencia', await rep.locator('tr[data-faltante]').count() === 2)
check('el conteo de hace 40 días no entra en "Este mes"', !/5 kg/.test(arr[6]))
await filaRep('Salmón rosado').getByRole('button', { name: /Ver el detalle de Salmón rosado/ }).click()
check('detalle: qué debía haber, qué se contó y quién', await rep.getByText('debía haber 11 kg, se contó 9,5 kg').count() === 1 && await rep.getByText('por Ana Encargada').count() === 2 && await rep.getByText('“se cayó una bandeja”').count() === 1)
await page.screenshot({ path: 'shots/st-03-faltantes.png' })

await rep.getByLabel(/Solo los que tuvieron faltante/).uncheck()
check('destildando aparece también la palta (se compró, sin diferencias)', await rep.locator('tr[data-faltante]').count() === 3 && (await celdas('Palta'))[3] === '+2' && (await celdas('Palta'))[6] === '—')
await rep.getByLabel('Buscar producto').fill('arroz')
check('el buscador filtra', await rep.locator('tr[data-faltante]').count() === 1)
await rep.getByLabel('Buscar producto').fill('')
await rep.getByLabel(/Solo los que tuvieron faltante/).check()

const [descarga] = await Promise.all([page.waitForEvent('download'), rep.getByRole('button', { name: 'Exportar Excel' }).click()])
const archivo = `shots/${descarga.suggestedFilename()}`
await descarga.saveAs(archivo)
const hoja = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(archivo)).Sheets.Faltantes, { header: 1 })
check('Excel: nombre con el período', /^kiku-sushi_faltantes_\d{4}-\d{2}-01_\d{4}-\d{2}-\d{2}\.xlsx$/.test(descarga.suggestedFilename()), descarga.suggestedFilename())
check('Excel: totales y la fila del salmón', hoja[3][1] === 18000 && hoja[4][1] === 4000 && hoja[5][1] === 12000
  && JSON.stringify(hoja.find(r => r[0] === 'Salmón rosado')) === JSON.stringify(['Salmón rosado', 'kg', 5, 10, 0, 3, 0, 1, 1.5, 0, 9.5, 12000, 18000, 0, 12000, 1]),
  JSON.stringify(hoja.find(r => r[0] === 'Salmón rosado')))

await rep.getByRole('button', { name: 'Elegir fechas' }).click()
const hace45 = sql("select ((now() at time zone 'America/Argentina/Buenos_Aires')::date - 45)::text")
const hace35 = sql("select ((now() at time zone 'America/Argentina/Buenos_Aires')::date - 35)::text")
await rep.getByLabel('Desde').fill(hace45)
await rep.getByLabel('Hasta').fill(hace35)
await filaRep('Arroz para sushi').waitFor()
check('eligiendo fechas aparece el conteo viejo: faltaron 5 kg de arroz', (await celdas('Arroz para sushi'))[6] === 'faltó 5 kg' && await rep.locator('tr[data-faltante]').count() === 1)
await filaRep('Arroz para sushi').getByRole('button', { name: /Ver el detalle/ }).click()
check('un movimiento anterior al SQL 56 dice que no tiene usuario', await rep.getByText('sin usuario registrado').count() === 1)
await rep.getByRole('button', { name: 'Mes pasado' }).click()
await page.waitForTimeout(700)
await rep.getByRole('button', { name: 'Cerrar' }).click()
check('se cierra', await rep.count() === 0)

console.log('— celular y tema claro')
await browser.close()
const m = await abrir('admin', { viewport: { width: 390, height: 844 }, tema: 'light' })
await m.page.goto(BASE + '/stock', { waitUntil: 'networkidle' })
await m.page.getByTitle('Qué faltó y qué sobró en los conteos, en pesos').click()
const repM = m.page.getByRole('dialog', { name: 'Faltantes de stock' })
await repM.getByRole('table').waitFor()
check('celular: el reporte entra en la pantalla (la tabla scrollea adentro)', await m.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
await m.page.screenshot({ path: 'shots/st-04-faltantes-celular.png' })
check('sin errores de consola', errores.length === 0 && m.errores.length === 0, [...errores, ...m.errores].join(' | '))
await m.browser.close()
process.exit(resumen() ? 1 : 0)
