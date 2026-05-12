# Supabase hardening notes

This folder now contains the first migration for role hardening.

Apply `migrations/20260510000000_hardening_foundation.sql` before switching users to the new client role logic. It copies existing roles from `raw_user_meta_data.role` into `raw_app_meta_data.role`, then adds helpers for RLS policies.

Apply `migrations/20260510001000_transactional_operations.sql` next. It adds:

- `public.crear_pedido_con_items(...)`: creates a `pedidos` row and all `pedido_items` in one transaction.
- `public.registrar_movimiento_stock(...)`: locks the stock row, updates `stock_actual`, and writes `stock_movimientos` in one transaction.

Apply `migrations/20260510002000_rls_policy_pack.sql` after enabling RLS. It adds full admin policies for the app tables and narrow kitchen read policies for active orders.

Apply `migrations/20260510003000_kitchen_order_transitions.sql` after that. It adds `public.avanzar_estado_pedido(...)`, so kitchen users can safely move active orders from `pendiente` to `preparando` to `listo` without broad table update permissions.

Kitchen users should get narrow policies for the exact KDS operations they need, for example reading active orders and moving `pendiente -> preparando -> listo`, but not editing prices, stock, clients, recipes, or analytics data.
