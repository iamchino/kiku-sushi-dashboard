# WhatsApp automático: reservas y pedidos de la web → Kiku

Cuando alguien **reserva** o hace un **pedido (delivery/takeaway)** desde la página, el backend dispara solo un aviso por WhatsApp al número de Kiku. El cliente no manda nada: solo ve la confirmación en pantalla.

```
Cliente reserva / pide en la web
        │
        ▼
  Supabase guarda la fila (origen='web')
        │
        ├─► notificación realtime en el dashboard      (ya existía)
        │
        └─► webhook  ──►  Make (o n8n)  ──►  WhatsApp a Kiku   (NUEVO)
```

La misma URL de webhook sirve para reservas y pedidos; cada mensaje trae un campo `evento` (`reserva_nueva_web` o `pedido_nuevo_web`) por si querés diferenciarlos.

---

## Parte A — Lo que se cambió en el código (ya hecho)

**Backend (Supabase) — 2 migraciones nuevas en `supabase/migrations/`:**

- `20260531000000_reserva_webhook_whatsapp.sql`
  - Habilita `pg_net`.
  - Crea la tabla **`webhook_config`** (una sola fila) con: `webhook_url`, `whatsapp_destino`, `activo`.
  - Trigger en `reservas` (solo `origen='web'`) → POST al webhook.

- `20260531010000_pedido_webhook_whatsapp.sql`
  - Agrega la columna **`origen`** a `pedidos`.
  - Trigger sobre `pedido_items` que, cuando entra un pedido web, arma el mensaje con cliente + items + total y hace el POST.
  - (Va sobre `pedido_items` y no sobre `pedidos` porque la web inserta primero el pedido y después los items; así el WhatsApp ya sale con el detalle.)

Ambos triggers están blindados: si el webhook falla, la reserva/pedido igual se guarda y la notificación del dashboard igual llega. Nunca bloquean una venta.

**Frontend (repo `kiku-reservations-main`):**

- `ReservationFormV2.tsx`: se quitó el redirect a WhatsApp del cliente; ahora solo muestra "Reserva confirmada".
- `Pedidos.tsx`: el insert del pedido ahora manda `origen: "web"` (para que dispare el webhook). El pedido ya mostraba la confirmación en pantalla, no tenía redirect.

---

## Parte B — Aplicar las migraciones en Supabase

Tenés dos formas. La más simple si nunca usaste la CLI:

**Opción 1 — SQL Editor (recomendada para vos):**
1. Entrá a tu proyecto en https://supabase.com → menú **SQL Editor** → **New query**.
2. Abrí el archivo `20260531000000_reserva_webhook_whatsapp.sql`, copiá TODO el contenido, pegalo y dale **Run**.
3. Repetí con `20260531010000_pedido_webhook_whatsapp.sql`.

**Opción 2 — CLI (si la tenés configurada):**
```bash
supabase db push
```

Después de correr las dos, la base ya está lista. Todavía no envía nada hasta que cargues la URL del webhook (Parte D).

---

## Parte C — Crear la automatización en Make (paso a paso, desde cero)

Vamos con **Make** (make.com) porque tiene plan gratis y no hay que instalar nada. Para enviar el WhatsApp usamos **CallMeBot**, que es gratis y manda el mensaje a TU número (ideal para un aviso interno al local). Más adelante podés cambiar a WhatsApp oficial sin tocar Supabase.

### C.1 — Activar CallMeBot en tu WhatsApp (una sola vez, 2 minutos)

CallMeBot necesita que le des permiso desde el teléfono que va a RECIBIR los avisos (el de Kiku / tu número de prueba):

1. Agregá el contacto **+34 644 51 95 23** en el teléfono.
2. Desde WhatsApp, enviale a ese número el mensaje exacto:
   `I allow callmebot to send me messages`
3. Te responde con tu **apikey** (un número, ej. `123456`). Guardalo.

> Si querés probar a tu número `5431501750`, hacé este paso desde ESE teléfono.

### C.2 — Crear el webhook en Make

1. Entrá a https://www.make.com y creá una cuenta gratis.
2. Click en **Create a new scenario** (arriba a la derecha).
3. En el círculo del medio, buscá y elegí **Webhooks** → **Custom webhook**.
4. Click en **Add** → ponele un nombre (ej. `kiku-web`) → **Save**.
5. Make te muestra una **URL** larga (ej. `https://hook.eu2.make.com/abc123...`). Copiala. **Esa es la URL que vas a cargar en Supabase.**
6. Dejá esa pantalla abierta: Make queda "escuchando" (dice *Waiting for data*).

### C.3 — Mandar un dato de prueba para que Make aprenda el formato

Para que Make conozca los campos, primero cargá la URL en Supabase (Parte D) y hacé UNA reserva o pedido de prueba en la web. Make va a capturar ese primer envío y va a "aprender" los campos (`mensaje_whatsapp`, `destino`, etc.).

> Alternativa rápida sin tocar la web: en la pantalla del webhook, Make a veces ofrece *Run once* y podés pegar un JSON de ejemplo. Si te complica, simplemente hacé el pedido de prueba real.

### C.4 — Agregar el envío de WhatsApp (módulo HTTP → CallMeBot)

1. En el scenario, click en el **+** a la derecha del webhook para agregar otro módulo.
2. Buscá **HTTP** → elegí **Make a request**.
3. Configuralo así:
   - **URL:**
     `https://api.callmebot.com/whatsapp.php`
   - **Method:** `GET`
   - En **Query String** agregá 3 parámetros (botón *Add item*):
     - `phone` → el número destino. Mapealo al campo **`destino`** que viene del webhook (o escribí `5431501750` fijo para la prueba).
     - `text` → mapealo al campo **`mensaje_whatsapp`** del webhook.
     - `apikey` → tu apikey de CallMeBot (la del paso C.1).
4. Click en **OK**.

### C.5 — Encender el scenario

- Abajo a la izquierda, poné el interruptor **ON** (Scheduling → *Immediately*) y **Save** (ícono de disquete).
- Listo: cada reserva/pedido web va a disparar el WhatsApp.

---

## Parte D — Conectar la URL del webhook en Supabase

En el **SQL Editor**, corré esto (pegando tu URL de Make del paso C.2):

```sql
update public.webhook_config
   set webhook_url      = 'https://hook.eu2.make.com/PEGA_TU_URL',
       whatsapp_destino = '5431501750',   -- número de PRUEBA (tuyo)
       activo           = true;
```

Cuando todo funcione y quieras pasarlo a producción, cambiá el destino al WhatsApp real de Kiku:

```sql
update public.webhook_config set whatsapp_destino = '549341XXXXXXX';
```

> **Formato del número:** CallMeBot y WhatsApp en general esperan el número con código de país, sin `+` ni espacios. Para Argentina suele ser `549` + característica + número (ej. el de reservas de Kiku es `5493412764562`). Dejé `5431501750` como pediste para la prueba; si el WhatsApp no llega, probá completándolo a ese formato.

Para apagar los avisos sin borrar nada: `update public.webhook_config set activo = false;`

---

## Parte E — Probar

1. Asegurate de que el scenario de Make esté en **ON**.
2. En la web, hacé una **reserva** de prueba (`/reservar`) y un **pedido** de prueba (`/pedidos`, delivery y takeaway).
3. Qué tiene que pasar:
   - En el dashboard entra la notificación realtime (como siempre).
   - En Make ves la ejecución (un "1" en el historial del scenario).
   - Te llega el WhatsApp al número de prueba.

**Si la notif del dashboard llega pero el WhatsApp no:**
- Revisá que `webhook_url` esté bien cargada y `activo = true` (`select * from public.webhook_config;`).
- En Make, mirá el historial del scenario (ícono de reloj) para ver si llegó el dato y qué respondió el módulo HTTP.
- Revisá que la apikey de CallMeBot sea la correcta y que el `phone` esté en formato internacional.
- En Supabase, los fallos del POST quedan como `WARNING` en **Logs → Postgres**.

---

## Qué recibe el webhook (campos del JSON)

**Reserva** (`evento: "reserva_nueva_web"`): `destino`, `reserva_id`, `codigo`, `fecha_txt`, `hora`, `personas`, `tipo_label`, `cliente_nombre`, `cliente_telefono`, `cliente_email`, `restricciones`, `accesibilidad`, `notas`, `mensaje_whatsapp`.

**Pedido** (`evento: "pedido_nuevo_web"`): `destino`, `pedido_id`, `numero`, `canal` (delivery/takeaway), `total`, `cliente_nombre`, `cliente_telefono`, `cliente_direccion`, `notas`, `items_texto`, `mensaje_whatsapp`.

Lo más práctico es mapear directo **`mensaje_whatsapp`** (ya viene listo con emojis y saltos de línea) y **`destino`**. Si querés diseñar tu propio texto, usá los campos sueltos.

---

## Notas

- **n8n** (la otra opción) es igual de válido: usás un nodo **Webhook** (copiás su Production URL para Supabase) y un nodo **HTTP Request** a la misma URL de CallMeBot con los parámetros `phone`, `text`, `apikey`. La diferencia es que n8n gratis es self-host (lo corrés vos); Make gratis es en la nube (más simple para empezar).
- Para producción seria (muchos mensajes, plantillas, multi-destinatario) conviene migrar el módulo de envío a **WhatsApp Business Cloud (Meta)** o **Twilio**. No hace falta tocar Supabase: solo cambiás el módulo de envío dentro de Make.
- El form V1 (`/v1`, legacy) mantiene el flujo viejo; la web principal es V2.
- La página `/sushi-libre` mantiene su botón de WhatsApp manual (es un CTA distinto, iniciado por el cliente).
