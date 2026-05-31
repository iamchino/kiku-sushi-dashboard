# Guía paso a paso — WhatsApp automático con Make + WhatsApp Business Cloud

Objetivo: cuando entra una **reserva** o un **pedido** desde la web, llega solo un WhatsApp a Kiku. Sin CallMeBot, con la API oficial de Meta a través de Make. Pensado para que funcione de forma confiable en una noche con muchos pedidos.

> **Antes de empezar — estado actual:**
> - Las 3 migraciones de Supabase ya están aplicadas (incluida la que agrega `tipo_aviso` y `resumen`).
> - Falta: (1) crear la automatización en Make, (2) cargar la URL del webhook en Supabase. Eso es todo lo que cubre esta guía.

---

## Cómo va a quedar el flujo

```
Reserva/pedido en la web
   → Supabase dispara el webhook
   → Make lo recibe
   → Make manda una "plantilla" de WhatsApp (API oficial Meta)
   → te llega el WhatsApp
```

Usamos **una sola plantilla** que sirve para reservas y pedidos, con 4 datos: tipo, nombre, teléfono y un resumen.

---

## Requisitos (una vez)

1. Una cuenta de **Facebook**.
2. Un **portafolio de negocio** en Meta Business Suite (gratis, 2 minutos).
3. Un **número de teléfono para ENVIAR** los WhatsApp. Importante:
   - El número que envía queda "tomado" por la API. Tenés dos caminos:
     - **Número dedicado (recomendado):** una SIM/chip aparte solo para el bot. Lo más limpio.
     - **Coexistencia:** usar el mismo número de WhatsApp Business que ya usás, sin perder la app. Make lo soporta, pero **no está disponible en todos los países** — si al conectar no te deja, usá un número dedicado.
   - Los avisos te llegan a TU WhatsApp normal (vos sos el destinatario, no el emisor).

> La buena noticia: con la conexión nueva de Make **no hace falta** crear cuenta de desarrollador de Meta ni generar tokens a mano. Te conectás con Facebook y Make hace el resto.

---

## Parte 1 — Crear el portafolio de negocio en Meta

1. Entrá a https://business.facebook.com con tu cuenta de Facebook.
2. Arriba a la izquierda → **Configuración / Crear un portafolio de negocio**.
3. Poné el nombre (ej. *Kiku Sushi*), tu email y datos de contacto → **Crear**.
4. Confirmá el email que te llega.

(Si ya tenés un Business Manager para Kiku, saltá este paso.)

---

## Parte 2 — Conectar WhatsApp en Make

1. Entrá a https://www.make.com y creá una cuenta gratis (o logueate).
2. **Create a new scenario** (arriba a la derecha).
3. En el círculo del centro, buscá y elegí **Webhooks → Custom webhook**.
   - **Add** → nombre `kiku-web` → **Save**.
   - Make te da una **URL** larga (ej. `https://hook.eu2.make.com/abc...`). **Copiala y guardala** (la vas a pegar en Supabase en la Parte 5).
4. Click en el **+** a la derecha del webhook → buscá **WhatsApp Business Cloud** → elegí la acción **Send a Template Message**.
5. En **Connection** → **Add** → **Create a connection**:
   - En **Connection type** elegí **WhatsApp Business Cloud** (la nueva, no la "legacy").
   - En **Signup mode** elegí **Regular (recommended)**.
   - Nombre de conexión: `kiku` → **Save**.
   - Se abre la ventana de Facebook: logueate, aceptá permisos, y:
     - Elegí tu **portafolio de negocio** (el de la Parte 1).
     - Creá o elegí la **cuenta de WhatsApp Business (WABA)**.
     - Registrá el **número emisor** (el dedicado) o conectá tu número existente (coexistencia).
     - Seguí hasta **Finish**.
   - Si aparece "resource not found", reintentá y elegí las cuentas que ya se crearon (no las crees de nuevo).

> Meta revisa tu negocio/nombre (hasta 1 día hábil). **Mientras tanto podés mandar 5 mensajes de prueba cada 24 h**, suficiente para testear.

---

## Parte 3 — Crear la plantilla (template) "Utility"

Como el mensaje lo inicia el negocio, hay que usar una plantilla aprobada. Se crea en **WhatsApp Manager** (https://business.facebook.com/wa/manage/message-templates/) → **Create template**.

- **Category:** `Utility` (utilitaria) ← importante, es la barata/confiable.
- **Name:** `kiku_aviso_web` (en minúsculas y con guión bajo, obligatorio).
- **Language:** Español (si está, *Spanish (ARG)*; si no, *Spanish*).
- **Body** (pegá esto tal cual):

```
🔔 Kiku Sushi — nuevo {{1}} desde la web

👤 {{2}}
📞 {{3}}
📋 {{4}}

Entrá al panel para gestionarlo. 👈
```

- Cuando te pida **ejemplos** de las variables (para la aprobación), poné:
  - {{1}} → `pedido DELIVERY`
  - {{2}} → `Juan Pérez`
  - {{3}} → `3415051750`
  - {{4}} → `2x California Roll, 1x Gyoza · Total $8000 · #12 · Av. Pellegrini 123`
- **Submit**. La aprobación suele tardar de minutos a 1 día.

> Reglas que ya cumple este texto: no empieza ni termina con variable, y no hay variables pegadas entre sí. No las muevas o Meta puede rechazarla.

---

## Parte 4 — Armar el envío en Make

Volvé al scenario (webhook → Send a Template Message).

### 4.1 Que Make "aprenda" los datos
1. Primero cargá la URL en Supabase (Parte 5) y hacé **una reserva o pedido de prueba** en la web.
2. En Make, el webhook captura ese primer envío y aprende los campos (`tipo_aviso`, `cliente_nombre`, `cliente_telefono`, `resumen`, `destino`, etc.).

### 4.2 Configurar el módulo "Send a Template Message"
- **Phone Number ID / From:** elegí el número emisor (lo seleccionás de la lista).
- **To / Recipient:** mapealo al campo **`destino`** que viene del webhook.
- **Template:** elegí `kiku_aviso_web`.
- **Language:** el mismo que elegiste al crearla.
- **Body parameters** (te van a aparecer 4 campos, {{1}} a {{4}}):
  - {{1}} → campo **`tipo_aviso`**
  - {{2}} → campo **`cliente_nombre`**
  - {{3}} → campo **`cliente_telefono`**
  - {{4}} → campo **`resumen`**
- **OK**.

### 4.3 Encender
- Abajo a la izquierda, poné el scenario en **ON** (Scheduling → *Immediately*) y **Save** (disquete).

---

## Parte 5 — Cargar la URL del webhook en Supabase

En el **SQL Editor** de Supabase, corré esto pegando tu URL de Make y tu número de prueba:

```sql
update public.webhook_config
   set webhook_url      = 'https://hook.eu2.make.com/PEGA_TU_URL',
       whatsapp_destino = '5493415051750',   -- tu número de prueba
       activo           = true;
```

> **Formato del número (importante):** para WhatsApp, los celulares argentinos van con **54 + 9 + característica + número**, solo dígitos, sin `+` ni espacios. Tu número es `5493415051750` (54 · 9 · 341 · 505 1750). Si lo cargás como `543415051750` (sin el 9) puede no llegar.

Verificá que quedó bien:
```sql
select webhook_url, whatsapp_destino, activo from public.webhook_config;
```

---

## Parte 6 — Probar

1. Scenario de Make en **ON**.
2. En la web: hacé una **reserva** (`/reservar`) y un **pedido** delivery y otro takeaway (`/pedidos`).
3. Qué tiene que pasar:
   - En el dashboard entra la notificación (como siempre).
   - En Make ves la ejecución (historial del scenario, ícono de reloj).
   - Te llega el WhatsApp al número de prueba.

---

## Parte 7 — Pasar a producción (cambiar al número de Kiku)

Cuando esté todo OK, cambiá el destinatario al WhatsApp real de Kiku con un solo comando en el SQL Editor:

```sql
update public.webhook_config set whatsapp_destino = '5493412764562';
```

(`5493412764562` es el número de Kiku que ya usás en la web; cambialo si querés otro). No hace falta tocar Make ni el código: el `destino` viaja en el webhook y Make lo usa como destinatario.

Para apagar los avisos temporalmente sin borrar nada:
```sql
update public.webhook_config set activo = false;
```

---

## Si algo no llega — checklist

- **Llega la notif del dashboard pero no el WhatsApp** → es de Make/Meta para abajo.
- En Make, abrí el historial del scenario y mirá el módulo de WhatsApp: el error te dice la causa.
- Errores típicos:
  - *Template not found / not approved* → la plantilla todavía no está aprobada, o el nombre/idioma no coincide.
  - *Re-engagement / 24h window* → estás usando "Send a message" en vez de "Send a **template** message". Usá la plantilla.
  - *Invalid recipient* → revisá el formato del número (`549...`).
  - Durante la revisión inicial de Meta: recordá el límite de 5 mensajes de prueba cada 24 h.
- En Supabase: `select * from public.webhook_config;` (URL correcta y `activo = true`). Los fallos del POST quedan como `WARNING` en **Logs → Postgres**.

---

## Costos (resumen)

- **API de Meta:** usar la API es gratis; pagás por mensaje. Los "Utility" son baratos (centavos; en Argentina se factura en pesos desde abril 2026). Para un restaurante, unos pocos dólares al mes — y gratis si el aviso cae dentro de una ventana de 24 h de conversación.
- **Make:** gratis hasta 1.000 operaciones/mes (cada pedido ~2). Con mucho volumen, plan **Core ~US$9–10/mes** (10.000 ops).
- Estimado producción: **~US$10–20/mes**, casi $0 al principio.
