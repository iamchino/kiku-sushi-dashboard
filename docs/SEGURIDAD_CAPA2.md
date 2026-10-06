# Seguridad · Capa 2 — Segundo factor, sesiones y accesos

## Qué hace

- **2FA obligatorio para admin y finanzas.** La base solo reconoce esos roles
  cuando la sesión pasó el código (JWT `aal = 'aal2'`). Con contraseña sola,
  `current_app_role()` devuelve null y ninguna policy ni RPC responde. El
  dashboard lo detecta (`MfaGate.jsx`) y muestra el QR o pide el código.
  Los roles se cambian en `private.config` → `mfa_roles` (ej. `admin,finanzas`).
- **Cierre por inactividad** (`useCierrePorInactividad.js`): admin/finanzas
  12 h sin usar el dashboard, el resto 7 días. Es del lado del navegador.
- **Últimos accesos** en Personal › Usuarios (`log_accesos()`): ingresos,
  salidas, 2FA, cambios de contraseña, con IP.
- **Resetear 2FA** desde Personal › Usuarios (ícono de escudo tachado) cuando
  alguien cambia de celular: borra sus factores y cierra sus sesiones.

## Pasos en Supabase (una sola vez)

1. **Authentication → Multi-Factor Auth**: habilitar **TOTP** (app
   authenticator). Sin esto, el alta del QR falla.
2. **Authentication → Rate Limits**: bajar "Sign in / sign up" a 10 por
   5 minutos por IP (frena el probar contraseñas en loop).
3. **Authentication → Providers → Email**: contraseña mínima 10 caracteres,
   "Letters, digits and symbols". Si el plan lo permite, activar
   "Leaked password protection".
4. Correr la migración `20261008000000` (SQL-CIERRES 31).
5. `supabase functions deploy admin-usuarios` (acción `mfa_reset` y la
   columna `mfa` en el listado).

## Rotar lo que se filtró

- **GitHub**: Settings → Developer settings → Personal access tokens →
  revocar el token viejo. No hace falta crear otro para el circuito actual.
- **Supabase service_role / anon**: Project Settings → API Keys. Si el
  proyecto tiene el sistema nuevo de claves (publishable / secret), crear una
  secret key nueva, cargarla en Vercel y en las Edge Functions, y borrar la
  vieja. Si solo están las legacy, rotar el JWT secret desloguea a todos y
  obliga a redeployar web + dashboard: hacerlo un día sin servicio.
- **VAPID**: no se filtraron; dejarlas. Regenerarlas obliga a reactivar las
  notificaciones en cada celular.

## Primer ingreso de cada admin/finanzas

Entra con su contraseña → pantalla "Activá el segundo factor" → escanea con
Google Authenticator → escribe el código → entra. De ahí en más, cada vez que
inicia sesión le pide el código. Mientras la sesión siga viva (hasta 12 h de
inactividad) no vuelve a pedirlo.

## La llave de emergencia

`es_admin_permisos_de_emergencia()` (email `finanzas@kikusushi.com.ar`) sigue
funcionando sin 2FA a propósito: es la forma de destrabar la matriz de
permisos si se rompe. Ese usuario tiene que tener contraseña fuerte y 2FA
igual (la base no se lo exige, pero conviene).
