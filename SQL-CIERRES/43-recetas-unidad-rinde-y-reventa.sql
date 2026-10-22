-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Recetas: unidad del rinde (porciones / kilos / litros / …) y
--              productos de reventa (bebidas) separados de los productos finales
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1) recetas.unidad_rinde: en qué se cuenta lo que rinde una receta.
--    Hasta ahora todo era "porciones" (y "rolls" en los rolls de servicio).
--    Ahora se elige al crear la receta: porc | u | kg | g | l | ml.
--    El ítem de stock de la receta (producción intermedia / lleva stock) copia
--    esa unidad: Inventario, Producción y Fichas muestran la misma.
--    Los rolls de servicio siguen siempre en 'roll'.
--
-- 2) recetas.porciones pasa a numeric: una salsa puede rendir 2,5 litros.
--
-- 3) recetas.reventa: productos que se venden tal cual se compran (bebidas,
--    etc.). La migración del 02/07 creó una receta 1:1 por cada bebida del
--    inventario para que la venta descuente stock; esas recetas aparecían
--    mezcladas con los platos en "Productos finales". Ahora se listan en una
--    pestaña propia "Bebidas y reventa". Es una marca, no cambia el descuento.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. unidad_rinde ────────────────────────────────────────────────────────
alter table public.recetas
  add column if not exists unidad_rinde text not null default 'porc';

alter table public.recetas drop constraint if exists recetas_unidad_rinde_check;
alter table public.recetas add constraint recetas_unidad_rinde_check
  check (unidad_rinde in ('porc', 'u', 'kg', 'g', 'l', 'ml'));

comment on column public.recetas.unidad_rinde is
  'Unidad en que se cuenta el rinde (porciones) y el stock de la receta: porc | u | kg | g | l | ml. Los rolls de servicio usan roll.';

-- Backfill: si el ítem de stock de la receta ya tenía una unidad real
-- (alguien la cambió a kg / l desde Inventario), la receta la adopta.
update public.recetas r
   set unidad_rinde = s.unidad
  from public.stock s
 where s.receta_id = r.id
   and s.tipo_stock <> 'materia_prima'
   and r.tipo <> 'servicio'
   and s.unidad in ('u', 'kg', 'g', 'l', 'ml')
   and r.unidad_rinde = 'porc';

-- ─── 2. porciones con decimales ─────────────────────────────────────────────
do $$
declare
  v_tipo text;
begin
  select data_type into v_tipo
    from information_schema.columns
   where table_schema = 'public' and table_name = 'recetas' and column_name = 'porciones';
  if v_tipo in ('integer', 'smallint', 'bigint') then
    alter table public.recetas alter column porciones type numeric(12,3) using porciones::numeric;
  end if;
end $$;

-- ─── 3. reventa ─────────────────────────────────────────────────────────────
alter table public.recetas
  add column if not exists reventa boolean not null default false;

comment on column public.recetas.reventa is
  'Producto que se vende tal cual se compra (bebidas, etc.): receta 1:1 con un ítem de materia prima. Se lista aparte de los productos finales.';

-- Backfill: receta final con UN solo ingrediente, que es materia prima, cantidad 1
-- y con el mismo nombre que el ítem del inventario (así las creó la migración
-- del 02/07 para las bebidas).
update public.recetas r
   set reventa = true
 where coalesce(r.tipo, 'final') = 'final'
   and not r.reventa
   and (select count(*) from public.receta_ingredientes ri where ri.receta_id = r.id) = 1
   and exists (
     select 1
       from public.receta_ingredientes ri
       join public.stock s on s.id = ri.stock_id
      where ri.receta_id = r.id
        and ri.subreceta_id is null
        and s.tipo_stock = 'materia_prima'
        and ri.cantidad = 1
        and lower(trim(s.nombre)) = lower(trim(r.nombre))
   );

-- Un producto de reventa no lleva stock propio (descuenta el ítem comprado).
update public.recetas set lleva_stock = false where reventa and lleva_stock;

-- ─── 4. El ítem de stock copia la unidad de la receta ───────────────────────
create or replace function public.recetas_sincronizar_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tipo_stock text := case new.tipo when 'servicio' then 'servicio'
                                     when 'intermedia' then 'produccion'
                                     else 'produccion' end;
  v_unidad text := case when new.tipo = 'servicio' then 'roll'
                        else coalesce(nullif(new.unidad_rinde, ''), 'porc') end;
begin
  if new.lleva_stock then
    if not exists (select 1 from public.stock where receta_id = new.id) then
      insert into public.stock (nombre, stock_actual, stock_minimo, unidad, tipo_stock,
                                receta_id, categoria, precio_unitario, rendimiento)
      values (new.nombre, 0, 0, v_unidad, v_tipo_stock, new.id, null, 0, 1);
    else
      update public.stock
         set tipo_stock = v_tipo_stock,
             unidad = v_unidad,
             nombre = case when tg_op = 'UPDATE' and nombre = old.nombre then new.nombre else nombre end
       where receta_id = new.id
         and tipo_stock <> 'materia_prima';
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_recetas_sincronizar_stock on public.recetas;
create trigger trg_recetas_sincronizar_stock
  after insert or update of tipo, lleva_stock, nombre, unidad_rinde on public.recetas
  for each row execute function public.recetas_sincronizar_stock();

-- Sincroniza los ítems existentes con la unidad de su receta.
update public.stock s
   set unidad = case when r.tipo = 'servicio' then 'roll' else r.unidad_rinde end
  from public.recetas r
 where s.receta_id = r.id
   and r.lleva_stock
   and s.tipo_stock <> 'materia_prima'
   and s.unidad is distinct from (case when r.tipo = 'servicio' then 'roll' else r.unidad_rinde end);

notify pgrst, 'reload schema';

-- Verificación:
--   select nombre, tipo, porciones, unidad_rinde, reventa from public.recetas order by reventa desc, tipo, nombre;
--   select r.nombre, s.unidad from public.stock s join public.recetas r on r.id = s.receta_id where r.lleva_stock;
