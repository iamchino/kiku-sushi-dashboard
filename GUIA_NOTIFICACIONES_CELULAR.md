# Notificaciones al celular (Chrome) — cocina y mozos

Objetivo: que **cocina** reciba un aviso con sonido cuando se crea una orden, y
que cuando cocina la marca **"listo para servir"**, le suene al **mozo** — todo
en Chrome del celular, aunque el navegador esté cerrado y la pantalla bloqueada.

Esto es **Web Push** (estándar del navegador). No hace falta Firebase, ni
compilar la APK, ni instalar nada en los teléfonos.

---

## Cómo funciona

```
Cocina/mozo abre el dashboard en Chrome
        │
        ├─ toca "Activar" en el aviso de arriba  →  permiso + suscripción
        │                                            guardada en web_push_subs
        ▼
Se crea un pedido  ──►  webhook de Supabase  ──►  edge function push-web
                                                         │
   cocina marca "listo"  ──►  webhook  ─────────────────►│
                                                         ▼
                                        push cifrado al servidor de Chrome
                                                         ▼
                                    🔔 suena el celular (aunque esté bloqueado)
```

Además queda el camino viejo por **realtime**: con la pestaña abierta el aviso
es instantáneo. Los dos usan el mismo `tag` por pedido, así que nunca aparecen
dos notificaciones del mismo pedido.

| Evento | Quién recibe | Texto |
|---|---|---|
| Se crea el pedido (INSERT) | cocina + admin | 🔥 Nuevo pedido |
| Pasa a estado `listo` (UPDATE) | mozo + admin | 🍣 Listo para servir |

Al tocar la notificación se abre directo la pantalla que corresponde:
`/operaciones` para cocina, `/platos` para el mozo.

---

## Puesta en marcha (una sola vez)

### 1. Tabla en la base

Supabase → **SQL Editor** → pegá entero
`supabase/migrations/20260906080000_web_push_subs.sql` → **Run**.

### 2. Claves VAPID

Ya están generadas para este proyecto (par ECDSA P-256):

```
Pública:  BGQ4SURvRDTHRiBrE-7TR-yBJe75JSHJ8hEK1GOdRnUVHpR3tGrgpt4IAaT4y0AOxm2YyUR4NzUjSMPmrtAFvHw
Privada:  v_797khEp2zErR9LL37l_rS-exvpcSPX6ceOLAWIhWw
```

> La **privada** no va nunca al front ni al repo público: solo como secret de
> Supabase. Si querés regenerar el par:
> ```bash
> node -e "const{generateKeyPairSync}=require('crypto');const{privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const j=privateKey.export({format:'jwk'});console.log('pub',Buffer.concat([Buffer.from([4]),Buffer.from(j.x,'base64url'),Buffer.from(j.y,'base64url')]).toString('base64url'));console.log('priv',j.d)"
> ```
> Si las cambiás, todos los celulares tienen que volver a tocar "Activar".

### 3. Variable en el front (Vercel)

Vercel → proyecto del dashboard → **Settings → Environment Variables**:

```
VITE_VAPID_PUBLIC_KEY = BGQ4SURvRDTHRiBrE-7TR-yBJe75JSHJ8hEK1GOdRnUVHpR3tGrgpt4IAaT4y0AOxm2YyUR4NzUjSMPmrtAFvHw
```

Y volvé a deployar (un redeploy vacío alcanza).

### 4. Secrets + edge function en Supabase

```bash
supabase secrets set VAPID_PUBLIC_KEY=BGQ4SURvRDTHRiBrE-7TR-yBJe75JSHJ8hEK1GOdRnUVHpR3tGrgpt4IAaT4y0AOxm2YyUR4NzUjSMPmrtAFvHw
supabase secrets set VAPID_PRIVATE_KEY=v_797khEp2zErR9LL37l_rS-exvpcSPX6ceOLAWIhWw
supabase secrets set VAPID_SUBJECT=mailto:tu@mail.com

supabase functions deploy push-web --no-verify-jwt
```

### 5. Disparador en la base

Supabase → **SQL Editor** → pegá entero
`supabase/migrations/20260906090000_trigger_push_web.sql` → **Run**.

Eso crea un trigger en `pedidos` que llama a `push-web` cuando entra un pedido
o cuando pasa a `listo`.

> **Por qué un trigger y no el "Database Webhook" del dashboard:** en este
> proyecto la integración de webhooks nunca se habilitó, y el formulario falla
> con `schema "supabase_functions" does not exist`. El trigger hace exactamente
> lo mismo (un webhook de Supabase ES un trigger que llama a `net.http_post`),
> pero sin esa dependencia — y filtra en SQL, así que la edge function solo se
> invoca cuando hay algo real para avisar, en vez de en cada UPDATE.

`pg_net` es asíncrono: encola el llamado HTTP y no demora el guardado del
pedido. Si la función falla, el pedido se crea igual.

---

## Activar en cada teléfono

1. El mozo / cocina abre el dashboard en Chrome y se loguea.
2. Arriba aparece la barra **"Activá las notificaciones"** → tocar **Activar**.
3. Chrome pide permiso → **Permitir**.
4. Llega una notificación de prueba. Si suena, quedó listo.

> **Importante:** para que el aviso llegue con Chrome cerrado, conviene
> **instalar el dashboard como app**: en Chrome → menú ⋮ → *Añadir a pantalla
> de inicio*. Queda con ícono propio y Android le da más prioridad a los push.

> **Si alguien tocó "Bloquear" por error:** candado 🔒 al lado de la dirección →
> *Permisos* → *Notificaciones* → Permitir → recargar. La barra roja del
> dashboard explica esto mismo cuando detecta el bloqueo.

> **iPhone:** Web Push funciona desde iOS 16.4 y **solo** si el sitio se agregó
> a la pantalla de inicio (Compartir → *Añadir a inicio*) y se abre desde ahí.
> Desde la pestaña normal de Safari no llega nada.

---

## Probar que anda

1. Con el celu de cocina bloqueado, creá un pedido desde otro dispositivo.
   → Debería sonar 🔥 *Nuevo pedido*.
2. En cocina, marcá el pedido como listo.
   → Debería sonar 🍣 *Listo para servir* en el celu del mozo.

### Caso típico: suena con la app abierta, pero no con el celu bloqueado

Eso significa que el **realtime funciona y el push no**. Se diagnostica de
arriba hacia abajo, y el primer paso que falle es la causa:

1. **¿Se registró el teléfono?**
   ```sql
   select role, user_agent, updated_at from web_push_subs order by updated_at desc;
   ```
   Vacío = ningún celular llegó a suscribirse. Casi siempre es que
   `VITE_VAPID_PUBLIC_KEY` no estaba en Vercel cuando corrió el build (Vite la
   compila adentro del bundle: agregarla después no sirve sin redeploy).
   El dashboard ahora avisa esto solo, con una barra naranja.

2. **¿El trigger llamó a la función?**
   ```sql
   select status_code, content, created from net._http_response
   order by created desc limit 5;
   ```
   - Sin filas → el trigger no está. Revisá el paso 5.
   - `401` → la función tiene "Verify JWT" activado. Desactivalo.
   - `500` → faltan los secrets VAPID en la edge function.
   - `200` → el servidor hizo su parte; el problema es del teléfono (punto 3).

3. **¿El teléfono deja pasar el push?** Instalá el dashboard como app
   (Chrome → ⋮ → Añadir a pantalla de inicio) y, en Android, sacá la app del
   ahorro de batería: Ajustes → Aplicaciones → Kiku Ops → Batería →
   **Sin restricciones**. El ahorro de energía agresivo (Xiaomi, Samsung,
   Huawei) mata los push de las pestañas sueltas de Chrome.

Si no llega:

- Supabase → **Edge Functions → push-web → Logs**: ahí se ve `enviadas: N` o el
  error. `sin suscripciones` = ningún teléfono tocó "Activar" con ese rol.
- `select * from net._http_response order by created desc limit 5;` → las
  últimas respuestas HTTP que mandó el trigger. Un `status_code` 401 significa
  que la función quedó con "Verify JWT" activado: desactivalo (o redeployá con
  `--no-verify-jwt`).
- `select role, count(*) from web_push_subs group by role;` → cuántos teléfonos
  hay registrados por rol.
- Si un mozo cambió de rol, tiene que cerrar sesión y volver a entrar: el rol
  se guarda junto a la suscripción.

---

## Archivos de este cambio

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/20260906080000_web_push_subs.sql` | Tabla de suscripciones + RLS |
| `supabase/migrations/20260906090000_trigger_push_web.sql` | Trigger en `pedidos` que dispara la función |
| `supabase/functions/push-web/index.ts` | Manda los push (VAPID + aes128gcm, sin dependencias) |
| `public/sw.js` | Recibe el push y muestra la notificación aunque Chrome esté cerrado |
| `src/lib/webNotifs.js` | Suscripción, permisos y el refuerzo por realtime |
| `src/components/NotifStatusBanner.jsx` | Barra "Activar notificaciones" + aviso si están bloqueadas |
| `src/App.jsx` | Monta la barra en el layout |
