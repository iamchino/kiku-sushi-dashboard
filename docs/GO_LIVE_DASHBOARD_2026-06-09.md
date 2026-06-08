# Go-live dashboard Kiku Sushi - martes 9 de junio de 2026

## Estado ejecutivo

El dashboard esta utilizable para operar salon, pedidos, stock, recetas, caja, reservas, clientes y notificaciones. La navegacion autenticada no mostro errores visibles ni errores de consola en las rutas principales.

Cambios aplicados para apertura:

- El descuento de stock por ventas queda apagado por defecto.
- El KPI de delivery ahora representa delivery + take away de forma consistente.
- Las alertas de stock del dashboard escuchan cambios de stock en tiempo real.
- Los pedidos web guardan `menu_item_id` en `pedido_items` cuando el producto viene desde Supabase.

## Stock y recetas

Produccion:

- Sigue descontando materia prima cuando se completa una tarea con receta.
- Puede sumar stock de produccion cuando la receta genera un item producido.

Ventas:

- Salon, delivery y take away no descuentan stock por recetas en apertura.
- La bandera es `VITE_ENABLE_ORDER_STOCK_DISCOUNT=false`.
- Para activar mas adelante: cambiar a `true` y validar RPCs, recetas, subrecetas y vinculos con menu.

Riesgos a resolver antes de activar descuento por ventas:

- Validar o migrar las funciones SQL de descuento/reversion de stock por pedido.
- Evitar doble descuento entre produccion y venta.
- Definir politica de stock insuficiente: bloquear, permitir negativo o registrar faltante.
- Versionar/snapshotear recetas si se quiere auditoria historica.

## E2E autenticado

Rutas verificadas:

- `/`
- `/dashboard`
- `/pedidos`
- `/mesas`
- `/reservas`
- `/menu`
- `/produccion`
- `/stock`
- `/recetas`
- `/caja`
- `/clientes`
- `/notificaciones`
- `/operaciones`
- `/analiticas`

Resultado:

- Sin errores visibles.
- Sin errores de consola durante navegacion.
- Login OK con usuario admin.
- Datos cargan en dashboard, ordenes, mesas, reservas, menu, inventario, recetas, caja, clientes y notificaciones.

Limitacion:

- Las pruebas de click sobre algunos modales quedaron no concluyentes por timeouts del navegador de automatizacion, no por errores visibles de la app. Repetir manualmente: nueva orden, detalle de reserva, pestaña combos, arqueo de caja.

## Wasender

El codigo versionado apunta a envio directo desde Supabase hacia WasenderAPI usando `pg_net`.

Checklist de produccion:

- Migraciones `20260531000000`, `20260531030000` y `20260531050000` aplicadas.
- `public.webhook_config.activo = true`.
- `public.webhook_config.whatsapp_destino` con numero real del local.
- `public.webhook_config.wasender_api_key` cargada.
- Probar un pedido web real y una reserva web real.
- Si no llega WhatsApp, revisar Logs de Postgres: los triggers levantan `WARNING`.

Nota:

- Hay documentacion vieja que todavia habla de Make. Para apertura conviene operar un solo camino: Supabase directo a Wasender.

## Correo de respaldo

Recomendacion: Resend con Supabase Edge Function.

Motivo:

- La API key queda como Supabase Secret, no expuesta al frontend.
- Permite mandar copia interna del pedido a un correo de Kiku.
- Sirve como respaldo si Wasender falla.
- Permite logs e idempotencia para evitar duplicados.

Implementacion sugerida:

1. Crear cuenta Resend.
2. Verificar dominio o subdominio, por ejemplo `avisos.kikusushi.com`.
3. Configurar DNS: SPF/DKIM/DMARC segun Resend.
4. Crear Edge Function `pedido-email-alert`.
5. Guardar `RESEND_API_KEY`, `ORDER_ALERT_TO` y `ORDER_ALERT_FROM` como secrets.
6. Invocar esa funcion desde el trigger de pedido web o desde una automatizacion de fallback.

## Pendientes antes del martes

Prioridad alta:

- Probar pedido web real: entra en Ordenes, Notificaciones y WhatsApp.
- Confirmar Wasender con numero definitivo.
- Hacer prueba manual de nueva orden desde dashboard.
- Hacer prueba manual de abrir mesa, agregar item y cerrar/cobrar en un pedido test.
- Probar impresora/comanda si se va a usar en caja.
- Configurar correo de respaldo.

Prioridad media:

- Resolver los 3 warnings de hooks.
- Revisar stock critico/bajo cargado para no abrir con alertas excesivas.
- Alinear documentacion Wasender: directo vs Make.
- Revisar que pedidos web no usen precios absurdos de fallback o variantes sin seleccionar.
