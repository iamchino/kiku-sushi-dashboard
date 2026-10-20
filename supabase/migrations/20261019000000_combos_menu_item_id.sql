-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — combos.menu_item_id (la columna que el dashboard siempre usó
-- pero nunca existió en producción)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Síntoma: al guardar un combo, "Could not find the 'menu_item_id' column of
-- 'combos' in the schema cache". El front (useCombos.js) escribe
-- combos.menu_item_id (producto del menú vinculado, de donde sale el precio
-- de venta si el combo no tiene precio propio), pero la tabla combos de
-- producción solo tiene id, nombre, precio, notas, activo, created_at,
-- updated_at. La migración 20260609 preveía la FK "si la columna existe", y
-- nunca existió.
--
-- Esta migración crea la columna + FK (ON DELETE SET NULL: borrar un
-- producto del menú no borra el combo, lo desvincula) y, por si el SQL 44 no
-- se corrió, repite de forma idempotente combo_items.piezas_por_unidad.
-- Idempotente: se puede correr más de una vez.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.combos
  add column if not exists menu_item_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'combos_menu_item_id_fkey'
      and conrelid = 'public.combos'::regclass
  ) then
    alter table public.combos
      add constraint combos_menu_item_id_fkey
      foreign key (menu_item_id) references public.menu_items(id)
      on delete set null;
  end if;
end $$;

create index if not exists combos_menu_item_id_idx
  on public.combos (menu_item_id);

comment on column public.combos.menu_item_id is
  'Producto del menú vinculado al combo. Si el combo no tiene precio propio, el precio de venta sale de acá.';

-- ── Por si el SQL 44 (combos por piezas) no se corrió: mismo contenido, idempotente ──
alter table public.combo_items
  add column if not exists piezas_por_unidad numeric(12,3);

alter table public.combo_items drop constraint if exists combo_items_piezas_por_unidad_check;
alter table public.combo_items add constraint combo_items_piezas_por_unidad_check
  check (piezas_por_unidad is null or piezas_por_unidad > 0);

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

-- PostgREST tiene que volver a leer el esquema (si no, el error sigue aunque la columna exista)
notify pgrst, 'reload schema';

-- Verificación (debe devolver 2 filas: combos.menu_item_id y combo_items.piezas_por_unidad)
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'combos' and column_name = 'menu_item_id')
     or (table_name = 'combo_items' and column_name = 'piezas_por_unidad'))
 order by 1;
