-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — RPC actualizar_datos_pedido (editar datos de cabecera de una orden)
-- ════════════════════════════════════════════════════════════════════════════
--
-- SÍNTOMA: desde el dashboard se editan los datos de una orden (fecha/hora,
--          cliente, mesa, notas, tipo) pero "no se guardan": el formulario
--          muestra el cambio y al refrescar vuelve todo atrás, sin ningún error.
--
-- CAUSA:   RLS. La escritura directa sobre `public.pedidos` está gobernada por
--          policies que exigen rol operativo/admin (is_operational_user /
--          is_admin). Si esa policy no está aplicada en esta base, o la sesión
--          no cumple el rol, el `UPDATE public.pedidos ...` NO lanza error:
--          simplemente afecta 0 filas (comportamiento estándar de RLS en un
--          UPDATE cuyo USING no matchea). El realtime luego vuelve a traer los
--          datos viejos y parece que "no guardó".
--
-- SOLUCIÓN: una RPC SECURITY DEFINER (corre con los privilegios del dueño, así
--           saltea RLS) que valida el rol del que llama y actualiza SOLO las
--           columnas permitidas presentes en el patch. Es el mismo patrón que
--           ya usa 20260627020000 (fix_total_pedido_web_security_definer) para
--           resolver exactamente este problema de "0 filas silenciosas".
--
-- SEGURIDAD:
--   • Autoriza con public.is_operational_user() (admin / cocina / mozo).
--   • Whitelist de columnas: nunca toca id, total, estado, comprobantes, etc.
--   • Dinámica y tolerante: si alguna columna no existe en este esquema, la
--     saltea (no rompe), igual que hacen reabrir_pedido / reactivar_pedido.
--
-- Idempotente: seguro de re-correr. Pegar en Supabase Studio → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.actualizar_datos_pedido(
  p_pedido_id uuid,
  p_patch     jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Columnas de "cabecera" que el editor puede tocar. Cualquier otra clave del
  -- patch se ignora (no se puede cambiar total, estado, facturación, etc.).
  v_allowed text[] := array[
    'created_at', 'canal', 'cliente_nombre', 'cliente_telefono',
    'cliente_direccion', 'mesa', 'personas', 'notas', 'programado_para'
  ];
  v_col  text;
  v_type text;
  v_set  text := '';
begin
  if p_pedido_id is null then
    raise exception 'pedido_id es requerido';
  end if;

  -- Autorización: mismo criterio que is_operational_user() (admin / cocina /
  -- mozo), pero INLINE para no depender de que esa función esté creada en esta
  -- base (su migración de origen puede no haberse aplicado). El rol se lee del
  -- JWT; por defecto 'cocina', que es operativo.
  if coalesce(
       nullif(auth.jwt() -> 'app_metadata'  ->> 'role', ''),
       nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
       'cocina'
     ) not in ('admin', 'cocina', 'mozo')
     and lower(coalesce(auth.jwt() ->> 'email', '')) <> 'cocina@kikusushi.com'
  then
    raise exception 'No autorizado para editar los datos del pedido';
  end if;

  if not exists (select 1 from public.pedidos where id = p_pedido_id) then
    raise exception 'Pedido no encontrado';
  end if;

  -- Armamos el SET solo con las claves que vienen en el patch Y existen como
  -- columna en la tabla (tolerante a esquemas donde falte alguna migración).
  foreach v_col in array v_allowed loop
    if p_patch ? v_col then
      select data_type into v_type
        from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'pedidos'
         and column_name  = v_col;

      if v_type is null then
        continue;  -- la columna no existe en este esquema → la salteamos
      end if;

      if v_set <> '' then
        v_set := v_set || ', ';
      end if;

      if v_col = 'personas' then
        v_set := v_set || format('%I = nullif(($1 ->> %L), '''')::int', v_col, v_col);
      elsif v_type = 'timestamp with time zone' then
        v_set := v_set || format('%I = nullif(($1 ->> %L), '''')::timestamptz', v_col, v_col);
      elsif v_type = 'timestamp without time zone' then
        v_set := v_set || format('%I = nullif(($1 ->> %L), '''')::timestamp', v_col, v_col);
      else
        -- Texto (canal, mesa, cliente_*, notas): ->> ya devuelve NULL si la
        -- clave trae JSON null, permitiendo limpiar el campo.
        v_set := v_set || format('%I = ($1 ->> %L)', v_col, v_col);
      end if;
    end if;
  end loop;

  if v_set = '' then
    return;  -- nada permitido para actualizar
  end if;

  execute format('update public.pedidos set %s where id = $2', v_set)
    using p_patch, p_pedido_id;
end;
$$;

grant execute on function public.actualizar_datos_pedido(uuid, jsonb) to authenticated;

comment on function public.actualizar_datos_pedido(uuid, jsonb) is
  'Edita datos de cabecera de una orden (fecha/hora, cliente, mesa, personas, '
  'notas, canal, programado_para) desde un patch jsonb. SECURITY DEFINER: saltea '
  'RLS pero autoriza con is_operational_user(). Whitelist de columnas + tolerante '
  'a columnas inexistentes.';

-- Recargar el schema cache de PostgREST para que la RPC quede disponible ya.
notify pgrst, 'reload schema';
