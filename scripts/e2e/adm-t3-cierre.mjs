// Cierre de caja: freno al guardar en la caja fuerte más de lo que hay, aviso
// al cerrar con medios sin cargar, y el camino para corregir un cierre viejo
// (reabrir → corregir el movimiento → volver a cerrar → corregir la caja
// fuerte). Es el mismo recorrido que se le explica a administración.
import { abrir, BASE, sql as sqlBase, check, resumen } from './lib.mjs'
const DB = process.env.DB || 'kkadm'
const sql = (q) => sqlBase(q, DB)
async function hasta(fn, ms = 10000) {
  const fin = Date.now() + ms
  for (;;) { const v = await fn(); if (v || Date.now() > fin) return v; await new Promise(r => setTimeout(r, 200)) }
}
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ')
const TURNO = '20000000-0000-0000-0000-000000000001'

const { browser, page, errores } = await abrir('admin', { viewport: { width: 1360, height: 1400 } })
await page.goto(BASE + '/caja', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Arqueo/ }).first().click()
const main = page.locator('main')
await hasta(async () => /Efectivo esperado \$170\.000,00/i.test(await txt(main)))
check('efectivo esperado = fondo + cobros en efectivo', /Efectivo esperado \$170\.000,00/i.test(await txt(main)))

console.log('— Guardar en caja fuerte: un cero de más')
await page.getByRole('button', { name: 'Guardar plata' }).click()
// El campo Monto toma el foco al abrir: se lo marca para volver a encontrarlo.
await page.locator('input:focus').evaluate(el => el.setAttribute('data-test', 'monto-caja-fuerte'))
const monto = page.locator('[data-test="monto-caja-fuerte"]')
const formCF = monto.locator('xpath=ancestor::div[contains(@class,"space-y-3")][1]')
await monto.fill('1600000')
const eco = page.locator('[data-eco-monto]')
check('muestra el monto con puntos y lo que hay en la caja', /Vas a guardar \$1\.600\.000,00 · en la caja hay \$170\.000,00 en efectivo/.test(await txt(eco)), await txt(eco))
await formCF.getByRole('button', { name: 'Guardar', exact: true }).click()
await page.locator('[data-aviso-exceso]').waitFor()
check('frena: es más de lo que hay', /Es más de lo que hay en la caja/.test(await txt(page.locator('[data-aviso-exceso]'))) && /un cero de más/.test(await txt(page.locator('[data-aviso-exceso]'))))
check('todavía no guardó nada', sql('select count(*) from caja_fuerte_movimientos') === '0' && sql("select count(*) from caja_movimientos where tipo = 'retiro'") === '0')
await page.screenshot({ path: 'shots/adm-7-caja-fuerte-freno.png' })
await monto.fill('160000')
check('con un monto que entra, el aviso se va', await page.locator('[data-aviso-exceso]').count() === 0 && await formCF.getByRole('button', { name: 'Guardar', exact: true }).count() === 1)
// Para reproducir el cierre que hay que corregir, se guarda igual el monto mal.
await monto.fill('1600000')
await formCF.getByRole('button', { name: 'Guardar', exact: true }).click()
await formCF.getByRole('button', { name: 'Guardar igual' }).click()
await hasta(async () => sql('select count(*) from caja_fuerte_movimientos') === '1')
check('"Guardar igual" deja pasar (la decisión es de la persona)', sql("select monto from caja_movimientos where tipo = 'retiro'") === '1600000.00' && sql('select monto from caja_fuerte_movimientos') === '1600000.00')

console.log('— Cerrar sin cargar lo contado')
await hasta(async () => /Efectivo esperado \$-?-?1\.430\.000,00|Efectivo esperado -\$1\.430\.000,00|Efectivo esperado \$-1\.430\.000,00/i.test(await txt(main)))
await page.getByRole('button', { name: 'Cerrar turno' }).click()
const aviso = page.locator('[data-aviso-sin-cargar]')
await aviso.waitFor()
const a = await txt(aviso)
check('avisa qué medios quedaron sin cargar y el faltante falso', /No cargaste lo contado en transferencia, tarjeta debito\./i.test(a) && /va a mostrar que faltan \$743\.600,00, aunque la plata esté/.test(a), a)
await page.screenshot({ path: 'shots/adm-8-cierre-sin-cargar.png' })
await page.getByRole('button', { name: 'Confirmar cierre' }).click()
await hasta(async () => sql(`select estado from caja_turnos where id = '${TURNO}'`) === 'cerrado')
check('si igual confirman, queda como en las capturas: contado $0 y diferencias', sql(`select cierre_monto || '|' || (denominaciones_cierre->'medios'->'transferencia'->>'contado') || '|' || (denominaciones_cierre->'medios'->'efectivo'->>'esperado') from caja_turnos where id = '${TURNO}'`) === '0.00|0|-1430000', sql(`select cierre_monto || '|' || denominaciones_cierre::text from caja_turnos where id = '${TURNO}'`))

console.log('— Corregirlo: reabrir el turno')
// Como lo haría administración al otro día: entrar de nuevo y buscar el cierre.
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Arqueo/ }).first().click()
await page.getByText('Historial de cierres', { exact: true }).scrollIntoViewIfNeeded()
const filaCierre = page.locator('button', { hasText: /Contado \$0,00/ }).first()
await filaCierre.waitFor()
check('el historial muestra el cierre con contado $0 y la diferencia', /Esperado \$-686\.400,00/.test(await txt(filaCierre)) || /Esperado -\$686\.400,00/.test(await txt(filaCierre)), await txt(filaCierre))
await filaCierre.click()   // el detalle se despliega tocando la fila
const reabrir = page.getByRole('button', { name: 'Reabrir turno' })
await reabrir.first().waitFor()
await reabrir.first().click()
const modalR = page.locator('.fixed.inset-0', { hasText: 'Motivo de la reapertura' }).last()
await modalR.locator('textarea').fill('Retiro a caja fuerte con un cero de más y cierre sin lo contado')
await modalR.getByRole('button', { name: 'Reabrir', exact: true }).click()
await page.getByText('Turno reabierto').first().waitFor()
await hasta(async () => /Motivo de reapertura/.test(await txt(main)))
check('el turno queda reabierto, con el motivo a la vista', sql(`select estado from caja_turnos where id = '${TURNO}'`) === 'reabierto' && /Motivo de reapertura: Retiro a caja fuerte con un cero de más/.test(await txt(main)), sql(`select estado from caja_turnos where id = '${TURNO}'`) + ' · ' + ((await txt(main)).match(/Turno reabierto[^]{0,260}/)?.[0] || ''))

console.log('— corregir el movimiento mal cargado')
const mov = page.locator('div.px-2.py-1\\.5', { hasText: 'Retiro a caja fuerte' }).first()
await mov.locator('button[title="Editar"]').click()
await mov.locator('input[placeholder="Monto"]').fill('160000')
await mov.getByRole('button', { name: 'Guardar', exact: true }).click()
await hasta(async () => sql("select monto from caja_movimientos where tipo = 'retiro'") === '160000.00')
check('el retiro queda en el monto real', sql("select monto from caja_movimientos where tipo = 'retiro'") === '160000.00')
check('la caja fuerte NO se corrige sola (son dos anotaciones)', sql('select monto from caja_fuerte_movimientos') === '1600000.00')

console.log('— volver a cerrar, ahora con lo contado')
// El panel de cierre es el formulario que tiene los casilleros de "contado".
const cierre = page.locator('form', { has: page.locator('input[placeholder="$0"]') }).last().locator('xpath=..')
await hasta(async () => /Efectivo (Esperado )?\$10\.000,00/.test((await txt(cierre))))
await page.locator('[data-usar-esperado]').click()
const inputs = cierre.locator('input[placeholder="$0"]')
const valores = await inputs.evaluateAll(els => els.map(e => e.value))
check('"Usar lo esperado" completa transferencia y tarjetas, no el efectivo', valores[0] === '' && valores.includes('459500,00') && valores.includes('284100,00'), JSON.stringify(valores))
await inputs.nth(0).fill('10000')
await hasta(async () => /Diferencia \+\$0,00/i.test(await txt(cierre)))
check('con todo cargado la diferencia es cero', /Total contado \$753\.600,00/i.test(await txt(cierre)) && /Diferencia \+\$0,00/i.test(await txt(cierre)), (await txt(cierre)).slice(-260))
await cierre.getByRole('button', { name: 'Cerrar turno' }).click()
await page.getByRole('button', { name: 'Confirmar cierre' }).waitFor()
check('ya no avisa medios sin cargar', await page.locator('[data-aviso-sin-cargar]').count() === 0)
await page.getByRole('button', { name: 'Confirmar cierre' }).click()
await hasta(async () => sql(`select estado from caja_turnos where id = '${TURNO}'`) === 'cerrado')
const final = sql(`select estado || '|' || cierre_monto || '|' || diferencia || '|' || (denominaciones_cierre->'medios'->'transferencia'->>'contado') || '|' || (denominaciones_cierre->'medios'->'tarjeta_debito'->>'contado') || '|' || (denominaciones_cierre->'medios'->'efectivo'->>'contado') from caja_turnos where id = '${TURNO}'`)
check('el cierre corregido queda sin diferencia', final === 'cerrado|753600.00|0.00|459500|284100|10000', final)
check('la reapertura quedó auditada', Number(sql(`select count(*) from caja_turnos_auditoria where turno_id = '${TURNO}'`)) >= 1)

console.log('— corregir el saldo de la caja fuerte')
await page.getByRole('button', { name: /^Caja fuerte$/ }).click()
await page.getByRole('button', { name: /Corrección/ }).click()
const modalA = page.locator('.fixed.inset-0', { hasText: 'Corrección de saldo' }).last()
await modalA.locator('input').first().fill('1440000')
await modalA.locator('select').selectOption('faltante')
await modalA.locator('textarea').fill('Depósito del turno cargado con un cero de más: era $160.000')
await modalA.getByRole('button', { name: 'Registrar ajuste' }).click()
await modalA.waitFor({ state: 'detached' })
const saldo = sql("select sum(case when tipo = 'deposito' or (tipo = 'ajuste' and categoria = 'sobrante') then monto else -monto end) from caja_fuerte_movimientos")
check('la caja fuerte queda con lo que realmente se guardó', saldo === '160000.00', saldo)

check('sin errores de consola', errores.length === 0, errores.join(' || '))
await browser.close()
process.exit(resumen() ? 1 : 0)
