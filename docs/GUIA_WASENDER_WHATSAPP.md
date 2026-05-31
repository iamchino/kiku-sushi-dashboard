# Guía paso a paso — WhatsApp automático con WasenderAPI + Make

Camino elegido: **WasenderAPI** (no oficial, evita Meta/Facebook por completo). Cuando entra una reserva o pedido desde la web, llega solo un WhatsApp a Kiku.

> **Recordá el trade-off:** es no oficial → existe riesgo (bajo, pero real) de que WhatsApp bloquee el número. Por eso usamos un **número dedicado** y dejamos una **red de seguridad con Telegram** (Parte 6). Nunca uses para esto tu WhatsApp personal ni la línea principal de Kiku.

> **Estado:** Supabase ya está 100% listo (las 3 migraciones aplicadas). El webhook ya manda todos los datos a Make (lo confirmamos en tu última prueba). Solo cambia el último paso de Make. **No hay que tocar nada de Supabase ni del código.**

---

## Cómo queda el flujo

```
Reserva/pedido en la web
   → Supabase dispara el webhook (ya funciona)
   → Make lo recibe (ya funciona)
   → Make arma el cuerpo (Create JSON) y hace un POST a WasenderAPI
   → te llega el WhatsApp
```

Como WasenderAPI no usa plantillas, mandamos directo el campo **`mensaje_whatsapp`** (el texto completo con emojis y saltos de línea que ya arma Supabase). Sin plantillas, sin aprobaciones.

---

## Parte 0 — Conseguir el número emisor (dedicado)

- Conseguí un **chip/SIM aparte** (o un número que no sea crítico). Ese va a ser el **emisor** (el "bot").
- El **destinatario** (`destino`, donde querés RECIBIR los avisos) tiene que ser **otro número** — tu WhatsApp personal o el del encargado. Emisor y destinatario no pueden ser el mismo número.
- Activá WhatsApp normal en el chip emisor (instalá WhatsApp y registralo) antes de escanear.

---

## Parte 1 — Crear cuenta en WasenderAPI y conectar el número

1. Entrá a https://wasenderapi.com y creá una cuenta (tiene prueba gratis).
2. Creá una **sesión de WhatsApp** (*Create Session* / *Add Session*).
3. Te muestra un **código QR**. Desde el teléfono del **número emisor**, abrí WhatsApp → **Dispositivos vinculados → Vincular dispositivo** → escaneá el QR.
4. Cuando la sesión quede **conectada**, copiá tu **API Key / Token** (panel de la sesión o en API settings). La vas a usar en Make.

> Dejá ese teléfono con conexión y batería: si se desvincula, hay que volver a escanear. (Por eso un chip dedicado y, si podés, siempre enchufado.)

---

## Parte 2 — Make: borrar el módulo que fallaba

Abrí tu scenario (el del webhook `kiku-web`) y **borrá el módulo "WhatsApp Business Cloud"** que daba el error 133010 (click derecho → *Delete module*). El webhook lo dejás como está. Vamos a poner dos módulos nuevos: uno que arma el mensaje y otro que lo envía.

---

## Parte 3 — Armar el cuerpo del mensaje (módulo "Create JSON")

Esto evita que los saltos de línea rompan el envío (Make escapa el texto correctamente).

1. Click en el **+** después del webhook → buscá **JSON** → elegí **Create JSON**.
2. En **Data structure** → **Add** → ponele nombre `wasender_body` y agregá dos campos (botón *Add item*):
   - `to` → tipo **Text**
   - `text` → tipo **Text**
   - **Save**.
3. Ahora mapeá los valores:
   - **to:** escribí `+` y al lado insertá el campo **`destino`** del webhook → queda `+{{destino}}`.
   - **text:** insertá el campo **`mensaje_whatsapp`** del webhook.
4. **OK**. Este módulo va a generar una salida llamada **"JSON string"** (el cuerpo ya listo y bien escapado).

---

## Parte 4 — Enviar a WasenderAPI (módulo HTTP)

1. Click en el **+** después del Create JSON → **HTTP → Make a request**.
2. Configuralo:
   - **URL:** `https://www.wasenderapi.com/api/send-message`
   - **Method:** `POST`
   - **Headers** (botón *Add item*, dos):
     - `Authorization` → `Bearer TU_API_KEY` (pegá tu key después de `Bearer `)
     - `Content-Type` → `application/json`
   - **Body type:** `Raw`
   - **Content type:** `JSON (application/json)`
   - **Request content:** insertá el campo **`JSON string`** que sale del módulo Create JSON (es lo único que va en este campo).
3. **OK**.
4. Encendé el scenario: abajo a la izquierda, interruptor en **ON** (Scheduling → *Immediately*) y **Save** (disquete).

---

## Parte 5 — Verificar Supabase y probar

En el SQL Editor, confirmá la config:

```sql
select webhook_url, whatsapp_destino, activo from public.webhook_config;
```

Debe tener tu URL de Make, `activo = true` y `whatsapp_destino = '5493415051750'` (tu número, con el 9).

Probá: hacé un pedido de prueba en la web, o usá **Replay run** sobre la ejecución anterior en Make. Tiene que llegarte el WhatsApp al `destino` y los dos módulos quedar en verde.

> Si el WhatsApp no llega con `5493415051750`, probá sin el 9 (`543415051750`) en la config de Supabase. Argentina tiene esa rareza con WhatsApp; uno de los dos formatos funciona.

---

## Parte 6 (recomendada) — Red de seguridad con Telegram

Para que NUNCA te quedes sin aviso si WasenderAPI falla o bloquean el número:

1. En Telegram, hablale a **@BotFather** → `/newbot` → seguí los pasos → te da un **token** del bot.
2. Creá un grupo (ej. "Avisos Kiku"), agregá tu bot, y obtené el **chat ID** (con el bot @getidsbot, o con el propio módulo de Telegram en Make).
3. En Make, sobre el módulo **HTTP** de WasenderAPI: click derecho → **Add error handler**.
4. En esa rama de error, agregá **Telegram Bot → Send a Text Message**:
   - Conexión: pegá el token de BotFather.
   - Chat ID: el del grupo.
   - Text: mapeá **`mensaje_whatsapp`**.
5. Así, si WasenderAPI tira error, el aviso igual te llega por Telegram automáticamente.

---

## Buenas prácticas anti-bloqueo

- **Número dedicado**, nunca el personal ni la línea principal de Kiku.
- "Calentá" el número: usalo normal unos días antes de meterle el automático.
- Todos los mensajes van **al mismo destino** y son transaccionales → es el patrón de menor riesgo.
- Si alguna vez lo bloquean: cambiás el chip emisor, reescaneás el QR en WasenderAPI, y listo (Make y Supabase no cambian).

---

## Pasar a producción (cambiar al número de Kiku)

Cuando termines de probar, cambiá el destinatario al WhatsApp donde quieras recibir los avisos en el local:

```sql
update public.webhook_config set whatsapp_destino = 'NUMERO_DE_KIKU_CON_9';
```

Para apagar los avisos sin borrar nada: `update public.webhook_config set activo = false;`

---

## Si algo no llega — checklist

- En Make, abrí el historial del scenario y mirá los módulos: el rojo te dice la causa.
- Errores típicos:
  - **401 / Unauthorized** → la API Key está mal o falta el `Bearer ` adelante.
  - **Sesión desconectada** → entrá a WasenderAPI y reescaneá el QR.
  - **Da 200 pero no llega** → revisá el formato del número (`+549...` / `+54...`).
  - **JSON inválido** → asegurate de usar el módulo Create JSON (Parte 3) y no escribir el JSON a mano.
- En Supabase: `select * from public.webhook_config;` (URL correcta y `activo = true`). Los fallos del POST quedan como `WARNING` en **Logs → Postgres**.

---

## Costos

- **WasenderAPI:** desde ~US$6/mes (plan con mensajes ilimitados).
- **Make:** gratis hasta 1.000 operaciones/mes; con ~50 pedidos/día (~1.500/mes, ~2–3 ops c/u) vas a necesitar el plan **Core (~US$9–10/mes)**.
- **Telegram (fallback):** gratis.
- Total estimado: **~US$15/mes**.
