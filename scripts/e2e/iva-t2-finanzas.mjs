// IVA de las ventas en Finanzas → Resumen. Lo suma la base (SQL 57), así que
// lo ve el rol de finanzas (que no lee los comprobantes) y no lo corta el tope
// de 1000 filas de la API (minirest corre con MAX_ROWS=1000).
import { abrir, BASE, sql as sqlBase, check, resumen } from './lib.mjs'
const DB = process.env.DB || 'kkiva'
const sql = (q) => sqlBase(q, DB)
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const HOY = iso(new Date()), AYER = iso(new Date(Date.now() - 86400000))
const plata = (n) => `$${Math.round(n).toLocaleString('es-AR')}`
async function hasta(fn, ms = 8000) {
  const fin = Date.now() + ms
  for (;;) { const v = await fn(); if (v || Date.now() > fin) return v; await new Promise(r => setTimeout(r, 200)) }
}

const { browser, page, errores } = await abrir('finanzas', { viewport: { width: 1360, height: 1200 } })
await page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
const card = page.locator('[data-iva-ventas]')
const texto = async () => (await card.innerText()).replace(/\s+/g, ' ')
const esperar = (re) => hasta(async () => (await card.count()) > 0 && re.test(await texto()), 15000)

console.log('— como finanzas (no lee los comprobantes uno por uno)')
check('finanzas no puede leer la tabla de comprobantes', sql(`select count(*) from rol_permisos rp join recurso_tablas rt on rt.recurso_id = rp.recurso_id where rp.rol_id = 'finanzas' and rt.tabla = 'comprobantes_fiscales' and rp.ver`) === '0')
// El mes: hoy + ayer si ayer cae en el mismo mes.
const mismoMes = HOY.slice(0, 7) === AYER.slice(0, 7)
const mes = { total: 409980 + (mismoMes ? 1452000 : 0), iva: 71153.55 + (mismoMes ? 252000 : 0), neto: 338826.45 + (mismoMes ? 1200000 : 0), facturas: 6 + (mismoMes ? 1200 : 0) }
await esperar(new RegExp(`FACTURADO \\${plata(mes.total).replace(/\./g, '\\.')}`, 'i'))
let t = await texto()
check('el recuadro aparece en el Resumen, debajo de los cuatro números', /IVA de las ventas ·/.test(t) && (await card.evaluate(el => el.previousElementSibling?.className.includes('grid') && el.nextElementSibling?.className.includes('grid'))), t.slice(0, 160))
check('mes: facturado, IVA y sin IVA (más de 1000 facturas, sumadas en la base)', t.includes(`FACTURADO ${plata(mes.total)}`) && t.includes(`IVA · VA A ARCA ${plata(mes.iva)}`) && t.includes(`SIN IVA · QUEDA EN EL NEGOCIO ${plata(mes.neto)}`), t)
check('mes: cantidad de facturas con separador de miles', t.includes(`${mes.facturas.toLocaleString('es-AR')} facturas · 2 notas de crédito ya restadas`), t)
await page.screenshot({ path: 'shots/iva-4-finanzas-mes.png' })

await page.getByRole('button', { name: 'Día', exact: true }).click()
await esperar(/FACTURADO \$409\.980/i)
t = await texto()
check('hoy: facturado (ya restadas las notas de crédito)', /FACTURADO \$409\.980 6 facturas · 2 notas de crédito ya restadas/i.test(t), t)
check('hoy: IVA que va a ARCA', /IVA · VA A ARCA \$71\.154/i.test(t), t)
check('hoy: sin IVA, queda en el negocio', /SIN IVA · QUEDA EN EL NEGOCIO \$338\.826/i.test(t), t)
check('avisa el comprobante sin desglose', /1 comprobante no tenía el desglose guardado: su IVA se calculó\./.test(t), t)
check('aclara qué cuenta y quién calcula lo que se paga', /por su fecha de emisión/.test(t) && /lo calcula el contador: a este IVA le resta el IVA de las compras/.test(t) && /Las ventas sin factura no entran acá/.test(t), t)
check('la barra muestra la proporción (17,4% de IVA)', /De cada \$100 facturados, \$17,4 son IVA/.test(await card.locator('[title^="De cada"]').getAttribute('title')))
await hasta(async () => /ENTRÓ \$373\.680/i.test((await page.locator('main').innerText()).replace(/\s+/g, ' ')))
check('"Entró" sigue contando los cobros (con o sin factura), no lo facturado', /ENTRÓ \$373\.680 4 cobros/i.test((await page.locator('main').innerText()).replace(/\s+/g, ' ')))
await card.scrollIntoViewIfNeeded()
await page.screenshot({ path: 'shots/iva-5-finanzas-dia.png' })

console.log('— ayer: 1200 facturas')
const anterior = page.locator('button', { has: page.locator('svg.lucide-chevron-left') }).first()
await anterior.click()
await esperar(/FACTURADO \$1\.452\.000/i)
t = await texto()
check('ayer: las 1200 facturas completas', /FACTURADO \$1\.452\.000 1\.200 facturas/i.test(t) && /IVA · VA A ARCA \$252\.000/i.test(t) && /SIN IVA · QUEDA EN EL NEGOCIO \$1\.200\.000/i.test(t), t)
check('sin notas de crédito no las nombra', !/notas? de crédito ya restadas/.test(t) && !/no tenía el desglose/.test(t), t)
await anterior.click()
await esperar(/Sin facturas emitidas en el período/)
check('un día sin facturas lo dice', /Sin facturas emitidas en el período/.test(await texto()), await texto())
check('el resto del Resumen sigue igual', await page.getByText('¿A dónde se va la plata?').count() === 1 && await page.getByText('Cierres de caja').count() === 1 && await page.getByText('Entró', { exact: true }).count() >= 1)
check('sin errores de consola (finanzas)', errores.length === 0, errores.join(' || '))
await browser.close()

console.log('— en el celular y en tema claro')
const cel = await abrir('finanzas', { viewport: { width: 390, height: 1500 }, tema: 'light' })
await cel.page.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
await cel.page.getByRole('button', { name: 'Día', exact: true }).click()
const cardCel = cel.page.locator('[data-iva-ventas]')
await hasta(async () => (await cardCel.count()) > 0 && /\$409\.980/.test(await cardCel.innerText()), 15000)
const tCel = (await cardCel.innerText()).replace(/\s+/g, ' ')
check('se ve igual', /\$409\.980/.test(tCel) && /\$71\.154/.test(tCel) && /\$338\.826/.test(tCel), tCel)
const desborda = await cel.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
const cajas = await cardCel.locator('.grid > div').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.width)] }))
check('en el celular entra sin scroll horizontal, un dato por renglón', !desborda && cajas.length === 3 && cajas.every(c => c[0] >= 0 && c[1] <= 390 && c[2] > 250), JSON.stringify(cajas))
await hasta(async () => /\$373\.680/.test(await cel.page.locator('main').innerText()))
await cardCel.scrollIntoViewIfNeeded()
await cel.page.screenshot({ path: 'shots/iva-6-finanzas-celular.png' })
check('sin errores de consola (finanzas en el celular)', cel.errores.length === 0, cel.errores.join(' || '))
await cel.browser.close()

const caja = await abrir('admin', { viewport: { width: 390, height: 1500 }, tema: 'light' })
await caja.page.goto(BASE + '/caja', { waitUntil: 'networkidle' })
await caja.page.getByRole('button', { name: 'Hoy', exact: true }).click()
const totCel = caja.page.locator('div.rounded-lg', { has: caja.page.getByText('Totales', { exact: true }) }).last()
await hasta(async () => /\$64\.853,55/.test(await totCel.innerText()), 15000)
const filasCel = await totCel.locator('div.flex.items-baseline').evaluateAll(els => els.filter(e => /IVA/.test(e.textContent)).map(e => { const r = e.getBoundingClientRect(); return { txt: e.textContent, ancho: Math.round(r.width), desborda: e.scrollWidth > e.clientWidth + 1 } }))
check('Caja en el celular: las dos filas del IVA entran', filasCel.length === 2 && filasCel.every(f => !f.desborda) && /va a ARCA\$64\.853,55/.test(filasCel[0].txt) && /queda en el negocio\$308\.826,45/.test(filasCel[1].txt), JSON.stringify(filasCel))
await totCel.scrollIntoViewIfNeeded()
await caja.page.screenshot({ path: 'shots/iva-7-caja-celular.png' })
check('sin errores de consola (Caja en el celular)', caja.errores.length === 0, caja.errores.join(' || '))
await caja.browser.close()
process.exit(resumen() ? 1 : 0)
