// IVA de las ventas en Caja: Totales, cada orden facturada y el Excel de los
// contadores. Corre contra minirest con MAX_ROWS=1000 (el tope de la API).
import { abrir, BASE, sql as sqlBase, check, resumen } from './lib.mjs'
import { createRequire } from 'node:module'
const XLSX = createRequire(new URL('../../package.json', import.meta.url))('xlsx')
const DB = process.env.DB || 'kkiva'
const sql = (q) => sqlBase(q, DB)
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const HOY = iso(new Date()), AYER = iso(new Date(Date.now() - 86400000))
const dmy = (s) => s.split('-').reverse().join('/')
// Lo que devuelve la base a un usuario con sesión (la función exige permiso).
const comoAdmin = (q) => sql(`select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","app_metadata":{"role":"admin"}}', false), set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false); ${q}`).split('\n').at(-1)
const resumenBase = (d, h) => comoAdmin(`select sum(case when clase = 'nota_credito' then -neto else neto end) || '|' || sum(case when clase = 'nota_credito' then -iva else iva end) || '|' || sum(case when clase = 'nota_credito' then -total else total end) from iva_ventas_resumen('${d}', '${h}')`)
async function hasta(fn, ms = 8000) {
  const fin = Date.now() + ms
  for (;;) { const v = await fn(); if (v || Date.now() > fin) return v; await new Promise(r => setTimeout(r, 200)) }
}

const { browser, page, errores } = await abrir('admin', { viewport: { width: 1360, height: 1100 } })
await page.goto(BASE + '/caja', { waitUntil: 'networkidle' })
const totales = page.locator('div.rounded-lg', { has: page.getByText('Totales', { exact: true }) }).last()

console.log('— Caja abre en "Últ. 7 días": hay más pedidos que el tope de la API')
await hasta(async () => (await page.locator('[data-aviso-tope]').count()) > 0, 20000)
const avisoSemana = await page.locator('[data-aviso-tope]').innerText().catch(() => '')
check('avisa que los totales pueden quedar cortos y dónde mirar el IVA completo', /Se cargaron 1\.000 pedidos y puede haber más/.test(avisoSemana) && /Finanzas → Resumen/.test(avisoSemana) && /IVA ventas/.test(avisoSemana), avisoSemana)
await totales.scrollIntoViewIfNeeded()
await page.screenshot({ path: 'shots/iva-3-caja-tope.png' })

await page.getByRole('button', { name: 'Hoy', exact: true }).click()
await hasta(async () => /Neto facturado\s*\$373\.680,00/.test(await totales.innerText()))

console.log('— Caja → Totales (hoy)')
const t = (await totales.innerText()).replace(/\s+/g, ' ')
check('Facturado y notas de crédito como siempre', /Facturado \$436\.600,00/.test(t) && /Notas de crédito -\$62\.920,00/.test(t) && /Neto facturado \$373\.680,00/.test(t), t)
check('IVA 21% → va a ARCA', /↳ IVA 21% va a ARCA \$64\.853,55/.test(t), t)
check('Sin IVA → queda en el negocio', /↳ Sin IVA queda en el negocio \$308\.826,45/.test(t), t)
check('IVA + sin IVA = Neto facturado', Math.round((64853.55 + 308826.45) * 100) === 37368000)
check('coincide con lo que suma la base para esos pedidos', sql(`select sum(case when c.tipo_cbte = 8 then -1 else 1 end * case when c.importe_iva = 0 and c.importe_neto = 0 then c.importe_total - round(c.importe_total / 1.21, 2) else c.importe_iva end) from comprobantes_fiscales c join pedidos p on p.id = c.pedido_id where p.created_at::date = '${HOY}' and ((c.tipo_cbte = 8 and c.estado = 'autorizado') or (c.tipo_cbte in (1, 6) and c.estado in ('autorizado', 'anulado')))`) === '64853.55')
check('sin aviso de tope (hoy hay pocos pedidos)', await page.locator('[data-aviso-tope]').count() === 0)
await totales.scrollIntoViewIfNeeded()
await page.screenshot({ path: 'shots/iva-1-caja-totales.png' })

console.log('— cada orden facturada')
await page.getByRole('button', { name: /^Todos/ }).first().click()
const orden = (mesa) => page.locator('article', { hasText: `Mesa ${mesa}` }).first()
await orden(21).waitFor()
const linea = async (mesa) => {
  const l = orden(mesa).locator('[data-iva-orden]')
  return (await l.count()) ? (await l.innerText()).replace(/\s+/g, ' ').trim() : null
}
check('Factura B: IVA y sin IVA de la orden', await linea(21) === 'IVA 21%: $21.000,00 · sin IVA: $100.000,00', await linea(21))
check('Factura A: lo mismo', await linea(22) === 'IVA 21%: $42.000,00 · sin IVA: $200.000,00', await linea(22))
check('con nota de crédito parcial: ya restada', await linea(24) === 'IVA 21%: $1.680,00 · sin IVA: $8.000,00', await linea(24))
check('factura sin desglose guardado: se calcula', await linea(25) === 'IVA 21%: $173,55 · sin IVA: $826,45', await linea(25))
check('anulada por nota de crédito: sin IVA que mostrar', await linea(23) === null, String(await linea(23)))
check('rechazada / sin facturar: sin línea de IVA', await linea(26) === null && await linea(7) === null)
await orden(24).scrollIntoViewIfNeeded()
await page.screenshot({ path: 'shots/iva-2-caja-ordenes.png' })

console.log('— Excel de los contadores (hoy)')
async function exportar(nombre) {
  const dl = page.waitForEvent('download', { timeout: 30000 })
  await page.getByRole('button', { name: 'Exportar Excel' }).click()
  const archivo = await dl
  await archivo.saveAs(`shots/${nombre}`)
  return XLSX.readFile(`shots/${nombre}`, { cellNF: true })
}
let wb = await exportar('iva-reporte-hoy.xlsx')
check('hoja "IVA ventas", después de Cobros', wb.SheetNames.indexOf('IVA ventas') === wb.SheetNames.indexOf('Cobros') + 1, wb.SheetNames.join(' | '))
check('las hojas de siempre siguen', ['Resumen', 'Cobros', 'Pagos', 'Sueldos por mes'].every(h => wb.SheetNames.includes(h)))
let filas = XLSX.utils.sheet_to_json(wb.Sheets['IVA ventas'])
check('una fila por comprobante emitido hoy + TOTAL', filas.length === 9, String(filas.length))
check('columnas', Object.keys(filas[0]).join('|') === 'Fecha de emisión|Comprobante|Número|Cliente|Documento|Condición IVA|Neto gravado|IVA 21%|Total|CAE|Pedido|Observación', Object.keys(filas[0]).join('|'))
const porNro = (n) => filas.find(f => f['Número'] === n) || {}
const fa = filas.find(f => f.Comprobante === 'Factura A') || {}
check('Factura A con cliente, CUIT y condición', fa.Cliente === 'Revista Punto Biz SA' && fa.Documento === 'CUIT 30712345678' && fa['Condición IVA'] === 'Responsable Inscripto' && fa['Neto gravado'] === 200000 && fa['IVA 21%'] === 42000 && fa.Total === 242000 && fa.Pedido === 9702 && fa['Fecha de emisión'] === dmy(HOY), JSON.stringify(fa))
const nc = filas.filter(f => f.Comprobante === 'Nota de Crédito B')
check('notas de crédito en negativo, con la factura que tocan', nc.length === 2 && nc[0].Total === -60500 && nc[0]['IVA 21%'] === -10500 && nc[0]['Observación'] === 'Anula o descuenta la B 00002-00000102' && nc[1]['IVA 21%'] === -420, JSON.stringify(nc))
check('factura anulada marcada', porNro('00002-00000102')['Observación'] === 'Anulada por nota de crédito')
check('sin desglose: calculado y avisado', porNro('00002-00000104')['IVA 21%'] === 173.55 && porNro('00002-00000104')['Observación'] === 'Sin desglose guardado: IVA calculado')
check('la factura del pedido de anoche entra HOY, con su número de pedido', porNro('00002-00000100').Total === 36300 && porNro('00002-00000100').Pedido === 9707, JSON.stringify(porNro('00002-00000100')))
check('rechazadas, con error y pendientes no figuran', filas.every(f => f.Total !== 99999))
const tot = filas.at(-1)
check('fila TOTAL', tot['Fecha de emisión'] === 'TOTAL' && tot['Neto gravado'] === 338826.45 && tot['IVA 21%'] === 71153.55 && tot.Total === 409980, JSON.stringify(tot))
check('TOTAL = lo que suma la base (iva_ventas_resumen)', resumenBase(HOY, HOY) === '338826.45|71153.55|409980.00', resumenBase(HOY, HOY))
check('formato de plata en las columnas', wb.Sheets['IVA ventas'].H2.z === '#,##0.00' && wb.Sheets['IVA ventas'].G2.z === '#,##0.00')
let res = XLSX.utils.sheet_to_json(wb.Sheets['Resumen'], { header: 1 })
const fila = (txt) => res.find(r => String(r[0] || '').startsWith(txt)) || []
const iBloque = res.findIndex(r => r[0] === 'IVA DE LAS VENTAS')
check('Resumen: bloque del IVA al final', iBloque > res.findIndex(r => r[0] === 'VENTAS Y FACTURACIÓN') && res[iBloque + 1][0] === `Comprobantes emitidos del ${dmy(HOY)} al ${dmy(HOY)} (por fecha de emisión)`, JSON.stringify(res.slice(iBloque, iBloque + 2)))
check('Resumen: facturas, notas de crédito y total', fila('Facturas emitidas')[1] === 472900 && fila('Facturas emitidas')[2] === '6 facturas' && res.slice(iBloque).find(r => r[0] === 'Notas de crédito')[1] === -62920 && fila('Total facturado')[1] === 409980, JSON.stringify(res.slice(iBloque)))
check('Resumen: neto e IVA', fila('Neto gravado')[1] === 338826.45 && fila('IVA 21% · débito fiscal, va a ARCA')[1] === 71153.55)
check('Resumen: avisa el comprobante calculado y quién hace la cuenta final', Boolean(fila('1 comprobante no tenía')[0]) && Boolean(fila('Lo que se paga a ARCA lo calcula el contador')[0]))
check('Resumen: explica por qué no coincide con el neto facturado de arriba', fila('Neto facturado')[1] === 373680 && Boolean(fila('Puede no coincidir')[0]))
const aviso = await hasta(async () => (await page.getByText(/Reporte descargado/).count()) ? page.getByText(/Reporte descargado/).innerText() : null)
check('aviso de descarga nombra el IVA', /IVA de las ventas/.test(aviso || ''), aviso)

console.log('— un día con más pedidos que el tope de la API (ayer: 1200 facturas)')
await page.getByRole('button', { name: 'Custom' }).click()
const fechas = page.locator('input[type="date"]')
await fechas.nth(0).fill(AYER); await fechas.nth(1).fill(AYER)
await hasta(async () => (await page.locator('[data-aviso-tope]').count()) > 0 && /↳ IVA 21% va a ARCA\s*\$216\.090,00/.test(await totales.innerText()), 20000)
check('Caja avisa que los totales pueden quedar cortos', await page.locator('[data-aviso-tope]').count() === 1)
const t2 = (await totales.innerText()).replace(/\s+/g, ' ')
// En pantalla: el pedido de anoche (36.300) + 999 de los 1200 → IVA 6.300 + 999 × 210
check('lo que muestra es lo cargado (1000 pedidos)', /↳ IVA 21% va a ARCA \$216\.090,00/.test(t2), t2.match(/↳ IVA[^↳]*/)?.[0])
wb = await exportar('iva-reporte-ayer.xlsx')
filas = XLSX.utils.sheet_to_json(wb.Sheets['IVA ventas'])
check('el Excel trae las 1200 facturas (va de a páginas)', filas.length === 1201, String(filas.length))
check('TOTAL del día completo', filas.at(-1)['IVA 21%'] === 252000 && filas.at(-1)['Neto gravado'] === 1200000 && filas.at(-1).Total === 1452000, JSON.stringify(filas.at(-1)))
check('en orden de emisión', filas[0]['Número'] === '00002-00005001' && filas[1199]['Número'] === '00002-00006200', `${filas[0]['Número']} … ${filas[1199]['Número']}`)
check('la de anoche NO está (se emitió hoy)', !filas.some(f => f['Número'] === '00002-00000100'))
res = XLSX.utils.sheet_to_json(wb.Sheets['Resumen'], { header: 1 })
check('el TOTAL del Excel = lo que suma la base', resumenBase(AYER, AYER) === '1200000.00|252000.00|1452000.00', resumenBase(AYER, AYER))
check('Resumen del día completo, con la aclaración', fila('Facturas emitidas')[2] === '1200 facturas' && fila('IVA 21% · débito fiscal, va a ARCA')[1] === 252000 && Boolean(fila('Puede no coincidir')[0]), JSON.stringify(res.slice(-8)))

check('sin errores de consola', errores.length === 0, errores.join(' || '))
await browser.close()
process.exit(resumen() ? 1 : 0)
