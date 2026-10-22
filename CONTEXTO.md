# CONTEXTO DEL PROYECTO — leer esto al arrancar cada chat

> **Para Manu:** arrancá cada chat nuevo con "Leé el CONTEXTO.md del repo kiku-sushi-dashboard y hacé X".
> **Para Claude:** leé todo este archivo antes de tocar nada. Al cerrar un bloque de trabajo, actualizá "Pendientes" y "Últimos cambios" **y mandá ese cambio dentro del parche del dashboard** (este archivo vive en el repo desde el 21/10/2026).

> **Dos máquinas (PC Windows + Mac) desde el 21/10/2026.** GitHub es la única fuente de verdad: este archivo, `SQL-CIERRES/` y los scripts de sync están en el repo `kiku-sushi-dashboard`. Rutina: `scripts/kiku-sync.sh pull` (Mac) / `scripts\kiku-sync.ps1 pull` (Windows) al empezar, `… push "mensaje"` al terminar, `… am archivo.patch` para aplicar un parche (hace pull + git am + push + borra el .patch). Guía completa: `docs/DOS-MAQUINAS.md`. Carpetas: `C:\Users\Juan Manuel\Desktop\kiku\` en la PC, `~/kiku/` en la Mac, con los dos repos adentro.

## Qué es esto

Sistema de gestión gastronómica de Kiku Sushi (Rosario, Argentina). Dos partes:

- **kiku-sushi-dashboard**: panel interno (React + Vite + Supabase). Roles: admin, finanzas, cocina, mozo, empleado.
- **kiku-sushi-web**: web pública (React + Vite + TS): pedidos delivery/takeaway y reservas.

Se está preparando para venderse white-label a otros locales como **Comandera**. Kiku es el cliente 0.

Manu no programa: Claude hace los cambios y los verifica. Hablar en español argentino (voseo), respuestas concisas.

---

## Cómo se trabaja (CAMBIÓ — leer sí o sí)

Claude corre en un sandbox en la nube cuyo proxy **bloquea el push** a GitHub
("access denied by the git proxy: … is not in this session's authorized
repository set"). No se resuelve con un token: el proxy corta antes de llegar a
GitHub. **No pierdas tiempo intentándolo.**

El circuito real:

1. Claude clona el repo (el clone SÍ funciona), trabaja y commitea local.
2. Claude genera un `.patch` con `git format-patch origin/master --stdout`.
3. Claude lo escribe **directo en la carpeta del repo** en la máquina conectada
   (PC: `C:\Users\Juan Manuel\Desktop\kiku\<repo>`; Mac: `~/kiku/<repo>`) **y
   además lo adjunta en el chat** (SendUserFile), por si Manu está en la otra
   máquina. La copia de `Documents\Proyectos WEB\KikuSUSHI` es VIEJA, no usarla.
   `device_bash` monta la carpeta (sirve para leer/editar); para escribir
   archivos nuevos lo más confiable es device_commit_files.
4. Manu: `scripts/kiku-sync.sh am archivo.patch` (Mac) o
   `scripts\kiku-sync.ps1 am archivo.patch` (Windows) = pull + `git am` +
   push + borrar el .patch. Vercel deploya solo.
5. **CONTEXTO.md y SQL-CIERRES/ viven en el repo del dashboard**: Claude los
   actualiza en su clon y los manda en el mismo parche. No editarlos a mano en
   la carpeta sin commitear después (`kiku-sync push`).

Reglas que evitan los problemas que ya pasaron:

- **Antes de generar un parche, `git fetch origin` y rebasar sobre `origin/master`.**
  Manu pushea entre medio y los parches dejan de aplicar. Pasó tres veces.
- **Verificar el parche clonando el repo de cero y corriendo `git am` ahí.**
  Es la única prueba de que va a aplicar en su máquina.
- Si `git am` le falla, casi siempre es que **falta aplicar un parche anterior**,
  no que el parche esté mal.
- En la PC de Manu los archivos están con CRLF y el repo con LF. Con
  `core.autocrlf=false` git ve TODO modificado y `git am` choca. Se fijó
  `git config core.autocrlf true` en su repo (29/09).
- **Nunca correr `git status` / `git diff` sin `--no-optional-locks` sobre
  la carpeta de Manu desde device_bash**: deja `.git/index.lock` y la VM no
  puede borrarlo (pasó el 29/09 y le trabó el pull).

**El token de GitHub que estaba acá se filtró y hay que rotarlo**
(GitHub → Settings → Developer settings → PAT). No hace falta ninguno para este
circuito: Manu ya está logueado como `iamchino` en su máquina.

- GitHub: `iamchino/kiku-sushi-dashboard` y `iamchino/kiku-sushi-web`, rama `master`.
- SQL: `kiku-sushi-dashboard/SQL-CIERRES/` (en el repo) + migración en `supabase/migrations/`. Parches: en la carpeta del repo que tocan, y `*.patch` está en `.gitignore`.

## Cómo verificar antes de entregar

Todo esto corre en el sandbox, en el repo clonado:

- Dashboard: `npm run build` + `npm run verificar:permisos` (**372 chequeos**:
  115 de paridad + 257 del front). Lint tiene **baseline de 32 problemas**
  preexistentes — comparar contra 32, no contra 0.
- Web: `npm run build` + `npx vitest run` (28 tests).
- **SQL: `pglast` para sintaxis y `pgserver` (pip) para correrlo contra un
  Postgres real.** Esto último no es opcional: en esta sesión encontró dos bugs
  que la sintaxis no ve (ver "Trampas").

## Reglas de trabajo acordadas con Manu

1. **Todo SQL se pasa por el chat** en bloques pegables, además de dejarlo como
   migración en `supabase/migrations/`. Manu lo corre a mano en Supabase → SQL Editor.
2. **Antes de un SQL que modifica datos, mandar SIEMPRE una consulta de
   diagnóstico que solo lea.** Se hizo así con el ×100 y destapó que había dos
   problemas distintos donde parecía uno.
3. Los cambios de permisos requieren que los usuarios recarguen el dashboard.
4. Commits directos a master, mensajes en español, sin acentos en el título.
   Después de `git am`, borrar el .patch (`del x.patch`) para no commitearlo.
5. Manu manda capturas para iterar; responder a lo que se ve.

---

## Arquitectura clave (trampas incluidas)

- **Supabase** (Postgres + RLS + Edge Functions). La matriz de permisos vive en la base:
  `roles`, `recursos`, `rol_permisos` — las columnas son **`rol_id` y `recurso_id`**.
- **`tiene_permiso()`** en las policies. **`is_finanzas_user()` ya NO mira emails**:
  desde 20260906030000 mira solo `app_metadata.role in ('finanzas','admin')`.
- **`es_admin_permisos_de_emergencia()`** sigue con `finanzas@kikusushi.com.ar`
  hardcodeado **a propósito**: es la llave debajo del felpudo para destrabar la
  matriz de permisos si se rompe. NO sacarla.
- **Envíos**: `envio_config` (fila única id=1, `base`=3500) + `envio_zonas`
  (la web no usa zonas: "Zona base" vs "Fuera de zona" con `ENVIO_FUERA_DESDE=6000`).
- **Pedidos web** (`kiku-sushi-web/src/pages/Pedidos.tsx`): mar–sáb 19:30–00:00
  (vie/sáb hasta 01:00), programar = calendario + turnos, hora AR `-03:00`.
- **Reservas**: `reservas_config` + `reservas_dias`. Mediodía mar–vie 11–15.
- **Empleados**: `tipo_sueldo` fijo|hora, `frecuencia_pago` mensual|quincenal|semanal|**diario**.
- **Caja / caja fuerte**: RPCs transaccionales, arrastre entre días, pagos centralizados.
- **Comandera Print** (`comandera-print/`, Go, v1.0.10): puente wss :8443, auto-update
  desde `public/descargas/`. HTTP :8442 reparte certificado y ticket de prueba.
- **Workflows**: `comandera-print.yml`, `dump-esquema.yml`, `backup-diario.yml` (cron 06:00 UTC).
- **provision/**: instalador de instancia nueva. Probado end-to-end contra PG virgen.
- **Meta Pixel** en la web: ID 202717241811091, evento `Schedule` al confirmar reserva.

### Modelo de permisos de Caja (nuevo)

| recurso | qué gobierna |
|---|---|
| `caja` | la pantalla entera y las policies de `caja_turnos` |
| `caja_historico` | el selector de rango + la banda de totales de facturación. Sin esto, la pantalla queda **fija en HOY** |
| `caja_fuerte` | la sección Caja fuerte: saldo, historial, corrección |
| `caja_fuerte_agregar` | **"Caja fuerte +"**: solo el botón de guardar plata, desde Arqueo. No muestra saldo |
| `pagos` | la sección Pagos |

El **historial de cierres NO depende de ningún permiso extra**: es trazabilidad
del arqueo y se ve siempre.

Config recomendada para el rol admin (el encargado):
`permisos ✗ · finanzas ✗ · personal ✗ · caja_historico ✗ · caja_fuerte ✗ · caja_fuerte_agregar ✓`

**Admin NO debe tener `permisos`**: quien edita la matriz se devuelve solo todo
lo que le sacaste.

### Trampas que ya mordieron

- **`parseAmount` y los números.** Estaba escrita para texto es-AR y hacía
  `String(v).replace(/\./g,'')` sobre TODO. Un número con centavos perdía el
  punto decimal y se guardaba **×100**. Rompió cierres reales. Ya está
  arreglada (devuelve los números tal cual), pero **cuidado al pasar números a
  funciones que esperan texto**.
- **RLS que no da error.** Un `UPDATE` bloqueado por RLS **no falla**: actualiza
  cero filas y devuelve éxito. Un `SELECT` bloqueado devuelve cero filas, no un
  error. Siempre verificar filas afectadas (`.select('id')` + chequear largo) y
  desconfiar de un cero que llega de una tabla con RLS. Ya causó dos bugs.
- **`security definer` y los permisos del que llama.** Una RPC que arma su
  respuesta llamando a otra función con guarda propia (`saldo_caja_fuerte()`)
  explota al final y **se lleva puesta la transacción**: el trabajo real se
  pierde en el paso decorativo.
- **`greatest(0, null)` da 0 en Postgres**, no null. "Sin dato" y "cero real" se
  confunden si no se distinguen a mano.
- **No usar `throw` para saltear un bloque cuyo `catch` tiene efectos.** El
  catch no distingue "falló" de "no hacía falta". Rompió el arrastre de la
  apertura el mismo día que se escribió.
- **El SQL Editor de Supabase corre como `postgres`, sin JWT.** Cualquier
  función con guarda de `tiene_permiso()` se niega ahí. Los diagnósticos tienen
  que replicar el cálculo inline, no llamar a la RPC.
- **Las migraciones se escriben pero no siempre se corren.** Varias funciones
  (`editar_pago`, la acción `rol` de la Edge Function) estaban commiteadas hace
  semanas y nunca deployadas. **Ante un error raro, primero chequear si el SQL o
  la Edge Function están realmente aplicados en Supabase.**

---

## Últimos cambios (2026-10-06 noche, 2) — Facturas emitidas en ARCA sin guardar (BUG GRAVE, mío)

Causa: el 06/10 habilité "volver a facturar tras anular con NC" en el front sin tocar el índice único `comprobantes_fiscales_pedido_factura_uid` (una factura `autorizado` por pedido). La B anulada seguía `autorizado` → ARCA daba CAE a la A y el insert fallaba → cada reintento emitía una factura real.
Huérfanas detectadas (SQL 32): pedido 904 A 00002-00000003 ($82.900, Brochar SRL); pedido 891 A 00002-00000001 y 00000002 ($147.000, INDIGO IA SAS — la 2 es duplicada, necesita NC); pedido 616 B 00002-00000325 ($58.000, 25/08). Las de mayo son homologación.
Arreglo: parche `factura-anulada-y-sin-duplicados.patch` + SQL 34 (migración 20261006020000: trigger → factura pasa a `anulado` cuando las NC cubren el total, con backfill) + Edge `arca-comprobantes` responde 409 si el pedido ya tiene factura vigente (no llama a ARCA) + SQL 33 recupera las huérfanas desde `arca_request_log` (la primera por pedido queda vigente, los reintentos `anulado` con nota DUPLICADA).
Orden: 34 → parche + push → deploy arca-comprobantes → 33 (después de confirmar razón social de 891) → NC en ARCA para la A 00002-00000002 (Comprobantes en línea, o botón futuro).
`fiscal.js`: `getFacturasAutorizadas` incluye `anulado`; `facturaAnulada` lo detecta por estado.

## Últimos cambios (2026-10-06 noche) — Urgente: "Facturar no hace nada"

Parche `facturar-error-visible.patch` (+ redeploy de `arca-comprobantes`).
- Causa de que "no pase nada": el error de ARCA/Edge se mostraba en la página, DETRÁS del modal "Facturar pedido". Ahora FacturarModal recibe `errorExterno` (Caja.jsx y PedidoDetalleModal.jsx).
- arca-comprobantes: el chequeo de `puede_cobrar()` (capa 1) usa el JWT del usuario con la service key como apikey (antes dependía de SUPABASE_ANON_KEY) y devuelve el motivo si la RPC falla.
- Si después del parche sigue fallando, el cartel rojo dentro del modal dice la causa real.

## Últimos cambios (2026-10-21, 2) — El repo pasa a ser la fuente de verdad (PC + Mac)
Parches `kiku-sushi-dashboard\repo-fuente-de-verdad.patch` (base e22c09a) y `kiku-sushi-web\web-limpieza-y-gitattributes.patch` (base 948b7db). Sin SQL.
- Manu va a trabajar también desde una Mac. Para que nada quede desactualizado, todo lo que antes estaba suelto en `Desktop\kiku` entra al repo del dashboard: `CONTEXTO.md` (este archivo), `SQL-CIERRES/` (0–47 + admin-usuarios.ts), `scripts/kiku-sync.sh` + `scripts/kiku-sync.ps1`, `docs/DOS-MAQUINAS.md` (puesta a punto de la Mac y rutina). `.gitattributes` (`* text=auto`) en los dos repos para que CRLF/LF no vuelva a molestar; `*.patch` en `.gitignore`; se borraron del repo los 11 `.patch` viejos de la raíz y, en la web, los 30 `.fuse_hidden*` / `XX7AQEXF` que estaban commiteados.
- `kiku-sync`: `status` (qué hay sin subir / qué hay nuevo en GitHub), `pull`, `push "msg"`, `am archivo.patch [--keep-cr]`. Probado contra un remoto local simulando PC y Mac.
- Después de aplicar en la PC: borrar los duplicados sueltos `Desktop\kiku\CONTEXTO.md` y `Desktop\kiku\SQL-CIERRES\` (ya están en el repo). `GUIA-IP-FIJA-PC-IMPRESORA.md` y `kiku-print\` (versión vieja de comandera-print, agosto) también se pueden borrar.

## Últimos cambios (2026-10-21) — No se podía cerrar la caja: "caja_turnos_cierre_monto_check"
Parche `kiku-sushi-dashboard\cierre-contado-no-negativo.patch` (base 84db77e, sin SQL) + **SQL-CIERRES 47** (diagnóstico, solo lectura).
- Causa: el efectivo esperado del turno del 20/10 dio **−$260.000** (apertura 0 + ventas efectivo 30.000 + ingresos 70.000 − egresos 360.000). El equipo escribió "−260000" en Contado para que la diferencia diera 0, y la base rechaza `cierre_monto < 0` (check de la migración 20260530). No es un bug del cierre: es que se registraron $360.000 de pagos/egresos en efectivo "desde la caja del día" en un turno al que entraron $100.000. Físicamente imposible: o esos pagos salieron de la caja fuerte / otro lado (corregir en Pagos → lápiz → origen), o faltó registrar un Ingreso a la caja (ej. retiro de caja fuerte).
- Fix en el front: Contado no acepta signo menos (plata física), el hook valida antes de mandar y traduce el error de la base; si algún medio tiene esperado negativo, el panel de cierre lo explica y dice cómo corregirlo, y la confirmación avisa que la diferencia queda como sobrante.
- SQL 47 lista los movimientos de efectivo del turno abierto con el pago y el origen declarado, para encontrar los $360.000.

## Últimos cambios (2026-10-20) — Cuentas del negocio para pagos por transferencia (Mercado Pago, etc.)
**SQL-CIERRES 46** (= migración 20261020000000_cuentas_negocio.sql) + parche `kiku-sushi-dashboard\pagos-cuentas-negocio.patch` (base 2296fc9). Orden: SQL 46 → `git am` + push. El dashboard sin el SQL sigue como antes (cuenta única de web_config.banco_cuenta).
- Pedido de Manu: que los admins puedan agregar cuentas (ej. "Mercado Pago KIKU SUSHI") al registrar un pago por transferencia.
- Tabla `cuentas_negocio` (nombre, tipo banco/billetera/otro, activa, orden; RLS: leen todos los logueados, escriben admin y finanzas). Siembra: la cuenta de `web_config.banco_cuenta` ("Kiku SAS — Galicia") + "Mercado Pago KIKU SUSHI". Se administra en **Configuración → Negocio → Cuentas del negocio** (`CuentasNegocioSection.jsx`): agregar, renombrar, reordenar (la primera es la propuesta por defecto), activar/desactivar, borrar solo si ningún pago la usa. El campo viejo "Cuenta bancaria" desapareció de esa pantalla; `web_config.banco_cuenta` queda en la tabla sin uso.
- `egresos.cuenta_id` (FK set null). Backfill: pagos viejos con origen banco → la primera cuenta. `registrar_pago()` y `editar_pago()` se borraron (todas las firmas) y se recrearon con `p_cuenta_id uuid default null` al final: sin él usan la primera activa; con origen ≠ banco siempre null; cuenta inexistente o desactivada → error (salvo que el pago ya la tuviera). **La lógica de caja/arqueo no se tocó**: origen 'banco' sigue siendo 'banco' y el trigger `caja_mov_afecta_arqueo` lo deja fuera del arqueo; el movimiento del turno ahora dice "Pago por transferencia (Mercado Pago KIKU SUSHI): …". Helpers `resolver_cuenta_negocio()` y `nombre_cuenta_negocio()`.
- Front: el select "¿De qué cuenta sale la transferencia?" lista las cuentas activas + "Otra cuenta" (valor `banco:<id>`); `usePagos` expone `cuentas` y embebe `cuenta:cuentas_negocio(nombre)` en la lista (con reintento sin embed si la tabla no existe); `p_cuenta_id` se manda solo si hay cuenta elegida (con la base vieja mandarlo rompería el RPC). Lista de Pagos muestra la cuenta; Excel contadores "Salió de" = nombre de la cuenta; historial muestra "cuenta". `Select` de `finanzas/fields.jsx` acepta `hint`.
- Verificado: migración 2 veces sobre `provision/esquema_base.sql` + todas las migraciones desde el 20/08 en PG 16 local (stubs auth/net), escenario completo (alta sin cuenta, con MP, efectivo ignora cuenta, cuenta inexistente/desactivada, edición con motivo, auto mantiene cuenta, pasar a caja fuerte limpia cuenta y mueve el reflejo, RLS cocina no escribe / admin sí). Build OK, lint 31, verificar:permisos OK, Playwright con mocks (capturas `Claude outputs\pagos-cuentas-*.png`).
- Nota: "Mercado Pago" NO es un medio de pago nuevo: va como Transferencia + cuenta. Si algún día quieren MP como medio aparte (QR), es otro cambio (MEDIOS_PAGO en lib/finanzas.js + checks de egresos.medio_pago).

## Últimos cambios (2026-10-19) — Combos: "Could not find the 'menu_item_id' column of 'combos'"
**SQL-CIERRES 45** (= migración 20261019000000) + parche `kiku-sushi-dashboard\combos-menu-item-id.patch` (base 2dddfd6, solo agrega la migración al repo).
- Causa: `useCombos.js` siempre escribió `combos.menu_item_id` (producto del menú vinculado, de donde sale el precio de venta), pero la tabla `combos` de producción nunca tuvo esa columna (ver `provision/esquema_base.sql`). La migración 20260609 ponía la FK "si la columna existe" y nunca existió. Nadie había guardado un combo hasta ahora.
- SQL 45: columna + FK a menu_items (on delete set null) + índice; repite `combo_items.piezas_por_unidad` (SQL 44) de forma idempotente por si no se corrió; `notify pgrst` para que PostgREST recargue el esquema. Probado 2 veces en PG 16 local sobre la forma real de las tablas + insert como el front.
- Orden: correr SQL 45 → recargar el dashboard → guardar el combo. El parche puede ir cuando sea.

## Últimos cambios (2026-10-18) — Kiku Libre con vino + repaso del doc "dash kiku"
Parche `kiku-sushi-web\web-kiku-libre-vino.patch` (base 06aa158). Sin SQL.
- Pedido de la pestaña "KIKULIBRE WEB" del Google Doc del equipo (`dash kiku`): /sushi-libre dice "Sushi + vino ilimitado…", el precio "incluye vino blanco o tinto", tres pasos (rondas + copa / copa de vino / sin límites), se VOLÓ la sección "Las variedades" y en Información importante se agregó "El precio incluye sushi + vino (jarra perfumada si no se bebe alcohol)". Mismo texto en el bloque del home y en el form de reservas. Default del precio 53.500 → 60.000.
- **El precio real sale de `web_config.libre_precio`: cambiarlo a 60000 en el dashboard, Menú → Kiku Libre** (o `update web_config set libre_precio = 60000 where id = 1;`). Sin eso la web sigue mostrando 53.500.
- Capturas en `Claude outputs\kiku-libre-vino-*.png`. Build OK, 51 tests.
- **Backlog del equipo**: el Google Doc `dash kiku` (Drive, id 1Q5Ec5NeMWEtk2vz92mwwhTmmIniCmAHHS9H8spzG9-U) se lee directo con el conector de Drive (texto y comentarios; las imágenes solo se ven abriéndolo en el navegador). El estado ítem por ítem está en el Project, doc `kiku/PEDIDOS_EQUIPO.md`: actualizarlo cada vez que se cierre algo del doc.

## Últimos cambios (2026-10-15) — Fichas: unidad del rinde, pestaña "Bebidas y reventa" y precio de venta
- Pedido del equipo: elegir si el rinde es en porciones, kilos o litros; y que las bebidas (Amargo Obrero, Aperol…) no aparezcan mezcladas con los rolls en "Productos finales".
- `recetas.unidad_rinde` (porc | u | kg | g | l | ml). En la receta: campo "Rinde" (ahora admite decimales, `porciones` pasó a numeric) + botones "Se cuenta en". El trigger `recetas_sincronizar_stock` copia la unidad al ítem de stock de la receta: Inventario, Producción (Cantidad producida) y Fichas muestran la misma. Rolls de servicio siguen en 'roll'. Backfill: si el ítem ya tenía kg/l puesto a mano, la receta lo adopta.
- `recetas.reventa`: las recetas 1:1 de bebidas (las creó la migración del 02/07 para que la venta descuente stock; NO son un error, son necesarias) ahora van en la pestaña **"Bebidas y reventa"** de Fichas Técnicas. Backfill automático (receta final, 1 ingrediente materia prima, cantidad 1, mismo nombre). Checkbox "Reventa" en la receta para marcar/desmarcar.
- Bug de paso: `menu_items.precio` "$12.500" se parseaba como 12,5 → columnas Venta y Margen mal en Fichas y Combos. Nuevo `src/utils/precio.js` (`parsePrecioAR`, `precioVentaDe`, usa `precio_num` si existe).
- SQL 43 (`43-recetas-unidad-rinde-y-reventa.sql`, probado en pg local, idempotente) + parche `fichas-unidad-rinde-y-reventa.patch` (base 036c0b5). El dashboard guarda sin las columnas nuevas si el SQL no corrió.
- (2) Buscador de ingredientes: en tema oscuro el `<select>` nativo mostraba las opciones claras sobre blanco (ilegible) y con 150 ítems no se podía buscar. Nuevo `src/components/ui/Buscador.jsx` (escribís y filtra, sin acentos, flechas + Enter, grupos, panel `position: fixed`) usado en RecetaModal (ingrediente, producto del menú) y ComboModal. Regla global en `index.css` para los `<select>` nativos que quedan (fondo/texto del tema). Parche `fichas-buscador-ingredientes.patch` (base 7c26509). Para listas largas en otras pantallas, reutilizar `Buscador`.

## Últimos cambios (2026-10-14, 2) — Formularios de reserva y pedidos legibles (web)
- Manu: "está todo muy oscuro e ilegible, letras más grandes, otra letra más normal".
- Nuevo scope `.v2-legible` en `src/index.css`: dentro del formulario de reserva (`ReservationFormV2.tsx`) y de /pedidos (`Pedidos.tsx`) todo va en **Inter 16px** (los títulos siguen en Cormorant), inputs con fondo más claro y texto blanco, textos secundarios más luminosos (`#D6CEE0` / `#B9AFC8`), labels en blanco. El resto de la web no cambia.
- Tamaños de 10–14px pasan a 13–16px y el tracking de 0.2–0.3em baja a 0.08–0.12em. Step dots del wizard no se cortan en celular; chip "por llegada" en una línea.
- Pedidos: fila de producto sin foto apila precio y botón debajo del texto en celular; carrito con nombres/precios grandes y botones +/- de 32px; resumen y checkout a 16px.
- Parche `web-formularios-legibles.patch` (commit sobre `web-reservas-anticipacion.patch`; aplicar DESPUÉS de ese). Verificado sobre 5fcace3: build OK, 51 tests, eslint baseline.

## Últimos cambios (2026-10-14) — Reservas sin el mínimo de 2 horas (configurable) + fix de zona horaria

Parches `kiku-sushi-dashboard\dashboard-reservas-anticipacion.patch` (base 59c9a27) y `kiku-sushi-web\web-reservas-anticipacion.patch` (base 5fcace3) + **SQL-CIERRES 42** (migración 20261014000000).
- `reservas_config.anticipacion_min_minutos` (default **0 = sin mínimo**) y `anticipacion_max_dias` (30). Configuración → Reservas: bloque "Con cuánta anticipación se puede reservar por la web" (botones Sin mínimo / 30 min / 1 h / 2 h / 3 h o minutos a mano, y días hacia adelante).
- **Bug encontrado**: `crear_reserva` comparaba `p_fecha + p_hora` (hora AR) contra `now()` como si fuera UTC → las "2 horas" eran en realidad 5 (a las 18:00 no se podía reservar para las 20:00). Ahora usa `at time zone 'America/Argentina/Buenos_Aires'`. Con mínimo 0 solo rechaza horarios ya pasados.
- Web: "hoy" en hora AR (antes UTC: desde las 21:00 no se podía reservar para hoy); oculta turnos pasados o a menos del mínimo (se refresca por minuto); limita fechas al máximo de días; mensaje "los turnos de hoy ya pasaron" en vez de lista de espera. Tests: 51.
- Orden: SQL 42 → parche dashboard + push → parche web + push.

## Últimos cambios (2026-10-13) — Tres bugs del dashboard (usuarios, stock, fichajes)

Parche `kiku-sushi-dashboard\arreglos-usuarios-stock-fichajes.patch` (base a00bd88) + **SQL-CIERRES 39** (migración 20261013000000) + **40** (diagnóstico, solo lectura) + `supabase functions deploy admin-usuarios`.
- **Eliminar usuario → "Database error deleting user"**: `produccion_listas.creado_por` referenciaba `auth.users` sin ON DELETE; si el usuario creó una lista de producción, Postgres no dejaba borrarlo. SQL 39 recorre todas las FKs de public → auth.users sin regla y las pasa a SET NULL (cubre tablas futuras). La Edge desvincula empleados/mozos/listas antes de borrar y, si vuelve a fallar, dice por qué.
- **Usuario "raro" (virus/sistema)** = `bee@llaoa35chd5l1tmr9vq1ucv2qtwjk8.oastify.com` (dominio de Burp Collaborator: escáner de vulnerabilidades automático que probó el signup público). Creado 10/09, sin rol, sin confirmar, nunca entró. Borrado. Cierre: apagar signups en Supabase + SQL 41 (`current_app_role()`: sin rol → null, ya no 'cocina').  SQL 40 lista todos los logins con rol, quién los creó y última entrada; los sin rol (entrarían como cocina); y qué datos apuntan al raro. Si se registró solo → desactivar "Allow new users to sign up" en Supabase → Authentication → Providers → Email (hoy cualquiera con la anon key podría crearse un login). Borrarlo después del SQL 39.
- **Stock "no me deja ingresar"**: no era un bug de datos, era UX: el campo "Stock actual" aparecía bloqueado y el movimiento estaba en un checkbox al final del modal. Ahora al editar, lo primero es "Stock actual −6 caja" + botones Entrada / Ajuste / Merma + cantidad + vista previa, con aviso cuando quedó negativo; y cada fila tiene un botón "Entrada" directo. La regla sigue igual: el stock solo cambia con movimiento (historial) o conteo.
- **Fichaje viernes 18:00 → sábado 01:00**: el modal armaba la fecha/hora con la zona horaria del celular y la salida que falta arrancaba en "hoy". Ahora todo es hora de Argentina (`arLocalToDate`), la salida arranca en el día de la entrada y, si la hora es de madrugada, la fecha salta sola al día siguiente con aviso; valida salida > entrada y entrada < salida con mensaje claro. Si Facundo tiene dos entradas seguidas (doble escaneo 18:04 y 18:05), borrar una desde el turno y cargar la salida.

## Últimos cambios (2026-10-12) — Pedidos online con días propios (lunes: salón sí, delivery no)

Parches `kiku-sushi-web\web-pedidos-dias-propios.patch` (base 421467e) y `kiku-sushi-dashboard\dashboard-pedidos-dias-propios.patch` (base 65b7e3e) + **SQL-CIERRES 38** (migración 20261012000000_dias_pedidos_online.sql). Los parches de Mediodías (10/10) ya están en GitHub.
- `reservas_dias.pedidos` (nueva): qué días se toman pedidos online (delivery y take away). Seed = noche salvo el lunes. Configuración → Reservas tiene ahora tres columnas por día: Mediodía, Noche (salón/reservas y horario del footer) y **Pedidos** (camión).
- Web: `/pedidos` (kikuAbierto, horarios programables, mensaje "Hoy (lunes) no tomamos pedidos online.") y `/pedir` leen `pedidos`; reservas y footer siguen con `noche`. Si la base no tiene la columna, pedidos = noche (compatibilidad). Tests: 45.
- Orden: SQL 38 → parche dashboard + push → parche web + push.

## Últimos cambios (2026-10-10) — Sección "Mediodías" en la web + lunes a la noche

Parches: `kiku-sushi-web\web-mediodias-y-lunes.patch` (base 41dc02d) y `kiku-sushi-dashboard\dashboard-mediodias.patch` (base 816e789) + **SQL-CIERRES 37** (migración 20261010000000_mediodia_web_y_lunes_noche.sql).
- **Web — /mediodias** (alias /mediodia), estilo Kiku Libre: hero (días/horario, "desde $" = menú más barato, CTAs reservar `?experiencia=kiku_mediodia` y "ver el menú del mes"), carrusel de placas 4:5 con lightbox (flechas, teclado, contador), "Los menús" (de `reservas_config.menus_mediodia`), salón/pick up (notas editables), CTA final con WhatsApp para pick up. Bloque `MediodiaShowcase` en el home después de Kiku Libre (abanico de 3 placas en desktop). Link "Mediodías" en header (desktop+mobile) y footer, solo si la sección está activa. Hooks `useMediodia` / `useMediodiaActivo`; sin fallback hardcodeado (apagada = no existe).
- **Web — días abiertos desde el dashboard** (`src/lib/diasAbiertos.ts`, lee `reservas_dias`): pedidos online (`kikuAbierto`, slots programados, mensaje "cerrado" armado con los días reales), footer ("Lun–Sáb · 20:00–01:00"), /pedir ("Lun–Sáb · 19:30 – 00:00", antes decía Mar–Dom, inconsistente) y la tarjeta "Carta abierta" del form (días y etiqueta "Lunes a sábado"). Fallback martes–sábado si la base no responde. `diasToLabel` ahora dice "Martes a sábado" para tramos consecutivos. Kiku Libre: sin el escabeche (pendiente del 15/09). Tests vitest: 43.
- **Dashboard — Menú → tab "Mediodías"** (`MediodiaTab.jsx`): prender/apagar, hasta 12 placas (drag o flechas para ordenar, la 1ª es portada, alt editable), días/horario (texto), título/bajada/descripción/notas, vista previa. Las fotos se achican a 1600 px y se convierten a WebP en el navegador antes de subir (`src/lib/imagenesWeb.js`): las placas de 1,2 MB quedan en ~90 KB. Los menús/precios se muestran de solo lectura con link a Configuración → Reservas (única fuente; la web muestra "desde" el más barato). Bucket `menu-images`, prefijo `mediodia/`.
- **Lunes a la noche**: SQL 37 pone `reservas_dias.noche = true` para dow 1. Desde ese momento la web entera lo refleja (reservas, pedidos, footer, pedir). Para cambiarlo después: Configuración → Reservas → Lunes → Noche (hay un aviso nuevo ahí explicando que rige toda la web).
- Las 6 placas de octubre están en `Downloads\medio dias kiku Octubre 2026-…\medio dias kiku Octubre 2026\mediodia-01..06.png`: se suben desde el tab (elegir las 6 juntas), en ese orden.
- Orden de aplicación: SQL 37 → parche dashboard + push → parche web + push (Vercel) → en el dashboard, Menú → Mediodías: subir placas, revisar textos, prender → en Configuración → Reservas revisar que los menús de mediodía tengan los precios de octubre ($32.000 cocina / $40.000 sushi omakase; el seed viejo decía 38.000/30.000).

## Últimos cambios (2026-10-09) — Impresión: conexión mantenida, letra nunca chica y cola por la PC

**TODO APLICADO Y FUNCIONANDO el 09/10** (Manu confirmó): 4 parches pusheados (GitHub master `816e789`; en el medio Actions commiteó `comandera-print: build v1.0.12`), SQL 36 corrido, Vercel deployado. La impresión desde celulares sale por la PC del local automáticamente.
- **Conexión mantenida** (`printerClient.js`): el dashboard conecta al cargar, reconecta sola si se corta, sondea cada minuto (socket "abierto pero muerto" tras dormir la PC), reintenta una vez si se corta al mandar; timeout de impresión 8 s → 20 s (con 8 s se daba por fallado un ticket que salía igual → doble, uno por el diálogo de Windows con letra chica).
- **Letra chica**: dos causas posibles. (1) plan B = diálogo de Windows, que escala el ticket (síntoma: aparece la ventanita de imprimir). (2) Comandera Print con más columnas de las que entran: reparte el ancho del rollo entre las columnas (`chars_per_line` 48 en 58 mm → letra diminuta). Comandera Print **1.0.12** pone piso de 11 puntos por carácter y envuelve las líneas largas en vez de achicar; Ajustes avisa si las columnas superan 32 (58 mm) / 48 (80 mm). La ventana negra loguea `papel=58mm · N columnas` por ticket.
- **Cola de impresión** (`docs/COLA_IMPRESION.md`): un celular que no llega a Comandera Print deja el ticket en `cola_impresion`; la PC conectada a la impresora (dashboard abierto) **lo imprime sola** y muestra un cartelito "Impreso desde un celular"; el pop-up grande con sonido aparece solo si un ticket falló (Reintentar / Descartar). Destildando "Imprimir automáticamente en esta PC" en ese pop-up, pide confirmar cada ticket (se guarda en esa PC). El celular ve "Enviado a la PC… → Impreso". Reserva atómica entre dos PCs; colgados >60 s se re-ofrecen; >15 min vencen; limpieza a los 7 días. Si la PC respondió pero la impresora dio error, NO se encola (diálogo del navegador como antes).
- Diagnóstico del 09/10: la PC "noeli" imprime bien (log "✔ impreso"); el celu de la captura estaba en **4G** (sin Wi-Fi) → no llega a 192.168.100.200. Manu dice que sí está en Wi-Fi: entonces probar `http://192.168.100.200:8442` desde el celu; si no carga, firewall de Windows en la PC (`netsh advfirewall firewall add rule name="Comandera Print" dir=in action=allow protocol=TCP localport=8442,8443`) o wifi de invitados con aislamiento. Con la cola, igual imprime por la PC.
- **4º parche `impresion-solo-por-la-pc.patch` (09/10, decisión de Manu)**: nadie usa la IP de red. Cada dispositivo prueba Comandera Print en su propia máquina (`127.0.0.1:8443`, `HOST_PC`); la PC del local conecta, los celulares fallan en silencio y mandan todo directo a la cola. Se borró `PrinterStatusBanner.jsx` (banner rojo + "Cambiar dirección") y el campo "Servidor de impresión" de Ajustes (ahora "Buscar impresoras en esta PC"). `server_host` queda en la tabla sin uso. Requisito único: en la PC del local, dashboard abierto + Comandera Print abierto + certificado instalado en esa PC (ya está).
- Pendiente Comandera Print (lado Go, después de un servicio): ping/pong, correrlo como tarea programada que se relanza sola, desactivar suspensión de la PC.

## Últimos cambios (2026-10-08) — 2FA obligatorio DESACTIVADO (decisión de los directivos)

La capa 2 se aplicó el 07/10 (parche 1036cd9 + SQL 31) y el 08/10 los directivos pidieron sacar el QR. SQL-CIERRES 35: `mfa_roles = ''`, `current_app_role()` vuelve a la versión de la capa 1 (sin exigir aal2) y `mfa_roles()` devuelve `{}`, con lo que `MfaGate` deja pasar a todos sin QR ni código. No se tocó el código del front: el panel "Últimos accesos", el chip 2FA y el reset siguen. Para reactivar algún día: `update private.config set valor = 'admin,finanzas' where clave = 'mfa_roles'` y volver a definir `current_app_role()` como en 20261008000000.
Queda activo de la capa 2: cierre por inactividad (12 h roles de `mfa_roles`… ahora vacío → todos 7 días) y el registro de accesos.

## Últimos cambios (2026-10-08) — Seguridad capa 2 (2FA, inactividad, accesos)

**⚠ PENDIENTE DE APLICAR (stand by, decidido el 06/10 a la noche con gente trabajando).** Hacerlo de día, antes del servicio, en el orden de abajo. Mientras tanto NO correr el SQL 31: deja sin datos a admin/finanzas hasta que configuren el código.

Parche `seguridad-capa2.patch` + SQL-CIERRES 31 (= migración 20261008000000). Doc: `docs/SEGURIDAD_CAPA2.md`.
**Orden**: (1) Supabase → Authentication → Multi-Factor Auth → habilitar TOTP (si no, el QR falla), (2) correr 31, (3) `git am` + push, (4) `supabase functions deploy admin-usuarios`.
- `private.config.mfa_roles` = `admin,finanzas`. `current_app_role()` → null para esos roles si el JWT no tiene `aal = 'aal2'`. `rol_declarado()` y `mfa_roles()` para el front. `log_accesos(p_limit)` lee `auth.audit_log_entries`.
- Front: `components/auth/MfaGate.jsx` (alta con QR / desafío) envuelve a PermisosProvider en App.jsx; `hooks/useCierrePorInactividad.js` (12 h / 7 d); `components/personal/AccesosPanel.jsx`; chip 2FA y botón "resetear 2FA" en UsuariosSection; `lib/mfa.js`.
- Edge admin-usuarios: acción `mfa_reset` (auth.admin.mfa.listFactors/deleteFactor + cerrar_sesiones_de_usuario) y campo `mfa` en listar.
- Llave de emergencia `es_admin_permisos_de_emergencia()` NO exige 2FA (a propósito).
- Captcha (Turnstile) quedó fuera por decisión de Manu; rate limits se bajan a mano en Supabase.
- Pendiente capa 3: auditoría de cambios sensibles (menú, permisos, usuarios, facturas), backup restaurable fuera de Supabase, alertas.

## Últimos cambios (2026-10-07) — Seguridad capa 1 (cerrar la base a anon)

Parches `seguridad-capa1-dashboard.patch` y `seguridad-capa1-web.patch` + SQL-CIERRES 29 (diagnóstico) y 30 (= migración 20261007000000).
**Orden**: (1) correr 29, (2) correr 30, (3) `git am` + push de la WEB (si no, la web no puede crear pedidos), (4) dashboard, (5) `supabase functions deploy push-web` y `arca-comprobantes`, (6) secreto push: `PUSH_WEB_SECRET` en Edge Functions → Secrets y el mismo valor en `update private.config set valor = '...' where clave = 'push_web_secret'`.
- `current_app_role()` → null sin sesión. anon: EXECUTE solo en crear_pedido_web, crear_reserva, crear_lista_espera, slots_disponibles; SELECT solo en menu_items, menu_item_variantes, especiales, especial_pasos, aperturas_especiales, envio_config, envio_zonas, reservas_config, reservas_dias, web_config. Policies anon de pedidos/pedido_items borradas. Default privileges: funciones nuevas → authenticated + service_role, nunca public/anon.
- **Si se agrega una tabla/función que la web deba usar, hay que dar el GRANT a anon a mano.**
- `crear_pedido_web()` reemplaza el insert de `Pedidos.tsx`; precio del menú manda; 5 pedidos/10 min por teléfono.
- Vistas con security_invoker (menos vista_jornadas*, que ya lo tenían).
- `private.config` (push_web_url, push_web_secret) + `push_web_post()`; redefinidas notificar_push_pedido, enviar_a_cocina, marcar_item_listo, marcar_tanda_lista.
- Edge: push-web exige `x-push-secret`; arca-comprobantes exige `puede_cobrar()`.
- Pendiente capa 2: 2FA admin/finanzas, captcha+rate limit login, expiración de sesión, rotar token GitHub/service key/VAPID, log de accesos.
- Nota: `web_config` entero es legible por anon (incluye `banco_cuenta`). Mover a una vista pública si molesta.

## Últimos cambios (2026-10-06, 4º parche) — Rediseño "Kiku Noche"

Parche `redisenio-kiku-noche.patch` (94 archivos, solo visual). Sin SQL.
**Aplicar con `git am --keep-cr`**: `src/pages/Login.jsx` tiene CRLF y sin
`--keep-cr` el parche no aplica. (Regla general de ahora en más: si un parche
toca un archivo CRLF, decirle a Manu `--keep-cr`.)
- `index.css`: tokens nuevos. Oscuro: fondo #0B0712, tarjeta #160F24,
  `--accent` violeta #3D2A5C (fondos sólidos con texto blanco),
  `--accent-lift` champagne #E8D4A2 (texto activo/links), `--cta` degradé
  champagne con `--cta-text` oscuro. Claro: papel #F7F3EE, violeta como
  acción. Tokens de estado `--ok/--warn/--bad/--info` (+ `-soft`).
- Regla `[style*="var(--cta)"] { color: var(--cta-text) !important }`: los
  botones principales (antes `linear-gradient(135deg, var(--accent),
  var(--accent-deep))`, ahora `var(--cta)`) toman el texto correcto aunque
  tengan `text-white`. Para botones nuevos usar `background: 'var(--cta)'`
  o la clase `.btn-cta`.
- Fuentes: Cormorant Garamond (h1, marca, clase `font-display`) + Manrope
  (`--font-ui`). Google Fonts en index.html.
- Literales de estado retocados en los .jsx (#f87171→#F2708C, #34d399→#5FD3A3,
  #fbbf24→#F2B35C, #4f8ef7→#7FA6F0, etc.). NO se tocaron: componentes de
  gráficos (recharts usa `fill=` y no acepta var()), `mesaColors.js`,
  `lib/finanzas.js` (colores de categoría), `lib/printing.js`.
- Cómo se verificó: `vite preview` + Playwright con sesión falsa en
  localStorage (`sb-example-auth-token`) y rutas de Supabase mockeadas;
  capturas en /caja /mesas /cocina /menu en ambos temas.

## Últimos cambios (2026-10-06, 3º parche) — Fecha en Caja y refacturar tras NC

Parche `fecha-y-refacturar-tras-nc.patch`. Sin SQL.
- Tarjeta de pedido en Caja: dd/mm hh:mm (antes solo hora).
- `lib/fiscal.js`: `getAuthorizedComprobante()` ahora devuelve solo la factura
  VIGENTE (no anulada por NC por el total). Nuevos `getFacturasAutorizadas`,
  `notasDeFactura` (por `cbte_asociado_id`; NC sin vínculo → única factura),
  `facturaAnulada`, `getComprobantesAnulados`. Con esto un pedido con B
  anulada vuelve a "Facturar + ticket" y se le puede hacer la A.
- OJO al calcular totales: "facturado" debe sumar TODAS las facturas
  (`getFacturasAutorizadas`) y restar las NC aparte; si se usa solo la
  vigente, la NC se resta dos veces. Ya corregido en useFacturacion.stats y
  en reporteContable.

## Últimos cambios (2026-10-06, 2º parche) — Reporte Excel y egresos en Totales

Parche `reporte-excel-contadores.patch`. Sin SQL.
- `src/lib/reporteContable.js`: `armarHojas()` (puro, testeable) +
  `exportarReporteContable()` (import dinámico de `xlsx` 0.18.5 → chunk
  aparte de ~140 KB gz). Hojas: Resumen, Cobros, Pagos, Sueldos por mes,
  Sueldos detalle. Sueldos = egresos categoría `sueldos` agrupados por
  `empleado` (join) y mes de `fecha`.
- `lib/pagos.js`: `cargarEgresosPeriodo(desde, hasta)` — egresos pagados por
  `fecha`; si el embed de empleados falla por RLS, reintenta sin él.
- Caja: botón "Exportar Excel" (solo con `caja_historico`) y la tarjeta
  Totales suma No facturado, Pagado (egresos) y Cobrado − pagado.
- Pendiente: Manu les preguntó a los contadores si necesitan algo más.

## Últimos cambios (2026-10-06) — Bugs de mesas y menú

Parche `bugs-mesas-y-variantes.patch` + SQL-CIERRES 28 (dos migraciones).
- **Aviso a cocina en mesas** (migración 20261006000000): abrir_mesa crea un
  pedido vacío y los triggers de INSERT avisaban ahí. Ahora, si `mesa_id` no
  es null, el INSERT no avisa (ni push `notificar_push_pedido` ni campanita
  `notif_on_pedido_insert`); `enviar_a_cocina` en el PRIMER envío con comida
  manda push type INSERT + fila en `notificaciones` ("🍽️ Nuevo pedido · Mesa
  N", mensaje = detalle). `webNotifs.js` igual (ignora INSERT con mesa_id y
  escucha `notificaciones`). Delivery/take/web sin cambios.
- **Variantes vendidas** (migración 20261006010000): `useMenu.updateItem`
  sincroniza variantes por id (antes borraba y recreaba → FK 23503). FK
  `pedido_items.variante_id` → ON DELETE SET NULL.
- Probado en pgserver (esquema_base + migraciones desde 0817): abrir mesa = 0
  avisos; solo bebida = 0 a cocina; primeros platos = 1 push + 1 campanita;
  agregado = ITEMS_AGREGADOS; delivery igual que antes.
- Nota: mandar SOLO bebidas pone el pedido en 'listo' y al mozo le llega
  "platos listos" (comportamiento previo, no tocado).

## Últimos cambios (2026-10-02) — Facturación ARCA

Parche `factura-a-y-errores-arca.patch` (dashboard). SQL-CIERRES 27 = diagnóstico ARCA.
- **Causa del rechazo "[-1] ARCA no devolvió CAE"** (factura 524, 30/09 21:03):
  `fecha_emision` salía de `toISOString()` (UTC) → después de las 21 h quedaba con
  fecha de mañana. El 30/09 eso dio 01/10 y ARCA rechaza si CbteFch pasa al mes
  siguiente de la fecha de envío. Ahora `fechaHoyAR()` en `lib/fiscal.js`.
- El motivo real de un rechazo viene en las Observaciones (Obs), no en Err: el
  front (`mensajeRechazoArca`) y la Edge Function ahora lo muestran/guardan.
  La Edge Function cambiada requiere `supabase functions deploy arca-comprobantes`.
- Factura A en Cobrar mesa y Cerrar pedido (`components/caja/ElegirComprobante.jsx`,
  helpers en `lib/comprobante.js`). Factura A solo a RI o Monotributo.
- Lint baseline: **31**.

## Últimos cambios (2026-09-29) — Stock en tres niveles

**Estado al cerrar (30/09):** commit `03c3000` pusheado a master (Vercel lo
deployó). Al arrancar la próxima sesión: confirmar con Manu que el SQL 26
está corrido (si no, guardar recetas falla) y revisar un pedido cerrado con
`select stock_descontado, descuento_detalle from pedidos order by created_at
desc limit 5;` para ver que el descuento automático anda.
Doc para el equipo: "Cómo baja el stock en Kiku" (Claude Docs,
https://claude.ai/code/artifact/ab1cd444-5857-45c0-85ae-c6fd70c44f30).

Decisiones de Manu: stock negativo permitido; rolls como stock de servicio
con conteo al cierre; todas las subrecetas pasan a producción intermedia con
stock propio; la venta descuenta al cerrar/cobrar.

- **Niveles**: `stock.tipo_stock` = materia_prima | produccion (intermedia) |
  servicio (rolls armados, unidad "roll"). `recetas.tipo` = final |
  intermedia | servicio, y `recetas.lleva_stock`. Trigger: toda receta que
  lleva stock tiene su ítem (se crea solo, se renombra con la receta).
  `es_subreceta` queda como espejo de `tipo`.
- **LA REGLA** (`explotar_receta()` en SQL y `src/lib/stockNiveles.js` en el
  front, tienen que coincidir): se baja por la receta y se descuenta en el
  primer nivel con stock propio. Roll de 10 piezas: receta final rinde 10 y
  lleva "1" del roll de servicio → vender 5 piezas descuenta 0,5 roll.
- **Venta**: trigger `trg_pedidos_stock_por_estado`. Al pasar a entregado
  descuenta (`descontar_stock_pedido`, movimientos tipo `salida` con
  `pedido_id`); al salir de entregado devuelve. Si falla, el cobro sigue y el
  error queda en `pedidos.descuento_detalle.error`. El descuento desde el
  navegador (flag VITE_ENABLE_ORDER_STOCK_DISCOUNT) se sacó.
- **Producción**: `completar_tarea_produccion` misma firma, pero con receta
  ignora `p_consumos` y calcula con la regla.
- **Conteo**: `registrar_conteo_stock(jsonb, nota)`; botón "Conteo de cierre"
  en Inventario > Servicio. `stock_minimo` en servicio = "Objetivo".
- Editar un ítem de stock ya no manda `stock_actual` (pisaba ventas).
- Arreglado el `.catch()` sobre `supabase.rpc` en `agregarItemsPedido`.
- SQL-CIERRES: 23 (diagnóstico), 24 (crea `registrar_movimiento_stock`, que
  faltaba en la base — CORRIDO), 25 (preview), 26 (migración).
- Probado contra el esquema real de producción (`provision/esquema_base.sql`
  cargado en pgserver con stubs de auth/net) + escenario completo.

## Cambios anteriores (2026-09-16)

Sesión de mantenimiento. Todo pusheado y con SQL corrido. Parches verificados
con `git am` sobre un clon limpio antes de entregar. Lint: la baseline ahora
es **32** (no 31).

**Web** (`kiku-sushi-web`)
1. Header: link "Mediodías" → `/reservar?experiencia=kiku_mediodia`. Se
   ajustó el espaciado entre 1024 y 1400 px para que no se pise con el logo.
2. Kiku Libre (inicio): se sacó la mención al escabeche de entrada.

**Dashboard** (`kiku-sushi-dashboard`)
3. **Menú: ocultar/mostrar un producto ya no borra el precio.** `updateItem`
   escribía `precio: null` en cualquier update parcial. `toggleActive` ahora
   solo toca `activo`. Migración 20260915: trigger que mantiene
   `menu_items.precio_num` como último precio conocido. SQL-CIERRES 14/15/16
   (diagnóstico, recuperación, trigger). Quedaron a mano: HH Aperol, Trucha,
   Tiradito de pejerrey.
4. **Fichaje con confirmación** (migración 20260916000000). Causa real de los
   turnos "cortados": la pantalla fichaba sola al abrirse y Chrome, al
   restaurar la pestaña con `?ficha=TOKEN`, volvía a fichar (salida fantasma
   a mitad de turno; la salida real quedaba como entrada). Ahora el token se
   saca de la URL al instante, vence a los 5 min, y hay botón "Registrar
   ENTRADA/SALIDA". `fichar(p_tipo_esperado, p_corregir_salida)`: valida lo
   confirmado y permite correr una salida por QR de las últimas 10 h
   ("Estoy terminando mi turno"). Aviso de doble escaneo (<30 min).
5. **KDS por plato** (migración 20260916010000): una tarjeta por ítem, tres
   columnas NUEVOS → EN PREPARACIÓN → LISTO PARA SERVIR (botón EN MESA, lo
   marca el mozo; recién ahí desaparece). `menu_items.va_a_cocina` (false en
   bebidas; switch "Pasa por cocina" en Menú). `pedido_items.servido_at`.
   RPCs `tomar_item`, `marcar_item_servido`. El estado del pedido ignora las
   bebidas. Platos (mozo) tiene EN MESA por plato.

## Pendientes

### ▶ MAÑANA (07/10) — hacer de día, antes del servicio, en este orden
1. **Confirmar que anoche se cerró el tema facturas**: SQL 34 corrido, parche
   `factura-anulada-y-sin-duplicados` pusheado (GitHub ya lo tiene: 1c2827c),
   `supabase functions deploy arca-comprobantes` hecho, SQL 33 corrido (antes
   confirmar razón social del pedido 891: "INDIGO IA SAS" / 30719022126).
   Verificar: pedido 904 muestra su Factura A y se reimprime el ticket.
2. **Nota de crédito en ARCA** para la Factura A duplicada 00002-00000002
   (pedido 891, $147.000). Hoy se hace desde Comprobantes en línea; opción:
   agregar al dashboard un botón "NC a factura duplicada" sobre comprobantes
   en estado `anulado` con nota DUPLICADA.
3. ~~Seguridad capa 2~~ APLICADA el 07/10 y el 2FA desactivado el 08/10 (SQL 35). (parche `seguridad-capa2.patch` ya está en la
   carpeta del dashboard + SQL 31): (a) Supabase → Authentication →
   Multi-Factor Auth → habilitar TOTP; (b) `git am` + push del parche y
   esperar Vercel; (c) correr SQL 31; (d) Manu entra y configura su código;
   después el encargado si es admin; (e) `supabase functions deploy
   admin-usuarios`; (f) Rate Limits a 10/5 min y contraseña mínima 10.
   Ver `docs/SEGURIDAD_CAPA2.md`. Revocar el token viejo de GitHub.
4. Probar un pedido real desde kikusushi.ar (capa 1 cambió cómo se crea).
5. ~~Impresión (09/10)~~ HECHO y funcionando. Ver sección 09/10.

### ▶ PRÓXIMA SESIÓN — con qué seguir
- **Repo como fuente de verdad (21/10)**: aplicar `repo-fuente-de-verdad.patch` (dashboard) y `web-limpieza-y-gitattributes.patch` (web), borrar los sueltos de Desktop\kiku, hacer la puesta a punto de la Mac (`docs/DOS-MAQUINAS.md`). A partir de ahí Claude lee CONTEXTO.md del repo y lo actualiza dentro del parche del dashboard.
- **Cierre de caja (21/10)**: `git am cierre-contado-no-negativo.patch` + push. Correr SQL 47 y corregir el origen de los pagos en efectivo del 20/10 (o cargar el ingreso que faltó) antes de cerrar ese turno; si no, cerrar con contado real (0) y queda sobrante de $260.000.
- **Cuentas del negocio (20/10)**: correr SQL 46 → `git am pagos-cuentas-negocio.patch` + push → en Configuración → Negocio revisar las dos cuentas sembradas (Galicia, Mercado Pago KIKU SUSHI) y cargar las que falten.
- ~~Combos (19/10)~~ HECHO (2296fc9 en GitHub; confirmar SQL 45 corrido).
- **Kiku Libre con vino (18/10)**: aplicar `web-kiku-libre-vino.patch` + push; en el dashboard Menú → Kiku Libre poner precio 60000. Verificar kikusushi.ar/sushi-libre.
- **Del doc "dash kiku", lo que FALTA (repaso 18/10, detalle en Project `kiku/PEDIDOS_EQUIPO.md`)**: (1) Checklist: sección nueva, por perfil (admin/finanzas/cocina/mozos), habilitada en todos los perfiles, con resumen en la página de inicio junto a las tareas de producción — hay que definirla con Sofi/Chino antes de programar. (2) Caja: al clickear una orden mostrar los datos del cliente (hoy solo despliega el cobro); el recuadro de datos fiscales (CUIT/PV/comandera) está como chips grises a la izquierda, pidieron naranja arriba a la derecha. (3) Menú → Ajustar precios: botón "igualar delivery/takeaway al salón" para los productos iguales (no existe; solo hay % y monto). (4) Liquidación: poder editar un turno abierto (hoy solo se puede borrar; el lápiz exige salida). (5) Proyección de pagos: pagos fijos recurrentes / cuotas no existen (solo pagos futuros sueltos). (6) Redondeo a 30 min: se resolvió distinto (minutos exactos desde 22/08) — confirmar con el equipo que les sirve así.
- **Fichas (15/10)**: ~~SQL 43 + parche unidad/reventa~~ HECHO (7c26509). ~~buscador de ingredientes~~ HECHO (0e2e01e).
- **Combos por piezas (15/10)**: SQL 44 (`44-combos-por-piezas.sql`) + parche `combos-por-piezas.patch` (base ff479d9). `combo_items.piezas_por_unidad` (NULL = unidades de receta; valor = cantidad en piezas, una unidad trae N). Botón "unid./piezas" por fila en ComboModal. Combos no descuentan stock, solo costeo.
- **Caja > Pagos (15/10)**: ~~parche `pagos-buscador.patch`~~ HECHO (ff479d9) (lupa para buscar pagos por nombre/proveedor/empleado/medio/monto, filtra sobre el período elegido; `PagosPanel.jsx`). Después mirar Producto → Recetas: pestaña "Bebidas y reventa" tiene que tener las ~40 bebidas; si alguna quedó en Productos finales, editarla y tildar "Reventa".
- **Anticipación + legibilidad (14/10)**: ~~dashboard~~ pusheado (036c0b5); web pusheada (06aa158). Falta solo confirmar que corrió el SQL 42. SQL 42 + `dashboard-reservas-anticipacion.patch` (dashboard, base 59c9a27) y en la web, en este orden, `web-reservas-anticipacion.patch` y `web-formularios-legibles.patch` (base 5fcace3). Después de deployar: ver kikusushi.ar/reservar y /pedidos desde el celular.
- **Bugs 13/10**: parche `arreglos-usuarios-stock-fichajes.patch` pusheado (c283154). Confirmar que SQL 39 se corrió y `supabase functions deploy admin-usuarios` se hizo. Usuario raro = escáner automático (`bee@…oastify.com`, 10/09, sin rol, nunca entró): borrado por Manu el 13/10. Falta: apagar "Allow new users to sign up" en Supabase → Authentication → Providers → Email; ~~correr **SQL 41** + parche `seguridad-sin-rol-sin-acceso.patch`~~ HECHO el 14/10 (SQL corrido, commit 59c9a27 en GitHub).
- **Pedidos lunes (12/10)**: aplicar SQL 38 + los dos parches `*-pedidos-dias-propios.patch`.
- **Mediodías (10/10)**: parches YA en GitHub. Falta confirmar: SQL 37 corrido, subir las 6 placas desde Menú → Mediodías y prender la sección; actualizar precios de los menús de mediodía en Configuración → Reservas. Verificar en kikusushi.ar: header "Mediodías", /mediodias, bloque del home, footer "Lun–Sáb".
- **Verificar en servicio real** la cola: que las comandas desde celulares salgan solas en la PC
  y que el cartelito "Impreso desde un celular" aparezca. Si algo falla, en la PC el pop-up
  muestra el motivo (Reintentar / Descartar); en Supabase, `select * from cola_impresion order by creado_at desc`.
- **Comandera Print lado Go** (un día sin servicio): ping/pong en el websocket, correrlo como
  tarea programada de Windows que se relanza sola, desactivar suspensión de la PC. Y ver si
  conviene que la cola la consuma el .exe directo (sin dashboard abierto) con un token en
  `private.config` + RPC para anon: hoy depende de que el dashboard esté abierto en la PC.
- **Limpieza opcional**: `server_host` en `impresion_config` ya no se usa; `docs/IMPRIMIR_SIN_GGEZPRINT.md`,
  `GUIA-IP-FIJA-PC-IMPRESORA.md` y `comandera-print/INSTRUCCIONES.md` hablan de IP/certificado en
  celulares: actualizar cuando haya tiempo (ya no hace falta nada de eso).
- GitHub: la credencial de Windows quedó logueada con la cuenta que SÍ tiene acceso (se borró
  `manuelcarreras-cloud`). Si vuelve el 403 en push: `cmdkey /delete:"git:https://github.com"` y
  reloguear.

### Después
- Capa 3: auditoría de cambios sensibles (menú, permisos, usuarios,
  facturas), backup restaurable fuera de Supabase, alertas al celular.
- Web: link "Mediodías" y sacar el escabeche nunca llegaron a GitHub (los
  parches del 15/09 se perdieron); rehacer.
- Rediseño: gráficos de Analíticas, colores de mesas y de categorías de
  pagos siguen con la paleta vieja.
- Contadores: preguntar si necesitan algo más en el Excel.
- Stock: recetas de rolls de servicio, 289 productos sin receta, combos.
- `web_config` entero legible por anon (incluye `banco_cuenta`).

### Fichajes: Manu confirmó el 29/09 que quedaron OK (diagnóstico 22 limpio)
### (lo de abajo queda como historial)
- [ ] **Vanina Romero**: marcas invertidas desde el 08/08 (entra ~17:00 como
      salida, sale ~01:15 como entrada). El sistema le cuenta turnos de 15 a
      112 h. Confirmar horario real y armar SQL que invierta las marcas.
      Revisar si esas semanas figuran "pagado" (horas de más).
- [ ] **Facundo Godoy**: 12/08 invertido (00:04→18:04 = 18 h). Salida del
      21/08 y del 15/09 sin fichar → cargar a mano.
- [ ] **Sofía Rodríguez**: doble escaneo al llegar (turnos de 12–22 min) y sin
      salida real. Cargar salidas a mano.
- [ ] **Máximo Sinturión**: cruces del 16/08 y 20/08.
- [ ] Mejora propuesta: que Liquidación muestre a los empleados con jornada
      abierta ("turno abierto, sin sumar") en vez de esconderlos.

### KDS (recién deployado, ver en servicio real)
- [ ] Revisar en la tablet que las 3 columnas entren; ajustar si queda apretado.
- [ ] Revisar la lista de "Sin cocina" en Menú (la regla automática fue por
      categoría: bebidas, vinos, tragos, cafés, infusiones).

### Stock (después del 26)
- [ ] Cargar recetas de "Roll de servicio" y vincular cada producto final
      (rinde = piezas por roll, ingrediente = 1 roll de servicio).
- [ ] Revisar las unidades de los ítems de intermedia creados en "porc".
- [ ] 289 productos activos del menú sin receta: no descuentan nada.
- [ ] Trigger viejo `trigger_descontar_stock` en pedido_items (tablas
      ingredientes/escandallo): evaluar sacarlo.
- [ ] Combos no descuentan stock (no tienen vínculo con el menú).

### Bugs encontrados en la auditoría del 29/09 (sin arreglar)
- [x] Mesas: a cocina le suena al ABRIR la mesa, no al mandar platos. (06/10)
- [x] Menú: editar un producto con variantes vendidas falla (FK). (06/10)
- [ ] Clientes: sin cumpleaños no se puede guardar (`cumpleanos: ''`).
- [ ] Finanzas/Pagos: "150.000" se guarda como $150 (`Number()`).
- [ ] Caja: re-cerrar un turno viejo pisa `cierre_at` y desordena el arrastre.
- [ ] Liquidación: esconde a quien solo tiene un turno abierto.

### De antes, sin tocar
- [ ] `3-revisar-grupo-b.sql`: 6 turnos con esperado distinto sin huella ×100.
- [ ] `caja_historico` es restricción de pantalla, no de datos.
- [ ] Pilotos Comandera (Etapa 1), dominio comandera.com.ar, Instagram, INPI.
- [ ] Zona de envío automática por dirección (geocoding).
- [x] 11 archivos `.patch` viejos commiteados en la raíz del dashboard y 36
      `.fuse_hidden*` en la web: limpiados el 21/10.
