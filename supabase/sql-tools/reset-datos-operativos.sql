-- ============================================================================
-- RESET DE DATOS OPERATIVOS — puesta en producción Kiku Sushi
-- ----------------------------------------------------------------------------
-- ⚠️  ESTE SCRIPT BORRA DATOS DE FORMA PERMANENTE E IRREVERSIBLE.
-- ⚠️  Hacé un backup ANTES de correrlo (Supabase → Database → Backups, o
--     un dump con pg_dump). No hay "deshacer".
--
-- SE BORRA (historial operativo / de prueba):
--   • reservas
--   • pedidos + pedido_items            (órdenes)
--   • pagos                             (cobros)
--   • comprobantes_fiscales             (facturas / NC / ND emitidas)
--   • impresiones_documentos            (historial de impresión)
--   • caja_turnos + caja_movimientos    (historial de caja y arqueos)
--   • clientes                          (TODOS los clientes)
--   • notificaciones                    (avisos del dashboard, quedan huérfanos)
--
-- NO SE TOCA (configuración / catálogo / inventario):
--   • stock                             ← inventario, intacto
--   • menu_items + menu_item_variantes  ← carta salón y delivery, intactos
--   • recetas + receta_ingredientes
--   • combos + combo_items
--   • mesas, salones, mozos
--   • produccion_listas, produccion_tareas
--   • facturacion_config, tipos_comprobante, arca_tokens
--   • arca_request_log                  ← solo se desvincula (comprobante_id = NULL)
--
-- Cómo correrlo: Supabase → SQL Editor → pegar TODO → Run.
-- Está todo dentro de una transacción: si algo falla, no borra nada.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ PASO 1 — PRE-CHECK (opcional). Corré SOLO este bloque primero para ver ║
-- ║ cuántas filas se van a borrar. No borra nada.                          ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select 'reservas'              as tabla, count(*) as filas_a_borrar from public.reservas
union all select 'pedidos',                 count(*) from public.pedidos
union all select 'pedido_items',            count(*) from public.pedido_items
union all select 'pagos',                   count(*) from public.pagos
union all select 'comprobantes_fiscales',   count(*) from public.comprobantes_fiscales
union all select 'impresiones_documentos',  count(*) from public.impresiones_documentos
union all select 'caja_turnos',             count(*) from public.caja_turnos
union all select 'caja_movimientos',        count(*) from public.caja_movimientos
union all select 'notificaciones',          count(*) from public.notificaciones
union all select 'clientes',                count(*) from public.clientes
order by tabla;


-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ PASO 2 — EL BORRADO. Corré este bloque cuando estés seguro.            ║
-- ╚══════════════════════════════════════════════════════════════════════╝
begin;

do $$
declare
  t       text;
  -- ORDEN IMPORTANTE: se borra de las tablas "hijas" hacia las "padres",
  -- respetando las claves foráneas (no se desactivan triggers porque el rol
  -- de Supabase no tiene ese permiso). Este orden satisface las reglas
  -- RESTRICT (comprobantes y pagos deben borrarse antes que pedidos).
  targets text[] := array[
    'impresiones_documentos',  -- referencia pedidos/comprobantes (SET NULL)
    'caja_movimientos',        -- referencia turnos/pedidos/pagos/comprobantes (SET NULL)
    'reservas',                -- referencia pedidos/mesas (SET NULL)
    'notificaciones',          -- ← si NO querés borrar los avisos, sacá esta línea
    'pagos',                   -- RESTRICT -> pedidos (antes que pedidos)
    'comprobantes_fiscales',   -- RESTRICT -> pedidos (antes que pedidos)
    'pedido_items',            -- hijo de pedidos
    'pedidos',                 -- ya sin referencias RESTRICT pendientes
    'caja_turnos',             -- ya sin referencias (pagos/pedidos/movimientos borrados)
    'clientes'                 -- ya sin referencias (pedidos borrados)
  ];
begin
  -- 1) Romper la auto-referencia de comprobantes (notas de crédito que
  --    apuntan a la factura original, con regla RESTRICT) antes de borrar.
  if to_regclass('public.comprobantes_fiscales') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'comprobantes_fiscales'
         and column_name = 'cbte_asociado_id'
     )
  then
    execute 'update public.comprobantes_fiscales set cbte_asociado_id = null where cbte_asociado_id is not null';
  end if;

  -- 2) Desvincular el log de AFIP (tabla que conservamos) de los comprobantes.
  --    (Con los triggers activos esto igual se haría solo por la regla SET NULL,
  --    pero lo hacemos explícito por las dudas.)
  if to_regclass('public.arca_request_log') is not null then
    execute 'update public.arca_request_log set comprobante_id = null where comprobante_id is not null';
  end if;

  -- 3) Vaciar cada tabla en orden (si existe).
  foreach t in array targets loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I', t);
      raise notice 'Vaciada: %', t;
    end if;
  end loop;
end $$;


-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ PASO 3 — VERIFICACIÓN (dentro de la misma transacción).                ║
-- ║ Las tablas borradas deben dar 0; stock y menú deben seguir con datos.  ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select 'BORRADAS (deben ser 0)' as grupo, 'pedidos'      as tabla, count(*) as filas from public.pedidos
union all select 'BORRADAS (deben ser 0)', 'reservas',     count(*) from public.reservas
union all select 'BORRADAS (deben ser 0)', 'pagos',        count(*) from public.pagos
union all select 'BORRADAS (deben ser 0)', 'caja_turnos',  count(*) from public.caja_turnos
union all select 'BORRADAS (deben ser 0)', 'clientes',     count(*) from public.clientes
union all select 'CONSERVADAS (>0)',       'stock',        count(*) from public.stock
union all select 'CONSERVADAS (>0)',       'menu_items',   count(*) from public.menu_items
order by grupo desc, tabla;


-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ PASO 4 — CONFIRMAR.                                                     ║
-- ║ Si la verificación se ve bien:  COMMIT;                                ║
-- ║ Si algo se ve mal:              ROLLBACK;   (deshace TODO)             ║
-- ╚══════════════════════════════════════════════════════════════════════╝
commit;
-- rollback;   -- ← usá esta en lugar del commit si querés cancelar
