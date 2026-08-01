# Permisos configurables — diseño y estado

Objetivo: que "qué puede hacer cada rol" se edite desde una pantalla, en vez de
vivir hardcodeado en `src/context/role.js` y en ~40 policies de Postgres.

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 0 | Cimientos de seguridad (rol solo desde `app_metadata`, RLS faltante) | ✅ en master |
| 1 | Tablas `roles` / `recursos` / `rol_permisos` + `tiene_permiso()` + seed | ✅ esta branch |
| 2 | El front lee la matriz de la base en vez de `role.js` | ✅ esta branch |
| 3 | Pantalla de edición en Personal | pendiente |
| 4 | Migrar las policies a `tiene_permiso()` y sacar `"admin full access"` | pendiente |

**La fase 1 no cambia el comportamiento de nadie** (crea y siembra las tablas,
nadie las lee todavía) y se puede aplicar sin tocar el front.

**La fase 2 sí toca el front** y exige que la fase 1 esté aplicada en la base.
Si se deploya el front sin la migración, el fallback lo cubre —vuelve a las
reglas del código y muestra un aviso— pero no es el orden deseado: primero la
migración, después el deploy.

## Modelo

```
roles          quiénes existen. id = el valor que va en app_metadata.role del JWT
recursos       qué se puede permitir (una sección). Catálogo del código, no de la UI
rol_permisos   la matriz: para cada par rol × recurso, dos booleanos (ver, editar)
```

Ausencia de fila = sin permiso. `editar` implica `ver` (hay un CHECK).

Funciones:

- `tiene_permiso(recurso, accion)` — el helper que van a usar las policies en la
  fase 4 y la UI vía RPC. `accion` es `'ver'` o `'editar'`; cualquier otro valor
  devuelve `false` (falla cerrado, para que un typo niegue en vez de conceder).
- `puede_administrar_permisos()` — quién puede editar la matriz.

## Cómo no quedarse afuera

Los permisos ahora son **datos, no código**: un error de configuración no se
arregla con un deploy. Por eso hay tres capas:

1. **Lista blanca de emails** (`es_admin_permisos_de_emergencia()`). Está
   hardcodeada en SQL y **no se puede tocar desde la UI**. Es la llave debajo
   del felpudo: esa cuenta siempre puede entrar a arreglar la matriz.
2. **Trigger anti-lockout**: no se puede guardar un estado donde ningún rol
   tenga `permisos × editar`. Falla con un mensaje en vez de dejar el sistema
   sin administrador.
3. **Los 5 roles originales no se borran** ni se les puede quitar la marca de
   sistema ni renombrar el id (hay JWTs vivos que los referencian).

Una decisión deliberada: la lista blanca de emergencia usa su propia función y
**no** `is_finanzas_user()`. Esta última da true para cualquiera con rol
`finanzas`, y eso habría convertido al rol entero en un bypass permanente:
destildar "finanzas × permisos" desde la UI no habría tenido ningún efecto.

## Verificación

```bash
npm run verificar:permisos
```

Sale con código 1 ante cualquier diferencia. Requiere `npm ci` previo, porque
importa el código real de la app (que a su vez importa React).

Son dos scripts, 369 chequeos en total:

- `verificar-paridad-permisos.mjs` — el seed contra `canAccessRoute()`.
- `verificar-permisos-front.mjs` — la lógica de la fase 2 contra las reglas que
  reemplaza: acceso por ruta, rutas por defecto, la pantalla mínima de fichaje,
  el bypass por email de la cuenta histórica de Finanzas, el catálogo del
  fallback sincronizado con el seed, y que ninguna ruta del router se quede sin
  recurso declarado (si no, una pantalla nueva quedaría abierta a todos).

Corrélos cada vez que toques el seed, `role.js`, `permisosCore.js` o agregues
una ruta en `App.jsx`.

## Cambios de menú que trajo la fase 2

El menú ahora se deriva de la matriz, así que desaparecieron los flags
`adminOnly` / `finanzasOnly` / `rolFinanzasOnly` del Sidebar. Efectos visibles,
acordados:

- **mozo** pasa a ver *Configuración* en el menú lateral (ya podía entrar desde
  la barra inferior del celular; el Sidebar se lo escondía).
- **todos** ven *Fichar* y *Mis horas* (antes solo el rol finanzas).
- El orden del menú pasa a ser el de `recursos.orden`, que no es el mismo que
  tenía `NAV_ITEMS`: para admin, Analíticas baja y Órdenes sube.
- *Salón* (`/configuracion/salon`) y el *KDS* siguen fuera del menú a propósito
  (`FUERA_DEL_MENU` en Sidebar.jsx): se llega a ellos desde adentro de otra
  pantalla.

## Pendientes conocidos para la fase 3

- **`Configuracion.jsx` filtra por tabs**: mozo ve solo Impresoras, admin ve las
  cuatro. No hay recursos `config_impresoras` / `config_envio` / etc., así que
  ese gate sigue hardcodeado. Si se quiere granularidad ahí, hay que agregar
  sub-recursos.
- **Guardar la matriz debería ser una sola transacción.** El trigger anti-lockout
  es `deferrable initially deferred`, o sea que evalúa al cerrar la transacción.
  Si la UI manda un request por checkbox (supabase-js abre una transacción por
  request), el diferido no sirve de nada y puede rechazar un estado intermedio
  legítimo. Conviene un RPC que reciba la matriz completa.
- **El cambio de permisos no le aplica a quien ya está logueado** hasta que
  refresque el JWT (~1 hora), porque el rol viaja en el token. Igual que con el
  cambio de rol, conviene cerrar las sesiones de los usuarios del rol afectado.

## Pendientes para la fase 4

- La policy global `"admin full access"` (migración `20260615030000`) le da a
  `admin` acceso a todas las tablas que existían al 15/06/2026, por fuera de
  cualquier permiso. Mientras exista, el rol admin no es configurable.
- `pedidos` y `pedido_items` aceptan INSERT y SELECT anónimo con `using (true)`.
- `reservas`, `notificaciones` y `lista_espera` son accesibles por cualquier
  usuario autenticado, sin distinción de rol.
- ⚠️ No le saques el `security definer` a `tiene_permiso()` ni le pongas
  `force row level security` a `rol_permisos`: es lo que evita la recursión
  cuando una policy de esa tabla llama a la función.
