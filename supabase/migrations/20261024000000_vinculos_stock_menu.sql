-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Vínculos de stock desde la carta (qué descuenta cada producto)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta hoy el vínculo iba al revés: la RECETA apuntaba a un producto del menú
-- (recetas.menu_item_id), solo las recetas de tipo 'final' podían hacerlo y
-- cada receta apuntaba a UN solo producto. Consecuencias:
--   · una lata de Coca (ítem de inventario, sin receta) no podía descontarse
--     al venderse;
--   · una producción intermedia tampoco;
--   · "Langostino furai x2 / x4 / x6" (un producto con tres variantes)
--     obligaba a armar tres recetas iguales, y carta + delivery seis.
--
-- Qué hace:
--   1) Tabla `menu_item_stock_vinculos`: cada producto de la carta (y, si se
--      quiere, cada variante) apunta a UNA de estas cosas con una CANTIDAD:
--        · receta_id  → receta final o producción intermedia (se explota con
--                       LA REGLA de explotar_receta: se corta en el primer
--                       nivel con stock propio);
--        · stock_id   → ítem de inventario directo (bebidas, reventa).
--      Un producto puede tener varios vínculos (ej. combo = 1 roll + 1 lata).
--      Regla con variantes: los vínculos del producto (variante_id null)
--      valen para todas las variantes y su cantidad se multiplica por las
--      piezas de la variante vendida (igual que hasta hoy); los vínculos de
--      una variante puntual se suman a eso y su cantidad es por unidad
--      vendida (ej. "x2" → 2, "x4" → 4, "x6" → 6 de la misma receta).
--   2) Backfill: lo que ya estaba vinculado por recetas.menu_item_id pasa a la
--      tabla (la receta más vieja por producto, que es la que usaba el
--      trigger). Nada cambia de comportamiento el día que se corre.
--   3) `descontar_stock_pedido()` lee la tabla nueva. `revertir_stock_pedido()`
--      no cambia (devuelve lo que anotó descuento_detalle).
--   4) El campo "Producto del menú" de la pantalla Recetas sigue funcionando:
--      un trigger mantiene el vínculo (cantidad 1, nivel producto) cuando el
--      producto no tiene ningún otro vínculo cargado.
--   5) Permisos: la tabla la escriben Menú y Recetas; Menú pasa a poder LEER
--      recetas y stock (para el buscador de la sección "Stock que descuenta").
--
-- Idempotente: se puede correr más de una vez.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) La tabla ─────────────────────────────────────────────────────────────
create table if not exists public.menu_item_stock_vinculos (
  id            uuid primary key default gen_random_uuid(),
  menu_item_id  uuid not null references public.menu_items(id) on delete cascade,
  variante_id   uuid references public.menu_item_variantes(id) on delete cascade,
  receta_id     uuid references public.recetas(id) on delete cascade,
  stock_id      uuid references public.stock(id) on delete cascade,
  cantidad      numeric(12,3) not null default 1,
  orden         integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint menu_item_stock_vinculos_cantidad_check check (cantidad > 0),
  -- exactamente uno de los dos destinos
  constraint menu_item_stock_vinculos_destino_check check ((receta_id is null) <> (stock_id is null))
);

comment on table public.menu_item_stock_vinculos is
  'Qué descuenta del stock cada producto de la carta al cobrarse. receta_id (final o intermedia, se explota con LA REGLA) o stock_id (ítem de inventario directo), por cantidad. variante_id null = vale para todas las variantes (cantidad × piezas); con variante_id = se suma solo al vender esa variante (cantidad por unidad vendida).';
comment on column public.menu_item_stock_vinculos.cantidad is
  'Cuántas porciones de la receta / unidades del ítem descuenta UNA unidad vendida. Con variante_id null se multiplica además por las piezas de la variante.';

create index if not exists menu_item_stock_vinculos_item_idx
  on public.menu_item_stock_vinculos (menu_item_id, variante_id);
create index if not exists menu_item_stock_vinculos_receta_idx
  on public.menu_item_stock_vinculos (receta_id);
create index if not exists menu_item_stock_vinculos_stock_idx
  on public.menu_item_stock_vinculos (stock_id);

-- Sin duplicados: mismo producto + misma variante (o ninguna) + mismo destino.
create unique index if not exists menu_item_stock_vinculos_unico
  on public.menu_item_stock_vinculos (
    menu_item_id,
    coalesce(variante_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(receta_id,   '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(stock_id,    '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- La variante tiene que ser del mismo producto.
create or replace function public.menu_item_stock_vinculos_validar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.variante_id is not null and not exists (
    select 1 from public.menu_item_variantes v
     where v.id = new.variante_id and v.menu_item_id = new.menu_item_id
  ) then
    raise exception 'La variante % no pertenece al producto %', new.variante_id, new.menu_item_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_menu_item_stock_vinculos_validar on public.menu_item_stock_vinculos;
create trigger trg_menu_item_stock_vinculos_validar
  before insert or update on public.menu_item_stock_vinculos
  for each row execute function public.menu_item_stock_vinculos_validar();

-- ── 2) Backfill desde recetas.menu_item_id ──────────────────────────────────
-- La receta más vieja por producto: es la que elegía descontar_stock_pedido
-- hasta hoy, así que el comportamiento queda idéntico. Solo si el producto
-- todavía no tiene ningún vínculo (idempotente).
insert into public.menu_item_stock_vinculos (menu_item_id, receta_id, cantidad)
select distinct on (r.menu_item_id) r.menu_item_id, r.id, 1
  from public.recetas r
 where r.menu_item_id is not null
   and not exists (
     select 1 from public.menu_item_stock_vinculos v where v.menu_item_id = r.menu_item_id
   )
 order by r.menu_item_id, r.created_at nulls last, r.id
on conflict do nothing;

-- ── 3) Compatibilidad con la pantalla Recetas ───────────────────────────────
-- Elegir "Producto del menú" en una receta sigue vinculando (cantidad 1, para
-- todas las variantes) si el producto no tiene nada vinculado. Sacarlo o
-- cambiarlo borra ese vínculo automático. Lo cargado desde Menú no se toca.
create or replace function public.recetas_sincronizar_vinculo_menu()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.menu_item_id is not null
     and old.menu_item_id is distinct from new.menu_item_id then
    delete from public.menu_item_stock_vinculos
     where menu_item_id = old.menu_item_id
       and receta_id = new.id
       and variante_id is null
       and cantidad = 1;
  end if;

  if new.menu_item_id is not null
     and (tg_op = 'INSERT' or old.menu_item_id is distinct from new.menu_item_id)
     and not exists (
       select 1 from public.menu_item_stock_vinculos v where v.menu_item_id = new.menu_item_id
     ) then
    insert into public.menu_item_stock_vinculos (menu_item_id, receta_id, cantidad)
    values (new.menu_item_id, new.id, 1)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_recetas_sincronizar_vinculo_menu on public.recetas;
create trigger trg_recetas_sincronizar_vinculo_menu
  after insert or update of menu_item_id on public.recetas
  for each row execute function public.recetas_sincronizar_vinculo_menu();

-- ── 4) Qué consume un pedido (la lógica, reutilizable) ──────────────────────
-- Devuelve los ítems de stock que consume cada renglón del pedido, ya
-- explotados con LA REGLA. La usa descontar_stock_pedido(); también sirve
-- para diagnósticos ("¿qué va a descontar este pedido?").
create or replace function public.consumos_stock_pedido(p_pedido_id uuid)
returns table (pedido_item_id uuid, stock_id uuid, cantidad numeric)
language sql
stable
set search_path = public, pg_temp
as $$
  with items as (
    select pi.id, pi.menu_item_id, pi.variante_id, pi.cantidad,
           coalesce(nullif(v.piezas, 0), 1)::numeric as piezas
      from public.pedido_items pi
      left join public.menu_item_variantes v on v.id = pi.variante_id
     where pi.pedido_id = p_pedido_id
       and pi.menu_item_id is not null
       and coalesce(pi.cantidad, 0) > 0
  ),
  -- Vínculos del producto (× piezas de la variante) + los de la variante vendida.
  vinc as (
    select i.id as pedido_item_id, k.receta_id, k.stock_id,
           k.cantidad * i.cantidad
             * case when k.variante_id is null then i.piezas else 1 end as cant
      from items i
      join public.menu_item_stock_vinculos k on k.menu_item_id = i.menu_item_id
     where k.variante_id is null
        or k.variante_id = i.variante_id
  ),
  consumos as (
    select vk.pedido_item_id, vk.stock_id, vk.cant
      from vinc vk
     where vk.stock_id is not null
    union all
    select vk.pedido_item_id, e.stock_id, e.cantidad
      from vinc vk
      cross join lateral public.explotar_receta(vk.receta_id, vk.cant, true) e
     where vk.receta_id is not null
  )
  select c.pedido_item_id, c.stock_id, sum(c.cant)
    from consumos c
   where c.stock_id is not null and c.cant > 0
   group by c.pedido_item_id, c.stock_id
$$;

-- ── 5) Venta: descontar (misma firma, lee la tabla nueva) ───────────────────
create or replace function public.descontar_stock_pedido(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido  record;
  v_c       record;
  v_actual  numeric;
  v_nuevo   numeric;
  v_detalle jsonb := '[]'::jsonb;
  v_ref     text := '#' || upper(right(p_pedido_id::text, 4));
begin
  select id, stock_descontado into v_pedido
    from public.pedidos where id = p_pedido_id for update;
  if not found or coalesce(v_pedido.stock_descontado, false) then
    return null;
  end if;

  for v_c in
    select c.stock_id, sum(c.cantidad) as cantidad
      from public.consumos_stock_pedido(p_pedido_id) c
     group by c.stock_id
     order by c.stock_id
  loop
    select stock_actual into v_actual from public.stock where id = v_c.stock_id for update;
    if not found then continue; end if;
    v_nuevo := v_actual - v_c.cantidad;           -- puede quedar negativo
    update public.stock set stock_actual = v_nuevo, updated_at = now() where id = v_c.stock_id;
    insert into public.stock_movimientos (stock_id, tipo, cantidad, stock_antes, stock_despues, notas, pedido_id)
    values (v_c.stock_id, 'salida', round(v_c.cantidad, 2), v_actual, v_nuevo, 'Venta pedido ' || v_ref, p_pedido_id);
    v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
      'stock_id', v_c.stock_id, 'cantidad', v_c.cantidad));
  end loop;

  update public.pedidos
     set stock_descontado = jsonb_array_length(v_detalle) > 0,
         descuento_detalle = case when jsonb_array_length(v_detalle) > 0 then v_detalle else null end
   where id = p_pedido_id;
  return v_detalle;
end;
$$;

-- ── 6) Permisos ─────────────────────────────────────────────────────────────
alter table public.menu_item_stock_vinculos enable row level security;

revoke all on public.menu_item_stock_vinculos from anon;
grant select, insert, update, delete on public.menu_item_stock_vinculos to authenticated;
grant all on public.menu_item_stock_vinculos to service_role;

revoke all on function public.descontar_stock_pedido(uuid) from public, anon, authenticated;
revoke all on function public.consumos_stock_pedido(uuid) from public, anon;
grant execute on function public.consumos_stock_pedido(uuid) to authenticated;

do $$
begin
  if to_regclass('public.recurso_tablas') is not null then
    insert into public.recurso_tablas (recurso_id, tabla, escribe)
    select v.recurso_id, v.tabla, v.escribe
      from (values
        ('menu',    'menu_item_stock_vinculos', true),
        ('recetas', 'menu_item_stock_vinculos', true),
        -- El buscador de la sección "Stock que descuenta" (Menú) lista recetas
        -- e inventario: solo lectura.
        ('menu',    'recetas', false),
        ('menu',    'stock',   false),
        -- Inventario ve qué productos descuentan cada ítem.
        ('stock',   'menu_item_stock_vinculos', false)
      ) as v(recurso_id, tabla, escribe)
     where exists (select 1 from public.recursos r where r.id = v.recurso_id)
    on conflict (recurso_id, tabla) do update set escribe = excluded.escribe;

    -- Mismas policies que genera 20260806010000 para toda tabla del mapa.
    drop policy if exists "permisos lectura" on public.menu_item_stock_vinculos;
    create policy "permisos lectura" on public.menu_item_stock_vinculos
      for select to authenticated
      using ((select public.puede_tabla('menu_item_stock_vinculos', 'ver')));

    drop policy if exists "permisos escritura" on public.menu_item_stock_vinculos;
    create policy "permisos escritura" on public.menu_item_stock_vinculos
      for all to authenticated
      using ((select public.puede_tabla('menu_item_stock_vinculos', 'editar')))
      with check ((select public.puede_tabla('menu_item_stock_vinculos', 'editar')));
  else
    -- Base sin la fase 4 de permisos: usuarios operativos.
    drop policy if exists "operational users manage menu_item_stock_vinculos" on public.menu_item_stock_vinculos;
    create policy "operational users manage menu_item_stock_vinculos"
      on public.menu_item_stock_vinculos for all to authenticated
      using (public.is_operational_user())
      with check (public.is_operational_user());
  end if;
end $$;

-- PostgREST tiene que volver a leer el esquema.
notify pgrst, 'reload schema';

-- Verificación: cuántos productos quedaron vinculados (tiene que ser ≥ la
-- cantidad de recetas finales que tenían producto del menú).
select count(*) as vinculos, count(distinct menu_item_id) as productos_vinculados
  from public.menu_item_stock_vinculos;
