-- Stock split: materia prima vs produccion.
-- Keeps one inventory table so recipes can consume either kind with the same stock_id.

alter table public.stock
  add column if not exists tipo_stock text not null default 'materia_prima',
  add column if not exists receta_id uuid references public.recetas(id) on delete set null;

update public.stock
set tipo_stock = 'materia_prima'
where tipo_stock is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_tipo_stock_check'
      and conrelid = 'public.stock'::regclass
  ) then
    alter table public.stock
      add constraint stock_tipo_stock_check
      check (tipo_stock in ('materia_prima', 'produccion'));
  end if;
end
$$;

create index if not exists idx_stock_tipo_stock on public.stock(tipo_stock, nombre);
create index if not exists idx_stock_receta_id on public.stock(receta_id) where receta_id is not null;

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
  v_allowed boolean := false;
  v_tarea record;
  v_item jsonb;
  v_stock_id uuid;
  v_cantidad numeric;
  v_nombre text;
  v_unidad text;
  v_actual numeric;
  v_nuevo numeric;
  v_consumos jsonb := '[]'::jsonb;
  v_produccion jsonb := null;
  v_produccion_cantidad numeric;
  v_tuvo_movimientos boolean := false;
begin
  if to_regprocedure('public.is_operational_user()') is not null then
    execute 'select public.is_operational_user()' into v_allowed;
  else
    v_allowed := auth.role() = 'authenticated';
  end if;

  if not v_allowed then
    raise exception 'No autorizado';
  end if;

  if p_cantidad_real is null or p_cantidad_real <= 0 then
    raise exception 'La cantidad producida debe ser mayor a cero';
  end if;

  select *
  into v_tarea
  from public.produccion_tareas
  where id = p_tarea_id
  for update;

  if not found then
    raise exception 'Tarea de produccion no encontrada';
  end if;

  if v_tarea.estado = 'completada' then
    raise exception 'La tarea ya esta completada';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_consumos, '[]'::jsonb)) as t(value)
  loop
    v_stock_id := nullif(v_item->>'stock_id', '')::uuid;
    v_cantidad := coalesce(nullif(v_item->>'cantidad', '')::numeric, 0);
    v_nombre := coalesce(nullif(v_item->>'nombre', ''), 'Stock');
    v_unidad := nullif(v_item->>'unidad', '');

    if v_stock_id is null or v_cantidad <= 0 then
      continue;
    end if;

    select stock_actual
    into v_actual
    from public.stock
    where id = v_stock_id
    for update;

    if not found then
      raise exception 'Item de stock no encontrado: %', v_stock_id;
    end if;

    v_nuevo := greatest(0, v_actual - v_cantidad);

    update public.stock
    set stock_actual = v_nuevo
    where id = v_stock_id;

    insert into public.stock_movimientos (
      stock_id,
      tipo,
      cantidad,
      stock_antes,
      stock_despues,
      notas
    )
    values (
      v_stock_id,
      'merma',
      v_cantidad,
      v_actual,
      v_nuevo,
      'Produccion: ' || v_tarea.descripcion
    );

    v_consumos := v_consumos || jsonb_build_array(jsonb_build_object(
      'stock_id', v_stock_id,
      'nombre', v_nombre,
      'unidad', v_unidad,
      'cantidad', v_cantidad,
      'stock_antes', v_actual,
      'stock_despues', v_nuevo
    ));
    v_tuvo_movimientos := true;
  end loop;

  v_produccion_cantidad := coalesce(p_produccion_cantidad, p_cantidad_real);

  if p_produccion_stock_id is not null and v_produccion_cantidad > 0 then
    select stock_actual, nombre, unidad
    into v_actual, v_nombre, v_unidad
    from public.stock
    where id = p_produccion_stock_id
    for update;

    if not found then
      raise exception 'Item producido no encontrado: %', p_produccion_stock_id;
    end if;

    v_nuevo := v_actual + v_produccion_cantidad;

    update public.stock
    set stock_actual = v_nuevo
    where id = p_produccion_stock_id;

    insert into public.stock_movimientos (
      stock_id,
      tipo,
      cantidad,
      stock_antes,
      stock_despues,
      notas
    )
    values (
      p_produccion_stock_id,
      'entrada',
      v_produccion_cantidad,
      v_actual,
      v_nuevo,
      'Produccion completada: ' || v_tarea.descripcion
    );

    v_produccion := jsonb_build_object(
      'stock_id', p_produccion_stock_id,
      'nombre', v_nombre,
      'unidad', v_unidad,
      'cantidad', v_produccion_cantidad,
      'stock_antes', v_actual,
      'stock_despues', v_nuevo
    );
    v_tuvo_movimientos := true;
  end if;

  update public.produccion_tareas
  set estado = 'completada',
      completada_por = nullif(p_completada_por, ''),
      completada_at = now(),
      cantidad_real = p_cantidad_real,
      stock_descontado = v_tuvo_movimientos,
      descuento_detalle = case
        when v_tuvo_movimientos then jsonb_build_object('consumos', v_consumos, 'produccion', v_produccion)
        else null
      end,
      notas_equipo = nullif(p_notas_equipo, '')
  where id = p_tarea_id;
end;
$$;

create or replace function public.revertir_tarea_produccion(
  p_tarea_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowed boolean := false;
  v_tarea record;
  v_detalle jsonb;
  v_consumos jsonb;
  v_produccion jsonb;
  v_item jsonb;
  v_stock_id uuid;
  v_cantidad numeric;
  v_actual numeric;
  v_nuevo numeric;
begin
  if to_regprocedure('public.is_operational_user()') is not null then
    execute 'select public.is_operational_user()' into v_allowed;
  else
    v_allowed := auth.role() = 'authenticated';
  end if;

  if not v_allowed then
    raise exception 'No autorizado';
  end if;

  select *
  into v_tarea
  from public.produccion_tareas
  where id = p_tarea_id
  for update;

  if not found then
    raise exception 'Tarea de produccion no encontrada';
  end if;

  v_detalle := v_tarea.descuento_detalle;

  if v_tarea.stock_descontado and v_detalle is not null then
    if jsonb_typeof(v_detalle) = 'array' then
      v_consumos := v_detalle;
      v_produccion := null;
    else
      v_consumos := coalesce(v_detalle->'consumos', '[]'::jsonb);
      v_produccion := v_detalle->'produccion';
    end if;

    for v_item in
      select value
      from jsonb_array_elements(coalesce(v_consumos, '[]'::jsonb)) as t(value)
    loop
      v_stock_id := nullif(v_item->>'stock_id', '')::uuid;
      v_cantidad := coalesce(nullif(v_item->>'cantidad', '')::numeric, 0);

      if v_stock_id is null or v_cantidad <= 0 then
        continue;
      end if;

      select stock_actual
      into v_actual
      from public.stock
      where id = v_stock_id
      for update;

      if not found then
        raise exception 'Item de stock no encontrado: %', v_stock_id;
      end if;

      v_nuevo := v_actual + v_cantidad;

      update public.stock
      set stock_actual = v_nuevo
      where id = v_stock_id;

      insert into public.stock_movimientos (stock_id, tipo, cantidad, stock_antes, stock_despues, notas)
      values (v_stock_id, 'entrada', v_cantidad, v_actual, v_nuevo, 'Revertido produccion: ' || v_tarea.descripcion);
    end loop;

    if v_produccion is not null and v_produccion <> 'null'::jsonb then
      v_stock_id := nullif(v_produccion->>'stock_id', '')::uuid;
      v_cantidad := coalesce(nullif(v_produccion->>'cantidad', '')::numeric, 0);

      if v_stock_id is not null and v_cantidad > 0 then
        select stock_actual
        into v_actual
        from public.stock
        where id = v_stock_id
        for update;

        if not found then
          raise exception 'Item producido no encontrado: %', v_stock_id;
        end if;

        v_nuevo := greatest(0, v_actual - v_cantidad);

        update public.stock
        set stock_actual = v_nuevo
        where id = v_stock_id;

        insert into public.stock_movimientos (stock_id, tipo, cantidad, stock_antes, stock_despues, notas)
        values (v_stock_id, 'merma', v_cantidad, v_actual, v_nuevo, 'Revertido produccion completada: ' || v_tarea.descripcion);
      end if;
    end if;
  end if;

  update public.produccion_tareas
  set estado = 'pendiente',
      completada_por = null,
      completada_at = null,
      cantidad_real = null,
      stock_descontado = false,
      descuento_detalle = null,
      notas_equipo = null
  where id = p_tarea_id;
end;
$$;

grant execute on function public.completar_tarea_produccion(uuid, text, numeric, text, jsonb, uuid, numeric) to authenticated;
grant execute on function public.revertir_tarea_produccion(uuid) to authenticated;

notify pgrst, 'reload schema';
