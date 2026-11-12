// Regresión: tarjeta con nro. de operación y "Sin pago" siguen igual (con el SQL 54 aplicado).
import { abrir, BASE, sql, check, resumen } from './lib.mjs'
// Fixture propio: un turno abierto y dos take away listos para cerrar.
sql(`insert into caja_turnos (id, estado, apertura_monto, business_date) values ('20000000-0000-0000-0000-000000000002','abierto',0,(now() at time zone 'America/Argentina/Buenos_Aires')::date) on conflict do nothing;
     insert into pedidos (id, numero, canal, estado, total, origen, cliente_nombre) values
       ('10000000-0000-0000-0000-0000000000d1', 9201, 'takeaway', 'listo', 10000, 'dashboard', 'Tarjeta Test'),
       ('10000000-0000-0000-0000-0000000000d2', 9202, 'takeaway', 'listo', 12000, 'dashboard', 'SinPago Test') on conflict do nothing;
     insert into pedido_items (pedido_id, nombre, cantidad, precio_unitario)
       select * from (values ('10000000-0000-0000-0000-0000000000d1'::uuid,'Roll tarjeta',1,10000), ('10000000-0000-0000-0000-0000000000d2'::uuid,'Roll sinpago',1,12000)) v
        where not exists (select 1 from pedido_items where nombre in ('Roll tarjeta','Roll sinpago'))`)
const { browser, page, errores } = await abrir('admin')
await page.goto(BASE + '/pedidos', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.locator('tr', { hasText: '1x Roll tarjeta' }).locator('button[title="Cerrar pedido"]').click()
let modal = page.locator('div.fixed', { hasText: 'Medio de pago' }).last()
await modal.getByRole('button', { name: 'Tarjeta debito' }).click()
check('tarjeta sin nro. no deja cerrar', await modal.getByRole('button', { name: 'Cerrar pedido' }).isDisabled())
await modal.getByPlaceholder('Ej: 0123456789').fill('987654')
await modal.getByRole('button', { name: 'No imprimir' }).click()
await modal.getByRole('button', { name: 'Cerrar pedido' }).click()
await modal.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
await page.waitForTimeout(500)
check('tarjeta: pago con nro. de operación', sql("select medio_pago||'|'||monto||'|'||numero_operacion||'|'||(cuenta_corriente_id is null) from pagos where pedido_id = '10000000-0000-0000-0000-0000000000d1'") === 'tarjeta_debito|10000.00|987654|true')
await page.locator('tr', { hasText: '1x Roll sinpago' }).locator('button[title="Cerrar pedido"]').click()
modal = page.locator('div.fixed', { hasText: 'Medio de pago' }).last()
await modal.getByRole('button', { name: 'Sin pago' }).click()
await modal.getByRole('button', { name: 'No imprimir' }).click()
await modal.getByRole('button', { name: 'Cerrar pedido' }).click()
await modal.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
await page.waitForTimeout(500)
check('sin pago: cierra sin registrar cobro', sql("select (select count(*) from pagos where pedido_id = '10000000-0000-0000-0000-0000000000d2')||'|'||(select estado from pedidos where id = '10000000-0000-0000-0000-0000000000d2')") === '0|entregado')
check('sin errores de consola', errores.length === 0, errores.join(' | '))
await browser.close()
process.exit(resumen() ? 1 : 0)
