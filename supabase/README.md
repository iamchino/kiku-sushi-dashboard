# Supabase hardening notes

This folder now contains the first migration for role hardening.

Apply `migrations/20260510000000_hardening_foundation.sql` before switching users to the new client role logic. It copies existing roles from `raw_user_meta_data.role` into `raw_app_meta_data.role`, then adds helpers for RLS policies.

Apply `migrations/20260510001000_transactional_operations.sql` next. It adds:

- `public.crear_pedido_con_items(...)`: creates a `pedidos` row and all `pedido_items` in one transaction.
- `public.registrar_movimiento_stock(...)`: locks the stock row, updates `stock_actual`, and writes `stock_movimientos` in one transaction.

Apply `migrations/20260510002000_rls_policy_pack.sql` after enabling RLS. It adds full admin policies for the app tables and narrow kitchen read policies for active orders.

Apply `migrations/20260510003000_kitchen_order_transitions.sql` after that. It adds `public.avanzar_estado_pedido(...)`, so kitchen users can safely move active orders from `pendiente` to `preparando` to `listo` without broad table update permissions.

Kitchen users should get narrow policies for the exact KDS operations they need, for example reading active orders and moving `pendiente -> preparando -> listo`, but not editing prices, stock, clients, recipes, or analytics data.

## Caja, comandas y facturacion electronica

Para dejar operativa la pantalla de Caja en una base que no tenga todas las migraciones aplicadas, abrir Supabase > SQL Editor y ejecutar completo:

`supabase/SQL_EDITOR_FACTURACION_COMPLETA.sql`

Ese script crea o actualiza:

- `public.crear_pedido_con_items(...)` para que el alta de pedidos vuelva a funcionar via RPC.
- `public.avanzar_estado_pedido(...)`.
- `public.facturacion_config`.
- `public.comprobantes_fiscales`.
- `public.impresiones_documentos`.
- `public.pedidos.descuento_porcentaje`.
- Politicas RLS para usuarios operativos y administradores.

Despues de ejecutarlo, completar los datos fiscales reales:

```sql
update public.facturacion_config
set
  razon_social = 'RAZON SOCIAL DE KIKU SAS',
  nombre_fantasia = 'Kiku Sushi',
  cuit = 'CUIT SIN GUIONES',
  condicion_iva = 'Responsable Inscripto',
  domicilio = 'DOMICILIO FISCAL',
  ingresos_brutos = 'NUMERO IIBB',
  inicio_actividades = 'YYYY-MM-DD',
  punto_venta = 1,
  ambiente = 'homologacion',
  updated_at = now()
where id = (select id from public.facturacion_config order by updated_at desc limit 1);

notify pgrst, 'reload schema';
```

La impresion de comanda ya funciona desde el navegador usando el dialogo de impresion de Windows. La pantalla de Caja tambien permite editar pedidos antes de imprimir, aplicar descuento porcentual y emitir un `Ticket no fiscal` con precios marcado como `NO VALIDO COMO FACTURA`.

La emision fiscal queda preparada para llamar a un backend seguro en `VITE_ARCA_API_URL`; ese backend debe manejar certificados, WSAA y WSFE, nunca el frontend.
