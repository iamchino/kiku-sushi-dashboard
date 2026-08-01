# Permisos configurables — diseño y estado

Objetivo: que "qué puede hacer cada rol" se edite desde una pantalla, en vez de
vivir hardcodeado en `src/context/role.js` y en ~40 policies de Postgres.

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 0 | Cimientos de seguridad (rol solo desde `app_metadata`, RLS faltante) | ✅ en master |
| 1 | Tablas `roles` / `recursos` / `rol_permisos` + `tiene_permiso()` + seed | ✅ esta branch |
| 2 | El front lee la matriz de la base en vez de `role.js` | ✅ esta branch |
| 3 | Pantalla de edición en Personal | ✅ esta branch |
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

## La pantalla (fase 3)

Personal → Permisos, visible solo para quien tiene el recurso `permisos`.
Elegís un rol, tildás secciones, confirmás y guardás.

Todo lo que escribe pasa por RPC (`guardar_permisos_rol`, `crear_rol`,
`eliminar_rol`), nunca por updates sueltos: el trigger anti-lockout es diferido
y necesita ver el estado final de la transacción. supabase-js abre una
transacción por request, así que un update por checkbox habría hecho que la
guarda rechazara estados intermedios perfectamente válidos.

### Qué frena antes de guardar

- **Confirmación** que lista qué secciones se quitan, cuáles se agregan y a
  cuántas personas afecta.
- **Auto-lockout**: si te estás sacando a vos la administración de permisos,
  hay que tildar una casilla extra reconociéndolo.
- **La guarda de la base cuenta personas, no roles.** Antes contaba filas de
  `rol_permisos`: darle el permiso a un rol vacío y sacárselo a finanzas pasaba
  el chequeo y dejaba a todos afuera.

### Sobre "cerrar la sesión"

Al guardar se cierran las sesiones del rol afectado. Con una precisión
importante: borrar la sesión invalida el **refresh token**, así que la persona
no puede renovar — pero el access token que ya tiene es un JWT firmado y sigue
valiendo hasta expirar (1 h por defecto, configurable en Auth → Settings → JWT
expiry).

Para los permisos eso casi no importa: la matriz se lee de la base en cada
carga, así que el cambio aplica apenas el front la relee. Lo que sí vive dentro
del JWT es el **rol**, y por eso un cambio de rol tiene esa ventana de hasta una
hora. Si te molesta, bajá el JWT expiry a 15 minutos.

## Pendientes conocidos

- **`Configuracion.jsx` filtra por tabs**: mozo ve solo Impresoras, admin ve las
  cuatro. No hay recursos `config_impresoras` / `config_envio` / etc., así que
  ese gate sigue hardcodeado. Si se quiere granularidad ahí, hay que agregar
  sub-recursos.
- La columna `editar` existe en la base pero la UI maneja una sola casilla
  (ver). El RPC preserva el `editar` que ya tuviera cada fila, así que guardar
  no eleva permisos sin querer. La segunda columna aparece en la fase 4.

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
