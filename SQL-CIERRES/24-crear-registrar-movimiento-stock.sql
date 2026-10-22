-- 24 · CREA registrar_movimiento_stock (falta en la base)
-- Es la funcion que usa Inventario -> "Registrar movimiento" (entrada, merma,
-- ajuste). Estaba en la migracion 20260511000000 pero nunca se corrio en
-- Supabase. No toca datos: solo crea la funcion y le da permiso.

create or replace function public.registrar_movimiento_stock(
  p_stock_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_notas text default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actual numeric;
  v_nuevo numeric;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  if p_tipo not in ('entrada', 'merma', 'ajuste') then
    raise exception 'Tipo de movimiento invalido: %', p_tipo;
  end if;

  if p_cantidad is null or p_cantidad < 0 then
    raise exception 'La cantidad debe ser mayor o igual a cero';
  end if;

  select stock_actual
  into v_actual
  from public.stock
  where id = p_stock_id
  for update;

  if not found then
    raise exception 'Ingrediente de stock no encontrado';
  end if;

  v_nuevo := case p_tipo
    when 'ajuste' then p_cantidad
    when 'entrada' then v_actual + p_cantidad
    else greatest(0, v_actual - p_cantidad)
  end;

  update public.stock
  set stock_actual = v_nuevo
  where id = p_stock_id;

  insert into public.stock_movimientos (
    stock_id,
    tipo,
    cantidad,
    stock_antes,
    stock_despues,
    notas
  )
  values (
    p_stock_id,
    p_tipo,
    abs(p_cantidad),
    v_actual,
    v_nuevo,
    nullif(p_notas, '')
  );

  return v_nuevo;
end;
$$;

grant execute on function public.registrar_movimiento_stock(uuid, text, numeric, text) to authenticated;

-- Verificacion: tiene que devolver una fila con "true".
select exists (select 1 from pg_proc where proname = 'registrar_movimiento_stock') as creada;
