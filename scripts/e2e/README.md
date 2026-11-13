# Pruebas de punta a punta (para el sandbox de Claude)

Sirven para probar el dashboard **de verdad** sin tocar producción: un Postgres
local con el esquema de Kiku, un mini PostgREST que habla con ese Postgres y un
navegador (Playwright) usando el dashboard compilado. El RLS, los triggers y los
checks que se ejercitan son los reales; lo único de juguete es ARCA (autoriza
todo) y la impresora (`window.print` anulado).

No corren en la máquina de Manu ni en Vercel: dependen de Postgres 16, `psql` y
Playwright, que están en el sandbox.

## Correr todo

```bash
scripts/e2e/correr-cuentas-corrientes.sh   # cobro con cuenta corriente, caja, arqueo (SQL 54)
scripts/e2e/correr-cashflow.sh             # Finanzas → Cash flow (SQL 55)
scripts/e2e/correr-stock-compras.sh        # boleta con productos, quién movió el stock, faltantes (SQL 56)
```

Cada una arma la base plantilla si no existe, compila el dashboard apuntando al
backend local, corre la batería de SQL y las de navegador, y deja capturas en
`scripts/e2e/shots/`. Terminan con `✓ batería … OK` o listan lo que falló.

## Piezas

| Archivo | Qué hace |
| --- | --- |
| `crear-base.sh` | Levanta Postgres (`/var/tmp/pgtest`, puerto 5499, usuario `nobody`) y arma la base plantilla `kk`: `stubs-supabase.sql` + `provision/esquema_base.sql` + migraciones posteriores al dump + `SQL-CIERRES/24` (`registrar_movimiento_stock`, que está en producción pero no en el dump). `--forzar` la rearma. |
| `prep-db.sh <db> <si\|no\|lista> [sin-datos]` | Clona `kk`, siembra la matriz de permisos, aplica las migraciones opcionales (`si` = todas, `no` = ninguna, o palabras del nombre separadas por coma: `cuentas_corrientes,cashflow_mensual`) y carga `seed-ui.sql`. |
| `minirest.mjs <puerto> <db>` | Mini PostgREST + GoTrue + ARCA de juguete. Cada request corre como `authenticated` con los claims del JWT que manda el navegador. Soporta `eq/neq/gte/lte/in/is`, `order`, `limit`, insert/update/delete con `returning`, RPC y los embebidos que usa el front (`pedidos` → items, comprobantes, pagos; `stock` → movimientos, respetando las columnas pedidas). Lo que no entiende lo loguea. |
| `lib.mjs` | `abrir(rol)` abre el navegador ya logueado como `admin`, `finanzas`, `mozo` o `administracion` (rol de solo lectura de Finanzas); `sql()` consulta la base; `check()` anota cada chequeo. |
| `cc-sql.sql` | Batería de SQL de cuentas corrientes: RLS por rol, trigger de saldo, re-cobro, cambio de medio, cuenta inactiva, vista del arqueo, grants de anon. |
| `cc-t*.mjs` | Flujos en el navegador (sección, cobrar mesa, cerrar pedido, pago dividido, Caja, Excel, arqueo, cierre de turno, permisos, celular, base sin el SQL 54, tarjeta / sin pago). |
| `st-sql.sql`, `st-t*.mjs` | Stock + compras: boleta con productos (alta, corrección, anulación, todo o nada con la caja), precio de costo, habituales por proveedor, quién hizo cada movimiento, reporte de faltantes y su Excel, permisos y base sin el SQL 56. `seed-stock.sql` carga proveedores y productos; `st-capturas.mjs` saca las capturas para mostrar. |
| `cf-sql.sql`, `cf-t*.mjs` | Cash flow: agregado por mes y zona horaria, RLS, edición de estimados, saldo, Excel, rol de solo lectura, base sin el SQL 55. `seed-cashflow.sql` carga tres meses de cobros y pagos de ejemplo (más de 1000 cobros por mes) y `cf-capturas.mjs` saca las capturas para mostrar. |

## Para probar otra cosa

1. `scripts/e2e/prep-db.sh mibase si` y `node scripts/e2e/minirest.mjs 54321 mibase &`.
2. Compilar con `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=eyJx.eyJ9.x`
   (y `VITE_ARCA_API_URL=http://127.0.0.1:54321/functions/v1` si hay que facturar)
   a `scripts/e2e/dist`, y servirlo: `node scripts/e2e/serve.mjs scripts/e2e/dist 4180 &`.
3. Escribir el test copiando uno de los `cc-t*.mjs`.

Trampas: nunca encadenar `pkill` en un comando del sandbox (mata la shell): usar
`stop-rest.sh` / `stop-serve.sh`. La clave de sesión en localStorage es
`sb-127-auth-token` (sale del host `127.0.0.1`). El tema se fuerza con
`kiku-dashboard-theme`. El contenido scrollea adentro de `<main>`, así que
`fullPage` no alcanza: para capturar una pantalla larga, agrandar el viewport.
