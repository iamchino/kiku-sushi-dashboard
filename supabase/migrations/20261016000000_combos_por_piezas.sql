-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Combos: cantidades por PIEZAS (no solo por roll entero)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta ahora un ítem de combo era "N unidades de la receta" (N entero), y
-- si la receta es un roll entero no se podía poner "3 piezas de ese roll".
--
-- combo_items.piezas_por_unidad: si es NULL, `cantidad` son unidades de la
-- receta (como antes). Si tiene valor (ej. 10), `cantidad` son PIEZAS y una
-- unidad de la receta trae esas piezas: costo = costo_unidad × cantidad / 10.
-- `cantidad` pasa a numeric por si hace falta media unidad.
--
-- Solo afecta el costeo de Fichas Técnicas; los combos no descuentan stock.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.combo_items
  add column if not exists piezas_por_unidad numeric(12,3);

alter table public.combo_items drop constraint if exists combo_items_piezas_por_unidad_check;
alter table public.combo_items add constraint combo_items_piezas_por_unidad_check
  check (piezas_por_unidad is null or piezas_por_unidad > 0);

comment on column public.combo_items.piezas_por_unidad is
  'NULL: cantidad = unidades de la receta. Con valor: cantidad = piezas, y una unidad de la receta rinde esas piezas.';

do $$
declare
  v_tipo text;
begin
  select data_type into v_tipo
    from information_schema.columns
   where table_schema = 'public' and table_name = 'combo_items' and column_name = 'cantidad';
  if v_tipo in ('integer', 'smallint', 'bigint') then
    alter table public.combo_items alter column cantidad type numeric(12,3) using cantidad::numeric;
  end if;
end $$;

notify pgrst, 'reload schema';
