-- ============================================================================
-- Stock en tres niveles + descuento automático por venta
--
--   1. Materia prima          (stock.tipo_stock = 'materia_prima')
--   2. Producción intermedia  (stock.tipo_stock = 'produccion')  ← subrecetas
--   3. Servicio               (stock.tipo_stock = 'servicio')    ← rolls armados
--
-- Recetas: recetas.tipo = 'final' | 'intermedia' | 'servicio' y
-- recetas.lleva_stock (si se produce antes y se guarda). Toda receta con
-- lleva_stock tiene su ítem de stock, creado solo por un trigger.
--
-- LA REGLA: al descontar se baja por la receta y se descuenta en el PRIMER
-- nivel que tenga stock propio; nunca más abajo. Así un roll vendido descuenta
-- 0,5 roll de servicio y no vuelve a descontar arroz ni salmón (eso ya bajó
-- cuando se produjo el arroz y cuando se armó el roll).
--
-- Ventas: un trigger en pedidos descuenta cuando el pedido pasa a 'entregado'
-- (mesa cobrada, delivery, take away) y devuelve si sale de 'entregado'
-- (cancelado o reabierto). Todo en la base, en una transacción. Si algo falla,
-- el cobro NO se frena: el error queda anotado en pedidos.descuento_detalle.
--
-- Stock negativo permitido en ventas y producción: un número en rojo muestra
-- que el conteo estaba mal o que faltó cargar una compra.
-- ============================================================================

-- ─── 1. Esquema ─────────────────────────────────────────────────────────────
alter table public.stock drop constraint if exists stock_tipo_stock_check;
alter table public.stock add constraint stock_tipo_stock_check
  check (tipo_stock in ('materia_prima', 'produccion', 'servicio'));

alter table public.recetas add column if not exists tipo text not null default 'final';
alter table public.recetas drop constraint if exists recetas_tipo_check;
alter table public.recetas add constraint recetas_tipo_check
  check (tipo in ('final', 'intermedia', 'servicio'));
alter table public.recetas add column if not exists lleva_stock boolean not null default false;

alter table public.stock_movimientos add column if not exists pedido_id uuid
  references public.pedidos(id) on delete set null;
create index if not exists stock_movimientos_pedido_idx on public.stock_movimientos(pedido_id);

comment on column public.recetas.tipo is
  'final = producto que se vende; intermedia = subreceta que se produce (arroz, salsas); servicio = rolls armados para el servicio.';
comment on column public.recetas.lleva_stock is
  'Se produce antes y se guarda: tiene ítem de stock propio y el descuento se corta acá.';

-- ─── 2. Backfill (solo la primera vez que corre) ────────────────────────────
-- Subrecetas → intermedia. Recetas sin producto del menú que ya tenían ítem de
-- stock de producción → intermedia. Todo lo que no es final lleva stock, y
-- también cualquier receta que ya se usó en una tarea de producción (se
-- produce antes, así que se guarda).
update public.recetas r
   set tipo = 'intermedia'
 where r.tipo = 'final'
   and (r.es_subreceta
        or (r.menu_item_id is null
            and exists (select 1 from public.stock s where s.receta_id = r.id)));

update public.recetas r
   set lleva_stock = true
 where not r.lleva_stock
   and (r.tipo <> 'final'
        or exists (select 1 from public.stock s where s.receta_id = r.id)
        or exists (select 1 from public.produccion_tareas t where t.receta_id = r.id));

update public.recetas set es_subreceta = (tipo <> 'final') where es_subreceta is distinct from (tipo <> 'final');

-- ─── 3. Ítem de stock de cada receta que lleva stock ────────────────────────
create or replace function public.stock_de_receta(p_receta_id uuid)
returns uuid
language sql stable
set search_path = public, pg_temp
as $$
  select s.id
    from public.stock s
    join public.recetas r on r.id = s.receta_id
   where s.receta_id = p_receta_id
     and r.lleva_stock
   order by (s.tipo_stock = 'materia_prima'), s.nombre, s.id
   limit 1
$$;

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
begin
  -- es_subreceta queda como espejo de tipo (compatibilidad con pantallas viejas).
  if new.lleva_stock then
    if not exists (select 1 from public.stock where receta_id = new.id) then
      insert into public.stock (nombre, stock_actual, stock_minimo, unidad, tipo_stock,
                                receta_id, categoria, precio_unitario, rendimiento)
      values (new.nombre, 0, 0,
              case when new.tipo = 'servicio' then 'roll' else 'porc' end,
              v_tipo_stock, new.id, null, 0, 1);
    else
      update public.stock
         set tipo_stock = v_tipo_stock,
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
  after insert or update of tipo, lleva_stock, nombre on public.recetas
  for each row execute function public.recetas_sincronizar_stock();

create or replace function public.recetas_es_subreceta_espejo()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.es_subreceta := (new.tipo <> 'final');
  return new;
end;
$$;

drop trigger if exists trg_recetas_es_subreceta on public.recetas;
create trigger trg_recetas_es_subreceta
  before insert or update of tipo, es_subreceta on public.recetas
  for each row execute function public.recetas_es_subreceta_espejo();

-- Backfill de ítems: dispara el trigger en las recetas que lo necesitan.
update public.recetas r
   set lleva_stock = lleva_stock
 where r.lleva_stock;

-- ─── 4. Explosión de una receta con LA REGLA ────────────────────────────────
-- Devuelve qué ítems de stock se consumen para p_porciones de la receta.
--   p_parar_en_raiz = true  → venta: si la receta misma tiene stock, se
--                             descuenta ella (ej. gyozas ya armadas).
--   p_parar_en_raiz = false → producción: la receta se fabrica, se consumen
--                             sus ingredientes.
create or replace function public.explotar_receta(
  p_receta_id uuid, p_porciones numeric, p_parar_en_raiz boolean
)
returns table (stock_id uuid, cantidad numeric)
language sql stable
set search_path = public, pg_temp
as $$
  with recursive arbol(receta_id, factor, nivel) as (
    select r.id,
           p_porciones / coalesce(nullif(r.porciones, 0), 1)::numeric,
           0
      from public.recetas r
     where r.id = p_receta_id
       and not (p_parar_en_raiz and public.stock_de_receta(r.id) is not null)
    union all
    select sub.id,
           a.factor * ri.cantidad / coalesce(nullif(sub.porciones, 0), 1)::numeric,
           a.nivel + 1
      from arbol a
      join public.receta_ingredientes ri on ri.receta_id = a.receta_id
      join public.recetas sub on sub.id = ri.subreceta_id
     where ri.stock_id is null
       and a.nivel < 8
       and public.stock_de_receta(sub.id) is null
  ),
  consumos as (
    -- la receta misma, si se vende y tiene stock propio
    select public.stock_de_receta(p_receta_id) as stock_id, p_porciones as cantidad
     where p_parar_en_raiz and public.stock_de_receta(p_receta_id) is not null
    union all
    -- ingredientes que son ítems de stock
    select ri.stock_id, a.factor * ri.cantidad
      from arbol a
      join public.receta_ingredientes ri on ri.receta_id = a.receta_id
     where ri.stock_id is not null
    union all
    -- subrecetas con stock propio: se corta acá
    select public.stock_de_receta(ri.subreceta_id), a.factor * ri.cantidad
      from arbol a
      join public.receta_ingredientes ri on ri.receta_id = a.receta_id
     where ri.stock_id is null
       and ri.subreceta_id is not null
       and public.stock_de_receta(ri.subreceta_id) is not null
  )
  select c.stock_id, sum(c.cantidad)
    from consumos c
   where c.stock_id is not null and c.cantidad > 0
   group by c.stock_id
$$;

-- ─── 5. Venta: descontar y devolver ─────────────────────────────────────────
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
    select e.stock_id, sum(e.cantidad) as cantidad
      from public.pedido_items pi
      cross join lateral (
        select r.id from public.recetas r
         where r.menu_item_id = pi.menu_item_id
         order by r.created_at nulls last, r.id
         limit 1
      ) rec
      left join public.menu_item_variantes v on v.id = pi.variante_id
      cross join lateral public.explotar_receta(
        rec.id, coalesce(nullif(v.piezas, 0), 1) * pi.cantidad, true
      ) e
     where pi.pedido_id = p_pedido_id
       and pi.menu_item_id is not null
     group by e.stock_id
     order by e.stock_id
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

create or replace function public.revertir_stock_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido  record;
  v_it      jsonb;
  v_id      uuid;
  v_cant    numeric;
  v_actual  numeric;
  v_ref     text := '#' || upper(right(p_pedido_id::text, 4));
begin
  select id, stock_descontado, descuento_detalle into v_pedido
    from public.pedidos where id = p_pedido_id for update;
  if not found or not coalesce(v_pedido.stock_descontado, false)
     or jsonb_typeof(v_pedido.descuento_detalle) <> 'array' then
    return;
  end if;

  for v_it in
    select value from jsonb_array_elements(v_pedido.descuento_detalle)
     order by value->>'stock_id'
  loop
    v_id   := nullif(v_it->>'stock_id', '')::uuid;
    v_cant := coalesce(nullif(v_it->>'cantidad', '')::numeric, 0);
    if v_id is null or v_cant <= 0 then continue; end if;
    select stock_actual into v_actual from public.stock where id = v_id for update;
    if not found then continue; end if;
    update public.stock set stock_actual = v_actual + v_cant, updated_at = now() where id = v_id;
    insert into public.stock_movimientos (stock_id, tipo, cantidad, stock_antes, stock_despues, notas, pedido_id)
    values (v_id, 'entrada', round(v_cant, 2), v_actual, v_actual + v_cant, 'Devuelto pedido ' || v_ref, p_pedido_id);
  end loop;

  update public.pedidos
     set stock_descontado = false, descuento_detalle = null
   where id = p_pedido_id;
end;
$$;

create or replace function public.pedidos_stock_por_estado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.estado = 'entregado' and old.estado is distinct from 'entregado'
     and not coalesce(new.stock_descontado, false) then
    begin
      perform public.descontar_stock_pedido(new.id);
    exception when others then
      -- El cobro sigue. El error queda anotado para verlo después.
      update public.pedidos
         set descuento_detalle = jsonb_build_object('error', sqlerrm, 'at', now())
       where id = new.id;
    end;
  elsif old.estado = 'entregado' and new.estado is distinct from 'entregado'
        and coalesce(old.stock_descontado, false) then
    perform public.revertir_stock_pedido(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_pedidos_stock_por_estado on public.pedidos;
create trigger trg_pedidos_stock_por_estado
  after update of estado on public.pedidos
  for each row execute function public.pedidos_stock_por_estado();

-- ─── 6. Producción con LA REGLA (misma firma de siempre) ────────────────────
-- Si la tarea tiene receta, los consumos los calcula la base (se ignora lo que
-- mande la pantalla) y lo producido se suma al ítem de la receta.
create or replace function public.completar_tarea_produccion(
  p_tarea_id uuid,
  p_completada_por text,
  p_cantidad_real numeric,
  p_notas_equipo text default null,
  p_consumos jsonb default '[]'::jsonb,
  p_produccion_stock_id uuid default null,
  p_produccion_cantidad numeric default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tarea       record;
  v_c           record;
  v_actual      numeric;
  v_nuevo       numeric;
  v_nombre      text;
  v_unidad      text;
  v_consumos    jsonb := '[]'::jsonb;
  v_produccion  jsonb := null;
  v_prod_id     uuid;
  v_prod_cant   numeric;
  v_hubo        boolean := false;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;
  if p_cantidad_real is null or p_cantidad_real <= 0 then
    raise exception 'La cantidad producida debe ser mayor a cero';
  end if;

  select * into v_tarea from public.produccion_tareas where id = p_tarea_id for update;
  if not found then raise exception 'Tarea de produccion no encontrada'; end if;
  if v_tarea.estado = 'completada' then raise exception 'La tarea ya esta completada'; end if;

  for v_c in
    select x.stock_id, x.cantidad from (
      select e.stock_id, e.cantidad
        from public.explotar_receta(v_tarea.receta_id, p_cantidad_real, false) e
       where v_tarea.receta_id is not null
      union all
      select nullif(j->>'stock_id', '')::uuid, coalesce(nullif(j->>'cantidad', '')::numeric, 0)
        from jsonb_array_elements(coalesce(p_consumos, '[]'::jsonb)) j
       where v_tarea.receta_id is null
    ) x
     where x.stock_id is not null and x.cantidad > 0
     order by x.stock_id
  loop
    select stock_actual, nombre, unidad into v_actual, v_nombre, v_unidad
      from public.stock where id = v_c.stock_id for update;
    if not found then raise exception 'Item de stock no encontrado: %', v_c.stock_id; end if;
    v_nuevo := v_actual - v_c.cantidad;           -- puede quedar negativo
    update public.stock set stock_actual = v_nuevo, updated_at = now() where id = v_c.stock_id;
    insert into public.stock_movimientos (stock_id, tipo, cantidad, stock_antes, stock_despues, notas)
    values (v_c.stock_id, 'salida', round(v_c.cantidad, 2), v_actual, v_nuevo, 'Produccion: ' || v_tarea.descripcion);
    v_consumos := v_consumos || jsonb_build_array(jsonb_build_object(
      'stock_id', v_c.stock_id, 'nombre', v_nombre, 'unidad', v_unidad,
      'cantidad', v_c.cantidad, 'stock_antes', v_actual, 'stock_despues', v_nuevo));
    v_hubo := true;
  end loop;

  v_prod_id := coalesce(public.stock_de_receta(v_tarea.receta_id), p_produccion_stock_id);
  v_prod_cant := coalesce(p_produccion_cantidad, p_cantidad_real);

  if v_prod_id is not null and v_prod_cant > 0 then
    select stock_actual, nombre, unidad into v_actual, v_nombre, v_unidad
      from public.stock where id = v_prod_id for update;
    if not found then raise exception 'Item producido no encontrado: %', v_prod_id; end if;
    v_nuevo := v_actual + v_prod_cant;
    update public.stock set stock_actual = v_nuevo, updated_at = now() where id = v_prod_id;
    insert into public.stock_movimientos (stock_id, tipo, cantidad, stock_antes, stock_despues, notas)
    values (v_prod_id, 'entrada', v_prod_cant, v_actual, v_nuevo, 'Produccion completada: ' || v_tarea.descripcion);
    v_produccion := jsonb_build_object(
      'stock_id', v_prod_id, 'nombre', v_nombre, 'unidad', v_unidad,
      'cantidad', v_prod_cant, 'stock_antes', v_actual, 'stock_despues', v_nuevo);
    v_hubo := true;
  end if;

  update public.produccion_tareas
     set estado = 'completada',
         completada_por = nullif(p_completada_por, ''),
         completada_at = now(),
         cantidad_real = p_cantidad_real,
         stock_descontado = v_hubo,
         descuento_detalle = case when v_hubo
           then jsonb_build_object('consumos', v_consumos, 'produccion', v_produccion) end,
         notas_equipo = nullif(p_notas_equipo, '')
   where id = p_tarea_id;
end;
$$;

-- ─── 7. Conteo (cierre de servicio o inventario) ────────────────────────────
-- p_conteos = [{ "stock_id": "...", "contado": 3.5 }, ...]
-- Deja cada ítem en lo contado y registra la diferencia como ajuste.
create or replace function public.registrar_conteo_stock(p_conteos jsonb, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_it      jsonb;
  v_id      uuid;
  v_cont    numeric;
  v_actual  numeric;
  v_nombre  text;
  v_res     jsonb := '[]'::jsonb;
begin
  if not (public.is_operational_user() or public.puede_tabla('stock', 'editar')) then
    raise exception 'No autorizado';
  end if;

  for v_it in
    select value from jsonb_array_elements(coalesce(p_conteos, '[]'::jsonb))
     order by value->>'stock_id'
  loop
    v_id   := nullif(v_it->>'stock_id', '')::uuid;
    v_cont := nullif(v_it->>'contado', '')::numeric;
    if v_id is null or v_cont is null then continue; end if;
    if v_cont < 0 then raise exception 'El conteo no puede ser negativo'; end if;

    select stock_actual, nombre into v_actual, v_nombre from public.stock where id = v_id for update;
    if not found then continue; end if;
    if v_actual = v_cont then
      v_res := v_res || jsonb_build_array(jsonb_build_object(
        'stock_id', v_id, 'nombre', v_nombre, 'esperado', v_actual, 'contado', v_cont, 'diferencia', 0));
      continue;
    end if;

    update public.stock set stock_actual = v_cont, updated_at = now() where id = v_id;
    insert into public.stock_movimientos (stock_id, tipo, cantidad, stock_antes, stock_despues, notas)
    values (v_id, 'ajuste', v_cont, v_actual, v_cont,
            coalesce(nullif(p_nota, ''), 'Conteo') || ': diferencia '
              || case when v_cont > v_actual then '+' else '' end || round(v_cont - v_actual, 2)::text);
    v_res := v_res || jsonb_build_array(jsonb_build_object(
      'stock_id', v_id, 'nombre', v_nombre, 'esperado', v_actual, 'contado', v_cont,
      'diferencia', v_cont - v_actual));
  end loop;
  return v_res;
end;
$$;

-- ─── 8. Permisos ────────────────────────────────────────────────────────────
revoke all on function public.descontar_stock_pedido(uuid) from public, anon, authenticated;
revoke all on function public.revertir_stock_pedido(uuid) from public, anon, authenticated;
grant execute on function public.stock_de_receta(uuid) to authenticated;
grant execute on function public.explotar_receta(uuid, numeric, boolean) to authenticated;
grant execute on function public.registrar_conteo_stock(jsonb, text) to authenticated;
grant execute on function public.completar_tarea_produccion(uuid, text, numeric, text, jsonb, uuid, numeric) to authenticated;
