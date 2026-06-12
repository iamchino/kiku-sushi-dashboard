# Guía: rol Mozo + App Android (Kiku Sushi)

## Parte 1 — Activar el rol mozo en Supabase

### 1.1 Correr la migración SQL

1. Entrá a [supabase.com](https://supabase.com) → tu proyecto → **SQL Editor**.
2. Abrí el archivo `supabase/migrations/20260611000000_rol_mozo.sql` de este proyecto, copialo entero y pegalo en el editor.
3. Tocá **Run**.
4. Repetí con `supabase/migrations/20260611010000_device_tokens.sql` (tokens para notificaciones push).

> ⚠️ **Mirá los mensajes al correr la primera migración.** Si aparece un
> WARNING tipo *"la funcion public.cerrar_mesa exige is_admin()"*, esa función
> fue creada a mano en tu base y solo deja pasar al admin. Solución: en el SQL
> Editor buscá la función (Database → Functions → cerrar_mesa → ver definición)
> y reemplazá `public.is_admin()` por `public.puede_cobrar()` (mozo + admin)
> o `public.is_operational_user()` (mozo + cocina + admin), según corresponda.

### 1.2 Crear el usuario mozo

1. Dashboard de Supabase → **Authentication** → **Users** → **Add user** → *Create new user*.
2. Email: `mozos@kikusushi.com` (o el que quieras) y una contraseña. Marcá **Auto Confirm User**.
3. Ahora asignale el rol. Andá al **SQL Editor** y corré:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || '{"role": "mozo"}'::jsonb
where email = 'mozos@kikusushi.com';
```

4. Listo. Cuando ese usuario inicie sesión va a ver solo: **Mesas**, **Platos** y **Stock**.

> Si el usuario ya tenía la sesión abierta, tiene que cerrar sesión y volver a
> entrar para que el rol nuevo cargue en su token.

### 1.3 Verificar el usuario de cocina (ya estaba OK)

Corré esto para confirmar:

```sql
select email, raw_app_meta_data->>'role' as rol
from auth.users;
```

- `cocina@kikusushi.com` debe decir `cocina` (o nada: ese mail tiene el rol forzado en el código).
- Cocina ve: Operaciones, Órdenes, Menú, Producción, Inventario y Recetas. ✅

### Qué puede hacer cada rol

| | Admin | Cocina | Mozo |
|---|---|---|---|
| Mesas: abrir, cargar items, cerrar | ✅ | ❌ | ✅ |
| Cobrar (registrar pago en el turno de caja) | ✅ | ❌ | ✅ |
| Abrir/cerrar turno de caja, arqueo | ✅ | ❌ | ❌ |
| Stock / inventario (modificar) | ✅ | ✅ | ✅ |
| Platos listos / en preparación | ✅ | ✅ (KDS) | ✅ (vista Platos) |
| Recetas, Producción | ✅ | ✅ | ❌ |
| Analíticas, Clientes, Caja/ARCA, Config | ✅ | ❌ | ❌ |

**Nota sobre la vista Platos:** cuando el pedido es de una mesa, el botón dice
"SERVIDO EN MESA" y NO cierra el pedido (la mesa se cierra al cobrar). Para
pedidos de mostrador/delivery dice "ENTREGADO" y sí lo cierra.

---

## Parte 2 — Compilar la app Android

La app ya está configurada con **Capacitor** (carpeta `android/` del proyecto).
Es una app instalable de verdad: ícono propio, pantalla completa sin barra de
navegador, notificaciones con sonido y vibración.

### 2.1 Requisitos (una sola vez)

1. Instalá **Android Studio**: https://developer.android.com/studio
2. Abrilo una vez y dejá que descargue el SDK (acepta todo lo que pida).

### 2.2 Compilar e instalar

En la carpeta del proyecto:

```bash
npm run android:open
```

Eso compila la web, la sincroniza y abre Android Studio. Después:

1. Esperá a que termine "Gradle sync" (barra de abajo).
2. **Para probar:** conectá el celu por USB (con *Depuración USB* activada en
   Opciones de desarrollador) y tocá ▶ Run.
3. **Para generar la APK e instalarla en todos los dispositivos:**
   Menú **Build → Generate App Bundles or APKs → Generate APKs**.
   La APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.
   Pasala por WhatsApp/Drive al celu y a la tablet, y abrila para instalar
   (Android va a pedir permitir "instalar apps de origen desconocido").

> 💡 En la tablet de cocina, después de instalar: abrí la app, logueate con
> `cocina@kikusushi.com` y dejala fijada (Ajustes → Pantalla → fijar app) para
> que no se cierre por accidente.

### 2.3 Notificaciones

**Ya funcionan con la app abierta o en segundo plano** (sonido + vibración):
- Mozo: cuando un pedido pasa a "listo" → 🍣 *Pedido listo*
- Cocina: cuando entra un pedido nuevo → 🔥 *Nuevo pedido*

**Para que lleguen también con la app cerrada** (push reales vía Firebase),
hay 4 pasos extra (opcional, se puede hacer después):

1. **Firebase:** entrá a https://console.firebase.google.com → *Add project*
   (nombre: kiku-sushi). Dentro del proyecto: *Add app* → Android →
   package name: `com.kikusushi.app`. Descargá `google-services.json` y
   ponelo en `android/app/google-services.json`. Recompilá la app.
2. **Service account:** en Firebase → ⚙ Project settings → *Service accounts*
   → *Generate new private key*. Se descarga un JSON.
3. **Edge function:** con la CLI de Supabase:
   ```bash
   supabase functions deploy push-pedidos --no-verify-jwt
   supabase secrets set FCM_SERVICE_ACCOUNT="$(cat ruta/al/archivo.json)"
   ```
4. **Webhook:** Dashboard de Supabase → **Database → Webhooks** → *Create*:
   - Tabla: `pedidos` · Eventos: **Insert** y **Update**
   - Tipo: *Supabase Edge Function* → `push-pedidos`

Con eso, cada pedido nuevo notifica a cocina y cada plato listo notifica a los
mozos, aunque tengan el celu bloqueado.

### 2.4 Actualizar la app cuando cambies el dashboard

Cada vez que cambies algo del código web:

```bash
npm run android:sync
```

y volvé a generar la APK (paso 2.2). La app y la web comparten el mismo código.

---

## Archivos que se agregaron/tocaron

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/20260611000000_rol_mozo.sql` | Permisos del rol mozo en la base |
| `supabase/migrations/20260611010000_device_tokens.sql` | Tabla de tokens push |
| `supabase/functions/push-pedidos/index.ts` | Edge function que manda los push |
| `src/context/role.js` | Rol mozo con sus rutas permitidas |
| `src/pages/Platos.jsx` | Vista de platos listos/en preparación |
| `src/components/layout/BottomNav.jsx` | Barra inferior por rol (celu) |
| `src/lib/native.js` | Push + notificaciones locales (Capacitor) |
| `capacitor.config.json` + carpeta `android/` | La app Android |
