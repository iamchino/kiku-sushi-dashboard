-- Kiku Sushi - acceso operativo para cocina@kikusushi.com
-- Version corta para pegar completa en Supabase SQL Editor.

create or replace function public.current_app_role()
returns text
language sql
stable
as 'select coalesce(nullif(auth.jwt() -> ''app_metadata'' ->> ''role'', ''''), nullif(auth.jwt() -> ''user_metadata'' ->> ''role'', ''''), ''cocina'')';

create or replace function public.is_operational_user()
returns boolean
language sql
stable
as 'select public.current_app_role() in (''admin'', ''cocina'') or lower(coalesce(auth.jwt() ->> ''email'', '''')) = ''cocina@kikusushi.com''';

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_operational_user() to authenticated;

do $kiku$
declare
  v_table text;
  v_policy text;
begin
  foreach v_table in array array[
    'pedidos',
    'pedido_items',
    'stock',
    'stock_movimientos',
    'menu_items',
    'menu_item_variantes',
    'recetas',
    'receta_ingredientes',
    'combos',
    'combo_items',
    'produccion_listas',
    'produccion_tareas'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      v_policy := 'operational users manage ' || v_table;
      execute format('alter table public.%I enable row level security', v_table);
      execute format('drop policy if exists %I on public.%I', v_policy, v_table);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_operational_user()) with check (public.is_operational_user())',
        v_policy,
        v_table
      );
    end if;
  end loop;
end
$kiku$;

notify pgrst, 'reload schema';
