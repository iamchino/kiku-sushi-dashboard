# Kiku con esteroides — Ideas, mejoras y automatizaciones

**Fecha:** 12 de junio de 2026
**Base:** relevamiento completo de ambos repos (`kiku-sushi-dashboard` + `kiku-reservations-main`) + investigación de tendencias gastro-tech 2026.

> **Cómo leer esto:** cada idea tiene impacto (💰 plata / ⏱️ tiempo / 😍 experiencia) y esfuerzo (🟢 días / 🟡 semana(s) / 🔴 grande). Al final hay un roadmap sugerido de 90 días. Casi todo reutiliza infraestructura que **ya tenés**: Supabase (pg_net, pg_cron, edge functions, realtime), Wasender, ARCA, la app Android y la tabla `clientes`.

---

## 0. Lo que ya tenés (para no proponerte lo que ya existe)

Web pública premium con reservas por experiencia, pedidos delivery/takeaway, carta y especiales editables. Dashboard con: pedidos, mesas con grupos, reservas con cupos, menú, producción, stock de dos depósitos, recetas con subrecetas, caja con turnos/arqueo/pago dividido/nota de crédito/gift card, facturación ARCA, impresión de comandas, clientes, analíticas (KPIs, heatmap, donut por canal), notificaciones realtime + push FCM, roles admin/cocina/mozo, app Android, WhatsApp automático vía Wasender, pedidos programados y proveedores.

Es una base **muy** por encima del promedio para un local chico. Los esteroides van en 7 ejes.

---

## 1. 🔴 Primero lo primero: deuda crítica que frena todo lo demás

Estas no son "ideas nuevas" — son las trabas que ya documentaste (`DOCS_PRODUCCION_Y_STOCK.md`, `GO_LIVE_DASHBOARD`) y que bloquean las automatizaciones de las secciones 4 y 5. Sin stock confiable no hay forecast, ni compras automáticas, ni costos en vivo.

| # | Qué | Impacto | Esfuerzo |
|---|-----|---------|----------|
| 1.1 | **Migrar los RPCs faltantes** de descuento/reversión de stock por venta, en un solo RPC transaccional (`descontar_pedido(p_pedido_id, p_consumos jsonb)`) | ⏱️💰 | 🟢 |
| 1.2 | **Política de stock insuficiente**: dejar de truncar a 0. Permitir negativo con movimiento `tipo='faltante'` auditable | 💰 | 🟢 |
| 1.3 | **Modo de receta `batch` vs `directo`** para eliminar el doble descuento producción/venta | 💰 | 🟡 |
| 1.4 | **Encender `VITE_ENABLE_ORDER_STOCK_DISCOUNT=true`** una vez resuelto 1.1–1.3 | 💰 | 🟢 |
| 1.5 | **Snapshot de costo** (`precio_unitario_en_consumo` en `stock_movimientos`) → habilita toda la analítica de margen de la sección 5 | 💰 | 🟢 |
| 1.6 | **Email de respaldo con Resend** (edge function `pedido-email-alert`) — ya lo tenías especificado, es 1 día | ⏱️ | 🟢 |

---

## 2. 🤖 Automatizaciones WhatsApp (el canal que ya tenés cableado)

Ya mandás WhatsApp saliente vía Wasender con `pg_net` desde triggers. La jugada es exprimir ese mismo caño con `pg_cron` (Supabase lo trae) para mensajes programados. En Argentina WhatsApp es **el** canal: más del 65% de los consumidores prefiere pedir por ahí.

### 2.1 Confirmación de reserva T-24h (anti no-show) — 💰😍 · 🟢
Job de `pg_cron` diario: busca reservas de mañana en estado `confirmada` y manda "Hola {nombre}! Te esperamos mañana a las {hora} para {experiencia}. Respondé SÍ para confirmar o CANCELAR si no llegás". El no-show es la sangría silenciosa de los menúes por pasos (Umami, Pacífico tienen cupos chicos los martes — una mesa vacía es un % enorme del cupo). Solo el recordatorio, sin respuesta automática, ya baja no-shows; la lectura de la respuesta puede ser manual al principio (el mensaje llega al WhatsApp del local).

### 2.2 Recordatorio de pedido programado — ⏱️ · 🟢
Ya tenés `pedidos_programados`. Mismo patrón: aviso al cliente "tu pedido sale en 30 min" y aviso a cocina con anticipación configurable.

### 2.3 Encuesta post-visita + embudo de reseñas Google — 💰😍 · 🟢
2 horas después de cerrar la mesa o entregar el delivery: "¿Cómo estuvo todo? 1–5". Si responde 4–5 → "¡Gracias! ¿Nos dejás una reseña? {link directo a Google Reviews}". Si responde 1–3 → alerta interna a la dueña para recuperar al cliente **antes** de que la mala experiencia llegue a Google. Las reseñas son el SEO local más barato que existe.

### 2.4 Campañas segmentadas desde la tabla `clientes` — 💰 · 🟡
Ya acumulás clientes con teléfono y historial. Segmentos automáticos: "no viene hace 60 días" (mensaje de reactivación con beneficio), "vino 3+ veces" (invitación a especiales nuevos antes que nadie), "siempre pide delivery" (promo takeaway). Una pantalla en el dashboard: elegir segmento → plantilla → enviar por Wasender con rate-limit. **Ojo:** opt-out simple ("respondé BAJA") para no quemar el número.

### 2.5 Cumpleaños — 😍 · 🟢
Campo `fecha_nacimiento` en `clientes` (se pide en la reserva web, opcional) + job diario: "¡Feliz cumple {nombre}! Esta semana tenés un postre de regalo si venís a celebrarlo". Costo cero, fidelidad altísima.

### 2.6 Bot de reservas/pedidos por WhatsApp (fase 2) — 💰 · 🔴
Un agente que toma reservas y pedidos conversacionalmente (los casos de n8n + WhatsApp + IA ya son estándar en 2026). Sugerencia: **no** arrancar acá; primero exprimir 2.1–2.5 que son salientes y simples. El bot entrante requiere webhook de Wasender + manejo de estado de conversación + escalamiento a humano.

---

## 3. 🍽️ Operación de salón

### 3.1 QR por mesa: carta + llamar mozo + pedir cuenta — 😍⏱️ · 🟡
Un QR por mesa que abre la carta (ya existe en la web) con 3 botones: "Llamar al mozo", "Pedir la cuenta", "Pedir agua". Cada tap inserta en una tabla `mesa_llamadas` → notificación realtime a la app del mozo (infra ya existente: canal realtime + push). No hace falta self-ordering completo (la tendencia 2026 marca que el pedido digital en mesa pierde peso vs. servicio personal — y Kiku es premium); esto es lo mejor de los dos mundos: el cliente no espera con la mano levantada y el mozo no pasea de más.

### 3.2 Tiempos objetivo en el KDS — ⏱️ · 🟢
Cada pedido en Cocina muestra cronómetro desde su creación con colores (verde < 15 min, amarillo < 25, rojo > 25, configurable por canal). Métrica derivada en Analíticas: tiempo promedio de preparación por día/hora/plato. Hoy tenés el KDS pero sin presión de tiempo visible.

### 3.3 Propinas digitales con QR de Mercado Pago — 😍 · 🟢
QR de propina (alias MP del pozo común) impreso en el ticket de cierre. Cada vez menos gente lleva efectivo; las propinas se están perdiendo.

### 3.4 Mapa de salón con estados en vivo en TV — ⏱️ · 🟡
Vista fullscreen de `/mesas` para una tablet/TV en la barra: colores por estado (libre / ocupada / esperando plato / cuenta pedida / reservada en 30 min). El dato de "reservada en 30 min" cruza con `reservas` y evita el clásico "sentamos walk-ins en la mesa reservada".

### 3.5 Apertura/cierre con checklist — ⏱️ · 🟢
Checklist diario configurable (encender heladeras, control de temperatura del pescado, limpieza) con firma de quién lo hizo. Para un local de pescado crudo, el registro de temperatura además es un respaldo bromatológico. Tabla simple + pantalla en Operaciones.

---

## 4. 📦 Stock, compras y producción

### 4.1 Lotes con vencimiento + FEFO — 💰 · 🔴
Ya lo tenés identificado como largo plazo. Para sushi es el upgrade más valioso del inventario: tabla `stock_lotes` (fecha_ingreso, vencimiento, cantidad), consumo del lote que vence primero, y alerta "vence en 48 h" en el dashboard y por WhatsApp interno. Reduce merma real (plata) y riesgo sanitario.

### 4.2 Sugerencia de compra automática → pedido al proveedor por WhatsApp — ⏱️💰 · 🟡
Cruce que ya está casi servido: `stock_actual` + `stock_minimo` + tabla `proveedores` (migración del 12/6) + consumo promedio de los últimos 14 días. Botón "Generar pedido de compra": agrupa faltantes por proveedor, arma el mensaje y lo manda por Wasender al proveedor (o lo deja listo para revisar). La dueña pasa de "recorrer la heladera anotando" a "aprobar una lista ya armada".

### 4.3 Forecast de demanda simple — 💰 · 🟡
No hace falta IA pesada: promedio móvil por día de semana + flag de feriado + clima (una API gratuita) ya predice "este jueves vas a vender ~X rolls". Salida: lista de producción **pre-armada** cada mañana (ya existe `produccion_listas` — el sistema la genera como borrador y la dueña ajusta). Los sistemas de predicción son la categoría con mejor ROI reportado en gastro-tech 2026; tu versión casera captura el 80% del valor.

### 4.4 Recuento físico asistido — ⏱️ · 🟢
Pantalla "inventario rápido" para el celu: lista de ítems, tipeás lo contado, el sistema genera los movimientos `ajuste` y un reporte de diferencias (lo contado vs. lo teórico). Hacerlo semanal detecta a tiempo los errores de recetas/mermas que hoy se acumulan invisibles.

---

## 5. 📊 Inteligencia de negocio

### 5.1 Ingeniería de menú (la matriz estrella/perro) — 💰 · 🟡
Tenés recetas con costo + ventas por ítem: cruzalos. Matriz de popularidad × margen: **Estrellas** (vender más, no tocar), **Vacas** (populares, margen bajo → subir precio o bajar costo), **Puzzles** (margen alto, poca venta → empujar con mozos/web), **Perros** (sacar de la carta). Una pantalla nueva en Analíticas. Es de las palancas de rentabilidad más probadas en gastronomía y la data ya está en tu base.

### 5.2 Margen en vivo por plato con alertas — 💰 · 🟢
Con el snapshot de costos (1.5): cuando el precio de un insumo sube y el margen de un plato cae bajo un umbral (ej. 55%), alerta en el dashboard: "El Centolla roll quedó con 41% de margen — el precio de la centolla subió 30%". En Argentina, con precios moviéndose todo el tiempo, esto solo paga el proyecto entero.

### 5.3 Reporte diario automático por WhatsApp a la dueña — ⏱️ · 🟢
`pg_cron` a las 00:30: "Hoy: $X facturados (+12% vs mismo día sem. pasada) · 43 cubiertos · 18 delivery · ticket prom $X · top: Kiku 12p · 2 reservas mañana". La dueña deja de entrar al dashboard "para ver cómo fue el día" — le llega solo. Es el feature con mejor relación valor/esfuerzo de todo este documento.

### 5.4 Cierre mensual contable en un click — ⏱️ · 🟢
Export a Excel/CSV del mes: ventas por canal, IVA, facturas ARCA emitidas, movimientos de caja, compras. Hoy el contador probablemente lo pide a mano; un botón "Descargar mes" en Caja lo resuelve.

### 5.5 Cohortes y retención de clientes — 💰 · 🟡
Con `clientes` + pedidos/reservas: % de clientes nuevos que vuelven dentro de 30/60/90 días, frecuencia promedio, LTV aproximado. Responde la pregunta más importante del negocio: ¿la gente vuelve? Alimenta los segmentos de 2.4.

---

## 6. 🌐 Web pública y ventas

### 6.1 Pago online del pedido (Mercado Pago Checkout) — 💰 · 🟡
Hoy el pedido web se confirma sin pago. Integrar Checkout Pro: el cliente paga al pedir (o seña 50%), se elimina el "pidió y nunca vino a buscar" y se acelera la entrega. Webhook de MP → marca el pedido `pagado` → notificación a cocina. Es la integración con más impacto directo en caja de toda la lista.

### 6.2 Seña para reservas de experiencias — 💰 · 🟡
Mismo Checkout para reservas de Omakase/Umami/Pacífico (cupos chicos, costo de insumo alto): seña de $X por persona al reservar, descontable de la cuenta. Combinado con 2.1, el no-show en experiencias tiende a cero. Configurable por experiencia desde el dashboard.

### 6.3 Gift cards vendibles online — 💰 · 🟡
Ya aceptás gift cards como descuento en caja. Cerrar el círculo: página `/regalo` donde se compra online (MP), genera código único, llega por WhatsApp/email al regalado. Las gift cards son plata adelantada y clientes nuevos garantizados.

### 6.4 Páginas individuales por experiencia + SEO local — 💰 · 🟡
Ya estaba en tu backlog (`/omakase`, `/umami-del-sur`...). Sumarle: datos estructurados schema.org/Restaurant (menú, horarios, reseñas), y contenido pensado para "omakase rosario", "sushi premium rosario". Con los especiales ahora en Supabase, estas páginas se alimentan solas.

### 6.5 Lista de espera con aviso automático — 😍 · 🟡
Si no hay cupo para la fecha elegida, en vez de "probá otra fecha": botón "avisame si se libera". Tabla `reservas_espera`; cuando alguien cancela, el trigger ya existente puede notificar al primero de la lista por WhatsApp. Cupos chicos + cancelaciones = mesas que hoy se pierden.

### 6.6 Completar la migración V2 — 😍 · 🟡
`/pedidos`, `/carta` y `/sushi-libre` siguen en paleta vieja y el swap de home está pendiente. Cerrar esto antes de invertir en marketing: el primer click de una campaña no puede caer en la versión vieja.

---

## 7. 🛡️ Infraestructura y tranquilidad

| Idea | Por qué | Esfuerzo |
|------|---------|----------|
| **Backup externo automático** de Supabase (pg_dump semanal a un storage aparte vía GitHub Action) | El negocio entero vive en esa base; el backup del plan free/pro no es tuyo | 🟢 |
| **Entorno de staging** (segundo proyecto Supabase + branch deploy en Vercel) | Hoy probás migraciones contra producción | 🟡 |
| **Healthcheck + alerta** (cron que verifica web, RPC de reservas y Wasender; si algo falla, WhatsApp interno) | Enterarte por el sistema y no por un cliente enojado | 🟢 |
| **Tests E2E del flujo de plata** (Playwright: pedido web → aparece en dashboard → cobrar → facturar) | El GO_LIVE los dejó manuales; automatizarlos protege cada deploy | 🟡 |
| **CI en GitHub** (lint + build + tsc en cada push) | Los node_modules Windows-only ya muestran que el build no se valida seguido | 🟢 |
| **Aplicar migraciones con `supabase db push`** en vez de copy-paste al SQL Editor | Elimina el drift entre repo y base (los RPCs faltantes de stock nacieron de ahí) | 🟢 |

---

## 8. 💡 Ideas "locas" (estacionar, no descartar)

**Sommelier digital de maridaje:** la carta web sugiere vino/sake por roll (data estática curada por el itamae, no IA). Diferenciador premium barato. · **Precios dinámicos suaves:** happy hour automático martes/miércoles temprano (los días flojos según tu heatmap) con precios que la web ya toma de Supabase. · **Contador de cupos en vivo en la web:** "Quedan 4 lugares para el Omakase del viernes" — urgencia real, dato que ya existe. · **Programa de puntos:** 1 punto por $1000, canjeable por especiales; requiere identificar al cliente en cada compra (teléfono en caja). · **Kiosco takeaway:** tablet en mostrador para pedir sin hacer cola los viernes. · **Cámara + conteo de salón:** medir ocupación real vs. reservas (overkill hoy).

---

## 9. Roadmap sugerido — 90 días

### Mes 1 — Cimientos + el golpe rápido
1. Deuda crítica de stock (1.1–1.4) y snapshot de costos (1.5)
2. Email de respaldo Resend (1.6)
3. **Reporte diario por WhatsApp (5.3)** ← la dueña siente el valor en la semana 1
4. Confirmación de reservas T-24h (2.1)
5. Backup externo + `supabase db push` + CI (sección 7)

### Mes 2 — Plata
6. Pago online de pedidos con Mercado Pago (6.1)
7. Seña para experiencias (6.2)
8. Margen en vivo + alertas (5.2)
9. Ingeniería de menú (5.1)
10. Encuesta post-visita + embudo de reseñas (2.3)

### Mes 3 — Crecimiento
11. Sugerencia de compra automática (4.2)
12. Campañas segmentadas + cumpleaños (2.4, 2.5)
13. Lista de espera (6.5)
14. QR por mesa (3.1) + tiempos en KDS (3.2)
15. Completar migración V2 + páginas por experiencia (6.4, 6.6)

**Después:** lotes FEFO (4.1), forecast (4.3), gift cards online (6.3), bot WhatsApp entrante (2.6).

---

## 10. Fuentes de la investigación

- [The Last Bite — Tendencias tecnológicas hostelería 2026](https://thelastbitemedia.com/tendencias-tecnologicas-hosteleria-2026/) (back-of-house gana prioridad sobre tecnología de cara al cliente)
- [Calisto — IA en restaurantes 2026](https://calisto.ai/es/blog/ia-transforma-operaciones-restauranteras-en-mexico-2026) (predicción de demanda y ROI de herramientas de IA)
- [DiegoCoquillat — La IA más útil está detrás de la operación](https://www.diegocoquillat.com/la-ia-mas-util-para-los-restaurantes-no-esta-delante-del-cliente-esta-detras-de-la-operacion/)
- [ITPago — Pedidos por WhatsApp en Argentina 2026](https://itpago.com/blog/como-recibir-pedidos-de-alimentos-por-whatsapp-en-argentina-2026) (preferencia de WhatsApp como canal + integración Mercado Pago)
- [AuroraInbox — Sistema de reservas por WhatsApp 2026](https://www.aurorainbox.com/2026/05/03/sistema-reservas-whatsapp-restaurantes/)
- [Xpertix — Agente IA para restaurantes con n8n y WhatsApp](https://xpertix.com/agente-ia-restaurantes-n8n-whatsapp/)
- Documentación interna: `DOCS_PRODUCCION_Y_STOCK.md`, `GO_LIVE_DASHBOARD_2026-06-09.md`, `ANALISIS_COMPETITIVO_KIKU.md`, `ESTADO_PROYECTO.md`, `INTEGRACIONES_V1.md`
