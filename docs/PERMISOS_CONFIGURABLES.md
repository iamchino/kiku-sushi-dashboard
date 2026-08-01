# Permisos configurables — diseño y estado

Objetivo: que "qué puede hacer cada rol" se edite desde una pantalla, en vez de
vivir hardcodeado en `src/context/role.js` y en ~40 policies de Postgres.

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 0 | Cimientos de seguridad (rol solo desde `app_metadata`, RLS faltante) | ✅ en master |
| 1 | Tablas `roles` / `recursos` / `rol_permisos` + `tiene_permiso()` + seed | ✅ esta branch |
| 2 | El front lee la matriz de la base en vez de `role.js` | pendiente |
| 3 | Pantalla de edición en Personal | pendiente |
| 4 | Migrar las policies a `tiene_permiso()` y sacar `"admin full access"` | pendiente |

**La fase 1 no cambia el comportamiento de nadie.** Crea las tablas y las
siembra calcando exactamente lo que hace hoy `role.js`, pero todavía nadie las
lee. Es seguro aplicarla en producción sin tocar el front.

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

Compara la matriz del seed contra `canAccessRoute()` de `role.js`, recurso por
recurso y rol por rol (115 comparaciones). Sale con código 1 ante cualquier
diferencia. Requiere `npm ci` previo, porque `role.js` importa React.

Corrélo cada vez que toques el seed o `role.js` hasta que termine la fase 2 —
después la fuente de verdad pasa a ser la base y el script se retira.

## Pendientes conocidos para la fase 2

- **El Sidebar tiene una segunda capa de gating** que la matriz no modela:
  los flags `adminOnly`, `finanzasOnly` y `rolFinanzasOnly` de `NAV_ITEMS`
  controlan visibilidad de menú aparte del acceso. Hoy mozo tiene
  `/configuracion` permitido pero el Sidebar se lo esconde (llega por el
  BottomNav). Al pasar la UI a la matriz hay que decidir si eso se unifica.
- **`Configuracion.jsx` filtra por tabs**: mozo ve solo Impresoras, admin ve las
  cuatro. No hay recursos `config_impresoras` / `config_envio` / etc. Si la UI
  se maneja solo con la matriz, mozo se gana la sección completa salvo que ese
  gate siga hardcodeado o se agreguen sub-recursos.
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
