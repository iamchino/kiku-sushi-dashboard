-- 21 · DIAGNOSTICO (solo lee, no cambia nada)
-- Parte A: ¿están aplicadas en la base las funciones que el dashboard usa?
select f as funcion,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = f) as existe
from unnest(array[
  'registrar_movimiento_stock', 'fichar', 'tomar_item', 'marcar_item_listo',
  'marcar_item_servido', 'enviar_a_cocina', 'apertura_sugerida', 'editar_pago',
  'anular_pago', 'guardar_suscripcion_push', 'agregar_items_pedido', 'cerrar_mesa'
]) as f
order by existe, f;
