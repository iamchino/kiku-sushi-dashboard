--
-- Nota: orden de instalación → 1) este archivo  2) datos_catalogo.sql  3) CONFIGURAR-CLIENTE.sql (editado)
-- PostgreSQL database dump
--

-- (limpiado) \restrict nYz45lZyIg5UhSvd2njM7t1Fj5oS4mtLRulBQ0QNeFhIbrsphOyTzfySbLUfESg

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: reserva_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reserva_estado AS ENUM (
    'pendiente',
    'confirmada',
    'sentada',
    'no_show',
    'cancelada'
);


--
-- Name: abrir_mesa(uuid, integer, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.abrir_mesa(p_mesa_id uuid, p_personas integer, p_mozo_id uuid DEFAULT NULL::uuid, p_cliente_nombre text DEFAULT NULL::text, p_cliente_telefono text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_pedido_id   uuid;
  v_mesa_numero int;
begin
  if not is_operational_user() then
    raise exception 'No autorizado';
  end if;

  if exists (
    select 1 from public.pedidos
    where mesa_id = p_mesa_id
      and estado not in ('entregado','cancelado')
  ) then
    raise exception 'La mesa ya está abierta';
  end if;

  select numero into v_mesa_numero from public.mesas where id = p_mesa_id;
  if v_mesa_numero is null then
    raise exception 'Mesa inexistente';
  end if;

  insert into public.pedidos (
    canal, mesa, mesa_id, mozo_id, personas,
    cliente_nombre, cliente_telefono,
    abierta_at, estado, total
  ) values (
    'salon', v_mesa_numero, p_mesa_id, p_mozo_id, p_personas,
    p_cliente_nombre, p_cliente_telefono,
    now(), 'pendiente', 0
  )
  returning id into v_pedido_id;

  return v_pedido_id;
end $$;


--
-- Name: actualizar_datos_pedido(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_datos_pedido(p_pedido_id uuid, p_patch jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
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
$_$;


--
-- Name: FUNCTION actualizar_datos_pedido(p_pedido_id uuid, p_patch jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.actualizar_datos_pedido(p_pedido_id uuid, p_patch jsonb) IS 'Edita datos de cabecera de una orden (fecha/hora, cliente, mesa, personas, notas, canal, programado_para) desde un patch jsonb. SECURITY DEFINER: saltea RLS pero autoriza con is_operational_user(). Whitelist de columnas + tolerante a columnas inexistentes.';


--
-- Name: actualizar_estado_lista_espera(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_estado_lista_espera(p_id uuid, p_estado text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if p_id is null or p_estado is null then
    raise exception 'id y estado son requeridos';
  end if;
  if p_estado not in ('esperando', 'contactado', 'convertida', 'cancelada') then
    raise exception 'Estado inválido: %', p_estado;
  end if;
 
  update public.lista_espera
     set estado = p_estado
   where id = p_id;
end;
$$;


--
-- Name: actualizar_estado_reserva(uuid, public.reserva_estado); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_estado_reserva(p_reserva_id uuid, p_estado public.reserva_estado) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_now timestamptz := now();
begin
  if p_reserva_id is null or p_estado is null then
    raise exception 'reserva_id y estado son requeridos';
  end if;

  update public.reservas
     set estado        = p_estado,
         confirmada_at = case when p_estado = 'confirmada' then v_now else confirmada_at end,
         sentada_at    = case when p_estado = 'sentada'    then v_now else sentada_at end,
         cancelada_at  = case when p_estado in ('cancelada','no_show') then v_now else cancelada_at end
   where id = p_reserva_id;
end;
$$;


--
-- Name: acumular_cliente(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acumular_cliente() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
BEGIN
  IF NEW.estado = 'entregado' AND OLD.estado != 'entregado' THEN
    UPDATE clientes
    SET 
      pedidos_total = pedidos_total + 1,
      gasto_total   = gasto_total + NEW.total,
      puntos        = puntos + FLOOR(NEW.total / 100)  -- 1 punto cada $100
    WHERE id = NEW.cliente_id;
  END IF;
  RETURN NEW;
END;
$_$;


--
-- Name: agregar_items_pedido(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.agregar_items_pedido(p_pedido_id uuid, p_items jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_descuento numeric;
begin
  if not is_operational_user() then
    raise exception 'No autorizado';
  end if;

  insert into public.pedido_items
    (pedido_id, menu_item_id, variante_id, nombre, precio_unitario, cantidad, notas)
  select
    p_pedido_id,
    nullif(i->>'menu_item_id','')::uuid,
    nullif(i->>'variante_id','')::uuid,
    i->>'nombre',
    (i->>'precio_unitario')::numeric,
    (i->>'cantidad')::int,
    nullif(i->>'notas','')
  from jsonb_array_elements(p_items) as i;

  select coalesce(descuento_porcentaje, 0)
    into v_descuento
  from public.pedidos where id = p_pedido_id;

  update public.pedidos
  set total = round(
        (select coalesce(sum(precio_unitario * cantidad), 0)
         from public.pedido_items where pedido_id = p_pedido_id)
        * (1 - v_descuento/100), 2),
      updated_at = now()
  where id = p_pedido_id;
end $$;


--
-- Name: agrupar_mesa(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.agrupar_mesa(p_leader_id uuid, p_member_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_leader_id IS NULL OR p_member_id IS NULL THEN
    RAISE EXCEPTION 'leader y member son requeridos';
  END IF;
 
  IF p_leader_id = p_member_id THEN
    RAISE EXCEPTION 'Una mesa no puede agruparse consigo misma';
  END IF;
 
  -- El miembro no puede ser ya líder de otro grupo
  IF EXISTS (SELECT 1 FROM public.mesas WHERE mesa_grupo_id = p_member_id) THEN
    RAISE EXCEPTION 'La mesa miembro ya es líder de su propio grupo, desagrupala primero';
  END IF;
 
  -- El líder no puede ser él mismo miembro de otro grupo
  IF EXISTS (
    SELECT 1 FROM public.mesas
     WHERE id = p_leader_id AND mesa_grupo_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'La mesa líder ya pertenece a otro grupo';
  END IF;
 
  -- Las dos mesas deben pertenecer al mismo salón
  IF EXISTS (
    SELECT 1
      FROM public.mesas l
      JOIN public.mesas m ON m.id = p_member_id
     WHERE l.id = p_leader_id
       AND l.salon_id IS DISTINCT FROM m.salon_id
  ) THEN
    RAISE EXCEPTION 'Las mesas a agrupar deben estar en el mismo salón';
  END IF;
 
  UPDATE public.mesas
     SET mesa_grupo_id = p_leader_id,
         updated_at    = now()
   WHERE id = p_member_id;
END;
$$;


--
-- Name: ajustar_caja_fuerte(numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ajustar_caja_fuerte(p_monto numeric, p_direccion text, p_descripcion text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not (public.tiene_permiso('caja_fuerte', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para operar la caja fuerte.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.';
  end if;
  if p_direccion not in ('sobrante', 'faltante') then
    raise exception 'Dirección inválida: usá sobrante (suma) o faltante (resta).';
  end if;
  if coalesce(trim(p_descripcion), '') = '' then
    raise exception 'Explicá el motivo del ajuste.';
  end if;

  insert into public.caja_fuerte_movimientos (tipo, categoria, monto, descripcion, usuario_id)
  values ('ajuste', p_direccion, p_monto, trim(p_descripcion), auth.uid());

  return jsonb_build_object('saldo', public.saldo_caja_fuerte());
end $$;


--
-- Name: asignar_pagos_a_turno(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.asignar_pagos_a_turno(p_turno_id uuid, p_pago_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede asignar pagos a un turno de caja.';
  end if;
  if p_turno_id is null then
    raise exception 'Falta el turno destino.';
  end if;
  if p_pago_ids is null or array_length(p_pago_ids, 1) is null then
    return 0;
  end if;
 
  update public.pagos
     set caja_turno_id = p_turno_id
   where id = any(p_pago_ids);
 
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


--
-- Name: avanzar_estado_pedido(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avanzar_estado_pedido(p_pedido_id uuid, p_estado_actual text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_estado_actual text;
  v_siguiente text;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  select estado
  into v_estado_actual
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_estado_actual <> p_estado_actual then
    raise exception 'El pedido cambio de estado. Actualiza la pantalla e intenta de nuevo.';
  end if;

  v_siguiente := case v_estado_actual
    when 'pendiente' then 'preparando'
    when 'preparando' then 'listo'
    when 'listo' then 'entregado'
    else null
  end;

  if v_siguiente is null then
    raise exception 'El pedido no se puede avanzar desde el estado %', v_estado_actual;
  end if;

  update public.pedidos
  set estado = v_siguiente
  where id = p_pedido_id;

  return v_siguiente;
end;
$$;


--
-- Name: FUNCTION avanzar_estado_pedido(p_pedido_id uuid, p_estado_actual text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.avanzar_estado_pedido(p_pedido_id uuid, p_estado_actual text) IS 'Advances an order state with role-aware rules. Cocina can only move pendiente/preparando orders; admin can use the full flow.';


--
-- Name: caja_movimientos_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.caja_movimientos_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_turno_id uuid := coalesce(NEW.turno_id, OLD.turno_id);
  v_estado   text;
begin
  if v_turno_id is null then
    return coalesce(NEW, OLD);
  end if;
 
  select estado into v_estado from public.caja_turnos where id = v_turno_id;
 
  if v_estado is distinct from 'reabierto' then
    return coalesce(NEW, OLD);
  end if;
 
  if TG_OP = 'INSERT' then
    insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
    values (NEW.turno_id, 'movimiento_creado',
            jsonb_build_object('nuevo', to_jsonb(NEW)));
  elsif TG_OP = 'UPDATE' then
    insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
    values (NEW.turno_id, 'movimiento_editado',
            jsonb_build_object('anterior', to_jsonb(OLD), 'nuevo', to_jsonb(NEW)));
  elsif TG_OP = 'DELETE' then
    insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
    values (OLD.turno_id, 'movimiento_eliminado',
            jsonb_build_object('anterior', to_jsonb(OLD)));
  end if;
 
  return coalesce(NEW, OLD);
end;
$$;


--
-- Name: caja_turnos_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.caja_turnos_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if OLD.estado = 'reabierto' and NEW.estado = 'cerrado' then
    insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
    values (NEW.id, 'recierre', jsonb_build_object(
      'cierre_monto',      jsonb_build_object('antes', OLD.cierre_monto,      'despues', NEW.cierre_monto),
      'efectivo_esperado', jsonb_build_object('antes', OLD.efectivo_esperado, 'despues', NEW.efectivo_esperado),
      'diferencia',        jsonb_build_object('antes', OLD.diferencia,        'despues', NEW.diferencia),
      'notas_cierre',      jsonb_build_object('antes', OLD.notas_cierre,      'despues', NEW.notas_cierre)
    ));
  elsif OLD.estado = 'reabierto' and NEW.estado = 'reabierto' and (
       OLD.cierre_monto         is distinct from NEW.cierre_monto
    or OLD.efectivo_esperado    is distinct from NEW.efectivo_esperado
    or OLD.diferencia           is distinct from NEW.diferencia
    or OLD.notas_cierre         is distinct from NEW.notas_cierre
    or OLD.denominaciones_cierre is distinct from NEW.denominaciones_cierre
  ) then
    insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
    values (NEW.id, 'cierre_editado', jsonb_build_object(
      'cierre_monto', jsonb_build_object('antes', OLD.cierre_monto, 'despues', NEW.cierre_monto),
      'diferencia',   jsonb_build_object('antes', OLD.diferencia,   'despues', NEW.diferencia)
    ));
  end if;
 
  return NEW;
end;
$$;


--
-- Name: cerrar_mesa(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cerrar_mesa(p_pedido_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_operational_user() then
    raise exception 'No autorizado';
  end if;

  -- Marcar entregado (esto NO descuenta stock automáticamente:
  -- el descuento ya se hizo o se hará en avanzar_estado_pedido).
  -- Aquí asumimos que el cobro ya pasó.
  update public.pedidos
  set estado     = 'entregado',
      cerrada_at = now(),
      updated_at = now()
  where id = p_pedido_id;
end $$;


--
-- Name: cerrar_sesiones_de_rol(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cerrar_sesiones_de_rol(p_rol text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  n integer;
begin
  -- A propósito NO alcanza con is_finanzas_user(): esa función da true para
  -- cualquiera con rol 'finanzas', y esto puede dejar a todo el local afuera.
  -- Va con el mismo permiso que editar la matriz.
  if not public.puede_administrar_permisos() then
    raise exception 'No tenés permiso para cerrar las sesiones de un rol.';
  end if;

  delete from auth.sessions s
  where s.user_id in (
    select u.id from auth.users u
    where u.deleted_at is null
      and coalesce(nullif(u.raw_app_meta_data ->> 'role', ''), 'cocina') = p_rol
      -- Al que está haciendo el cambio no lo echamos: se cerraría su propia
      -- pantalla justo después de guardar.
      and u.id <> auth.uid()
  );
  get diagnostics n = row_count;
  return n;
end $$;


--
-- Name: cerrar_sesiones_de_usuario(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cerrar_sesiones_de_usuario(p_user_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  n integer;
begin
  if not (public.is_finanzas_user() or public.puede_administrar_permisos()) then
    raise exception 'No tenés permiso para cerrar sesiones de otros usuarios.';
  end if;

  delete from auth.sessions where user_id = p_user_id;
  get diagnostics n = row_count;
  return n;
end $$;


--
-- Name: FUNCTION cerrar_sesiones_de_usuario(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cerrar_sesiones_de_usuario(p_user_id uuid) IS 'Borra las sesiones de un usuario: no puede renovar el token. El access token vigente sigue valiendo hasta expirar (JWT expiry, 1 h por defecto).';


--
-- Name: completar_tarea_produccion(uuid, text, numeric, text, jsonb, uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.completar_tarea_produccion(p_tarea_id uuid, p_completada_por text, p_cantidad_real numeric, p_notas_equipo text DEFAULT NULL::text, p_consumos jsonb DEFAULT '[]'::jsonb, p_produccion_stock_id uuid DEFAULT NULL::uuid, p_produccion_cantidad numeric DEFAULT NULL::numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: crear_lista_espera(date, integer, text, text, time without time zone, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_lista_espera(p_fecha date, p_personas integer, p_cliente_nombre text, p_cliente_telefono text DEFAULT NULL::text, p_hora time without time zone DEFAULT NULL::time without time zone, p_cliente_email text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_tipo_experiencia text DEFAULT NULL::text, p_origen text DEFAULT 'web'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_id  uuid;
  v_dow int;
begin
  if p_fecha is null then
    raise exception 'La fecha es requerida';
  end if;
  if p_personas is null or p_personas < 1 then
    raise exception 'Cantidad de personas inválida';
  end if;
  if p_cliente_nombre is null or btrim(p_cliente_nombre) = '' then
    raise exception 'El nombre es requerido';
  end if;
  if p_tipo_experiencia is not null
     and p_tipo_experiencia not in ('omakase', 'umami_del_sur', 'pacifico_y_patagonia', 'kiku_libre', 'carta_abierta') then
    raise exception 'Tipo de experiencia inválido: %', p_tipo_experiencia;
  end if;
 
  -- Domingo (0) y Lunes (1): cerrado.
  v_dow := extract(dow from p_fecha)::int;
  if v_dow in (0, 1) then
    raise exception 'El local está cerrado ese día. Abrimos de martes a sábado.';
  end if;
 
  insert into public.lista_espera (
    fecha, hora, personas, tipo_experiencia,
    cliente_nombre, cliente_telefono, cliente_email, notas, origen
  ) values (
    p_fecha,
    p_hora,
    p_personas,
    p_tipo_experiencia,
    btrim(p_cliente_nombre),
    nullif(btrim(coalesce(p_cliente_telefono, '')), ''),
    nullif(btrim(coalesce(p_cliente_email,    '')), ''),
    nullif(btrim(coalesce(p_notas,            '')), ''),
    coalesce(p_origen, 'web')
  ) returning id into v_id;
 
  return v_id;
end;
$$;


--
-- Name: FUNCTION crear_lista_espera(p_fecha date, p_personas integer, p_cliente_nombre text, p_cliente_telefono text, p_hora time without time zone, p_cliente_email text, p_notas text, p_tipo_experiencia text, p_origen text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.crear_lista_espera(p_fecha date, p_personas integer, p_cliente_nombre text, p_cliente_telefono text, p_hora time without time zone, p_cliente_email text, p_notas text, p_tipo_experiencia text, p_origen text) IS 'Anota a un cliente en la lista de espera (canal web). No valida cupo (justamente se usa cuando no hay). Dispara notificación al dashboard.';


--
-- Name: crear_pedido_con_items(text, text, text, jsonb, numeric, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_pedido_con_items(p_canal text, p_mesa text, p_notas text, p_items jsonb, p_descuento_porcentaje numeric DEFAULT 0, p_cliente_nombre text DEFAULT NULL::text, p_cliente_telefono text DEFAULT NULL::text, p_cliente_direccion text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_pedido_id        uuid;
  v_subtotal         numeric := 0;
  v_descuento        numeric;
  v_total            numeric;
  v_has_menu_item_id boolean := false;
  v_has_variante_id  boolean := false;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe incluir al menos un item';
  end if;

  -- Clamp 0..100 (la columna ya tiene su check, esto es defensa en
  -- profundidad por si el cliente manda un valor fuera de rango).
  v_descuento := greatest(0, least(100, coalesce(p_descuento_porcentaje, 0)));

  -- Subtotal a partir de los items
  select coalesce(sum(
    coalesce((item->>'precio_unitario')::numeric, 0) *
    coalesce((item->>'cantidad')::numeric, 0)
  ), 0)
  into v_subtotal
  from jsonb_array_elements(p_items) as item;

  v_total := round(v_subtotal * (1 - v_descuento / 100.0), 2);

  insert into public.pedidos (
    canal, mesa, notas, total, descuento_porcentaje,
    cliente_nombre, cliente_telefono, cliente_direccion
  )
  values (
    p_canal,
    nullif(p_mesa, '')::int,
    nullif(p_notas, ''),
    v_total,
    v_descuento,
    nullif(btrim(coalesce(p_cliente_nombre,    '')), ''),
    nullif(btrim(coalesce(p_cliente_telefono,  '')), ''),
    nullif(btrim(coalesce(p_cliente_direccion, '')), '')
  )
  returning id into v_pedido_id;

  -- Detectar columnas opcionales en pedido_items (compat con instalaciones
  -- que aún no aplicaron 20260511_*: las columnas se crean ahí).
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'pedido_items' and column_name = 'menu_item_id'
  ) into v_has_menu_item_id;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'pedido_items' and column_name = 'variante_id'
  ) into v_has_variante_id;

  if v_has_menu_item_id and v_has_variante_id then
    execute $sql$
      insert into public.pedido_items (
        pedido_id, nombre, precio_unitario, cantidad, notas, menu_item_id, variante_id
      )
      select
        $1,
        i.nombre,
        coalesce(i.precio_unitario, 0),
        coalesce(i.cantidad, 1),
        nullif(i.notas, ''),
        i.menu_item_id,
        i.variante_id
      from jsonb_to_recordset($2) as i(
        nombre text,
        precio_unitario numeric,
        cantidad numeric,
        notas text,
        menu_item_id uuid,
        variante_id uuid
      )
    $sql$ using v_pedido_id, p_items;
  elsif v_has_menu_item_id then
    execute $sql$
      insert into public.pedido_items (
        pedido_id, nombre, precio_unitario, cantidad, notas, menu_item_id
      )
      select
        $1,
        i.nombre,
        coalesce(i.precio_unitario, 0),
        coalesce(i.cantidad, 1),
        nullif(i.notas, ''),
        i.menu_item_id
      from jsonb_to_recordset($2) as i(
        nombre text,
        precio_unitario numeric,
        cantidad numeric,
        notas text,
        menu_item_id uuid
      )
    $sql$ using v_pedido_id, p_items;
  else
    insert into public.pedido_items (
      pedido_id, nombre, precio_unitario, cantidad, notas
    )
    select
      v_pedido_id,
      i.nombre,
      coalesce(i.precio_unitario, 0),
      coalesce(i.cantidad, 1),
      nullif(i.notas, '')
    from jsonb_to_recordset(p_items) as i(
      nombre text,
      precio_unitario numeric,
      cantidad numeric,
      notas text
    );
  end if;

  return v_pedido_id;
end;
$_$;


--
-- Name: FUNCTION crear_pedido_con_items(p_canal text, p_mesa text, p_notas text, p_items jsonb, p_descuento_porcentaje numeric, p_cliente_nombre text, p_cliente_telefono text, p_cliente_direccion text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.crear_pedido_con_items(p_canal text, p_mesa text, p_notas text, p_items jsonb, p_descuento_porcentaje numeric, p_cliente_nombre text, p_cliente_telefono text, p_cliente_direccion text) IS 'Crea un pedido y sus items en una sola transacción. Acepta descuento_porcentaje (0..100) y datos opcionales de cliente. Calcula total = subtotal × (1 − desc/100).';


--
-- Name: crear_reserva(date, time without time zone, integer, text, text, text, text, text, integer, boolean, text, text, text, date, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_reserva(p_fecha date, p_hora time without time zone, p_personas integer, p_cliente_nombre text, p_cliente_telefono text DEFAULT NULL::text, p_cliente_email text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_origen text DEFAULT 'web'::text, p_duracion_min integer DEFAULT 90, p_auto_confirmar boolean DEFAULT true, p_restricciones text DEFAULT NULL::text, p_accesibilidad text DEFAULT NULL::text, p_tipo_experiencia text DEFAULT NULL::text, p_cliente_cumple date DEFAULT NULL::date, p_acepta_marketing boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_id               uuid;
  v_combined_ts      timestamp;
  v_min_anticip      interval := interval '2 hours';
  v_max_anticip      interval := interval '30 days';
  v_estado_inicial   reserva_estado;
  v_dow              int;
  v_dia              public.reservas_dias%rowtype;
  v_cfg              public.reservas_config%rowtype;
  v_slots_ok         text[];
  v_hhmm             text;
  v_experiencia_ok   boolean;
  v_capacidad_sal    int;
  v_capacidad_bar    int := public.kiku_capacidad_barra();
  v_ocupados_dia     int;
  v_ocupados_oma     int;
begin
  -- Validaciones básicas
  if p_fecha is null or p_hora is null then
    raise exception 'Fecha y hora son requeridas';
  end if;
  if p_personas is null or p_personas < 1 then
    raise exception 'Cantidad de personas inválida';
  end if;
  if p_cliente_nombre is null or btrim(p_cliente_nombre) = '' then
    raise exception 'El nombre del cliente es requerido';
  end if;
  if p_origen not in ('web', 'dashboard', 'telefono', 'whatsapp') then
    raise exception 'Origen inválido';
  end if;

  -- Experiencia válida: fija, o especial activo. (NULL = sin experiencia.)
  if p_tipo_experiencia is not null then
    v_experiencia_ok :=
         p_tipo_experiencia in ('carta_abierta', 'omakase', 'kiku_libre')
      or exists (select 1 from public.especiales e
                  where e.experiencia = p_tipo_experiencia and e.activo);
    if not v_experiencia_ok then
      raise exception 'Tipo de experiencia inválido o no disponible: %', p_tipo_experiencia;
    end if;
  end if;

  -- ─── Restricciones de día/horario (solo canal web) ───────────────────────
  if p_origen in ('web', 'whatsapp') then
    v_dow := extract(dow from p_fecha)::int;

    select * into v_dia  from public.reservas_dias   where dow = v_dow;
    select * into v_cfg  from public.reservas_config where id = 1;

    -- Día cerrado: ninguna franja habilitada.
    if v_dia.dow is null or not (coalesce(v_dia.mediodia, false) or coalesce(v_dia.noche, false)) then
      raise exception 'No tomamos reservas ese día.';
    end if;

    -- La experiencia tiene que ofrecerse ese día.
    if not public.kiku_experiencia_en_dia(p_tipo_experiencia, v_dow) then
      raise exception 'Esa experiencia no está disponible ese día.';
    end if;

    -- El horario tiene que ser un turno habilitado ese día.
    v_slots_ok := array[]::text[];
    if coalesce(v_dia.mediodia, false) then
      v_slots_ok := v_slots_ok || coalesce(v_cfg.mediodia_slots, '{}');
    end if;
    if coalesce(v_dia.noche, false) then
      v_slots_ok := v_slots_ok
        || coalesce(v_cfg.noche_slots, '{}')
        || coalesce(v_cfg.orden_llegada_slots, '{}');
    end if;

    v_hhmm := to_char(p_hora, 'HH24:MI');
    if not (v_hhmm = any(v_slots_ok)) then
      raise exception 'Ese horario no está disponible para reservar ese día.';
    end if;
  end if;

  v_combined_ts := (p_fecha + p_hora);

  if p_origen in ('web', 'whatsapp') then
    if v_combined_ts < (now() + v_min_anticip) then
      raise exception 'La reserva debe ser con al menos 2 horas de anticipación';
    end if;
    if v_combined_ts > (now() + v_max_anticip) then
      raise exception 'No se pueden hacer reservas con más de 30 días de anticipación';
    end if;
  end if;

  -- ─── Validación de cupo POR DÍA (solo web/whatsapp) — SIN CAMBIOS ─────────
  if p_origen in ('web', 'whatsapp') then
    if p_tipo_experiencia = 'omakase' then
      if p_personas > v_capacidad_bar then
        raise exception 'El omakase es para un máximo de % personas.', v_capacidad_bar;
      end if;
      select coalesce(sum(personas), 0)
        into v_ocupados_oma
        from public.reservas
       where fecha = p_fecha
         and tipo_experiencia = 'omakase'
         and estado not in ('cancelada', 'no_show');
      if v_ocupados_oma + p_personas > v_capacidad_bar then
        raise exception 'No quedan asientos de omakase para esa fecha. Lugares libres en la barra: %.',
          greatest(0, v_capacidad_bar - v_ocupados_oma);
      end if;
    else
      v_capacidad_sal := public.kiku_capacidad_salon_fecha(p_fecha);
      select coalesce(sum(personas), 0)
        into v_ocupados_dia
        from public.reservas
       where fecha = p_fecha
         and (tipo_experiencia is null or tipo_experiencia <> 'omakase')
         and estado not in ('cancelada', 'no_show');
      if v_ocupados_dia + p_personas > v_capacidad_sal then
        raise exception 'No hay cupo suficiente para esa fecha. Quedan % lugares libres.',
          greatest(0, v_capacidad_sal - v_ocupados_dia);
      end if;
    end if;
  end if;

  v_estado_inicial := case
    when p_auto_confirmar then 'confirmada'::reserva_estado
    else 'pendiente'::reserva_estado
  end;

  insert into public.reservas (
    fecha, hora, personas, duracion_min,
    cliente_nombre, cliente_telefono, cliente_email,
    notas, restricciones, accesibilidad, tipo_experiencia,
    estado, origen, confirmada_at
  ) values (
    p_fecha, p_hora, p_personas, coalesce(p_duracion_min, 90),
    btrim(p_cliente_nombre),
    nullif(btrim(coalesce(p_cliente_telefono, '')), ''),
    nullif(btrim(coalesce(p_cliente_email,    '')), ''),
    nullif(btrim(coalesce(p_notas,           '')), ''),
    nullif(btrim(coalesce(p_restricciones,   '')), ''),
    nullif(btrim(coalesce(p_accesibilidad,   '')), ''),
    p_tipo_experiencia,
    v_estado_inicial,
    p_origen,
    case when v_estado_inicial = 'confirmada' then now() else null end
  ) returning id into v_id;

  -- ─── Alta/actualización del cliente en el CRM (no bloqueante) — SIN CAMBIOS
  begin
    if p_origen in ('web', 'whatsapp', 'telefono') then
      perform public.kiku_upsert_cliente_marketing(
        p_nombre           => p_cliente_nombre,
        p_telefono         => p_cliente_telefono,
        p_email            => p_cliente_email,
        p_cumple           => p_cliente_cumple,
        p_acepta_marketing => coalesce(p_acepta_marketing, false),
        p_origen           => p_origen
      );
    end if;
  exception when others then
    raise warning 'crear_reserva: upsert CRM falló (reserva % igual guardada): %', v_id, sqlerrm;
  end;

  return v_id;
end;
$$;


--
-- Name: FUNCTION crear_reserva(p_fecha date, p_hora time without time zone, p_personas integer, p_cliente_nombre text, p_cliente_telefono text, p_cliente_email text, p_notas text, p_origen text, p_duracion_min integer, p_auto_confirmar boolean, p_restricciones text, p_accesibilidad text, p_tipo_experiencia text, p_cliente_cumple date, p_acepta_marketing boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.crear_reserva(p_fecha date, p_hora time without time zone, p_personas integer, p_cliente_nombre text, p_cliente_telefono text, p_cliente_email text, p_notas text, p_origen text, p_duracion_min integer, p_auto_confirmar boolean, p_restricciones text, p_accesibilidad text, p_tipo_experiencia text, p_cliente_cumple date, p_acepta_marketing boolean) IS 'Crea una reserva validando experiencia, día y turno contra reservas_dias/reservas_config/especiales (canal web/whatsapp), más cupo por día. Staff (dashboard/telefono) sin restricción de día/horario.';


--
-- Name: crear_rol(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_rol(p_id text, p_nombre text, p_descripcion text DEFAULT ''::text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
begin
  if not public.puede_administrar_permisos() then
    raise exception 'No tenés permiso para crear roles.';
  end if;

  if p_id !~ '^[a-z][a-z0-9_]{1,30}$' then
    raise exception
      'El id "%" no sirve: usá minúsculas, números y guión bajo, empezando por una letra (ej: encargado_turno).', p_id;
  end if;

  if exists (select 1 from public.roles where id = p_id) then
    raise exception 'Ya existe un rol con el id "%".', p_id;
  end if;

  insert into public.roles (id, nombre, descripcion, sistema, orden)
  values (p_id, p_nombre, coalesce(p_descripcion, ''), false,
          -- los roles nuevos van al final
          coalesce((select max(orden) from public.roles), 0) + 10);
end $_$;


--
-- Name: current_app_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_app_role() RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  -- SOLO app_metadata. user_metadata es escribible por el usuario.
  select coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), 'cocina')
$$;


--
-- Name: FUNCTION current_app_role(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.current_app_role() IS 'Rol del usuario autenticado, leído exclusivamente de app_metadata (escribible solo con la service key). Default: cocina. Espeja getRoleFromUser() en src/context/role.js.';


--
-- Name: desagrupar_grupo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desagrupar_grupo(p_leader_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_leader_id IS NULL THEN
    RAISE EXCEPTION 'leader es requerido';
  END IF;
 
  UPDATE public.mesas
     SET mesa_grupo_id = NULL,
         updated_at    = now()
   WHERE mesa_grupo_id = p_leader_id;
END;
$$;


--
-- Name: descontar_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.descontar_stock() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE ingredientes i
  SET stock_actual = stock_actual - (e.cantidad * NEW.cantidad)
  FROM escandallo e
  WHERE e.producto_id = NEW.producto_id
    AND e.ingrediente_id = i.id;
  RETURN NEW;
END;
$$;


--
-- Name: descontar_stock_produccion(uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.descontar_stock_produccion(p_stock_id uuid, p_cantidad numeric, p_notas text DEFAULT NULL::text) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_actual numeric;
  v_nuevo  numeric;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;
 
  if p_cantidad is null or p_cantidad <= 0 then
    return null;   -- nada que descontar
  end if;
 
  select stock_actual
  into v_actual
  from public.stock
  where id = p_stock_id
  for update;
 
  if not found then
    raise exception 'Ingrediente de stock no encontrado: %', p_stock_id;
  end if;
 
  v_nuevo := greatest(0, v_actual - p_cantidad);
 
  update public.stock
  set stock_actual = v_nuevo
  where id = p_stock_id;
 
  insert into public.stock_movimientos (
    stock_id, tipo, cantidad, stock_antes, stock_despues, notas
  )
  values (
    p_stock_id, 'merma', p_cantidad, v_actual, v_nuevo, coalesce(p_notas, 'Venta')
  );
 
  return v_nuevo;
end;
$$;


--
-- Name: eliminar_notificacion(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.eliminar_notificacion(p_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  delete from public.notificaciones where id = p_id;
$$;


--
-- Name: eliminar_rol(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.eliminar_rol(p_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  en_uso int;
  quienes text;
begin
  if not public.puede_administrar_permisos() then
    raise exception 'No tenés permiso para eliminar roles.';
  end if;

  select count(*), string_agg(coalesce(u.email, u.id::text), ', ')
    into en_uso, quienes
  from auth.users u
  where u.deleted_at is null
    and u.raw_app_meta_data ->> 'role' = p_id;

  if en_uso > 0 then
    raise exception
      'No podés eliminar el rol "%": lo tienen % usuario(s) (%). Cambiales el rol primero.',
      p_id, en_uso, quienes;
  end if;

  delete from public.roles where id = p_id;   -- el trigger frena los de sistema
end $$;


--
-- Name: empleados_para_pagos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.empleados_para_pagos() RETURNS TABLE(id uuid, nombre text, apellido text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not (public.tiene_permiso('pagos', 'ver') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para registrar pagos.';
  end if;
  return query
    select e.id, e.nombre, e.apellido
    from public.empleados e
    where e.activo
    order by e.nombre, e.apellido;
end $$;


--
-- Name: FUNCTION empleados_para_pagos(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.empleados_para_pagos() IS 'Solo id y nombre de los empleados activos, para el selector de pagos de sueldos. No expone sueldo_base ni el resto del legajo.';


--
-- Name: enviar_a_cocina(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enviar_a_cocina(p_pedido_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_enviados int;
begin
  if not is_operational_user() then
    raise exception 'No autorizado';
  end if;

  update public.pedido_items
  set enviado_cocina = true,
      enviado_at     = now()
  where pedido_id = p_pedido_id
    and enviado_cocina = false;

  get diagnostics v_enviados = row_count;

  if v_enviados > 0 then
    update public.pedidos
    set estado = case when estado in ('pendiente','listo')
                      then 'preparando'
                      else estado end,
        updated_at = now()
    where id = p_pedido_id;
  end if;

  return v_enviados;
end $$;


--
-- Name: es_admin_permisos_de_emergencia(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.es_admin_permisos_de_emergencia() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'finanzas@kikusushi.com.ar'
  )
$$;


--
-- Name: FUNCTION es_admin_permisos_de_emergencia(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.es_admin_permisos_de_emergencia() IS 'Lista blanca de emails que SIEMPRE pueden editar la matriz de permisos, pase lo que pase con la configuración. Solo se cambia con una migración.';


--
-- Name: fichar(text, double precision, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fichar(p_token text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_precision_m double precision DEFAULT NULL::double precision) RETURNS TABLE(fichaje_id uuid, tipo text, ts timestamp with time zone, mensaje text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_emp        public.empleados%rowtype;
  v_punto      public.puntos_fichaje%rowtype;
  v_last       public.fichajes%rowtype;
  v_tipo       text;
  v_fichaje_id uuid;
  v_ts         timestamptz;
  v_dist_m     double precision;
  v_tolerancia double precision;
begin
  -- 1) empleado activo vinculado al usuario logueado
  select * into v_emp
  from public.empleados
  where user_id = auth.uid() and activo
  limit 1;
  if not found then
    raise exception 'Tu usuario no está vinculado a un empleado activo. Avisale al encargado.';
  end if;
 
  -- 2) validar el QR (punto de fichaje activo)
  select * into v_punto
  from public.puntos_fichaje
  where token = p_token and activo
  limit 1;
  if not found then
    raise exception 'QR inválido o inactivo. Escaneá el QR oficial del local.';
  end if;
 
  -- 3) geocerca: si el punto tiene ubicación, hay que estar dentro del radio.
  --    Tolerancia extra = precisión del GPS reportada, tope 60 m.
  if v_punto.lat is not null and v_punto.lng is not null then
    if p_lat is null or p_lng is null then
      raise exception 'Necesitamos tu ubicación para fichar. Activá el GPS y dale permiso al navegador.';
    end if;
 
    v_dist_m := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - v_punto.lat) / 2), 2) +
      cos(radians(v_punto.lat)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - v_punto.lng) / 2), 2)
    ));
    v_tolerancia := v_punto.radio_m + least(coalesce(p_precision_m, 0), 60);
 
    if v_dist_m > v_tolerancia then
      raise exception 'Estás a ~% m del local (máx. % m). Tenés que fichar desde el local.',
        round(v_dist_m)::int, v_punto.radio_m;
    end if;
  end if;
 
  -- 4) última marca del empleado
  select * into v_last
  from public.fichajes
  where empleado_id = v_emp.id
  order by ts desc, created_at desc
  limit 1;
 
  -- 5) anti doble-scan (60 s)
  if v_last.id is not null and now() - v_last.ts < interval '60 seconds' then
    raise exception 'Ya fichaste hace instantes. Esperá un momento.';
  end if;
 
  -- 6) alternar entrada/salida
  if v_last.id is null or v_last.tipo = 'salida' then
    v_tipo := 'entrada';
  else
    v_tipo := 'salida';
  end if;
 
  -- 7) registrar (siempre a nombre del usuario logueado)
  insert into public.fichajes
    (empleado_id, tipo, ts, punto_id, origen, lat, lng, precision_m, distancia_m, registrado_por)
  values
    (v_emp.id, v_tipo, now(), v_punto.id, 'qr', p_lat, p_lng, p_precision_m,
     case when v_dist_m is null then null else round(v_dist_m)::int end,
     auth.uid())
  returning id, fichajes.ts into v_fichaje_id, v_ts;
 
  fichaje_id := v_fichaje_id;
  tipo       := v_tipo;
  ts         := v_ts;
  mensaje    := case when v_tipo = 'entrada' then 'Entrada registrada' else 'Salida registrada' end;
  return next;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: liquidaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empleado_id uuid NOT NULL,
    semana_inicio date NOT NULL,
    semana_fin date NOT NULL,
    minutos integer DEFAULT 0 NOT NULL,
    horas numeric(10,2) DEFAULT 0 NOT NULL,
    valor_hora numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    egreso_id uuid,
    pagado_at timestamp with time zone,
    nota text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tipo text DEFAULT 'semana'::text NOT NULL,
    CONSTRAINT liquidaciones_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'pagado'::text]))),
    CONSTRAINT liquidaciones_tipo_check CHECK ((tipo = ANY (ARRAY['semana'::text, 'dia'::text])))
);


--
-- Name: TABLE liquidaciones; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.liquidaciones IS 'Cierre semanal de horas por empleado (semana martes→lunes). La semana actual no se persiste: es "en curso" en el front.';


--
-- Name: COLUMN liquidaciones.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.liquidaciones.tipo IS 'semana = cierre martes→lunes · dia = jornal suelto (semana_inicio = semana_fin = día)';


--
-- Name: generar_liquidacion_dia(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generar_liquidacion_dia(p_empleado_id uuid, p_fecha date) RETURNS SETOF public.liquidaciones
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_emp public.empleados%rowtype;
  v_min int;
begin
  if not public.is_finanzas_user() then
    raise exception 'Solo el usuario de Finanzas puede generar liquidaciones.';
  end if;
 
  select * into v_emp from public.empleados where id = p_empleado_id;
  if not found then
    raise exception 'Empleado inexistente.';
  end if;
  if v_emp.tipo_sueldo <> 'hora' then
    raise exception 'El empleado no cobra por hora.';
  end if;
 
  -- si el día ya quedó dentro de un cierre semanal, no se puede pagar suelto
  if exists (
    select 1 from public.liquidaciones l
    where l.empleado_id = p_empleado_id
      and l.tipo = 'semana'
      and p_fecha between l.semana_inicio and l.semana_fin
  ) then
    raise exception 'Ese día ya está incluido en una liquidación semanal. Eliminá primero ese cierre si querés pagar el día suelto.';
  end if;
 
  select coalesce(sum(j.minutos), 0)::int into v_min
  from public.vista_jornadas j
  where j.empleado_id = p_empleado_id
    and j.salida is not null
    and (j.entrada at time zone 'America/Argentina/Buenos_Aires')::date = p_fecha;
 
  if v_min <= 0 then
    raise exception 'Sin horas cerradas ese día (jornadas abiertas no cuentan).';
  end if;
 
  return query
  insert into public.liquidaciones as l
    (empleado_id, tipo, semana_inicio, semana_fin, minutos, horas, valor_hora, total, estado)
  values (
    p_empleado_id, 'dia', p_fecha, p_fecha, v_min,
    round(v_min / 60.0, 2), v_emp.sueldo_base,
    round(v_min / 60.0 * v_emp.sueldo_base, 2), 'pendiente'
  )
  on conflict (empleado_id, tipo, semana_inicio) do update
    set minutos    = excluded.minutos,
        horas      = excluded.horas,
        valor_hora = excluded.valor_hora,
        total      = excluded.total
    where l.estado <> 'pagado'
  returning l.*;
end;
$$;


--
-- Name: generar_liquidacion_semanal(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generar_liquidacion_semanal(p_fecha date) RETURNS SETOF public.liquidaciones
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_inicio date;
  v_fin    date;
begin
  if not public.is_finanzas_user() then
    raise exception 'Solo el usuario de Finanzas puede generar liquidaciones.';
  end if;
 
  -- Lunes de esa semana (date_trunc('week') devuelve el lunes ISO) → domingo.
  v_inicio := date_trunc('week', p_fecha::timestamp)::date;
  v_fin    := v_inicio + 6;   -- domingo
 
  return query
  insert into public.liquidaciones as l
    (empleado_id, tipo, semana_inicio, semana_fin, minutos, horas, valor_hora, total, estado)
  select
    lh.empleado_id, 'semana', v_inicio, v_fin, lh.minutos, lh.horas, lh.valor_hora, lh.total, 'pendiente'
  from public.liquidacion_horas(v_inicio, v_fin) lh
  where lh.tipo_sueldo = 'hora' and lh.minutos > 0
  on conflict (empleado_id, tipo, semana_inicio) do update
    set minutos    = excluded.minutos,
        horas      = excluded.horas,
        valor_hora = excluded.valor_hora,
        total      = excluded.total,
        semana_fin = excluded.semana_fin
    where l.estado <> 'pagado'
  returning l.*;
end;
$$;


--
-- Name: guardar_admin_de_permisos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guardar_admin_de_permisos() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  roles_con_permiso int;
  con_gente         int;
begin
  select count(*) into roles_con_permiso
  from public.rol_permisos
  where recurso_id = 'permisos' and editar;

  if roles_con_permiso = 0 then
    raise exception
      'No podés dejar el sistema sin ningún rol que administre permisos. '
      'Dale el permiso a otro rol primero y después sacáselo a este.';
  end if;

  select count(*) into con_gente
  from public.rol_permisos rp
  where rp.recurso_id = 'permisos' and rp.editar
    and exists (
      select 1 from auth.users u
      where u.deleted_at is null
        and coalesce(nullif(u.raw_app_meta_data ->> 'role', ''), 'cocina') = rp.rol_id
    );

  if con_gente = 0 then
    raise exception
      'Los roles que administran permisos no los tiene ninguna persona, así que '
      'nadie podría volver a entrar a esta pantalla. Asignale ese rol a alguien '
      'antes de guardar.';
  end if;

  return null;
end $$;


--
-- Name: guardar_permisos_rol(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guardar_permisos_rol(p_rol text, p_recursos jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  n_invalidos int;
begin
  if not public.puede_administrar_permisos() then
    raise exception 'No tenés permiso para editar los permisos del sistema.';
  end if;

  if not exists (select 1 from public.roles where id = p_rol) then
    raise exception 'El rol "%" no existe.', p_rol;
  end if;

  if jsonb_typeof(p_recursos) <> 'array' then
    raise exception 'Se esperaba un array de ids de recurso.';
  end if;

  -- Un id mal escrito reventaría después con un error de foreign key poco
  -- legible; mejor decir cuál es.
  select count(*) into n_invalidos
  from jsonb_array_elements_text(p_recursos) e(id)
  where not exists (select 1 from public.recursos r where r.id = e.id);

  if n_invalidos > 0 then
    raise exception 'Hay % recurso(s) que no existen en el catálogo: %',
      n_invalidos,
      (select string_agg(e.id, ', ')
         from jsonb_array_elements_text(p_recursos) e(id)
        where not exists (select 1 from public.recursos r where r.id = e.id));
  end if;

  -- Borrar + insertar en la misma transacción. El trigger anti-lockout es
  -- diferido, así que ve el resultado final y no el hueco del medio.
  --
  -- `distinct` porque un id repetido reventaría con una violación de clave
  -- primaria y un mensaje de Postgres crudo.
  --
  -- `editar` se preserva si la fila ya existía: la UI de la fase 3 maneja una
  -- sola casilla (ver), y no queremos que guardar sin tocar nada eleve a
  -- editar una fila que alguien había dejado en solo-lectura. Para las filas
  -- nuevas arranca en true, igual que el seed.
  create temporary table _editar_previo on commit drop as
    select recurso_id, editar from public.rol_permisos where rol_id = p_rol;

  delete from public.rol_permisos where rol_id = p_rol;

  insert into public.rol_permisos (rol_id, recurso_id, ver, editar)
  select distinct p_rol, e.id, true, coalesce(prev.editar, true)
  from jsonb_array_elements_text(p_recursos) e(id)
  left join _editar_previo prev on prev.recurso_id = e.id;

  -- Que el error del trigger (que es diferido) salga acá adentro, con su
  -- mensaje, en vez de reventar en el COMMIT como un 500 sin explicación.
  set constraints all immediate;
end $$;


--
-- Name: FUNCTION guardar_permisos_rol(p_rol text, p_recursos jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.guardar_permisos_rol(p_rol text, p_recursos jsonb) IS 'Reemplaza los permisos de un rol en una sola transacción. Lo que no venga en el array se borra. Requiere puede_administrar_permisos().';


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select public.current_app_role() = 'admin'
$$;


--
-- Name: FUNCTION is_admin(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_admin() IS 'Convenience helper for RLS policies that should only allow admin users.';


--
-- Name: is_finanzas_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_finanzas_user() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'finanzas@kikusushi.com.ar'
      -- agregá acá más emails si hace falta habilitar a alguien sin rol
    )
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'finanzas'
$$;


--
-- Name: FUNCTION is_finanzas_user(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_finanzas_user() IS 'True si el usuario está habilitado para Finanzas: por email en lista blanca o por app_metadata.role = ''finanzas''. Espeja canAccessFinanzas() en src/context/role.js.';


--
-- Name: is_mozo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_mozo() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select public.current_app_role() = 'mozo'
$$;


--
-- Name: is_operational_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_operational_user() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select
    public.current_app_role() in ('admin', 'cocina', 'mozo')
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cocina@kikusushi.com'
$$;


--
-- Name: FUNCTION is_operational_user(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_operational_user() IS 'Admin, cocina y mozo gestionan tablas operativas. Caja/arqueo, clientes y analíticas quedan fuera.';


--
-- Name: kiku_capacidad_barra(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kiku_capacidad_barra() RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$ select 6 $$;


--
-- Name: FUNCTION kiku_capacidad_barra(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kiku_capacidad_barra() IS 'Capacidad de la barra del itamae (omakase). Una sola reserva de omakase por día.';


--
-- Name: kiku_capacidad_salon(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kiku_capacidad_salon() RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$ select 34 $$;


--
-- Name: FUNCTION kiku_capacidad_salon(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kiku_capacidad_salon() IS 'Capacidad total del salón POR DÍA (24 arriba + 4 pared abajo). Cambiar acá si se reconfigura el local.';


--
-- Name: kiku_capacidad_salon_fecha(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kiku_capacidad_salon_fecha(p_fecha date) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  select case when extract(dow from p_fecha)::int in (5, 6) then 28 else 34 end
$$;


--
-- Name: FUNCTION kiku_capacidad_salon_fecha(p_fecha date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kiku_capacidad_salon_fecha(p_fecha date) IS 'Cupo de salón POR DÍA para menús no-omakase. 28 los viernes/sábado (la barra va a omakase), 34 el resto de los días.';


--
-- Name: kiku_experiencia_en_dia(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kiku_experiencia_en_dia(p_experiencia text, p_dow integer) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select case
    -- Fijas (días estables)
    when p_experiencia is null            then true                 -- sin experiencia: cualquier día abierto
    when p_experiencia = 'carta_abierta'  then true
    when p_experiencia = 'omakase'        then p_dow in (5, 6)      -- viernes y sábado
    when p_experiencia = 'kiku_libre'     then p_dow in (3, 4)      -- miércoles y jueves
    -- Rotativas: según especiales.dias (vacío = cualquier día abierto)
    else exists (
      select 1 from public.especiales e
      where e.experiencia = p_experiencia
        and e.activo
        and (e.dias = '{}' or p_dow = any(e.dias))
    )
  end;
$$;


--
-- Name: kiku_items_recompute_total(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kiku_items_recompute_total() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_pedido uuid;
begin
  v_pedido := coalesce(new.pedido_id, old.pedido_id);
  if v_pedido is not null then
    update public.pedidos
      set total = public.kiku_total_pedido(pedidos)
      where id = v_pedido;
  end if;
  return coalesce(new, old);
end;
$$;


--
-- Name: kiku_parse_notas_legacy(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kiku_parse_notas_legacy(p_notas text) RETURNS TABLE(cliente_nombre text, cliente_telefono text, cliente_direccion text)
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
declare
  v_nombre text;
  v_tel    text;
  v_dir    text;
begin
  if p_notas is null or btrim(p_notas) = '' then
    return query select null::text, null::text, null::text;
    return;
  end if;

  -- "Cliente: X" — captura hasta el siguiente " | " o el final.
  v_nombre := substring(p_notas from 'Cliente:\s*([^|]+?)(?:\s*\||$)');
  v_tel    := substring(p_notas from 'Tel:\s*([^|]+?)(?:\s*\||$)');
  v_dir    := substring(p_notas from 'Dirección:\s*([^|]+?)(?:\s*\||$)');

  -- Trim defensivo
  v_nombre := nullif(btrim(coalesce(v_nombre, '')), '');
  v_tel    := nullif(btrim(coalesce(v_tel, '')),    '');
  v_dir    := nullif(btrim(coalesce(v_dir, '')),    '');

  return query select v_nombre, v_tel, v_dir;
end;
$_$;


--
-- Name: FUNCTION kiku_parse_notas_legacy(p_notas text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kiku_parse_notas_legacy(p_notas text) IS 'Extrae cliente_nombre/telefono/direccion del formato viejo "Cliente: ... | Tel: ... | Dirección: ... | Notas: ...". Devuelve NULL en cada campo no encontrado.';


--
-- Name: kiku_parse_precio_ar(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kiku_parse_precio_ar(p_input text) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
declare
  v_raw   text;
  v_clean text;
  v_match text;
begin
  if p_input is null then
    return null;
  end if;
  v_raw := trim(p_input);
  if v_raw = '' then
    return null;
  end if;
  -- Precios compuestos: "5p: $12.500 / 9p: $23.200"
  if position('/' in v_raw) > 0 then
    return null;
  end if;
  -- Extraer primer grupo numérico con separadores
  v_match := substring(v_raw from '([0-9]{1,3}(?:[.\,][0-9]{3})*(?:[.\,][0-9]{1,2})?|[0-9]+)');
  if v_match is null then
    return null;
  end if;
  v_clean := v_match;
  -- Si tiene coma, asumimos coma = decimal: quitamos puntos (miles).
  if position(',' in v_clean) > 0 then
    v_clean := replace(v_clean, '.', '');
    v_clean := replace(v_clean, ',', '.');
  else
    -- Sin coma: si el último punto está a >2 dígitos del final,
    -- es separador de miles ("12.500" → 12500). Si está a 1-2 dígitos
    -- del final, podría ser decimal ("12.50"), pero en AR para precios
    -- enteros con punto-miles ("$12.100") es siempre miles.
    -- Regla pragmática: si hay punto y el último grupo es exactamente
    -- 3 dígitos, tratamos como miles.
    if v_clean ~ '\.[0-9]{3}$' then
      v_clean := replace(v_clean, '.', '');
    end if;
  end if;
  begin
    return v_clean::numeric;
  exception when others then
    return null;
  end;
end;
$_$;


--
-- Name: FUNCTION kiku_parse_precio_ar(p_input text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kiku_parse_precio_ar(p_input text) IS 'Parser tolerante de precios en formato AR. Devuelve NULL para inputs vacíos, compuestos (con "/") o no parseables.';


--
-- Name: kiku_pedidos_set_total(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kiku_pedidos_set_total() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.total := public.kiku_total_pedido(new);
  return new;
end;
$$;


--
-- Name: kiku_reservas_touch_updated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kiku_reservas_touch_updated() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: kiku_sync_precio_especial_a_producto(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kiku_sync_precio_especial_a_producto() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_target numeric;
begin
  if new.cta_tipo = 'pedir'
     and new.cta_producto_id is not null
     and new.precio is not null then
 
    v_target := round(new.precio);
 
    update public.menu_items
       set precio     = v_target::bigint::text,   -- "45000" (el front lo formatea)
           precio_num = v_target
     where id = new.cta_producto_id
       -- Solo si el valor numérico difiere: así no pisamos un formato existente
       -- equivalente ni entramos en loop con el otro trigger.
       and public.kiku_parse_precio_ar(precio) is distinct from v_target;
  end if;
  return new;
end;
$$;


--
-- Name: kiku_sync_precio_producto_a_especial(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kiku_sync_precio_producto_a_especial() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_val numeric;
begin
  v_val := public.kiku_parse_precio_ar(new.precio);
  if v_val is not null then
    update public.especiales
       set precio = v_val
     where cta_producto_id = new.id
       and cta_tipo = 'pedir'
       and precio is distinct from v_val;   -- evita rebote/loop
  end if;
  return new;
end;
$$;


--
-- Name: pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero integer NOT NULL,
    cliente_id uuid,
    canal text NOT NULL,
    mesa text,
    estado text DEFAULT 'pendiente'::text,
    metodo_pago text,
    total numeric(10,2),
    notas text,
    turno_caja_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    stock_descontado boolean DEFAULT false,
    descuento_detalle jsonb,
    descuento_porcentaje numeric(5,2) DEFAULT 0 NOT NULL,
    cliente_nombre text,
    cliente_telefono text,
    cliente_direccion text,
    mesa_id uuid,
    mozo_id uuid,
    personas integer DEFAULT 1,
    abierta_at timestamp with time zone,
    cerrada_at timestamp with time zone,
    origen text DEFAULT 'dashboard'::text NOT NULL,
    programado_para timestamp with time zone,
    afecta_caja boolean DEFAULT true NOT NULL,
    medio_pago text,
    descuento_tipo text DEFAULT 'porcentaje'::text NOT NULL,
    descuento_valor numeric(12,2) DEFAULT 0 NOT NULL,
    descuento_alcance text DEFAULT 'todo'::text NOT NULL,
    descuento_monto numeric(12,2),
    descuento_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    servido_at timestamp with time zone,
    kiku_libre_rondas integer DEFAULT 0 NOT NULL,
    kiku_libre_historial jsonb DEFAULT '[]'::jsonb NOT NULL,
    costo_envio numeric(12,2) DEFAULT 0 NOT NULL,
    kiku_libre_platos integer,
    envio_zona text,
    CONSTRAINT pedidos_descuento_alcance_check CHECK ((descuento_alcance = ANY (ARRAY['todo'::text, 'seleccion'::text]))),
    CONSTRAINT pedidos_descuento_porcentaje_check CHECK (((descuento_porcentaje >= (0)::numeric) AND (descuento_porcentaje <= (100)::numeric))),
    CONSTRAINT pedidos_descuento_tipo_check CHECK ((descuento_tipo = ANY (ARRAY['porcentaje'::text, 'monto'::text]))),
    CONSTRAINT pedidos_kiku_libre_platos_check CHECK (((kiku_libre_platos IS NULL) OR (kiku_libre_platos >= 1))),
    CONSTRAINT pedidos_kiku_libre_rondas_check CHECK ((kiku_libre_rondas >= 0)),
    CONSTRAINT pedidos_origen_check CHECK ((origen = ANY (ARRAY['web'::text, 'dashboard'::text, 'telefono'::text, 'whatsapp'::text, 'pedidosya'::text, 'rappi'::text])))
);


--
-- Name: COLUMN pedidos.cliente_nombre; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.cliente_nombre IS 'Nombre del cliente que hizo el pedido. Llenado por la web pública y por el dashboard.';


--
-- Name: COLUMN pedidos.cliente_telefono; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.cliente_telefono IS 'Teléfono de contacto del cliente. Útil para CRM y para la facturación electrónica.';


--
-- Name: COLUMN pedidos.cliente_direccion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.cliente_direccion IS 'Dirección de entrega cuando el canal es delivery. NULL para retiro en local.';


--
-- Name: COLUMN pedidos.origen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.origen IS 'De dónde entró el pedido: web (página pública) | dashboard | telefono | whatsapp | pedidosya | rappi. La web manda origen=web y eso dispara el webhook de WhatsApp.';


--
-- Name: COLUMN pedidos.programado_para; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.programado_para IS 'Fecha/hora para la que el cliente programó el pedido. NULL = lo antes posible (inmediato).';


--
-- Name: COLUMN pedidos.afecta_caja; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.afecta_caja IS 'Si es false, el pedido está cobrado fuera de caja (no impacta el arqueo del turno ni se marca como pedido sin pago). Default true = operación normal.';


--
-- Name: COLUMN pedidos.medio_pago; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.medio_pago IS 'Medio de pago informado para el pedido (efectivo/transferencia/tarjeta_*). Solo dato/impresión; el arqueo se calcula desde la tabla pagos.';


--
-- Name: COLUMN pedidos.descuento_tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.descuento_tipo IS 'Tipo de descuento: porcentaje o monto fijo (gift card).';


--
-- Name: COLUMN pedidos.descuento_alcance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.descuento_alcance IS 'Alcance: todo el pedido o una selección de ítems (ej. solo comida o solo bebida).';


--
-- Name: COLUMN pedidos.descuento_monto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.descuento_monto IS 'Descuento ya calculado en $. Si está set, manda sobre descuento_porcentaje para el total.';


--
-- Name: COLUMN pedidos.descuento_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.descuento_items IS 'Array de ids de pedido_items a los que aplica el descuento (cuando el alcance es selección).';


--
-- Name: COLUMN pedidos.servido_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.servido_at IS 'Momento en que el mozo sirvió los platos en la mesa. No cambia el estado del pedido.';


--
-- Name: COLUMN pedidos.kiku_libre_rondas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.kiku_libre_rondas IS 'Contador interno de repeticiones (rondas) de Kiku libre para la mesa. No afecta el total; se imprime en comanda por ronda.';


--
-- Name: COLUMN pedidos.kiku_libre_historial; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.kiku_libre_historial IS 'Historial de rondas de "libre": array de { ronda, nota, mozo, at }. Solo control interno.';


--
-- Name: COLUMN pedidos.costo_envio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.costo_envio IS 'Costo de envío del pedido (delivery). Ya está sumado dentro de pedidos.total.';


--
-- Name: COLUMN pedidos.kiku_libre_platos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.kiku_libre_platos IS 'Platos por ronda de Kiku libre (la "x" que prepara cocina). NULL => usar personas como default. El detalle por ronda (incluido platos) vive en kiku_libre_historial.';


--
-- Name: COLUMN pedidos.envio_zona; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.envio_zona IS 'Nombre de la zona de envío elegida para el pedido (informativo).';


--
-- Name: kiku_total_pedido(public.pedidos); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kiku_total_pedido(p_pedido public.pedidos) RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with sub as (
    select coalesce(sum(precio_unitario * cantidad), 0)::numeric as subtotal
    from public.pedido_items
    where pedido_id = p_pedido.id
  )
  select greatest(
           0,
           sub.subtotal - least(
             greatest(
               0,
               case
                 when p_pedido.descuento_monto is not null
                   then round(p_pedido.descuento_monto)
                 else round(sub.subtotal * coalesce(p_pedido.descuento_porcentaje, 0) / 100)
               end
             ),
             sub.subtotal
           )
         ) + coalesce(p_pedido.costo_envio, 0)
  from sub;
$$;


--
-- Name: kiku_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kiku_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: kiku_upsert_cliente_marketing(text, text, text, date, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kiku_upsert_cliente_marketing(p_nombre text, p_telefono text, p_email text DEFAULT NULL::text, p_cumple date DEFAULT NULL::date, p_acepta_marketing boolean DEFAULT false, p_origen text DEFAULT 'web'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_id        uuid;
  v_tel       text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_tel_dig   text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_nombre    text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_email     text := nullif(btrim(coalesce(p_email, '')), '');
  v_acepta    boolean := coalesce(p_acepta_marketing, false);
  v_tags      text;
begin
  -- Sin teléfono no podemos deduplicar de forma confiable → no tocamos el CRM.
  if v_tel_dig is null or v_tel_dig = '' then
    return null;
  end if;

  -- ¿Existe ya un cliente con ese teléfono?
  select id, tags
    into v_id, v_tags
    from public.clientes
   where regexp_replace(coalesce(telefono, ''), '\D', '', 'g') = v_tel_dig
   limit 1;

  if v_id is null then
    -- Alta nueva.
    insert into public.clientes (
      nombre, telefono, email, cumpleanos,
      acepta_marketing, origen, marketing_optin_at,
      tags
    ) values (
      coalesce(v_nombre, 'Cliente web'),
      v_tel,
      v_email,
      p_cumple,
      v_acepta,
      coalesce(p_origen, 'web'),
      case when v_acepta then now() else null end,
      case when p_origen = 'web' then 'Web' else null end
    )
    returning id into v_id;
  else
    -- Actualización: completamos huecos sin pisar datos buenos.
    update public.clientes c
       set email            = coalesce(c.email, v_email),
           cumpleanos       = coalesce(c.cumpleanos, p_cumple),
           -- el consentimiento solo "sube", nunca baja automáticamente
           acepta_marketing = c.acepta_marketing or v_acepta,
           marketing_optin_at = case
             when not c.acepta_marketing and v_acepta then now()
             else c.marketing_optin_at
           end,
           -- sumamos el tag 'Web' si vino de la web y no lo tenía
           tags = case
             when p_origen = 'web' and coalesce(c.tags, '') not ilike '%Web%'
               then nullif(btrim(concat_ws(', ', nullif(c.tags, ''), 'Web')), '')
             else c.tags
           end
     where c.id = v_id;
  end if;

  return v_id;
end;
$$;


--
-- Name: FUNCTION kiku_upsert_cliente_marketing(p_nombre text, p_telefono text, p_email text, p_cumple date, p_acepta_marketing boolean, p_origen text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.kiku_upsert_cliente_marketing(p_nombre text, p_telefono text, p_email text, p_cumple date, p_acepta_marketing boolean, p_origen text) IS 'Inserta o actualiza un cliente deduplicando por teléfono (solo dígitos). No pisa datos buenos con NULL y el consentimiento de marketing nunca baja solo. Usada por crear_reserva para alimentar el CRM desde la web.';


--
-- Name: liquidacion_horas(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.liquidacion_horas(p_desde date, p_hasta date) RETURNS TABLE(empleado_id uuid, nombre text, tipo_sueldo text, minutos integer, horas numeric, valor_hora numeric, total numeric)
    LANGUAGE sql STABLE
    AS $$
  select
    e.id,
    trim(concat_ws(' ', e.nombre, e.apellido)),
    e.tipo_sueldo,
    coalesce(sum(j.minutos), 0)::int                                   as minutos,
    round(coalesce(sum(j.minutos), 0) / 60.0, 2)                       as horas,
    case when e.tipo_sueldo = 'hora' then e.sueldo_base else 0 end     as valor_hora,
    case when e.tipo_sueldo = 'hora'
         then round(coalesce(sum(j.minutos), 0) / 60.0 * e.sueldo_base, 2)
         else 0 end                                                    as total
  from public.empleados e
  left join public.vista_jornadas j
    on  j.empleado_id = e.id
    and j.salida is not null
    and (j.entrada at time zone 'America/Argentina/Buenos_Aires')::date
        between p_desde and p_hasta
    -- días ya liquidados como jornal: fuera del cálculo
    and not exists (
      select 1 from public.liquidaciones ld
      where ld.tipo = 'dia'
        and ld.empleado_id = e.id
        and ld.semana_inicio =
            (j.entrada at time zone 'America/Argentina/Buenos_Aires')::date
    )
  where e.activo
  group by e.id, e.nombre, e.apellido, e.tipo_sueldo, e.sueldo_base
  order by 2;
$$;


--
-- Name: lista_espera_touch_updated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lista_espera_touch_updated() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: marcar_notificacion_leida(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_notificacion_leida(p_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  update public.notificaciones
     set leida = true,
         leida_at = now()
   where id = p_id and leida = false;
$$;


--
-- Name: marcar_todas_notificaciones_leidas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_todas_notificaciones_leidas() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  update public.notificaciones
     set leida = true,
         leida_at = now()
   where leida = false;
$$;


--
-- Name: notif_on_lista_espera_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_on_lista_espera_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.notificaciones (
    tipo, titulo, mensaje, referencia_id, referencia_tabla, metadata
  ) values (
    'lista_espera_nueva',
    '⏳ Nueva lista de espera',
    coalesce(new.cliente_nombre, 'Sin nombre') || ' · ' ||
      to_char(new.fecha, 'DD/MM') ||
      coalesce(' ' || to_char(new.hora, 'HH24:MI'), '') ||
      ' · ' || new.personas || (case when new.personas = 1 then ' persona' else ' personas' end),
    new.id,
    'lista_espera',
    jsonb_build_object(
      'origen',           new.origen,
      'cliente_nombre',   new.cliente_nombre,
      'cliente_telefono', new.cliente_telefono,
      'cliente_email',    new.cliente_email,
      'fecha',            new.fecha,
      'hora',             new.hora,
      'personas',         new.personas,
      'tipo_experiencia', new.tipo_experiencia,
      'notas',            new.notas
    )
  );
  return new;
end;
$$;


--
-- Name: notif_on_pedido_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_on_pedido_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_emoji  text;
  v_titulo text;
  v_canal  text;
begin
  v_canal := coalesce(new.canal, 'pedido');
  v_emoji := case v_canal
    when 'delivery'   then '🛵'
    when 'takeaway'   then '🛍️'
    when 'salon'      then '🍽️'
    when 'whatsapp'   then '💬'
    when 'pedidosya'  then '🟢'
    when 'rappi'      then '🟠'
    else                   '🔔'
  end;
 
  v_titulo := 'Nuevo pedido' ||
              case when v_canal = 'pedido' then '' else ' · ' || initcap(v_canal) end;
 
  insert into public.notificaciones (
    tipo, titulo, mensaje, referencia_id, referencia_tabla, metadata
  ) values (
    'pedido_nuevo',
    v_emoji || ' ' || v_titulo,
    coalesce(new.cliente_nombre, 'Sin nombre') ||
      ' · $' || coalesce(new.total, 0)::text ||
      case when new.numero is not null then ' · #' || new.numero::text else '' end,
    new.id,
    'pedidos',
    jsonb_build_object(
      'canal',             new.canal,
      'numero',            new.numero,
      'total',             new.total,
      'cliente_nombre',    new.cliente_nombre,
      'cliente_telefono',  new.cliente_telefono,
      'cliente_direccion', new.cliente_direccion,
      'estado',            new.estado,
      'mesa_id',           new.mesa_id,
      'notas',             new.notas
    )
  );
 
  return new;
end;
$_$;


--
-- Name: notif_on_reserva_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_on_reserva_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_titulo text;
  v_emoji  text;
  v_tipo_label text;
begin
  v_emoji  := case when new.origen = 'web' then '🌐' else '📅' end;
  v_titulo := case
    when new.origen = 'web'       then 'Nueva reserva desde la web'
    when new.origen = 'whatsapp'  then 'Nueva reserva por WhatsApp'
    when new.origen = 'telefono'  then 'Nueva reserva por teléfono'
    else                               'Nueva reserva'
  end;
 
  -- Label legible del tipo (para el mensaje rápido de la notif)
  v_tipo_label := case new.tipo_experiencia
    when 'omakase'              then 'Omakase'
    when 'umami_del_sur'        then 'Umami del Sur'
    when 'pacifico_y_patagonia' then 'Pacífico y Patagonia'
    when 'kiku_libre'           then 'Kiku Libre'
    when 'carta_abierta'        then 'Carta abierta'
    else null
  end;
 
  insert into public.notificaciones (
    tipo, titulo, mensaje, referencia_id, referencia_tabla, metadata
  ) values (
    'reserva_nueva',
    v_emoji || ' ' || v_titulo,
    coalesce(new.cliente_nombre, 'Sin nombre') || ' · ' ||
      to_char(new.fecha, 'DD/MM') || ' ' || to_char(new.hora, 'HH24:MI') ||
      ' · ' || new.personas || (case when new.personas = 1 then ' persona' else ' personas' end) ||
      case when v_tipo_label is not null then ' · ' || v_tipo_label else '' end,
    new.id,
    'reservas',
    jsonb_build_object(
      'origen',            new.origen,
      'cliente_nombre',    new.cliente_nombre,
      'cliente_telefono',  new.cliente_telefono,
      'cliente_email',     new.cliente_email,
      'fecha',             new.fecha,
      'hora',              new.hora,
      'personas',          new.personas,
      'estado',            new.estado,
      'restricciones',     new.restricciones,
      'accesibilidad',     new.accesibilidad,
      'notas',             new.notas,
      'tipo_experiencia',  new.tipo_experiencia,
      'tipo_label',        v_tipo_label
    )
  );
 
  return new;
end;
$$;


--
-- Name: pagos_reasignacion_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pagos_reasignacion_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_estado text;
begin
  if NEW.caja_turno_id is distinct from OLD.caja_turno_id
     and NEW.caja_turno_id is not null then
    select estado into v_estado from public.caja_turnos where id = NEW.caja_turno_id;
    if v_estado = 'reabierto' then
      insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
      values (NEW.caja_turno_id, 'pago_reasignado', jsonb_build_object(
        'pago_id',        NEW.id,
        'turno_anterior', OLD.caja_turno_id,
        'monto',          NEW.monto,
        'medio_pago',     NEW.medio_pago
      ));
    end if;
  end if;
  return NEW;
end;
$$;


--
-- Name: pedido_web_horario_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pedido_web_horario_check() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_ahora   timestamp := (now() at time zone 'America/Argentina/Buenos_Aires');
  v_target  timestamp;
  v_dow     int;
  v_t       time;
  v_abierto boolean;
begin
  if new.origen = 'web' and coalesce(new.canal, '') in ('delivery', 'takeaway') then
 
    if new.programado_para is null then
      -- Inmediato: se valida contra la hora actual.
      v_target := v_ahora;
    else
      -- Programado: anticipación 30 min, ventana 3 días.
      if new.programado_para < now() + interval '30 minutes' then
        raise exception 'Programá con al menos 30 minutos de anticipación.';
      end if;
      if new.programado_para > now() + interval '3 days' then
        raise exception 'Solo se puede programar hasta 3 días de anticipación.';
      end if;
      v_target := (new.programado_para at time zone 'America/Argentina/Buenos_Aires');
    end if;
 
    v_dow := extract(dow from v_target)::int;   -- 0=Dom .. 6=Sáb
    v_t   := v_target::time;
    v_abierto :=
         (v_dow in (2, 3, 4, 5, 6) and v_t >= time '19:30')
      or (v_dow in (6, 0)          and v_t <= time '01:00');
 
    if not v_abierto then
      if new.programado_para is null then
        raise exception 'Estamos cerrados ahora. Programá tu pedido (Mar–Jue 19:30–00:00, Vie–Sáb 19:30–01:00).';
      else
        raise exception 'Ese horario está fuera de atención (Mar–Jue 19:30–00:00, Vie–Sáb 19:30–01:00).';
      end if;
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: pedido_webhook_whatsapp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pedido_webhook_whatsapp() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare
  v_api_url  text;
  v_api_key  text;
  v_destino  text;
  v_activo   boolean;
  v_to       text;
  r          record;
  v_ped      record;
  v_items    text;
  v_canal    text;
  v_titulo   text;
  v_emoji    text;
  v_cuando   text;
  v_mensaje  text;
begin
  select wasender_api_url, wasender_api_key, whatsapp_destino, activo
    into v_api_url, v_api_key, v_destino, v_activo
  from public.webhook_config
  where id = true;
 
  if coalesce(v_activo, false) = false
     or v_api_url is null or btrim(v_api_url) = ''
     or v_api_key is null or btrim(v_api_key) = ''
     or v_destino is null or btrim(v_destino) = '' then
    return null;
  end if;
 
  v_to := case when v_destino like '+%' then v_destino else '+' || v_destino end;
 
  for r in select distinct pedido_id from nuevos loop
 
    select * into v_ped from public.pedidos where id = r.pedido_id;
 
    if v_ped.id is null or coalesce(v_ped.origen, 'dashboard') <> 'web' then
      continue;
    end if;
 
    select string_agg(
             '• ' || coalesce(cantidad, 1) || 'x ' || nombre ||
             ' — $' || round(coalesce(precio_unitario, 0))::bigint::text,
             E'\n' order by nombre)
      into v_items
    from public.pedido_items
    where pedido_id = v_ped.id;
 
    v_canal := coalesce(v_ped.canal, 'pedido');
    v_emoji := case v_canal when 'delivery' then '🛵' when 'takeaway' then '🛍️' else '🔔' end;
    v_titulo := case v_canal
      when 'delivery' then 'Nuevo pedido DELIVERY'
      when 'takeaway' then 'Nuevo pedido TAKEAWAY'
      else 'Nuevo pedido'
    end;
 
    v_cuando := case
      when v_ped.programado_para is not null
        then '🕒 Programado: ' ||
             to_char(v_ped.programado_para at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || ' hs'
      else '🕒 Lo antes posible'
    end;
 
    v_mensaje :=
      v_emoji || ' *' || v_titulo || ' — Kiku Sushi*' || E'\n' ||
      '———————————————' || E'\n' ||
      '👤 ' || coalesce(v_ped.cliente_nombre, 'Sin nombre') || E'\n' ||
      '📞 ' || coalesce(v_ped.cliente_telefono, '—') || E'\n' ||
      case when v_canal = 'delivery' and v_ped.cliente_direccion is not null
           then '🏠 ' || v_ped.cliente_direccion || E'\n' else '' end ||
      v_cuando || E'\n' ||
      '———————————————' || E'\n' ||
      case when v_ped.numero is not null then '🧾 Pedido #' || v_ped.numero || E'\n' else '' end ||
      coalesce(v_items, '(sin items)') || E'\n' ||
      '———————————————' || E'\n' ||
      '💰 Total: $' || round(coalesce(v_ped.total, 0))::bigint::text ||
        case when v_canal = 'delivery' then ' (incluye envío)' else '' end || E'\n' ||
      case when v_ped.notas is not null then '📝 Notas: ' || v_ped.notas || E'\n' else '' end ||
      '👉 Preparar y coordinar con el cliente.';
 
    begin
      perform net.http_post(
        url     := v_api_url,
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || v_api_key
                   ),
        body    := jsonb_build_object('to', v_to, 'text', v_mensaje)
      );
    exception when others then
      raise warning '[pedido_webhook_whatsapp] no se pudo enviar: %', sqlerrm;
    end;
 
  end loop;
 
  return null;
end;
$_$;


--
-- Name: proteger_roles_sistema(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proteger_roles_sistema() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'DELETE' then
    if old.sistema then
      raise exception
        'El rol "%" es del sistema y no se puede eliminar. Podés vaciarle los permisos, '
        'pero antes reasigná los usuarios que lo tengan.', old.id;
    end if;
    return old;
  end if;

  -- UPDATE. Sin esto, la protección del DELETE se esquiva en dos pasos:
  -- primero `set sistema = false`, después el delete.
  if old.sistema then
    if new.sistema is distinct from true then
      raise exception 'No se puede quitar la marca de sistema al rol "%".', old.id;
    end if;
    if new.id is distinct from old.id then
      raise exception
        'No se puede renombrar el id del rol "%": hay sesiones activas cuyo JWT lo referencia.', old.id;
    end if;
  end if;
  return new;
end $$;


--
-- Name: puede_administrar_permisos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_administrar_permisos() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select public.es_admin_permisos_de_emergencia()
      or public.tiene_permiso('permisos', 'editar')
$$;


--
-- Name: FUNCTION puede_administrar_permisos(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.puede_administrar_permisos() IS 'True si el usuario puede editar la matriz de permisos: por permiso configurado o por estar en la lista blanca de emergencia.';


--
-- Name: puede_cobrar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_cobrar() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select public.current_app_role() in ('admin', 'mozo')
$$;


--
-- Name: puede_tabla(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_tabla(p_tabla text, p_accion text DEFAULT 'ver'::text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.recurso_tablas rt
    join public.rol_permisos rp on rp.recurso_id = rt.recurso_id
    where rt.tabla = p_tabla
      and rp.rol_id = public.current_app_role()
      and case p_accion
            when 'editar' then rp.editar and rt.escribe
            when 'ver'    then rp.ver
            else false          -- falla cerrado ante una acción desconocida
          end
  )
  -- Bypass por email para el DOMINIO de Finanzas, espejando al front
  -- (RECURSOS_FINANZAS en permisosCore.js): la cuenta histórica tiene rol
  -- admin y entra a Finanzas/Personal por lista blanca de email. Sin esto,
  -- el menú le muestra las pantallas y la base le niega los datos — veía
  -- solo sus propios fichajes y no podía liquidar sueldos.
  or (
    public.is_finanzas_user()
    and exists (
      select 1 from public.recurso_tablas rt2
      where rt2.tabla = p_tabla
        and rt2.recurso_id in ('finanzas', 'personal', 'permisos')
        and (p_accion = 'ver' or (p_accion = 'editar' and rt2.escribe))
    )
  )
$$;


--
-- Name: FUNCTION puede_tabla(p_tabla text, p_accion text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.puede_tabla(p_tabla text, p_accion text) IS 'True si el rol del usuario tiene alguna sección que habilite esa tabla. p_accion: ''ver'' o ''editar''. Cualquier otro valor devuelve false.';


--
-- Name: reabrir_pedido(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reabrir_pedido(p_pedido_id uuid) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_estado text;
begin
  if p_pedido_id is null then
    raise exception 'pedido_id es requerido';
  end if;
 
  -- Traemos el estado actual y bloqueamos la fila para evitar carreras.
  select estado
    into v_estado
    from public.pedidos
   where id = p_pedido_id
   for update;
 
  if not found then
    raise exception 'Pedido no encontrado';
  end if;
 
  if v_estado = 'cancelado' then
    raise exception 'No se puede reabrir un pedido cancelado';
  end if;
 
  -- Bloqueo fiscal: si ya tiene un comprobante autorizado (Factura A/B/C),
  -- no se permite reabrir.
  if exists (
    select 1
      from public.comprobantes_fiscales cf
     where cf.pedido_id = p_pedido_id
       and cf.estado = 'autorizado'
       and cf.tipo_cbte in (1, 6, 11)
  ) then
    raise exception 'No se puede reabrir un pedido ya facturado';
  end if;
 
  -- Reabrir: volvemos a un estado activo de preparación.
  update public.pedidos
     set estado = 'preparando'
   where id = p_pedido_id;
 
  -- Limpiar cerrada_at solo si la columna existe en este esquema.
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'pedidos'
       and column_name  = 'cerrada_at'
  ) then
    execute 'update public.pedidos set cerrada_at = null where id = $1'
      using p_pedido_id;
  end if;
 
  return 'preparando';
end;
$_$;


--
-- Name: FUNCTION reabrir_pedido(p_pedido_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reabrir_pedido(p_pedido_id uuid) IS 'Reabre un pedido entregado (estado -> preparando, limpia cerrada_at). Bloquea pedidos cancelados o ya facturados (comprobante autorizado A/B/C). SECURITY INVOKER: respeta la RLS existente sobre pedidos.';


--
-- Name: reabrir_turno(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reabrir_turno(p_turno_id uuid, p_motivo text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_estado text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede reabrir turnos de caja';
  end if;
 
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'El motivo de reapertura es obligatorio';
  end if;
 
  select estado
    into v_estado
    from public.caja_turnos
   where id = p_turno_id
   for update;
 
  if not found then
    raise exception 'Turno no encontrado';
  end if;
 
  if v_estado <> 'cerrado' then
    raise exception 'Solo se puede reabrir un turno cerrado (estado actual: %)', v_estado;
  end if;
 
  update public.caja_turnos
     set estado = 'reabierto',
         updated_at = now()
   where id = p_turno_id;
 
  -- La reapertura se registra acá con su motivo (los triggers NO la duplican).
  insert into public.caja_turnos_auditoria (turno_id, evento, motivo, detalle)
  values (
    p_turno_id,
    'reapertura',
    btrim(p_motivo),
    jsonb_build_object('estado_anterior', 'cerrado')
  );
end;
$$;


--
-- Name: FUNCTION reabrir_turno(p_turno_id uuid, p_motivo text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reabrir_turno(p_turno_id uuid, p_motivo text) IS 'Reabre un turno cerrado (estado -> reabierto). Solo admin, motivo obligatorio. Deja registro en caja_turnos_auditoria.';


--
-- Name: reactivar_pedido(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reactivar_pedido(p_pedido_id uuid) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_estado text;
begin
  if p_pedido_id is null then
    raise exception 'pedido_id es requerido';
  end if;
 
  select estado
    into v_estado
    from public.pedidos
   where id = p_pedido_id
   for update;
 
  if not found then
    raise exception 'Pedido no encontrado';
  end if;
 
  if v_estado <> 'cancelado' then
    raise exception 'Solo se puede restablecer un pedido cancelado (estado actual: %)', v_estado;
  end if;
 
  -- Bloqueo fiscal por las dudas.
  if exists (
    select 1
      from public.comprobantes_fiscales cf
     where cf.pedido_id = p_pedido_id
       and cf.estado = 'autorizado'
       and cf.tipo_cbte in (1, 6, 11)
  ) then
    raise exception 'No se puede restablecer un pedido ya facturado';
  end if;
 
  -- Volvemos al estado pristino: pendiente (sin stock descontado).
  update public.pedidos
     set estado = 'pendiente'
   where id = p_pedido_id;
 
  -- Limpiar cerrada_at solo si la columna existe en este esquema.
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'pedidos'
       and column_name  = 'cerrada_at'
  ) then
    execute 'update public.pedidos set cerrada_at = null where id = $1'
      using p_pedido_id;
  end if;
 
  return 'pendiente';
end;
$_$;


--
-- Name: FUNCTION reactivar_pedido(p_pedido_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reactivar_pedido(p_pedido_id uuid) IS 'Restablece un pedido cancelado (estado -> pendiente, limpia cerrada_at). Bloquea pedidos facturados. SECURITY INVOKER: respeta la RLS existente sobre pedidos.';


--
-- Name: reactivar_reserva(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reactivar_reserva(p_reserva_id uuid) RETURNS public.reserva_estado
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_reserva        record;
  v_capacidad_sal  int;
  v_capacidad_bar  int := public.kiku_capacidad_barra();
  v_ocupados       int;
begin
  if p_reserva_id is null then
    raise exception 'reserva_id es requerido';
  end if;
 
  -- Traemos y bloqueamos la fila para evitar carreras.
  select * into v_reserva
    from public.reservas
   where id = p_reserva_id
   for update;
 
  if not found then
    raise exception 'Reserva no encontrada';
  end if;
 
  if v_reserva.estado not in ('cancelada', 'no_show') then
    raise exception 'Solo se puede restablecer una reserva cancelada o marcada como no-show (estado actual: %).', v_reserva.estado;
  end if;
 
  -- Revalidamos cupo del día (excluyendo esta misma reserva).
  if v_reserva.tipo_experiencia = 'omakase' then
    select coalesce(sum(personas), 0)
      into v_ocupados
      from public.reservas
     where fecha = v_reserva.fecha
       and tipo_experiencia = 'omakase'
       and estado not in ('cancelada', 'no_show')
       and id <> p_reserva_id;
    if v_ocupados + v_reserva.personas > v_capacidad_bar then
      raise exception 'No se puede restablecer: la barra de omakase ya no tiene % asientos libres para esa fecha.', v_reserva.personas;
    end if;
  else
    v_capacidad_sal := public.kiku_capacidad_salon_fecha(v_reserva.fecha);
    select coalesce(sum(personas), 0)
      into v_ocupados
      from public.reservas
     where fecha = v_reserva.fecha
       and (tipo_experiencia is null or tipo_experiencia <> 'omakase')
       and estado not in ('cancelada', 'no_show')
       and id <> p_reserva_id;
    if v_ocupados + v_reserva.personas > v_capacidad_sal then
      raise exception 'No se puede restablecer: ya no hay % lugares libres en el salón para esa fecha (quedan %).',
        v_reserva.personas, greatest(0, v_capacidad_sal - v_ocupados);
    end if;
  end if;
 
  update public.reservas
     set estado        = 'confirmada',
         confirmada_at = now(),
         cancelada_at  = null
   where id = p_reserva_id;
 
  return 'confirmada'::reserva_estado;
end;
$$;


--
-- Name: FUNCTION reactivar_reserva(p_reserva_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reactivar_reserva(p_reserva_id uuid) IS 'Restablece una reserva cancelada/no_show volviéndola a confirmada, revalidando el cupo del día. Bloquea si ya no hay lugar.';


--
-- Name: registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_pago(p_categoria text, p_descripcion text, p_monto numeric, p_medio_pago text DEFAULT 'efectivo'::text, p_estado text DEFAULT 'pagado'::text, p_fecha date DEFAULT CURRENT_DATE, p_proveedor_id uuid DEFAULT NULL::uuid, p_empleado_id uuid DEFAULT NULL::uuid, p_subtipo text DEFAULT NULL::text, p_periodo text DEFAULT NULL::text, p_vencimiento date DEFAULT NULL::date, p_comprobante text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_origen text DEFAULT 'auto'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_turno_id   uuid;
  v_egreso_id  uuid;
  v_mov_id     uuid;
  v_cf_id      uuid;
  v_origen     text;
  v_es_cash    boolean;
begin
  if not (public.tiene_permiso('pagos', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para registrar pagos.';
  end if;
  if coalesce(trim(p_descripcion), '') = '' then
    raise exception 'Falta la descripción del pago.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.';
  end if;
  if p_estado not in ('pagado', 'pendiente') then
    raise exception 'Estado inválido: %', p_estado;
  end if;
  if p_categoria = 'sueldos' and p_empleado_id is null then
    raise exception 'Un pago de sueldos necesita el empleado.';
  end if;
  if p_origen not in ('auto', 'caja', 'caja_fuerte', 'ninguno') then
    raise exception 'Origen inválido: %', p_origen;
  end if;

  select ct.id into v_turno_id
  from public.caja_turnos ct
  where ct.estado = 'abierto'
  order by ct.created_at desc
  limit 1;

  v_es_cash := (p_estado = 'pagado' and p_medio_pago = 'efectivo');

  -- Resolver el origen del efectivo
  if not v_es_cash then
    v_origen := null;                    -- transferencias/tarjetas no tienen origen de efectivo
  elsif p_origen = 'caja_fuerte' then
    v_origen := 'caja_fuerte';
  elsif p_origen = 'caja' then
    if v_turno_id is null then
      raise exception 'No hay un turno de caja abierto: elegí caja fuerte u otro origen.';
    end if;
    v_origen := 'caja';
  elsif p_origen = 'auto' and v_turno_id is not null then
    v_origen := 'caja';
  else
    v_origen := null;                    -- 'ninguno', o auto sin turno
  end if;

  insert into public.egresos (
    fecha, categoria, subtipo, descripcion, monto, medio_pago, estado,
    vencimiento, periodo, proveedor_id, empleado_id, comprobante_nro, notas,
    caja_turno_id, pagado_desde, usuario_id
  ) values (
    coalesce(p_fecha, current_date), p_categoria, p_subtipo, trim(p_descripcion),
    p_monto, p_medio_pago, p_estado,
    p_vencimiento, p_periodo, p_proveedor_id, p_empleado_id, p_comprobante, p_notas,
    case when v_origen = 'caja' then v_turno_id else null end,
    v_origen, auth.uid()
  )
  returning id into v_egreso_id;

  if v_origen = 'caja' then
    insert into public.caja_movimientos (
      turno_id, tipo, medio_pago, monto, categoria, descripcion, egreso_id, usuario_id
    ) values (
      v_turno_id, 'egreso', 'efectivo', p_monto, p_categoria,
      'Pago: ' || trim(p_descripcion), v_egreso_id, auth.uid()
    )
    returning id into v_mov_id;
  elsif v_origen = 'caja_fuerte' then
    insert into public.caja_fuerte_movimientos (tipo, monto, descripcion, egreso_id, usuario_id)
    values ('egreso', p_monto, 'Pago: ' || trim(p_descripcion), v_egreso_id, auth.uid())
    returning id into v_cf_id;
  end if;

  return jsonb_build_object(
    'egreso_id', v_egreso_id,
    'origen', v_origen,
    'caja_turno_id', case when v_origen = 'caja' then v_turno_id else null end,
    'movimiento_id', v_mov_id,
    'caja_fuerte_movimiento_id', v_cf_id,
    'descuenta_arqueo', v_mov_id is not null
  );
end $$;


--
-- Name: FUNCTION registrar_pago(p_categoria text, p_descripcion text, p_monto numeric, p_medio_pago text, p_estado text, p_fecha date, p_proveedor_id uuid, p_empleado_id uuid, p_subtipo text, p_periodo text, p_vencimiento date, p_comprobante text, p_notas text, p_origen text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.registrar_pago(p_categoria text, p_descripcion text, p_monto numeric, p_medio_pago text, p_estado text, p_fecha date, p_proveedor_id uuid, p_empleado_id uuid, p_subtipo text, p_periodo text, p_vencimiento date, p_comprobante text, p_notas text, p_origen text) IS 'Alta centralizada de egresos. p_origen: auto | caja | caja_fuerte | ninguno. Caja descuenta del arqueo del turno abierto; caja fuerte descuenta de su saldo. Todo o nada.';


--
-- Name: reserva_webhook_whatsapp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserva_webhook_whatsapp() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_api_url     text;
  v_api_key     text;
  v_destino     text;
  v_activo      boolean;
  v_to          text;
  v_tipo_label  text;
  v_codigo      text;
  v_fecha_txt   text;
  v_hora_txt    text;
  v_orden_lleg  boolean;
  v_mensaje     text;
begin
  if new.origen <> 'web' then
    return new;
  end if;
 
  select wasender_api_url, wasender_api_key, whatsapp_destino, activo
    into v_api_url, v_api_key, v_destino, v_activo
  from public.webhook_config
  where id = true;
 
  if coalesce(v_activo, false) = false
     or v_api_url is null or btrim(v_api_url) = ''
     or v_api_key is null or btrim(v_api_key) = ''
     or v_destino is null or btrim(v_destino) = '' then
    return new;
  end if;
 
  v_tipo_label := case new.tipo_experiencia
    when 'omakase'              then 'Omakase'
    when 'umami_del_sur'        then 'Umami del Sur'
    when 'pacifico_y_patagonia' then 'Pacífico y Patagonia'
    when 'kiku_libre'           then 'Kiku Libre'
    when 'carta_abierta'        then 'Carta abierta'
    else null
  end;
 
  v_codigo    := upper(substring(new.id::text, 1, 8));
  v_fecha_txt := to_char(new.fecha, 'DD/MM/YYYY');
  v_hora_txt  := to_char(new.hora, 'HH24:MI');
  v_orden_lleg := to_char(new.hora, 'HH24:MI') in ('22:30', '23:00');
 
  v_mensaje :=
    '🍣 *Nueva reserva web — Kiku Sushi*' || E'\n' ||
    '———————————————' || E'\n' ||
    '👤 ' || coalesce(new.cliente_nombre, 'Sin nombre') || E'\n' ||
    '📞 ' || coalesce(new.cliente_telefono, '—') || E'\n' ||
    case when new.cliente_email is not null then '📧 ' || new.cliente_email || E'\n' else '' end ||
    '📅 ' || v_fecha_txt || '   🕐 ' || v_hora_txt || E'\n' ||
    '👥 ' || new.personas || (case when new.personas = 1 then ' persona' else ' personas' end) || E'\n' ||
    case when v_tipo_label is not null then '✨ ' || v_tipo_label || E'\n' else '' end ||
    case when v_orden_lleg then '⏱️ Por orden de llegada (sin mesa fija)' || E'\n' else '' end ||
    case when new.restricciones is not null then '🥗 Restricciones: ' || new.restricciones || E'\n' else '' end ||
    case when new.accesibilidad is not null then '♿ Accesibilidad: ' || new.accesibilidad || E'\n' else '' end ||
    case when new.notas is not null then '📝 Notas: ' || new.notas || E'\n' else '' end ||
    '———————————————' || E'\n' ||
    '🎫 Código #' || v_codigo;
 
  v_to := case when v_destino like '+%' then v_destino else '+' || v_destino end;
 
  begin
    perform net.http_post(
      url     := v_api_url,
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'Authorization', 'Bearer ' || v_api_key
                 ),
      body    := jsonb_build_object('to', v_to, 'text', v_mensaje)
    );
  exception when others then
    raise warning '[reserva_webhook_whatsapp] no se pudo enviar: %', sqlerrm;
  end;
 
  return new;
end;
$$;


--
-- Name: retirar_a_caja_fuerte(numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retirar_a_caja_fuerte(p_monto numeric, p_notas text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_turno_id      uuid;
  v_mov_id        uuid;
  v_dep_id        uuid;
  v_cerrado_id    uuid;
  v_fecha         date;
  v_cierre_at     timestamptz;
  v_denominaciones jsonb;
  v_contado       numeric;
  v_ya_depositado numeric;
begin
  if not (public.tiene_permiso('caja_fuerte', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para operar la caja fuerte.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.';
  end if;

  select ct.id into v_turno_id
  from public.caja_turnos ct
  where ct.estado = 'abierto'
  order by ct.created_at desc
  limit 1;

  -- ── Con turno abierto: igual que siempre ─────────────────────────────────
  -- Movimiento de caja 'retiro' (el arqueo lo descuenta) + depósito, atómico.
  if v_turno_id is not null then
    insert into public.caja_movimientos (turno_id, tipo, medio_pago, monto, categoria, descripcion, usuario_id)
    values (v_turno_id, 'retiro', 'efectivo', p_monto, 'caja_fuerte',
            coalesce('Retiro a caja fuerte · ' || nullif(trim(p_notas), ''), 'Retiro a caja fuerte'),
            auth.uid())
    returning id into v_mov_id;

    insert into public.caja_fuerte_movimientos (tipo, monto, descripcion, turno_id, usuario_id)
    values ('deposito', p_monto,
            coalesce('Depósito desde caja · ' || nullif(trim(p_notas), ''), 'Depósito desde caja'),
            v_turno_id, auth.uid())
    returning id into v_dep_id;

    return jsonb_build_object(
      'modo', 'turno_abierto',
      'turno_id', v_turno_id,
      'movimiento_caja_id', v_mov_id,
      'deposito_id', v_dep_id,
      'saldo', public.saldo_caja_fuerte()
    );
  end if;

  -- ── Sin turno abierto: retiro post-cierre ────────────────────────────────
  select ct.id, ct.business_date, ct.cierre_at, ct.denominaciones_cierre
    into v_cerrado_id, v_fecha, v_cierre_at, v_denominaciones
  from public.caja_turnos ct
  where ct.estado = 'cerrado'
  order by ct.cierre_at desc, ct.created_at desc
  limit 1;

  if not found then
    raise exception
      'No hay ningún turno de caja, ni abierto ni cerrado. Si tenés efectivo para guardar, registralo como depósito externo.';
  end if;

  v_contado := nullif(coalesce(
      v_denominaciones #>> '{medios,efectivo,contado}',
      v_denominaciones #>> '{medios,efectivo,esperado}'), '')::numeric;

  select coalesce(sum(m.monto), 0) into v_ya_depositado
  from public.caja_fuerte_movimientos m
  where m.turno_id = v_cerrado_id
    and m.tipo = 'deposito'
    and m.created_at > v_cierre_at;

  if v_contado is not null and p_monto > (v_contado - v_ya_depositado) then
    raise exception
      'El cierre del % dejó $ % en efectivo y ya se depositaron $ %: quedan $ % para retirar. Si esta plata NO vino de la caja, registrala como depósito externo.',
      v_fecha, v_contado, v_ya_depositado, v_contado - v_ya_depositado;
  end if;

  -- Solo el depósito, vinculado al turno cerrado. Sin movimiento de caja: el
  -- arqueo de ese turno ya quedó contado, y el arrastre de la próxima apertura
  -- descuenta los depósitos post-cierre vinculados.
  insert into public.caja_fuerte_movimientos (tipo, monto, descripcion, turno_id, usuario_id)
  values ('deposito', p_monto,
          coalesce('Depósito del cierre de caja · ' || nullif(trim(p_notas), ''), 'Depósito del cierre de caja'),
          v_cerrado_id, auth.uid())
  returning id into v_dep_id;

  return jsonb_build_object(
    'modo', 'post_cierre',
    'turno_id', v_cerrado_id,
    'deposito_id', v_dep_id,
    'saldo', public.saldo_caja_fuerte()
  );
end $_$;


--
-- Name: FUNCTION retirar_a_caja_fuerte(p_monto numeric, p_notas text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.retirar_a_caja_fuerte(p_monto numeric, p_notas text) IS 'Retiro de efectivo de la caja a la caja fuerte. Con turno abierto descuenta el arqueo (movimiento tipo retiro). Sin turno abierto sale del efectivo del último cierre (depósito vinculado, con guarda de disponible): la próxima apertura deja de arrastrarlo.';


--
-- Name: revertir_stock_produccion(uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revertir_stock_produccion(p_stock_id uuid, p_cantidad numeric, p_notas text DEFAULT NULL::text) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_actual numeric;
  v_nuevo  numeric;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;
 
  if p_cantidad is null or p_cantidad <= 0 then
    return null;
  end if;
 
  select stock_actual
  into v_actual
  from public.stock
  where id = p_stock_id
  for update;
 
  if not found then
    raise exception 'Ingrediente de stock no encontrado: %', p_stock_id;
  end if;
 
  v_nuevo := v_actual + p_cantidad;
 
  update public.stock
  set stock_actual = v_nuevo
  where id = p_stock_id;
 
  insert into public.stock_movimientos (
    stock_id, tipo, cantidad, stock_antes, stock_despues, notas
  )
  values (
    p_stock_id, 'entrada', p_cantidad, v_actual, v_nuevo, coalesce(p_notas, 'Reversión de venta')
  );
 
  return v_nuevo;
end;
$$;


--
-- Name: revertir_tarea_produccion(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revertir_tarea_produccion(p_tarea_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: saldo_caja_fuerte(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.saldo_caja_fuerte() RETURNS numeric
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v numeric;
begin
  if not (public.tiene_permiso('caja_fuerte', 'ver') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para ver la caja fuerte.';
  end if;
  select coalesce(sum(
    case
      when tipo = 'deposito' then monto
      when tipo = 'egreso'   then -monto
      when categoria = 'faltante' then -monto
      else monto
    end), 0)
    into v
  from public.caja_fuerte_movimientos;
  return v;
end $$;


--
-- Name: sentar_reserva(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sentar_reserva(p_reserva_id uuid, p_mesa_id uuid, p_mozo_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_reserva         record;
  v_pedido_id       uuid;
begin
  select * into v_reserva from public.reservas where id = p_reserva_id;
  if not found then
    raise exception 'Reserva no encontrada';
  end if;

  if v_reserva.estado in ('cancelada', 'no_show', 'sentada') then
    raise exception 'La reserva no se puede sentar (estado: %)', v_reserva.estado;
  end if;

  -- Abrir la mesa con los datos de la reserva (reusa la RPC abrir_mesa)
  v_pedido_id := public.abrir_mesa(
    p_mesa_id          := p_mesa_id,
    p_personas         := v_reserva.personas,
    p_mozo_id          := p_mozo_id,
    p_cliente_nombre   := v_reserva.cliente_nombre,
    p_cliente_telefono := v_reserva.cliente_telefono
  );

  -- Marcar reserva como sentada y vincular mesa + pedido
  update public.reservas
     set estado     = 'sentada',
         mesa_id    = p_mesa_id,
         pedido_id  = v_pedido_id,
         sentada_at = now()
   where id = p_reserva_id;

  return v_pedido_id;
end;
$$;


--
-- Name: set_caja_turno_on_pago(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_caja_turno_on_pago() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Respetamos un turno asignado explícitamente desde el cliente.
  if new.caja_turno_id is not null then
    return new;
  end if;
 
  select t.id
    into new.caja_turno_id
  from public.caja_turnos t
  where t.estado in ('abierto', 'reabierto')
  order by
    case t.estado when 'abierto' then 0 else 1 end,  -- 'abierto' tiene prioridad
    t.apertura_at desc                               -- ante empate, el más reciente
  limit 1;
 
  return new;
end;
$$;


--
-- Name: FUNCTION set_caja_turno_on_pago(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_caja_turno_on_pago() IS 'Completa pagos.caja_turno_id con el turno de caja vigente (abierto > reabierto) cuando el pago se inserta sin turno. Evita pedidos "sin turno" por desfase de timing o multi-dispositivo.';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: siguiente_numero_comprobante(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.siguiente_numero_comprobante(p_tipo_cbte integer, p_punto_venta integer) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  select coalesce(max(numero), 0) + 1
  from public.comprobantes_fiscales
  where tipo_cbte = p_tipo_cbte
    and punto_venta = p_punto_venta
    and estado = 'autorizado';
$$;


--
-- Name: slots_disponibles(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.slots_disponibles(p_fecha date) RETURNS TABLE(hora time without time zone, cupo_salon integer, cupo_barra integer, hay_omakase boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_slots          time[] := array[
                                '20:00','20:30','21:00','21:30','22:00','22:30','23:00'
                              ]::time[];
  v_capacidad_sal  int    := public.kiku_capacidad_salon_fecha(p_fecha);
  v_capacidad_bar  int    := public.kiku_capacidad_barra();
  v_ocupados_oma   int;
  v_ocupados_dia   int;
  v_slot           time;
begin
  -- Comensales de omakase ya reservados ese día (todas las reservas activas).
  select coalesce(sum(personas), 0)
    into v_ocupados_oma
    from public.reservas
   where fecha = p_fecha
     and tipo_experiencia = 'omakase'
     and estado not in ('cancelada', 'no_show');
 
  -- Comensales del salón (no-omakase) ya reservados ese día.
  select coalesce(sum(personas), 0)
    into v_ocupados_dia
    from public.reservas
   where fecha = p_fecha
     and (tipo_experiencia is null or tipo_experiencia <> 'omakase')
     and estado not in ('cancelada', 'no_show');
 
  foreach v_slot in array v_slots loop
    hora        := v_slot;
    cupo_salon  := greatest(0, v_capacidad_sal - v_ocupados_dia);
    cupo_barra  := greatest(0, v_capacidad_bar - v_ocupados_oma);
    hay_omakase := (v_ocupados_oma >= v_capacidad_bar);
    return next;
  end loop;
end;
$$;


--
-- Name: FUNCTION slots_disponibles(p_fecha date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.slots_disponibles(p_fecha date) IS 'Cupo por slot para la fecha (por DÍA). cupo_salon = 34/28 menos reservas no-omakase; cupo_barra = 6 menos comensales de omakase; hay_omakase = barra de omakase llena.';


--
-- Name: tiene_permiso(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tiene_permiso(p_recurso text, p_accion text DEFAULT 'ver'::text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.rol_permisos rp
    where rp.rol_id     = public.current_app_role()
      and rp.recurso_id = p_recurso
      and case p_accion
            when 'editar' then rp.editar
            when 'ver'    then rp.ver
            -- Falla cerrado: una acción mal escrita ('edit', 'Editar') niega el
            -- permiso en vez de conceder el de lectura. Se rompe visible, no en
            -- silencio y de más.
            else false
          end
  )
$$;


--
-- Name: FUNCTION tiene_permiso(p_recurso text, p_accion text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tiene_permiso(p_recurso text, p_accion text) IS 'True si el rol del usuario autenticado tiene el permiso pedido sobre el recurso. p_accion: ''ver'' (default) o ''editar''. Cualquier otro valor devuelve false.';


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: usuarios_por_rol(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.usuarios_por_rol() RETURNS TABLE(rol_id text, usuarios bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not public.puede_administrar_permisos() then
    raise exception 'No tenés permiso para ver la cantidad de usuarios por rol.';
  end if;

  return query
  select
    coalesce(nullif(u.raw_app_meta_data ->> 'role', ''), 'cocina') as rol_id,
    count(*)
  from auth.users u
  where u.deleted_at is null
  group by 1;
end $$;


--
-- Name: FUNCTION usuarios_por_rol(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.usuarios_por_rol() IS 'Cuántos usuarios activos tiene cada rol. Solo el conteo, sin datos personales.';


--
-- Name: aperturas_especiales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aperturas_especiales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fecha date NOT NULL,
    canal text DEFAULT 'takeaway'::text NOT NULL,
    apertura_min integer NOT NULL,
    nota text,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT aperturas_especiales_apertura_min_check CHECK (((apertura_min >= 0) AND (apertura_min <= 1439))),
    CONSTRAINT aperturas_especiales_canal_check CHECK ((canal = ANY (ARRAY['takeaway'::text, 'delivery'::text, 'ambos'::text])))
);


--
-- Name: TABLE aperturas_especiales; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.aperturas_especiales IS 'Horarios especiales de apertura por día (ej. días de partido). apertura_min = minuto del día (13:00=780). La web adelanta la apertura del canal indicado.';


--
-- Name: arca_request_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arca_request_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comprobante_id uuid,
    servicio text NOT NULL,
    metodo text,
    request_payload jsonb,
    response_payload jsonb,
    http_status integer,
    duracion_ms integer,
    error_code text,
    error_mensaje text,
    ambiente text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT arca_request_log_servicio_check CHECK ((servicio = ANY (ARRAY['wsaa'::text, 'wsfe'::text])))
);


--
-- Name: arca_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arca_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    servicio text NOT NULL,
    ambiente text NOT NULL,
    cuit text NOT NULL,
    token text NOT NULL,
    sign text NOT NULL,
    generation_time timestamp with time zone NOT NULL,
    expiration_time timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT arca_tokens_ambiente_check CHECK ((ambiente = ANY (ARRAY['homologacion'::text, 'produccion'::text])))
);


--
-- Name: caja_fuerte_movimientos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caja_fuerte_movimientos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    categoria text,
    monto numeric(12,2) NOT NULL,
    descripcion text NOT NULL,
    turno_id uuid,
    egreso_id uuid,
    usuario_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT caja_fuerte_ajuste_categoria CHECK (((tipo = 'ajuste'::text) = (categoria IS NOT NULL))),
    CONSTRAINT caja_fuerte_movimientos_categoria_check CHECK ((categoria = ANY (ARRAY['sobrante'::text, 'faltante'::text]))),
    CONSTRAINT caja_fuerte_movimientos_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT caja_fuerte_movimientos_tipo_check CHECK ((tipo = ANY (ARRAY['deposito'::text, 'egreso'::text, 'ajuste'::text])))
);


--
-- Name: caja_movimientos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caja_movimientos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    turno_id uuid,
    tipo text NOT NULL,
    medio_pago text DEFAULT 'efectivo'::text NOT NULL,
    monto numeric(12,2) NOT NULL,
    categoria text,
    descripcion text NOT NULL,
    pedido_id uuid,
    pago_id uuid,
    comprobante_id uuid,
    usuario_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    egreso_id uuid,
    CONSTRAINT caja_movimientos_medio_pago_check CHECK ((medio_pago = ANY (ARRAY['efectivo'::text, 'transferencia'::text, 'tarjeta_credito'::text, 'tarjeta_debito'::text, 'nota_credito'::text, 'otro'::text]))),
    CONSTRAINT caja_movimientos_monto_check CHECK ((monto >= (0)::numeric)),
    CONSTRAINT caja_movimientos_monto_operativo CHECK (((tipo = 'no_venta'::text) OR (monto > (0)::numeric))),
    CONSTRAINT caja_movimientos_tipo_check CHECK ((tipo = ANY (ARRAY['ingreso'::text, 'egreso'::text, 'retiro'::text, 'deposito'::text, 'gasto'::text, 'propina'::text, 'ajuste'::text, 'no_venta'::text])))
);


--
-- Name: caja_turnos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caja_turnos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caja_nombre text DEFAULT 'Caja principal'::text NOT NULL,
    business_date date DEFAULT CURRENT_DATE NOT NULL,
    estado text DEFAULT 'abierto'::text NOT NULL,
    apertura_monto numeric(12,2) DEFAULT 0 NOT NULL,
    apertura_usuario_id uuid DEFAULT auth.uid(),
    apertura_at timestamp with time zone DEFAULT now() NOT NULL,
    cierre_monto numeric(12,2),
    efectivo_esperado numeric(12,2),
    diferencia numeric(12,2),
    deposito_monto numeric(12,2) DEFAULT 0 NOT NULL,
    cierre_usuario_id uuid,
    cierre_at timestamp with time zone,
    denominaciones_apertura jsonb DEFAULT '{}'::jsonb NOT NULL,
    denominaciones_cierre jsonb DEFAULT '{}'::jsonb NOT NULL,
    notas_apertura text,
    notas_cierre text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT caja_turnos_apertura_monto_check CHECK ((apertura_monto >= (0)::numeric)),
    CONSTRAINT caja_turnos_cierre_consistente CHECK ((((estado = 'abierto'::text) AND (cierre_at IS NULL)) OR ((estado = 'cerrado'::text) AND (cierre_at IS NOT NULL) AND (cierre_monto IS NOT NULL)) OR (estado = 'reabierto'::text))),
    CONSTRAINT caja_turnos_cierre_monto_check CHECK (((cierre_monto IS NULL) OR (cierre_monto >= (0)::numeric))),
    CONSTRAINT caja_turnos_deposito_monto_check CHECK ((deposito_monto >= (0)::numeric)),
    CONSTRAINT caja_turnos_estado_check CHECK ((estado = ANY (ARRAY['abierto'::text, 'cerrado'::text, 'reabierto'::text])))
);


--
-- Name: caja_turnos_auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caja_turnos_auditoria (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    turno_id uuid NOT NULL,
    evento text NOT NULL,
    motivo text,
    detalle jsonb DEFAULT '{}'::jsonb NOT NULL,
    usuario_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT caja_turnos_auditoria_evento_check CHECK ((evento = ANY (ARRAY['reapertura'::text, 'recierre'::text, 'cierre_editado'::text, 'movimiento_creado'::text, 'movimiento_editado'::text, 'movimiento_eliminado'::text, 'pago_reasignado'::text])))
);


--
-- Name: TABLE caja_turnos_auditoria; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.caja_turnos_auditoria IS 'Registro de auditoría de turnos de caja: reaperturas (con motivo), re-cierres y cambios hechos mientras el turno está reabierto. Guarda usuario, fecha y antes/después.';


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    telefono text,
    email text,
    puntos integer DEFAULT 0,
    pedidos_total integer DEFAULT 0,
    gasto_total numeric(12,2) DEFAULT 0,
    notas text,
    created_at timestamp with time zone DEFAULT now(),
    cumpleanos date,
    tags text DEFAULT ''::text,
    acepta_marketing boolean DEFAULT false NOT NULL,
    origen text DEFAULT 'dashboard'::text NOT NULL,
    marketing_optin_at timestamp with time zone
);


--
-- Name: COLUMN clientes.acepta_marketing; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.acepta_marketing IS 'TRUE si el cliente dio consentimiento explícito (opt-in) para recibir promos/novedades por email. Base legal para email marketing (Ley 25.326).';


--
-- Name: COLUMN clientes.origen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.origen IS 'De dónde salió el cliente: ''web'' (reserva online), ''dashboard'' (carga manual), ''telefono'', etc.';


--
-- Name: COLUMN clientes.marketing_optin_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.marketing_optin_at IS 'Momento en que el cliente aceptó recibir promos. Útil como prueba de consentimiento.';


--
-- Name: combo_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.combo_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    combo_id uuid NOT NULL,
    receta_id uuid NOT NULL,
    cantidad integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT combo_items_cantidad_check CHECK ((cantidad > 0))
);


--
-- Name: combos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.combos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    precio numeric(10,2),
    notas text,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: comprobantes_afip; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comprobantes_afip (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid,
    tipo text NOT NULL,
    numero text,
    cae text,
    cae_vencimiento date,
    monto numeric(10,2),
    pdf_url text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: comprobantes_fiscales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comprobantes_fiscales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    letra text DEFAULT 'B'::text NOT NULL,
    tipo_cbte integer DEFAULT 6 NOT NULL,
    punto_venta integer,
    numero integer,
    fecha_emision date DEFAULT CURRENT_DATE NOT NULL,
    concepto integer DEFAULT 1 NOT NULL,
    doc_tipo integer DEFAULT 99 NOT NULL,
    doc_nro text DEFAULT '0'::text,
    receptor_nombre text DEFAULT 'Consumidor Final'::text,
    receptor_condicion_iva text DEFAULT 'Consumidor Final'::text,
    importe_neto numeric(12,2) DEFAULT 0 NOT NULL,
    importe_iva numeric(12,2) DEFAULT 0 NOT NULL,
    importe_total numeric(12,2) DEFAULT 0 NOT NULL,
    moneda text DEFAULT 'PES'::text NOT NULL,
    cotizacion numeric(12,6) DEFAULT 1 NOT NULL,
    cae text,
    cae_vto date,
    qr_url text,
    qr_data_url text,
    arca_request jsonb,
    arca_response jsonb,
    error_mensaje text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cbte_asociado_id uuid,
    receptor_domicilio text,
    receptor_metadata jsonb DEFAULT '{}'::jsonb,
    fecha_vto_pago date,
    fecha_servicio_desde date,
    fecha_servicio_hasta date,
    CONSTRAINT comprobantes_fiscales_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'autorizado'::text, 'rechazado'::text, 'error'::text, 'anulado'::text]))),
    CONSTRAINT comprobantes_fiscales_tipo_letra_check CHECK ((((tipo_cbte = ANY (ARRAY[1, 2, 3])) AND (letra = 'A'::text)) OR ((tipo_cbte = ANY (ARRAY[6, 7, 8])) AND (letra = 'B'::text)) OR ((tipo_cbte = ANY (ARRAY[11, 12, 13])) AND (letra = 'C'::text))))
);


--
-- Name: comprobantes_fiscales_extendidos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.comprobantes_fiscales_extendidos AS
 SELECT c.id,
    c.pedido_id,
    c.estado,
    c.letra,
    c.tipo_cbte,
    c.punto_venta,
    c.numero,
    c.fecha_emision,
    c.concepto,
    c.doc_tipo,
    c.doc_nro,
    c.receptor_nombre,
    c.receptor_condicion_iva,
    c.importe_neto,
    c.importe_iva,
    c.importe_total,
    c.moneda,
    c.cotizacion,
    c.cae,
    c.cae_vto,
    c.qr_url,
    c.qr_data_url,
    c.arca_request,
    c.arca_response,
    c.error_mensaje,
    c.created_by,
    c.created_at,
    c.updated_at,
    c.cbte_asociado_id,
    c.receptor_domicilio,
    c.receptor_metadata,
    c.fecha_vto_pago,
    c.fecha_servicio_desde,
    c.fecha_servicio_hasta,
    p.canal AS pedido_canal,
    p.mesa AS pedido_mesa,
    p.created_at AS pedido_created_at,
    asoc.numero AS cbte_asociado_numero,
    asoc.punto_venta AS cbte_asociado_punto_venta,
    asoc.tipo_cbte AS cbte_asociado_tipo
   FROM ((public.comprobantes_fiscales c
     LEFT JOIN public.pedidos p ON ((p.id = c.pedido_id)))
     LEFT JOIN public.comprobantes_fiscales asoc ON ((asoc.id = c.cbte_asociado_id)));


--
-- Name: device_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text DEFAULT 'android'::text NOT NULL,
    role text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE device_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.device_tokens IS 'Tokens FCM de la app movil Kiku Sushi, por usuario y rol, para push notifications.';


--
-- Name: egresos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.egresos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    categoria text DEFAULT 'otros'::text NOT NULL,
    subtipo text,
    descripcion text NOT NULL,
    monto numeric(12,2) NOT NULL,
    medio_pago text DEFAULT 'efectivo'::text NOT NULL,
    estado text DEFAULT 'pagado'::text NOT NULL,
    vencimiento date,
    periodo text,
    recurrente boolean DEFAULT false NOT NULL,
    proveedor_id uuid,
    empleado_id uuid,
    comprobante_nro text,
    notas text,
    usuario_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    caja_turno_id uuid,
    pagado_desde text,
    CONSTRAINT egresos_categoria_check CHECK ((categoria = ANY (ARRAY['mercaderia'::text, 'sueldos'::text, 'proveedores'::text, 'alquiler'::text, 'servicios'::text, 'impuestos'::text, 'mantenimiento'::text, 'marketing'::text, 'otros'::text]))),
    CONSTRAINT egresos_estado_check CHECK ((estado = ANY (ARRAY['pagado'::text, 'pendiente'::text]))),
    CONSTRAINT egresos_medio_pago_check CHECK ((medio_pago = ANY (ARRAY['efectivo'::text, 'transferencia'::text, 'tarjeta_credito'::text, 'tarjeta_debito'::text, 'cheque'::text, 'otro'::text]))),
    CONSTRAINT egresos_monto_check CHECK ((monto >= (0)::numeric)),
    CONSTRAINT egresos_pagado_desde_check CHECK (((pagado_desde IS NULL) OR (pagado_desde = ANY (ARRAY['caja'::text, 'caja_fuerte'::text]))))
);


--
-- Name: COLUMN egresos.pagado_desde; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.egresos.pagado_desde IS 'De dónde salió el efectivo: caja (turno abierto, descuenta arqueo) o caja_fuerte. Null para medios no-efectivo o efectivo sin origen registrado.';


--
-- Name: empleados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empleados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    apellido text,
    puesto text,
    sueldo_base numeric(12,2) DEFAULT 0 NOT NULL,
    fecha_ingreso date,
    cuit_cuil text,
    cbu text,
    alias text,
    telefono text,
    dia_pago smallint,
    activo boolean DEFAULT true NOT NULL,
    notas text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tipo_sueldo text DEFAULT 'fijo'::text NOT NULL,
    frecuencia_pago text DEFAULT 'mensual'::text NOT NULL,
    dia_pago_semana smallint,
    user_id uuid,
    CONSTRAINT empleados_dia_pago_check CHECK (((dia_pago IS NULL) OR ((dia_pago >= 1) AND (dia_pago <= 31)))),
    CONSTRAINT empleados_dia_pago_semana_check CHECK (((dia_pago_semana IS NULL) OR ((dia_pago_semana >= 0) AND (dia_pago_semana <= 6)))),
    CONSTRAINT empleados_frecuencia_pago_check CHECK ((frecuencia_pago = ANY (ARRAY['mensual'::text, 'quincenal'::text, 'semanal'::text]))),
    CONSTRAINT empleados_sueldo_base_check CHECK ((sueldo_base >= (0)::numeric)),
    CONSTRAINT empleados_tipo_sueldo_check CHECK ((tipo_sueldo = ANY (ARRAY['fijo'::text, 'hora'::text])))
);


--
-- Name: COLUMN empleados.tipo_sueldo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.empleados.tipo_sueldo IS 'fijo = sueldo mensual; hora = sueldo_base es el valor por hora';


--
-- Name: COLUMN empleados.frecuencia_pago; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.empleados.frecuencia_pago IS 'mensual | quincenal | semanal';


--
-- Name: COLUMN empleados.dia_pago_semana; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.empleados.dia_pago_semana IS '0=Domingo … 6=Sábado. Solo se usa cuando frecuencia_pago = semanal';


--
-- Name: COLUMN empleados.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.empleados.user_id IS 'Usuario de auth vinculado. El fichaje se registra siempre a nombre de este usuario.';


--
-- Name: envio_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.envio_config (
    id smallint DEFAULT 1 NOT NULL,
    base numeric(12,2) DEFAULT 3500 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT envio_config_id_check CHECK ((id = 1))
);


--
-- Name: TABLE envio_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.envio_config IS 'Configuración global del costo de envío. Fila única (id=1). base = costo de envío por defecto.';


--
-- Name: envio_zonas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.envio_zonas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    recargo numeric(12,2) DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE envio_zonas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.envio_zonas IS 'Zonas de delivery. El costo final = envio_config.base + zona.recargo.';


--
-- Name: COLUMN envio_zonas.recargo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.envio_zonas.recargo IS 'Plus que se suma a la base de envío para esta zona.';


--
-- Name: escandallo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escandallo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    producto_id uuid,
    ingrediente_id uuid,
    cantidad numeric(10,3) NOT NULL
);


--
-- Name: especial_pasos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.especial_pasos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    especial_id uuid NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    etiqueta text NOT NULL,
    texto text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: especiales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.especiales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    experiencia text NOT NULL,
    numero text,
    overline text,
    titulo text NOT NULL,
    titulo_acento text,
    descripcion text,
    precio numeric(12,2),
    precio_nota text,
    firma text,
    imagen_url text,
    imagen_alt text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cta_tipo text DEFAULT 'reservar'::text NOT NULL,
    cta_producto_id uuid,
    cta_url text,
    cta_label text,
    grupo text,
    descripcion_destacada text,
    dias integer[] DEFAULT '{}'::integer[] NOT NULL,
    CONSTRAINT especiales_cta_tipo_check CHECK ((cta_tipo = ANY (ARRAY['reservar'::text, 'pedir'::text, 'link'::text])))
);


--
-- Name: COLUMN especiales.cta_tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.especiales.cta_tipo IS 'Acción del botón del especial: reservar (form), pedir (deli/take), link (URL libre).';


--
-- Name: COLUMN especiales.cta_producto_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.especiales.cta_producto_id IS 'Producto de menu_items (tipo=delivery) al que apunta el botón cuando cta_tipo = pedir.';


--
-- Name: COLUMN especiales.cta_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.especiales.cta_url IS 'URL destino cuando cta_tipo = link.';


--
-- Name: COLUMN especiales.cta_label; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.especiales.cta_label IS 'Texto opcional del botón. Si está vacío se usa el default según cta_tipo.';


--
-- Name: COLUMN especiales.grupo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.especiales.grupo IS 'Etiqueta de agrupación para carrusel. Especiales con el mismo grupo se muestran juntos (deslizables). NULL = se muestra solo, en su sección.';


--
-- Name: COLUMN especiales.descripcion_destacada; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.especiales.descripcion_destacada IS 'Texto destacado opcional en recuadro debajo de la descripción del especial. Soporta saltos de línea.';


--
-- Name: COLUMN especiales.dias; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.especiales.dias IS 'Días de la semana en que se ofrece el especial (0=Dom..6=Sáb). Vacío = cualquier día abierto. Define en qué fechas aparece en el form de reservas.';


--
-- Name: facturacion_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facturacion_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    razon_social text,
    nombre_fantasia text DEFAULT 'Kiku Sushi'::text,
    cuit text,
    condicion_iva text DEFAULT 'Responsable Inscripto'::text,
    domicilio text,
    ingresos_brutos text,
    inicio_actividades date,
    punto_venta integer,
    ambiente text DEFAULT 'homologacion'::text NOT NULL,
    alicuota_iva numeric(5,2) DEFAULT 21 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    permite_factura_a boolean DEFAULT false NOT NULL,
    certificado_alias text,
    ultimos_numeros jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT facturacion_config_ambiente_check CHECK ((ambiente = ANY (ARRAY['homologacion'::text, 'produccion'::text])))
);


--
-- Name: fichajes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fichajes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empleado_id uuid NOT NULL,
    tipo text NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    punto_id uuid,
    origen text DEFAULT 'qr'::text NOT NULL,
    lat double precision,
    lng double precision,
    precision_m double precision,
    distancia_m integer,
    nota text,
    registrado_por uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fichajes_origen_check CHECK ((origen = ANY (ARRAY['qr'::text, 'manual'::text]))),
    CONSTRAINT fichajes_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'salida'::text])))
);


--
-- Name: impresion_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impresion_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    server_host text,
    printer_comanda_name text,
    printer_comanda_type text DEFAULT 'USB'::text,
    printer_ticket_name text,
    printer_ticket_type text DEFAULT 'USB'::text,
    printer_fiscal_name text,
    printer_fiscal_type text DEFAULT 'USB'::text,
    font_size integer DEFAULT 1 NOT NULL,
    paper_width integer DEFAULT 58 NOT NULL,
    chars_per_line integer DEFAULT 32 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT impresion_config_font_size_check CHECK ((font_size = ANY (ARRAY[1, 2, 3]))),
    CONSTRAINT impresion_config_paper_width_check CHECK ((paper_width = ANY (ARRAY[58, 80]))),
    CONSTRAINT impresion_config_printer_comanda_type_check CHECK ((printer_comanda_type = ANY (ARRAY['USB'::text, 'Network'::text]))),
    CONSTRAINT impresion_config_printer_fiscal_type_check CHECK ((printer_fiscal_type = ANY (ARRAY['USB'::text, 'Network'::text]))),
    CONSTRAINT impresion_config_printer_ticket_type_check CHECK ((printer_ticket_type = ANY (ARRAY['USB'::text, 'Network'::text])))
);


--
-- Name: impresiones_documentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impresiones_documentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid,
    comprobante_id uuid,
    tipo text NOT NULL,
    destino text DEFAULT 'comandera_usb'::text,
    usuario_id uuid DEFAULT auth.uid(),
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT impresiones_documentos_tipo_check CHECK ((tipo = ANY (ARRAY['comanda'::text, 'ticket_fiscal'::text, 'ticket_no_fiscal'::text])))
);


--
-- Name: ingredientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingredientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    unidad text NOT NULL,
    stock_actual numeric(10,3) DEFAULT 0,
    stock_minimo numeric(10,3) DEFAULT 0,
    costo_unitario numeric(10,4),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: lista_espera; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lista_espera (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fecha date NOT NULL,
    hora time without time zone,
    personas integer NOT NULL,
    tipo_experiencia text,
    cliente_nombre text NOT NULL,
    cliente_telefono text,
    cliente_email text,
    notas text,
    estado text DEFAULT 'esperando'::text NOT NULL,
    origen text DEFAULT 'web'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lista_espera_estado_check CHECK ((estado = ANY (ARRAY['esperando'::text, 'contactado'::text, 'convertida'::text, 'cancelada'::text]))),
    CONSTRAINT lista_espera_personas_check CHECK ((personas >= 1)),
    CONSTRAINT lista_espera_tipo_check CHECK (((tipo_experiencia IS NULL) OR (tipo_experiencia = ANY (ARRAY['omakase'::text, 'umami_del_sur'::text, 'pacifico_y_patagonia'::text, 'kiku_libre'::text, 'carta_abierta'::text]))))
);


--
-- Name: TABLE lista_espera; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.lista_espera IS 'Anotaciones de lista de espera (web) cuando una fecha/turno no tiene cupo. Gestión manual desde el dashboard.';


--
-- Name: menu_item_variantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_item_variantes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    menu_item_id uuid NOT NULL,
    nombre text NOT NULL,
    piezas numeric DEFAULT 1 NOT NULL,
    precio numeric DEFAULT 0 NOT NULL,
    orden integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    categoria text NOT NULL,
    subtitulo text,
    nombre text NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    precio text,
    imagen_url text,
    etiqueta text,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    precio_num numeric(12,2),
    picante smallint DEFAULT 0 NOT NULL,
    vegano boolean DEFAULT false NOT NULL,
    vegetariano boolean DEFAULT false NOT NULL,
    sin_tacc boolean DEFAULT false NOT NULL,
    solo_salon boolean DEFAULT false NOT NULL,
    descripcion_destacada text,
    CONSTRAINT menu_items_picante_chk CHECK (((picante >= 0) AND (picante <= 3))),
    CONSTRAINT menu_items_tipo_check CHECK ((tipo = ANY (ARRAY['carta'::text, 'delivery'::text])))
);


--
-- Name: COLUMN menu_items.precio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.precio IS 'LEGACY: campo de display compuesto ("$12.100" o "5p: $12.500 / 9p: $23.200"). Para items con variantes el precio real vive en menu_item_variantes. A migrar a precio_num en fase 2.';


--
-- Name: COLUMN menu_items.precio_num; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.precio_num IS 'Precio numérico canónico para items sin variantes. NULL si el item se vende por variantes (consultar menu_item_variantes) o si no tiene precio asignado.';


--
-- Name: COLUMN menu_items.picante; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.picante IS '0 ninguno · 1 Leve · 2 Medio · 3 Muy Picante';


--
-- Name: COLUMN menu_items.vegano; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.vegano IS 'Apto vegano (icono veggie verde)';


--
-- Name: COLUMN menu_items.vegetariano; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.vegetariano IS 'Apto vegetariano';


--
-- Name: COLUMN menu_items.sin_tacc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.sin_tacc IS 'Sin TACC (apto celíacos)';


--
-- Name: COLUMN menu_items.solo_salon; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.solo_salon IS 'Si es true, el producto se ofrece en salón/mesas (admin) aunque esté oculto en la carta web pública (que filtra por activo). Útil para cubierto / Kiku libre.';


--
-- Name: COLUMN menu_items.descripcion_destacada; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.descripcion_destacada IS 'Texto destacado opcional en recuadro debajo de la descripción (ej: "Consultar opción sin bebida", "Descuento efectivo/transferencia"). Soporta saltos de línea.';


--
-- Name: mermas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mermas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ingrediente_id uuid,
    cantidad numeric(10,3) NOT NULL,
    motivo text,
    registrado_por text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mesas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mesas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    salon_id uuid NOT NULL,
    numero integer NOT NULL,
    nombre text,
    capacidad integer DEFAULT 4 NOT NULL,
    pos_x integer DEFAULT 0 NOT NULL,
    pos_y integer DEFAULT 0 NOT NULL,
    ancho integer DEFAULT 80 NOT NULL,
    alto integer DEFAULT 80 NOT NULL,
    forma text DEFAULT 'rect'::text NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    mesa_grupo_id uuid,
    CONSTRAINT mesas_forma_check CHECK ((forma = ANY (ARRAY['rect'::text, 'circle'::text])))
);


--
-- Name: COLUMN mesas.mesa_grupo_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mesas.mesa_grupo_id IS 'Si está set, esta mesa es MIEMBRO de un grupo cuyo líder es la mesa apuntada. El líder tiene mesa_grupo_id = NULL. Al cerrar/cobrar el pedido del líder el frontend debe llamar a desagrupar_grupo(leader).';


--
-- Name: mozos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mozos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    color text DEFAULT '#9b87f5'::text,
    activo boolean DEFAULT true NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notificaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    titulo text NOT NULL,
    mensaje text NOT NULL,
    referencia_id uuid,
    referencia_tabla text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    leida boolean DEFAULT false NOT NULL,
    leida_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE notificaciones; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notificaciones IS 'Historial persistente de notificaciones del dashboard. Trigger-driven desde reservas y pedidos.';


--
-- Name: pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    comprobante_id uuid,
    medio_pago text NOT NULL,
    numero_operacion text,
    monto numeric(12,2) NOT NULL,
    notas text,
    usuario_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    caja_turno_id uuid,
    CONSTRAINT pagos_medio_pago_check CHECK ((medio_pago = ANY (ARRAY['efectivo'::text, 'transferencia'::text, 'tarjeta_credito'::text, 'tarjeta_debito'::text]))),
    CONSTRAINT pagos_monto_check CHECK ((monto >= (0)::numeric))
);


--
-- Name: pagos_arqueo; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.pagos_arqueo AS
 SELECT p.id,
    p.medio_pago,
    p.numero_operacion,
    p.monto,
    p.notas,
    p.created_at,
    p.usuario_id,
    ped.id AS pedido_id,
    ped.mesa AS pedido_mesa,
    ped.canal AS pedido_canal,
    ped.total AS pedido_total,
    c.id AS comprobante_id,
    c.letra AS comprobante_letra,
    c.tipo_cbte AS comprobante_tipo,
    c.punto_venta AS comprobante_pv,
    c.numero AS comprobante_numero,
    c.cae AS comprobante_cae,
    c.importe_total AS comprobante_importe,
    p.caja_turno_id
   FROM ((public.pagos p
     JOIN public.pedidos ped ON ((ped.id = p.pedido_id)))
     LEFT JOIN public.comprobantes_fiscales c ON ((c.id = p.comprobante_id)));


--
-- Name: pedido_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedido_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid,
    producto_id uuid,
    cantidad integer DEFAULT 1 NOT NULL,
    precio_unitario numeric(10,2) NOT NULL,
    subtotal numeric(10,2) GENERATED ALWAYS AS (((cantidad)::numeric * precio_unitario)) STORED,
    notas text,
    nombre text,
    menu_item_id uuid,
    variante_id uuid,
    enviado_cocina boolean DEFAULT false NOT NULL,
    enviado_at timestamp with time zone
);


--
-- Name: pedidos_numero_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pedidos_numero_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pedidos_numero_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pedidos_numero_seq OWNED BY public.pedidos.numero;


--
-- Name: produccion_listas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produccion_listas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    titulo text,
    notas text,
    creado_por uuid,
    estado text DEFAULT 'activa'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT produccion_listas_estado_check CHECK ((estado = ANY (ARRAY['activa'::text, 'completada'::text, 'archivada'::text])))
);


--
-- Name: produccion_tareas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produccion_tareas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lista_id uuid NOT NULL,
    receta_id uuid,
    descripcion text NOT NULL,
    cantidad numeric(10,2) DEFAULT 1,
    cantidad_real numeric(10,2),
    prioridad integer DEFAULT 0,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    completada_por text,
    completada_at timestamp with time zone,
    stock_descontado boolean DEFAULT false,
    descuento_detalle jsonb,
    notas_equipo text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT produccion_tareas_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'en_progreso'::text, 'completada'::text])))
);


--
-- Name: productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.productos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    categoria text NOT NULL,
    precio numeric(10,2) NOT NULL,
    activo boolean DEFAULT true,
    imagen_url text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: proveedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proveedores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    razon_social text NOT NULL,
    nro_cuenta text,
    cuit_cuil text,
    cbu text,
    alias text,
    telefono text,
    notas text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fecha_pago date
);


--
-- Name: COLUMN proveedores.fecha_pago; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.proveedores.fecha_pago IS 'Fecha del próximo pago al proveedor (selector de calendario)';


--
-- Name: puntos_fichaje; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.puntos_fichaje (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    token text NOT NULL,
    lat double precision,
    lng double precision,
    radio_m integer DEFAULT 100 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT puntos_fichaje_radio_m_check CHECK (((radio_m >= 10) AND (radio_m <= 1000)))
);


--
-- Name: TABLE puntos_fichaje; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.puntos_fichaje IS 'QR fijos del local. Si lat/lng están seteados, fichar() exige estar dentro del radio (geocerca).';


--
-- Name: receta_ingredientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receta_ingredientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    receta_id uuid NOT NULL,
    stock_id uuid,
    cantidad numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    subreceta_id uuid
);


--
-- Name: recetas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recetas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    menu_item_id uuid,
    porciones integer DEFAULT 1,
    notas text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    es_subreceta boolean DEFAULT false
);


--
-- Name: recurso_tablas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurso_tablas (
    recurso_id text NOT NULL,
    tabla text NOT NULL,
    escribe boolean DEFAULT true NOT NULL
);


--
-- Name: TABLE recurso_tablas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.recurso_tablas IS 'Qué tablas necesita cada sección. Una tabla puede estar en varios recursos: el acceso se concede si el rol tiene alguno. Lo mantiene el código, no la UI.';


--
-- Name: recursos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recursos (
    id text NOT NULL,
    nombre text NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    ruta text,
    grupo text DEFAULT 'General'::text NOT NULL,
    sensible boolean DEFAULT false NOT NULL,
    orden integer DEFAULT 100 NOT NULL,
    CONSTRAINT recursos_id_check CHECK ((id ~ '^[a-z][a-z0-9_]{1,40}$'::text))
);


--
-- Name: TABLE recursos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.recursos IS 'Catálogo de secciones/permisos otorgables. Lo mantiene el equipo de desarrollo, no la UI.';


--
-- Name: reservas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fecha date NOT NULL,
    hora time without time zone NOT NULL,
    duracion_min integer DEFAULT 90 NOT NULL,
    personas integer NOT NULL,
    cliente_nombre text NOT NULL,
    cliente_telefono text,
    cliente_email text,
    notas text,
    estado public.reserva_estado DEFAULT 'pendiente'::public.reserva_estado NOT NULL,
    origen text DEFAULT 'dashboard'::text NOT NULL,
    salon_id uuid,
    mesa_id uuid,
    pedido_id uuid,
    confirmada_at timestamp with time zone,
    sentada_at timestamp with time zone,
    cancelada_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    restricciones text,
    accesibilidad text,
    tipo_experiencia text,
    CONSTRAINT reservas_duracion_min_check CHECK (((duracion_min >= 15) AND (duracion_min <= 480))),
    CONSTRAINT reservas_origen_check CHECK ((origen = ANY (ARRAY['web'::text, 'dashboard'::text, 'telefono'::text, 'whatsapp'::text]))),
    CONSTRAINT reservas_personas_check CHECK (((personas >= 1) AND (personas <= 100)))
);


--
-- Name: TABLE reservas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reservas IS 'Reservas de mesa. Insertadas por la web pública (origen=web) o cargadas a mano desde el dashboard.';


--
-- Name: COLUMN reservas.restricciones; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reservas.restricciones IS 'Restricciones alimentarias declaradas por el cliente (vegetariano, celiaco, etc.). Opcional.';


--
-- Name: COLUMN reservas.accesibilidad; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reservas.accesibilidad IS 'Necesidades de accesibilidad declaradas por el cliente (silla de ruedas, planta baja, etc.). Opcional.';


--
-- Name: COLUMN reservas.tipo_experiencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reservas.tipo_experiencia IS 'Experiencia gastronómica reservada: omakase | umami_del_sur | pacifico_y_patagonia | kiku_libre | carta_abierta. NULL en reservas previas a esta migración.';


--
-- Name: reservas_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservas_config (
    id integer DEFAULT 1 NOT NULL,
    mediodia_slots text[] DEFAULT ARRAY['12:30'::text, '13:00'::text, '13:30'::text, '14:00'::text, '14:30'::text, '15:00'::text] NOT NULL,
    noche_slots text[] DEFAULT ARRAY['20:00'::text, '20:30'::text, '21:00'::text, '21:30'::text, '22:00'::text] NOT NULL,
    orden_llegada_slots text[] DEFAULT ARRAY['22:30'::text, '23:00'::text] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reservas_config_singleton CHECK ((id = 1))
);


--
-- Name: TABLE reservas_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reservas_config IS 'Turnos de reserva por franja (fila única id=1). Editable desde el dashboard → Configuración → Reservas.';


--
-- Name: COLUMN reservas_config.mediodia_slots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reservas_config.mediodia_slots IS 'Horarios de mediodía disponibles para reservar, como "HH:MM". Ej: {12:30,13:00,...}.';


--
-- Name: COLUMN reservas_config.noche_slots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reservas_config.noche_slots IS 'Horarios de noche con mesa asignada.';


--
-- Name: COLUMN reservas_config.orden_llegada_slots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reservas_config.orden_llegada_slots IS 'Horarios de noche que se toman por orden de llegada (sin mesa fija).';


--
-- Name: reservas_dias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservas_dias (
    dow integer NOT NULL,
    mediodia boolean DEFAULT false NOT NULL,
    noche boolean DEFAULT false NOT NULL,
    CONSTRAINT reservas_dias_dow_check CHECK (((dow >= 0) AND (dow <= 6)))
);


--
-- Name: TABLE reservas_dias; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reservas_dias IS 'Franjas habilitadas por día de la semana (dow 0=Dom..6=Sáb). El día abre si mediodia o noche es true. Editable desde Configuración → Reservas.';


--
-- Name: rol_permisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rol_permisos (
    rol_id text NOT NULL,
    recurso_id text NOT NULL,
    ver boolean DEFAULT false NOT NULL,
    editar boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rol_permisos_editar_implica_ver CHECK (((NOT editar) OR ver))
);


--
-- Name: TABLE rol_permisos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rol_permisos IS 'Matriz rol × recurso. La ausencia de fila equivale a sin permiso.';


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id text NOT NULL,
    nombre text NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    sistema boolean DEFAULT false NOT NULL,
    orden integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT roles_id_check CHECK ((id ~ '^[a-z][a-z0-9_]{1,30}$'::text))
);


--
-- Name: TABLE roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.roles IS 'Roles del sistema. El id es el valor que va en app_metadata.role del JWT.';


--
-- Name: COLUMN roles.sistema; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roles.sistema IS 'True para los 5 roles originales (admin, cocina, mozo, empleado, finanzas): no borrables.';


--
-- Name: salones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    ancho integer DEFAULT 1200 NOT NULL,
    alto integer DEFAULT 800 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    stock_actual numeric(10,2) DEFAULT 0 NOT NULL,
    stock_minimo numeric(10,2) DEFAULT 0 NOT NULL,
    unidad text DEFAULT 'u'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    proveedor text,
    categoria text DEFAULT 'General'::text,
    precio_unitario numeric DEFAULT 0,
    rendimiento numeric DEFAULT 1,
    notas text,
    tipo_stock text DEFAULT 'materia_prima'::text NOT NULL,
    receta_id uuid,
    CONSTRAINT stock_tipo_stock_check CHECK ((tipo_stock = ANY (ARRAY['materia_prima'::text, 'produccion'::text])))
);


--
-- Name: COLUMN stock.precio_unitario; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock.precio_unitario IS 'Precio de compra por unidad (ej: $/kg)';


--
-- Name: COLUMN stock.rendimiento; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock.rendimiento IS 'Factor de rendimiento después de merma (0-1). 1 = sin merma';


--
-- Name: stock_movimientos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movimientos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stock_id uuid NOT NULL,
    tipo text NOT NULL,
    cantidad numeric(10,2) NOT NULL,
    stock_antes numeric(10,2) NOT NULL,
    stock_despues numeric(10,2) NOT NULL,
    notas text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT stock_movimientos_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'salida'::text, 'ajuste'::text, 'merma'::text])))
);


--
-- Name: tipos_comprobante; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_comprobante (
    codigo integer NOT NULL,
    letra text NOT NULL,
    descripcion text NOT NULL,
    es_nota boolean DEFAULT false NOT NULL,
    signo numeric(2,0) DEFAULT 1 NOT NULL,
    CONSTRAINT tipos_comprobante_letra_check CHECK ((letra = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])))
);


--
-- Name: turnos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turnos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empleado_id uuid,
    dia_semana smallint,
    hora_inicio time without time zone NOT NULL,
    hora_fin time without time zone NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    nota text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT turnos_dia_semana_check CHECK (((dia_semana >= 0) AND (dia_semana <= 6)))
);


--
-- Name: turnos_caja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turnos_caja (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    apertura_at timestamp with time zone DEFAULT now(),
    cierre_at timestamp with time zone,
    monto_apertura numeric(10,2) NOT NULL,
    monto_cierre numeric(10,2),
    usuario text,
    estado text DEFAULT 'abierto'::text
);


--
-- Name: v_alertas_stock; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_alertas_stock AS
 SELECT id,
    nombre,
    stock_actual,
    stock_minimo,
    unidad,
        CASE
            WHEN (stock_actual <= (0)::numeric) THEN 'critico'::text
            WHEN (stock_actual <= stock_minimo) THEN 'bajo'::text
            ELSE 'ok'::text
        END AS estado
   FROM public.stock
  WHERE (stock_actual <= stock_minimo);


--
-- Name: v_kpis_dia; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_kpis_dia AS
 SELECT (COALESCE(sum(total), (0)::numeric))::numeric(12,2) AS ventas_total,
    (COALESCE(avg(total), (0)::numeric))::numeric(12,2) AS ticket_promedio,
    count(*) FILTER (WHERE (canal = 'salon'::text)) AS pedidos_salon,
    count(*) FILTER (WHERE (canal <> 'salon'::text)) AS pedidos_delivery,
    count(*) AS pedidos_total
   FROM public.pedidos
  WHERE ((date((created_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text)) = CURRENT_DATE) AND (estado <> 'cancelado'::text));


--
-- Name: v_mesas_estado; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_mesas_estado AS
 SELECT m.id,
    m.salon_id,
    m.numero,
    m.nombre,
    m.capacidad,
    m.pos_x,
    m.pos_y,
    m.ancho,
    m.alto,
    m.forma,
    m.activa,
    s.nombre AS salon_nombre,
    p.id AS pedido_id,
    p.estado AS pedido_estado,
    p.total AS pedido_total,
    p.personas AS pedido_personas,
    p.abierta_at AS pedido_abierta_at,
    p.mozo_id AS pedido_mozo_id,
    mz.nombre AS mozo_nombre,
    mz.color AS mozo_color,
        CASE
            WHEN (p.id IS NULL) THEN 'libre'::text
            WHEN (p.estado = 'pendiente'::text) THEN 'ocupada'::text
            WHEN (p.estado = 'preparando'::text) THEN 'en_cocina'::text
            WHEN (p.estado = 'listo'::text) THEN 'lista_para_cobrar'::text
            WHEN (EXISTS ( SELECT 1
               FROM public.comprobantes_fiscales c
              WHERE ((c.pedido_id = p.id) AND (c.estado = 'autorizado'::text)))) THEN 'cobrada'::text
            ELSE 'ocupada'::text
        END AS estado_mesa
   FROM (((public.mesas m
     LEFT JOIN public.salones s ON ((s.id = m.salon_id)))
     LEFT JOIN LATERAL ( SELECT pedidos.id,
            pedidos.numero,
            pedidos.cliente_id,
            pedidos.canal,
            pedidos.mesa,
            pedidos.estado,
            pedidos.metodo_pago,
            pedidos.total,
            pedidos.notas,
            pedidos.turno_caja_id,
            pedidos.created_at,
            pedidos.updated_at,
            pedidos.stock_descontado,
            pedidos.descuento_detalle,
            pedidos.descuento_porcentaje,
            pedidos.cliente_nombre,
            pedidos.cliente_telefono,
            pedidos.cliente_direccion,
            pedidos.mesa_id,
            pedidos.mozo_id,
            pedidos.personas,
            pedidos.abierta_at,
            pedidos.cerrada_at
           FROM public.pedidos
          WHERE ((pedidos.mesa_id = m.id) AND (pedidos.estado <> ALL (ARRAY['entregado'::text, 'cancelado'::text])))
          ORDER BY pedidos.created_at DESC
         LIMIT 1) p ON (true))
     LEFT JOIN public.mozos mz ON ((mz.id = p.mozo_id)));


--
-- Name: vista_jornadas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vista_jornadas WITH (security_invoker='on') AS
 WITH ordenados AS (
         SELECT fichajes.empleado_id,
            fichajes.tipo,
            fichajes.ts,
            lead(fichajes.tipo) OVER (PARTITION BY fichajes.empleado_id ORDER BY fichajes.ts, fichajes.created_at) AS sig_tipo,
            lead(fichajes.ts) OVER (PARTITION BY fichajes.empleado_id ORDER BY fichajes.ts, fichajes.created_at) AS sig_ts
           FROM public.fichajes
        )
 SELECT empleado_id,
    ts AS entrada,
    sig_ts AS salida,
    (round((EXTRACT(epoch FROM (sig_ts - ts)) / 60.0)))::integer AS minutos_reales,
    ((round(((EXTRACT(epoch FROM (sig_ts - ts)) / 60.0) / 30.0)) * (30)::numeric))::integer AS minutos
   FROM ordenados
  WHERE ((tipo = 'entrada'::text) AND ((sig_tipo IS NULL) OR (sig_tipo = 'salida'::text)));


--
-- Name: VIEW vista_jornadas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.vista_jornadas IS 'Jornadas derivadas del log de fichajes. minutos = redondeo a bloques de 30 min (más cercano); salida null = jornada abierta.';


--
-- Name: web_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_config (
    id integer DEFAULT 1 NOT NULL,
    anuncio_texto text,
    anuncio_activo boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    omakase_precio integer DEFAULT 70000 NOT NULL,
    novedad_activo boolean DEFAULT false NOT NULL,
    novedad_overline text DEFAULT 'ラーメン'::text NOT NULL,
    novedad_titulo text DEFAULT 'Ramen'::text NOT NULL,
    novedad_titulo_accent text DEFAULT ''::text NOT NULL,
    novedad_descripcion text DEFAULT ''::text NOT NULL,
    novedad_precio integer DEFAULT 0 NOT NULL,
    novedad_imagenes jsonb DEFAULT '[]'::jsonb NOT NULL,
    libre_precio integer DEFAULT 53500 NOT NULL,
    libre_sena integer DEFAULT 20000 NOT NULL,
    libre_multa_pieza integer DEFAULT 1000 NOT NULL,
    libre_pago_nota text DEFAULT 'Efectivo o transferencia · Otro medio de pago consultar'::text NOT NULL,
    cubierto_precio integer DEFAULT 3500 NOT NULL,
    agua_texto text DEFAULT 'Este establecimiento garantiza a cada comensal un vaso de agua potable de 375 ml sin cargo.'::text NOT NULL,
    negocio_nombre text DEFAULT 'KIKU SUSHI'::text NOT NULL,
    negocio_subtitulo text DEFAULT 'Sistema de gestión'::text NOT NULL,
    negocio_color text DEFAULT '#2a1d3d'::text NOT NULL,
    CONSTRAINT web_config_cubierto_precio_check CHECK ((cubierto_precio >= 0)),
    CONSTRAINT web_config_libre_multa_pieza_check CHECK ((libre_multa_pieza >= 0)),
    CONSTRAINT web_config_libre_precio_check CHECK ((libre_precio > 0)),
    CONSTRAINT web_config_libre_sena_check CHECK ((libre_sena >= 0)),
    CONSTRAINT web_config_negocio_color_check CHECK ((negocio_color ~ '^#[0-9a-fA-F]{6}$'::text)),
    CONSTRAINT web_config_novedad_activo_requiere_contenido CHECK (((novedad_activo = false) OR ((length(btrim(novedad_descripcion)) > 0) AND (jsonb_array_length(novedad_imagenes) >= 2)))),
    CONSTRAINT web_config_novedad_imagenes_shape CHECK (((jsonb_typeof(novedad_imagenes) = 'array'::text) AND (jsonb_array_length(novedad_imagenes) <= 5))),
    CONSTRAINT web_config_novedad_precio_no_negativo CHECK ((novedad_precio >= 0)),
    CONSTRAINT web_config_singleton CHECK ((id = 1))
);


--
-- Name: TABLE web_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.web_config IS 'Configuración editable de la web pública (fila única id=1). Barra de anuncio, etc.';


--
-- Name: COLUMN web_config.omakase_precio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.omakase_precio IS 'Precio por persona del Omakase (en pesos, sin separadores). Ej: 70000. Editable desde /menu → tab Omakase.';


--
-- Name: COLUMN web_config.novedad_activo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.novedad_activo IS 'Si la sección Novedad se muestra en el home (justo después del hero). Editable desde /menu → tab "Nuevo".';


--
-- Name: COLUMN web_config.novedad_overline; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.novedad_overline IS 'Texto japonés decorativo sobre el título de la sección. Ej: ラーメン';


--
-- Name: COLUMN web_config.novedad_titulo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.novedad_titulo IS 'Primera palabra del título (peso liviano). Ej: "Ramen"';


--
-- Name: COLUMN web_config.novedad_titulo_accent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.novedad_titulo_accent IS 'Segunda palabra del título, se renderiza con gradiente champagne/violeta. Ej: "de Kiku"';


--
-- Name: COLUMN web_config.novedad_descripcion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.novedad_descripcion IS 'Párrafo descriptivo de la sección.';


--
-- Name: COLUMN web_config.novedad_precio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.novedad_precio IS 'Precio en pesos, sin separadores. Ej: 18000. Si es 0, la web no muestra precio.';


--
-- Name: COLUMN web_config.novedad_imagenes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.novedad_imagenes IS 'Array jsonb de imágenes: [{ "url": "...", "alt": "..." }]. Entre 2 y 5 — la web las muestra en carrusel. Se suben al bucket menu-images bajo el prefijo novedad/.';


--
-- Name: COLUMN web_config.libre_precio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.libre_precio IS 'Kiku Libre: precio por persona. Se muestra en /sushi-libre, el showcase del inicio y el form de reservas.';


--
-- Name: COLUMN web_config.libre_sena; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.libre_sena IS 'Kiku Libre: seña por persona para reservar.';


--
-- Name: COLUMN web_config.libre_multa_pieza; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.libre_multa_pieza IS 'Kiku Libre: multa por pieza sin consumir (política anti-desperdicio).';


--
-- Name: COLUMN web_config.cubierto_precio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.cubierto_precio IS 'Servicio de mesa / cubierto por persona. Solo a la carta de salón. Se muestra en la carta online, especiales y reservas.';


--
-- Name: COLUMN web_config.agua_texto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.agua_texto IS 'Texto legal del vaso de agua sin cargo. Aparece al pie de la carta, especiales y el Libre.';


--
-- Name: COLUMN web_config.negocio_nombre; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.negocio_nombre IS 'Nombre del negocio: marca del dashboard (sidebar, login). White-label.';


--
-- Name: COLUMN web_config.negocio_color; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.web_config.negocio_color IS 'Color de acento del dashboard en hex. El front deriva los tonos.';


--
-- Name: webhook_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_config (
    id boolean DEFAULT true NOT NULL,
    webhook_url text,
    whatsapp_destino text DEFAULT '5431501750'::text,
    activo boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    wasender_api_url text DEFAULT 'https://www.wasenderapi.com/api/send-message'::text,
    wasender_api_key text,
    CONSTRAINT webhook_config_id_check CHECK (id)
);


--
-- Name: TABLE webhook_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.webhook_config IS 'Config singleton para webhooks salientes. webhook_url apunta a la automatización no-code (Make/n8n/Zapier) que envía el WhatsApp a whatsapp_destino al entrar una reserva o un pedido desde la web.';


--
-- Name: COLUMN webhook_config.wasender_api_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.webhook_config.wasender_api_key IS 'Token (Bearer) de WasenderAPI. Lo usa el trigger para enviar el WhatsApp directo. Sin "Bearer ", solo el token.';


--
-- Name: pedidos numero; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos ALTER COLUMN numero SET DEFAULT nextval('public.pedidos_numero_seq'::regclass);


--
-- Name: aperturas_especiales aperturas_especiales_fecha_canal_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aperturas_especiales
    ADD CONSTRAINT aperturas_especiales_fecha_canal_key UNIQUE (fecha, canal);


--
-- Name: aperturas_especiales aperturas_especiales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aperturas_especiales
    ADD CONSTRAINT aperturas_especiales_pkey PRIMARY KEY (id);


--
-- Name: arca_request_log arca_request_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arca_request_log
    ADD CONSTRAINT arca_request_log_pkey PRIMARY KEY (id);


--
-- Name: arca_tokens arca_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arca_tokens
    ADD CONSTRAINT arca_tokens_pkey PRIMARY KEY (id);


--
-- Name: caja_fuerte_movimientos caja_fuerte_movimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_fuerte_movimientos
    ADD CONSTRAINT caja_fuerte_movimientos_pkey PRIMARY KEY (id);


--
-- Name: caja_movimientos caja_movimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimientos
    ADD CONSTRAINT caja_movimientos_pkey PRIMARY KEY (id);


--
-- Name: caja_turnos_auditoria caja_turnos_auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_turnos_auditoria
    ADD CONSTRAINT caja_turnos_auditoria_pkey PRIMARY KEY (id);


--
-- Name: caja_turnos caja_turnos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_turnos
    ADD CONSTRAINT caja_turnos_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_telefono_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_telefono_key UNIQUE (telefono);


--
-- Name: combo_items combo_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.combo_items
    ADD CONSTRAINT combo_items_pkey PRIMARY KEY (id);


--
-- Name: combos combos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.combos
    ADD CONSTRAINT combos_pkey PRIMARY KEY (id);


--
-- Name: comprobantes_afip comprobantes_afip_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobantes_afip
    ADD CONSTRAINT comprobantes_afip_pkey PRIMARY KEY (id);


--
-- Name: comprobantes_fiscales comprobantes_fiscales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobantes_fiscales
    ADD CONSTRAINT comprobantes_fiscales_pkey PRIMARY KEY (id);


--
-- Name: device_tokens device_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_pkey PRIMARY KEY (id);


--
-- Name: device_tokens device_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_token_key UNIQUE (token);


--
-- Name: egresos egresos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.egresos
    ADD CONSTRAINT egresos_pkey PRIMARY KEY (id);


--
-- Name: empleados empleados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_pkey PRIMARY KEY (id);


--
-- Name: envio_config envio_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envio_config
    ADD CONSTRAINT envio_config_pkey PRIMARY KEY (id);


--
-- Name: envio_zonas envio_zonas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envio_zonas
    ADD CONSTRAINT envio_zonas_pkey PRIMARY KEY (id);


--
-- Name: escandallo escandallo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escandallo
    ADD CONSTRAINT escandallo_pkey PRIMARY KEY (id);


--
-- Name: especial_pasos especial_pasos_especial_id_orden_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.especial_pasos
    ADD CONSTRAINT especial_pasos_especial_id_orden_key UNIQUE (especial_id, orden);


--
-- Name: especial_pasos especial_pasos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.especial_pasos
    ADD CONSTRAINT especial_pasos_pkey PRIMARY KEY (id);


--
-- Name: especiales especiales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.especiales
    ADD CONSTRAINT especiales_pkey PRIMARY KEY (id);


--
-- Name: especiales especiales_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.especiales
    ADD CONSTRAINT especiales_slug_key UNIQUE (slug);


--
-- Name: facturacion_config facturacion_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturacion_config
    ADD CONSTRAINT facturacion_config_pkey PRIMARY KEY (id);


--
-- Name: fichajes fichajes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fichajes
    ADD CONSTRAINT fichajes_pkey PRIMARY KEY (id);


--
-- Name: impresion_config impresion_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impresion_config
    ADD CONSTRAINT impresion_config_pkey PRIMARY KEY (id);


--
-- Name: impresiones_documentos impresiones_documentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impresiones_documentos
    ADD CONSTRAINT impresiones_documentos_pkey PRIMARY KEY (id);


--
-- Name: ingredientes ingredientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredientes
    ADD CONSTRAINT ingredientes_pkey PRIMARY KEY (id);


--
-- Name: liquidaciones liquidaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT liquidaciones_pkey PRIMARY KEY (id);


--
-- Name: lista_espera lista_espera_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lista_espera
    ADD CONSTRAINT lista_espera_pkey PRIMARY KEY (id);


--
-- Name: menu_item_variantes menu_item_variantes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_variantes
    ADD CONSTRAINT menu_item_variantes_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: mermas mermas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mermas
    ADD CONSTRAINT mermas_pkey PRIMARY KEY (id);


--
-- Name: mesas mesas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesas
    ADD CONSTRAINT mesas_pkey PRIMARY KEY (id);


--
-- Name: mesas mesas_salon_id_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesas
    ADD CONSTRAINT mesas_salon_id_numero_key UNIQUE (salon_id, numero);


--
-- Name: mozos mozos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mozos
    ADD CONSTRAINT mozos_pkey PRIMARY KEY (id);


--
-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (id);


--
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (id);


--
-- Name: pedido_items pedido_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_items
    ADD CONSTRAINT pedido_items_pkey PRIMARY KEY (id);


--
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (id);


--
-- Name: produccion_listas produccion_listas_fecha_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produccion_listas
    ADD CONSTRAINT produccion_listas_fecha_key UNIQUE (fecha);


--
-- Name: produccion_listas produccion_listas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produccion_listas
    ADD CONSTRAINT produccion_listas_pkey PRIMARY KEY (id);


--
-- Name: produccion_tareas produccion_tareas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produccion_tareas
    ADD CONSTRAINT produccion_tareas_pkey PRIMARY KEY (id);


--
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (id);


--
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (id);


--
-- Name: puntos_fichaje puntos_fichaje_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.puntos_fichaje
    ADD CONSTRAINT puntos_fichaje_pkey PRIMARY KEY (id);


--
-- Name: puntos_fichaje puntos_fichaje_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.puntos_fichaje
    ADD CONSTRAINT puntos_fichaje_token_key UNIQUE (token);


--
-- Name: receta_ingredientes receta_ingredientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receta_ingredientes
    ADD CONSTRAINT receta_ingredientes_pkey PRIMARY KEY (id);


--
-- Name: receta_ingredientes receta_ingredientes_receta_id_stock_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receta_ingredientes
    ADD CONSTRAINT receta_ingredientes_receta_id_stock_id_key UNIQUE (receta_id, stock_id);


--
-- Name: recetas recetas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recetas
    ADD CONSTRAINT recetas_pkey PRIMARY KEY (id);


--
-- Name: recurso_tablas recurso_tablas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurso_tablas
    ADD CONSTRAINT recurso_tablas_pkey PRIMARY KEY (recurso_id, tabla);


--
-- Name: recursos recursos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recursos
    ADD CONSTRAINT recursos_pkey PRIMARY KEY (id);


--
-- Name: reservas_config reservas_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas_config
    ADD CONSTRAINT reservas_config_pkey PRIMARY KEY (id);


--
-- Name: reservas_dias reservas_dias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas_dias
    ADD CONSTRAINT reservas_dias_pkey PRIMARY KEY (dow);


--
-- Name: reservas reservas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_pkey PRIMARY KEY (id);


--
-- Name: rol_permisos rol_permisos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rol_permisos
    ADD CONSTRAINT rol_permisos_pkey PRIMARY KEY (rol_id, recurso_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: salones salones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salones
    ADD CONSTRAINT salones_pkey PRIMARY KEY (id);


--
-- Name: stock_movimientos stock_movimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movimientos
    ADD CONSTRAINT stock_movimientos_pkey PRIMARY KEY (id);


--
-- Name: stock stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_pkey PRIMARY KEY (id);


--
-- Name: tipos_comprobante tipos_comprobante_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_comprobante
    ADD CONSTRAINT tipos_comprobante_pkey PRIMARY KEY (codigo);


--
-- Name: turnos_caja turnos_caja_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos_caja
    ADD CONSTRAINT turnos_caja_pkey PRIMARY KEY (id);


--
-- Name: turnos turnos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT turnos_pkey PRIMARY KEY (id);


--
-- Name: web_config web_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_config
    ADD CONSTRAINT web_config_pkey PRIMARY KEY (id);


--
-- Name: webhook_config webhook_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_config
    ADD CONSTRAINT webhook_config_pkey PRIMARY KEY (id);


--
-- Name: arca_request_log_comprobante_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX arca_request_log_comprobante_idx ON public.arca_request_log USING btree (comprobante_id, created_at DESC);


--
-- Name: arca_request_log_servicio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX arca_request_log_servicio_idx ON public.arca_request_log USING btree (servicio, created_at DESC);


--
-- Name: arca_tokens_expiration_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX arca_tokens_expiration_idx ON public.arca_tokens USING btree (expiration_time);


--
-- Name: arca_tokens_servicio_ambiente_cuit_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX arca_tokens_servicio_ambiente_cuit_uid ON public.arca_tokens USING btree (servicio, ambiente, cuit);


--
-- Name: caja_fuerte_movs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX caja_fuerte_movs_created_idx ON public.caja_fuerte_movimientos USING btree (created_at DESC);


--
-- Name: caja_fuerte_movs_turno_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX caja_fuerte_movs_turno_idx ON public.caja_fuerte_movimientos USING btree (turno_id);


--
-- Name: caja_movimientos_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX caja_movimientos_created_at_idx ON public.caja_movimientos USING btree (created_at DESC);


--
-- Name: caja_movimientos_egreso_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX caja_movimientos_egreso_idx ON public.caja_movimientos USING btree (egreso_id);


--
-- Name: caja_movimientos_turno_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX caja_movimientos_turno_idx ON public.caja_movimientos USING btree (turno_id, created_at DESC);


--
-- Name: caja_turnos_auditoria_turno_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX caja_turnos_auditoria_turno_idx ON public.caja_turnos_auditoria USING btree (turno_id, created_at DESC);


--
-- Name: caja_turnos_business_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX caja_turnos_business_date_idx ON public.caja_turnos USING btree (business_date DESC, apertura_at DESC);


--
-- Name: caja_turnos_caja_abierta_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX caja_turnos_caja_abierta_uid ON public.caja_turnos USING btree (lower(caja_nombre)) WHERE (estado = 'abierto'::text);


--
-- Name: comprobantes_fiscales_cbte_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX comprobantes_fiscales_cbte_uid ON public.comprobantes_fiscales USING btree (tipo_cbte, punto_venta, numero) WHERE (numero IS NOT NULL);


--
-- Name: comprobantes_fiscales_pedido_factura_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX comprobantes_fiscales_pedido_factura_uid ON public.comprobantes_fiscales USING btree (pedido_id) WHERE ((estado = 'autorizado'::text) AND (tipo_cbte = ANY (ARRAY[1, 6, 11])));


--
-- Name: comprobantes_fiscales_pedido_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comprobantes_fiscales_pedido_idx ON public.comprobantes_fiscales USING btree (pedido_id);


--
-- Name: device_tokens_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_tokens_role_idx ON public.device_tokens USING btree (role);


--
-- Name: device_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_tokens_user_idx ON public.device_tokens USING btree (user_id);


--
-- Name: egresos_caja_turno_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX egresos_caja_turno_idx ON public.egresos USING btree (caja_turno_id, created_at DESC);


--
-- Name: egresos_categoria_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX egresos_categoria_idx ON public.egresos USING btree (categoria, fecha DESC);


--
-- Name: egresos_empleado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX egresos_empleado_idx ON public.egresos USING btree (empleado_id, fecha DESC);


--
-- Name: egresos_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX egresos_estado_idx ON public.egresos USING btree (estado, vencimiento);


--
-- Name: egresos_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX egresos_fecha_idx ON public.egresos USING btree (fecha DESC, created_at DESC);


--
-- Name: egresos_proveedor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX egresos_proveedor_idx ON public.egresos USING btree (proveedor_id, fecha DESC);


--
-- Name: empleados_activo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX empleados_activo_idx ON public.empleados USING btree (activo, lower(nombre));


--
-- Name: empleados_user_id_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX empleados_user_id_uidx ON public.empleados USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: envio_zonas_activo_orden_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX envio_zonas_activo_orden_idx ON public.envio_zonas USING btree (activo, orden, lower(nombre));


--
-- Name: fichajes_empleado_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fichajes_empleado_ts_idx ON public.fichajes USING btree (empleado_id, ts DESC);


--
-- Name: fichajes_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fichajes_ts_idx ON public.fichajes USING btree (ts DESC);


--
-- Name: idx_clientes_telefono_digits; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_telefono_digits ON public.clientes USING btree (regexp_replace(COALESCE(telefono, ''::text), '\D'::text, ''::text, 'g'::text)) WHERE ((telefono IS NOT NULL) AND (btrim(telefono) <> ''::text));


--
-- Name: idx_especial_pasos_especial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_especial_pasos_especial ON public.especial_pasos USING btree (especial_id, orden);


--
-- Name: idx_lista_espera_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lista_espera_estado ON public.lista_espera USING btree (estado);


--
-- Name: idx_lista_espera_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lista_espera_fecha ON public.lista_espera USING btree (fecha);


--
-- Name: idx_lista_espera_pendientes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lista_espera_pendientes ON public.lista_espera USING btree (created_at DESC) WHERE (estado = 'esperando'::text);


--
-- Name: idx_menu_items_precio_num; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_precio_num ON public.menu_items USING btree (precio_num) WHERE (precio_num IS NOT NULL);


--
-- Name: idx_menu_items_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_tipo ON public.menu_items USING btree (tipo, activo, orden);


--
-- Name: idx_mesas_mesa_grupo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mesas_mesa_grupo_id ON public.mesas USING btree (mesa_grupo_id);


--
-- Name: idx_mesas_salon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mesas_salon ON public.mesas USING btree (salon_id);


--
-- Name: idx_movimientos_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movimientos_stock ON public.stock_movimientos USING btree (stock_id, created_at DESC);


--
-- Name: idx_notif_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_created_at ON public.notificaciones USING btree (created_at DESC);


--
-- Name: idx_notif_no_leidas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_no_leidas ON public.notificaciones USING btree (created_at DESC) WHERE (leida = false);


--
-- Name: idx_notif_referencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_referencia ON public.notificaciones USING btree (referencia_id);


--
-- Name: idx_notif_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_tipo ON public.notificaciones USING btree (tipo);


--
-- Name: idx_pedido_items_menu_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedido_items_menu_item ON public.pedido_items USING btree (menu_item_id);


--
-- Name: idx_pedido_items_pedido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedido_items_pedido ON public.pedido_items USING btree (pedido_id);


--
-- Name: idx_pedidos_cliente_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_cliente_nombre ON public.pedidos USING btree (lower(cliente_nombre)) WHERE (cliente_nombre IS NOT NULL);


--
-- Name: idx_pedidos_cliente_telefono; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_cliente_telefono ON public.pedidos USING btree (cliente_telefono) WHERE (cliente_telefono IS NOT NULL);


--
-- Name: idx_pedidos_mesa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_mesa_id ON public.pedidos USING btree (mesa_id);


--
-- Name: idx_pedidos_mozo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_mozo_id ON public.pedidos USING btree (mozo_id);


--
-- Name: idx_pedidos_origen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_origen ON public.pedidos USING btree (origen);


--
-- Name: idx_prod_tareas_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_tareas_estado ON public.produccion_tareas USING btree (estado);


--
-- Name: idx_prod_tareas_lista; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_tareas_lista ON public.produccion_tareas USING btree (lista_id, prioridad);


--
-- Name: idx_reservas_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_estado ON public.reservas USING btree (estado);


--
-- Name: idx_reservas_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_fecha ON public.reservas USING btree (fecha);


--
-- Name: idx_reservas_fecha_hora; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_fecha_hora ON public.reservas USING btree (fecha, hora);


--
-- Name: idx_reservas_mesa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_mesa ON public.reservas USING btree (mesa_id) WHERE (mesa_id IS NOT NULL);


--
-- Name: idx_reservas_telefono; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_telefono ON public.reservas USING btree (cliente_telefono) WHERE (cliente_telefono IS NOT NULL);


--
-- Name: idx_reservas_tipo_experiencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_tipo_experiencia ON public.reservas USING btree (tipo_experiencia) WHERE (tipo_experiencia IS NOT NULL);


--
-- Name: idx_rol_permisos_rol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rol_permisos_rol ON public.rol_permisos USING btree (rol_id);


--
-- Name: idx_stock_receta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_receta_id ON public.stock USING btree (receta_id) WHERE (receta_id IS NOT NULL);


--
-- Name: idx_stock_tipo_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_tipo_stock ON public.stock USING btree (tipo_stock, nombre);


--
-- Name: idx_variantes_menu_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variantes_menu_item ON public.menu_item_variantes USING btree (menu_item_id);


--
-- Name: impresiones_documentos_pedido_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX impresiones_documentos_pedido_idx ON public.impresiones_documentos USING btree (pedido_id, created_at DESC);


--
-- Name: liquidaciones_emp_tipo_inicio_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX liquidaciones_emp_tipo_inicio_uidx ON public.liquidaciones USING btree (empleado_id, tipo, semana_inicio);


--
-- Name: liquidaciones_semana_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liquidaciones_semana_idx ON public.liquidaciones USING btree (semana_inicio DESC, estado);


--
-- Name: pagos_caja_turno_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pagos_caja_turno_idx ON public.pagos USING btree (caja_turno_id, created_at DESC);


--
-- Name: pagos_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pagos_created_at_idx ON public.pagos USING btree (created_at DESC);


--
-- Name: pagos_medio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pagos_medio_idx ON public.pagos USING btree (medio_pago, created_at DESC);


--
-- Name: pagos_pedido_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pagos_pedido_idx ON public.pagos USING btree (pedido_id);


--
-- Name: proveedores_razon_social_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proveedores_razon_social_idx ON public.proveedores USING btree (lower(razon_social));


--
-- Name: uniq_pedido_abierto_por_mesa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_pedido_abierto_por_mesa ON public.pedidos USING btree (mesa_id) WHERE ((mesa_id IS NOT NULL) AND (estado <> ALL (ARRAY['entregado'::text, 'cancelado'::text])));


--
-- Name: egresos egresos_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER egresos_set_updated_at BEFORE UPDATE ON public.egresos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: empleados empleados_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER empleados_set_updated_at BEFORE UPDATE ON public.empleados FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: envio_config envio_config_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER envio_config_set_updated_at BEFORE UPDATE ON public.envio_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: envio_zonas envio_zonas_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER envio_zonas_set_updated_at BEFORE UPDATE ON public.envio_zonas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: impresion_config impresion_config_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER impresion_config_set_updated_at BEFORE UPDATE ON public.impresion_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: liquidaciones liquidaciones_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER liquidaciones_set_updated_at BEFORE UPDATE ON public.liquidaciones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: proveedores proveedores_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER proveedores_set_updated_at BEFORE UPDATE ON public.proveedores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: caja_movimientos trg_caja_movimientos_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_caja_movimientos_audit AFTER INSERT OR DELETE OR UPDATE ON public.caja_movimientos FOR EACH ROW EXECUTE FUNCTION public.caja_movimientos_audit();


--
-- Name: caja_turnos trg_caja_turnos_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_caja_turnos_audit AFTER UPDATE ON public.caja_turnos FOR EACH ROW EXECUTE FUNCTION public.caja_turnos_audit();


--
-- Name: especiales trg_especial_sync_precio; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_especial_sync_precio AFTER INSERT OR UPDATE OF precio, cta_producto_id, cta_tipo ON public.especiales FOR EACH ROW EXECUTE FUNCTION public.kiku_sync_precio_especial_a_producto();


--
-- Name: especiales trg_especiales_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_especiales_touch BEFORE UPDATE ON public.especiales FOR EACH ROW EXECUTE FUNCTION public.kiku_touch_updated_at();


--
-- Name: pedido_items trg_items_recompute_total; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_items_recompute_total AFTER INSERT OR DELETE OR UPDATE ON public.pedido_items FOR EACH ROW EXECUTE FUNCTION public.kiku_items_recompute_total();


--
-- Name: lista_espera trg_lista_espera_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lista_espera_updated BEFORE UPDATE ON public.lista_espera FOR EACH ROW EXECUTE FUNCTION public.lista_espera_touch_updated();


--
-- Name: menu_items trg_menu_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_items_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: lista_espera trg_notif_lista_espera_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notif_lista_espera_insert AFTER INSERT ON public.lista_espera FOR EACH ROW EXECUTE FUNCTION public.notif_on_lista_espera_insert();


--
-- Name: pedidos trg_notif_pedido_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notif_pedido_insert AFTER INSERT ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.notif_on_pedido_insert();


--
-- Name: reservas trg_notif_reserva_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notif_reserva_insert AFTER INSERT ON public.reservas FOR EACH ROW EXECUTE FUNCTION public.notif_on_reserva_insert();


--
-- Name: pagos trg_pagos_reasignacion_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pagos_reasignacion_audit AFTER UPDATE ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.pagos_reasignacion_audit();


--
-- Name: pedidos trg_pedido_web_horario; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pedido_web_horario BEFORE INSERT ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.pedido_web_horario_check();


--
-- Name: pedido_items trg_pedido_webhook_whatsapp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pedido_webhook_whatsapp AFTER INSERT ON public.pedido_items REFERENCING NEW TABLE AS nuevos FOR EACH STATEMENT EXECUTE FUNCTION public.pedido_webhook_whatsapp();


--
-- Name: pedidos trg_pedidos_set_total; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pedidos_set_total BEFORE INSERT OR UPDATE OF descuento_monto, descuento_porcentaje, descuento_valor, descuento_tipo, descuento_alcance, descuento_items, costo_envio, total ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.kiku_pedidos_set_total();


--
-- Name: pedidos trg_pedidos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pedidos_updated_at BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: produccion_listas trg_produccion_listas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_produccion_listas_updated_at BEFORE UPDATE ON public.produccion_listas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: menu_items trg_producto_sync_precio; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_producto_sync_precio AFTER UPDATE OF precio ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.kiku_sync_precio_producto_a_especial();


--
-- Name: reservas trg_reserva_webhook_whatsapp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reserva_webhook_whatsapp AFTER INSERT ON public.reservas FOR EACH ROW EXECUTE FUNCTION public.reserva_webhook_whatsapp();


--
-- Name: reservas trg_reservas_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reservas_updated BEFORE UPDATE ON public.reservas FOR EACH ROW EXECUTE FUNCTION public.kiku_reservas_touch_updated();


--
-- Name: rol_permisos trg_rol_permisos_admin_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_rol_permisos_admin_guard AFTER DELETE OR UPDATE ON public.rol_permisos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN ((old.recurso_id = 'permisos'::text)) EXECUTE FUNCTION public.guardar_admin_de_permisos();


--
-- Name: rol_permisos trg_rol_permisos_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rol_permisos_updated BEFORE UPDATE ON public.rol_permisos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: roles trg_roles_no_borrar_sistema; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roles_no_borrar_sistema BEFORE DELETE OR UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.proteger_roles_sistema();


--
-- Name: roles trg_roles_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roles_updated BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: pagos trg_set_caja_turno_on_pago; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_caja_turno_on_pago BEFORE INSERT ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.set_caja_turno_on_pago();


--
-- Name: stock trg_stock_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_updated_at BEFORE UPDATE ON public.stock FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: pedidos trigger_acumular_cliente; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_acumular_cliente AFTER UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.acumular_cliente();


--
-- Name: pedido_items trigger_descontar_stock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_descontar_stock AFTER INSERT ON public.pedido_items FOR EACH ROW EXECUTE FUNCTION public.descontar_stock();


--
-- Name: pedidos trigger_pedidos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_pedidos_updated_at BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: webhook_config webhook_config_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER webhook_config_set_updated_at BEFORE UPDATE ON public.webhook_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: arca_request_log arca_request_log_comprobante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arca_request_log
    ADD CONSTRAINT arca_request_log_comprobante_id_fkey FOREIGN KEY (comprobante_id) REFERENCES public.comprobantes_fiscales(id) ON DELETE SET NULL;


--
-- Name: caja_fuerte_movimientos caja_fuerte_movimientos_egreso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_fuerte_movimientos
    ADD CONSTRAINT caja_fuerte_movimientos_egreso_id_fkey FOREIGN KEY (egreso_id) REFERENCES public.egresos(id) ON DELETE SET NULL;


--
-- Name: caja_fuerte_movimientos caja_fuerte_movimientos_turno_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_fuerte_movimientos
    ADD CONSTRAINT caja_fuerte_movimientos_turno_id_fkey FOREIGN KEY (turno_id) REFERENCES public.caja_turnos(id) ON DELETE SET NULL;


--
-- Name: caja_movimientos caja_movimientos_comprobante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimientos
    ADD CONSTRAINT caja_movimientos_comprobante_id_fkey FOREIGN KEY (comprobante_id) REFERENCES public.comprobantes_fiscales(id) ON DELETE SET NULL;


--
-- Name: caja_movimientos caja_movimientos_egreso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimientos
    ADD CONSTRAINT caja_movimientos_egreso_id_fkey FOREIGN KEY (egreso_id) REFERENCES public.egresos(id) ON DELETE SET NULL;


--
-- Name: caja_movimientos caja_movimientos_pago_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimientos
    ADD CONSTRAINT caja_movimientos_pago_id_fkey FOREIGN KEY (pago_id) REFERENCES public.pagos(id) ON DELETE SET NULL;


--
-- Name: caja_movimientos caja_movimientos_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimientos
    ADD CONSTRAINT caja_movimientos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;


--
-- Name: caja_movimientos caja_movimientos_turno_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimientos
    ADD CONSTRAINT caja_movimientos_turno_id_fkey FOREIGN KEY (turno_id) REFERENCES public.caja_turnos(id) ON DELETE SET NULL;


--
-- Name: caja_turnos_auditoria caja_turnos_auditoria_turno_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_turnos_auditoria
    ADD CONSTRAINT caja_turnos_auditoria_turno_id_fkey FOREIGN KEY (turno_id) REFERENCES public.caja_turnos(id) ON DELETE CASCADE;


--
-- Name: combo_items combo_items_combo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.combo_items
    ADD CONSTRAINT combo_items_combo_id_fkey FOREIGN KEY (combo_id) REFERENCES public.combos(id) ON DELETE CASCADE;


--
-- Name: combo_items combo_items_receta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.combo_items
    ADD CONSTRAINT combo_items_receta_id_fkey FOREIGN KEY (receta_id) REFERENCES public.recetas(id) ON DELETE CASCADE;


--
-- Name: comprobantes_afip comprobantes_afip_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobantes_afip
    ADD CONSTRAINT comprobantes_afip_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id);


--
-- Name: comprobantes_fiscales comprobantes_fiscales_cbte_asociado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobantes_fiscales
    ADD CONSTRAINT comprobantes_fiscales_cbte_asociado_id_fkey FOREIGN KEY (cbte_asociado_id) REFERENCES public.comprobantes_fiscales(id) ON DELETE RESTRICT;


--
-- Name: comprobantes_fiscales comprobantes_fiscales_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobantes_fiscales
    ADD CONSTRAINT comprobantes_fiscales_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE RESTRICT;


--
-- Name: device_tokens device_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: egresos egresos_caja_turno_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.egresos
    ADD CONSTRAINT egresos_caja_turno_id_fkey FOREIGN KEY (caja_turno_id) REFERENCES public.caja_turnos(id) ON DELETE SET NULL;


--
-- Name: egresos egresos_empleado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.egresos
    ADD CONSTRAINT egresos_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.empleados(id) ON DELETE SET NULL;


--
-- Name: egresos egresos_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.egresos
    ADD CONSTRAINT egresos_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE SET NULL;


--
-- Name: empleados empleados_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: escandallo escandallo_ingrediente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escandallo
    ADD CONSTRAINT escandallo_ingrediente_id_fkey FOREIGN KEY (ingrediente_id) REFERENCES public.ingredientes(id) ON DELETE CASCADE;


--
-- Name: escandallo escandallo_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escandallo
    ADD CONSTRAINT escandallo_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE;


--
-- Name: especial_pasos especial_pasos_especial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.especial_pasos
    ADD CONSTRAINT especial_pasos_especial_id_fkey FOREIGN KEY (especial_id) REFERENCES public.especiales(id) ON DELETE CASCADE;


--
-- Name: especiales especiales_cta_producto_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.especiales
    ADD CONSTRAINT especiales_cta_producto_fk FOREIGN KEY (cta_producto_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;


--
-- Name: fichajes fichajes_empleado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fichajes
    ADD CONSTRAINT fichajes_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.empleados(id) ON DELETE CASCADE;


--
-- Name: fichajes fichajes_punto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fichajes
    ADD CONSTRAINT fichajes_punto_id_fkey FOREIGN KEY (punto_id) REFERENCES public.puntos_fichaje(id) ON DELETE SET NULL;


--
-- Name: impresiones_documentos impresiones_documentos_comprobante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impresiones_documentos
    ADD CONSTRAINT impresiones_documentos_comprobante_id_fkey FOREIGN KEY (comprobante_id) REFERENCES public.comprobantes_fiscales(id) ON DELETE SET NULL;


--
-- Name: impresiones_documentos impresiones_documentos_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impresiones_documentos
    ADD CONSTRAINT impresiones_documentos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;


--
-- Name: liquidaciones liquidaciones_egreso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT liquidaciones_egreso_id_fkey FOREIGN KEY (egreso_id) REFERENCES public.egresos(id) ON DELETE SET NULL;


--
-- Name: liquidaciones liquidaciones_empleado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT liquidaciones_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.empleados(id) ON DELETE CASCADE;


--
-- Name: menu_item_variantes menu_item_variantes_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_variantes
    ADD CONSTRAINT menu_item_variantes_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: mermas mermas_ingrediente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mermas
    ADD CONSTRAINT mermas_ingrediente_id_fkey FOREIGN KEY (ingrediente_id) REFERENCES public.ingredientes(id);


--
-- Name: mesas mesas_mesa_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesas
    ADD CONSTRAINT mesas_mesa_grupo_id_fkey FOREIGN KEY (mesa_grupo_id) REFERENCES public.mesas(id) ON DELETE SET NULL;


--
-- Name: mesas mesas_salon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesas
    ADD CONSTRAINT mesas_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salones(id) ON DELETE CASCADE;


--
-- Name: mozos mozos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mozos
    ADD CONSTRAINT mozos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pagos pagos_caja_turno_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_caja_turno_id_fkey FOREIGN KEY (caja_turno_id) REFERENCES public.caja_turnos(id) ON DELETE SET NULL;


--
-- Name: pagos pagos_comprobante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_comprobante_id_fkey FOREIGN KEY (comprobante_id) REFERENCES public.comprobantes_fiscales(id) ON DELETE SET NULL;


--
-- Name: pagos pagos_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE RESTRICT;


--
-- Name: pedido_items pedido_items_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_items
    ADD CONSTRAINT pedido_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;


--
-- Name: pedido_items pedido_items_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_items
    ADD CONSTRAINT pedido_items_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: pedido_items pedido_items_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_items
    ADD CONSTRAINT pedido_items_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id);


--
-- Name: pedido_items pedido_items_variante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_items
    ADD CONSTRAINT pedido_items_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES public.menu_item_variantes(id);


--
-- Name: pedidos pedidos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: pedidos pedidos_mesa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_mesa_id_fkey FOREIGN KEY (mesa_id) REFERENCES public.mesas(id) ON DELETE SET NULL;


--
-- Name: pedidos pedidos_mozo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_mozo_id_fkey FOREIGN KEY (mozo_id) REFERENCES public.mozos(id) ON DELETE SET NULL;


--
-- Name: pedidos pedidos_turno_caja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_turno_caja_id_fkey FOREIGN KEY (turno_caja_id) REFERENCES public.turnos_caja(id);


--
-- Name: produccion_listas produccion_listas_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produccion_listas
    ADD CONSTRAINT produccion_listas_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id);


--
-- Name: produccion_tareas produccion_tareas_lista_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produccion_tareas
    ADD CONSTRAINT produccion_tareas_lista_id_fkey FOREIGN KEY (lista_id) REFERENCES public.produccion_listas(id) ON DELETE CASCADE;


--
-- Name: produccion_tareas produccion_tareas_receta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produccion_tareas
    ADD CONSTRAINT produccion_tareas_receta_id_fkey FOREIGN KEY (receta_id) REFERENCES public.recetas(id);


--
-- Name: receta_ingredientes receta_ingredientes_receta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receta_ingredientes
    ADD CONSTRAINT receta_ingredientes_receta_id_fkey FOREIGN KEY (receta_id) REFERENCES public.recetas(id) ON DELETE CASCADE;


--
-- Name: receta_ingredientes receta_ingredientes_stock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receta_ingredientes
    ADD CONSTRAINT receta_ingredientes_stock_id_fkey FOREIGN KEY (stock_id) REFERENCES public.stock(id) ON DELETE CASCADE;


--
-- Name: receta_ingredientes receta_ingredientes_subreceta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receta_ingredientes
    ADD CONSTRAINT receta_ingredientes_subreceta_id_fkey FOREIGN KEY (subreceta_id) REFERENCES public.recetas(id) ON DELETE CASCADE;


--
-- Name: recetas recetas_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recetas
    ADD CONSTRAINT recetas_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;


--
-- Name: recurso_tablas recurso_tablas_recurso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurso_tablas
    ADD CONSTRAINT recurso_tablas_recurso_id_fkey FOREIGN KEY (recurso_id) REFERENCES public.recursos(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: reservas reservas_mesa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_mesa_id_fkey FOREIGN KEY (mesa_id) REFERENCES public.mesas(id) ON DELETE SET NULL;


--
-- Name: reservas reservas_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;


--
-- Name: reservas reservas_salon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salones(id) ON DELETE SET NULL;


--
-- Name: rol_permisos rol_permisos_recurso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rol_permisos
    ADD CONSTRAINT rol_permisos_recurso_id_fkey FOREIGN KEY (recurso_id) REFERENCES public.recursos(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: rol_permisos rol_permisos_rol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rol_permisos
    ADD CONSTRAINT rol_permisos_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: stock_movimientos stock_movimientos_stock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movimientos
    ADD CONSTRAINT stock_movimientos_stock_id_fkey FOREIGN KEY (stock_id) REFERENCES public.stock(id) ON DELETE CASCADE;


--
-- Name: stock stock_receta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_receta_id_fkey FOREIGN KEY (receta_id) REFERENCES public.recetas(id) ON DELETE SET NULL;


--
-- Name: turnos turnos_empleado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT turnos_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.empleados(id) ON DELETE CASCADE;


--
-- Name: produccion_listas Escritura autenticada listas prod; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Escritura autenticada listas prod" ON public.produccion_listas USING ((auth.role() = 'authenticated'::text));


--
-- Name: stock_movimientos Escritura autenticada movimientos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Escritura autenticada movimientos" ON public.stock_movimientos USING ((auth.role() = 'authenticated'::text));


--
-- Name: stock Escritura autenticada stock; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Escritura autenticada stock" ON public.stock USING ((auth.role() = 'authenticated'::text));


--
-- Name: produccion_tareas Escritura autenticada tareas prod; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Escritura autenticada tareas prod" ON public.produccion_tareas USING ((auth.role() = 'authenticated'::text));


--
-- Name: produccion_listas Lectura pública listas prod; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura pública listas prod" ON public.produccion_listas FOR SELECT USING (true);


--
-- Name: stock_movimientos Lectura pública movimientos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura pública movimientos" ON public.stock_movimientos FOR SELECT USING (true);


--
-- Name: stock Lectura pública stock; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura pública stock" ON public.stock FOR SELECT USING (true);


--
-- Name: produccion_tareas Lectura pública tareas prod; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura pública tareas prod" ON public.produccion_tareas FOR SELECT USING (true);


--
-- Name: clientes Solo staff autenticado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Solo staff autenticado" ON public.clientes USING ((auth.role() = 'authenticated'::text));


--
-- Name: comprobantes_afip Solo staff autenticado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Solo staff autenticado" ON public.comprobantes_afip USING ((auth.role() = 'authenticated'::text));


--
-- Name: escandallo Solo staff autenticado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Solo staff autenticado" ON public.escandallo USING ((auth.role() = 'authenticated'::text));


--
-- Name: ingredientes Solo staff autenticado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Solo staff autenticado" ON public.ingredientes USING ((auth.role() = 'authenticated'::text));


--
-- Name: mermas Solo staff autenticado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Solo staff autenticado" ON public.mermas USING ((auth.role() = 'authenticated'::text));


--
-- Name: productos Solo staff autenticado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Solo staff autenticado" ON public.productos USING ((auth.role() = 'authenticated'::text));


--
-- Name: turnos_caja Solo staff autenticado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Solo staff autenticado" ON public.turnos_caja USING ((auth.role() = 'authenticated'::text));


--
-- Name: mesas admin escribe mesas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin escribe mesas" ON public.mesas USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: mozos admin escribe mozos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin escribe mozos" ON public.mozos USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: salones admin escribe salones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin escribe salones" ON public.salones USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: combo_items admins manage combo_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage combo_items" ON public.combo_items TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: combos admins manage combos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage combos" ON public.combos TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: menu_item_variantes admins manage menu_item_variantes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage menu_item_variantes" ON public.menu_item_variantes TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: menu_items admins manage menu_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage menu_items" ON public.menu_items TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: pedido_items admins manage pedido_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage pedido_items" ON public.pedido_items TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: pedidos admins manage pedidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage pedidos" ON public.pedidos TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: produccion_listas admins manage produccion_listas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage produccion_listas" ON public.produccion_listas TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: produccion_tareas admins manage produccion_tareas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage produccion_tareas" ON public.produccion_tareas TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: receta_ingredientes admins manage receta_ingredientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage receta_ingredientes" ON public.receta_ingredientes TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: recetas admins manage recetas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage recetas" ON public.recetas TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: stock admins manage stock; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage stock" ON public.stock TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: stock_movimientos admins manage stock_movimientos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage stock_movimientos" ON public.stock_movimientos TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: pedido_items anon crear pedido_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon crear pedido_items" ON public.pedido_items FOR INSERT TO anon WITH CHECK (true);


--
-- Name: pedidos anon crear pedidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon crear pedidos" ON public.pedidos FOR INSERT TO anon WITH CHECK (true);


--
-- Name: especial_pasos anon leer especial_pasos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon leer especial_pasos" ON public.especial_pasos FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.especiales e
  WHERE ((e.id = especial_pasos.especial_id) AND (e.activo = true)))));


--
-- Name: especial_pasos anon leer especial_pasos (web); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon leer especial_pasos (web)" ON public.especial_pasos FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.especiales e
  WHERE ((e.id = especial_pasos.especial_id) AND (e.activo = true)))));


--
-- Name: especiales anon leer especiales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon leer especiales" ON public.especiales FOR SELECT TO anon USING ((activo = true));


--
-- Name: especiales anon leer especiales (web); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon leer especiales (web)" ON public.especiales FOR SELECT TO anon USING ((activo = true));


--
-- Name: menu_item_variantes anon leer menu_item_variantes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon leer menu_item_variantes" ON public.menu_item_variantes FOR SELECT TO anon USING (true);


--
-- Name: menu_item_variantes anon leer menu_item_variantes (catalogo); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon leer menu_item_variantes (catalogo)" ON public.menu_item_variantes FOR SELECT TO anon USING (true);


--
-- Name: menu_items anon leer menu_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon leer menu_items" ON public.menu_items FOR SELECT TO anon USING ((activo = true));


--
-- Name: menu_items anon leer menu_items (catalogo); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon leer menu_items (catalogo)" ON public.menu_items FOR SELECT TO anon USING ((activo = true));


--
-- Name: pedido_items anon leer pedido_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon leer pedido_items" ON public.pedido_items FOR SELECT TO anon USING (true);


--
-- Name: pedidos anon leer pedidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon leer pedidos" ON public.pedidos FOR SELECT TO anon USING (true);


--
-- Name: aperturas_especiales aperturas lectura publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aperturas lectura publica" ON public.aperturas_especiales FOR SELECT TO authenticated, anon USING (true);


--
-- Name: aperturas_especiales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aperturas_especiales ENABLE ROW LEVEL SECURITY;

--
-- Name: arca_request_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.arca_request_log ENABLE ROW LEVEL SECURITY;

--
-- Name: arca_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.arca_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: arca_tokens arca_tokens service only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "arca_tokens service only" ON public.arca_tokens TO service_role USING (true) WITH CHECK (true);


--
-- Name: receta_ingredientes auth users can manage receta_ingredientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth users can manage receta_ingredientes" ON public.receta_ingredientes USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: recetas auth users can manage recetas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth users can manage recetas" ON public.recetas USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: caja_fuerte_movimientos caja_fuerte lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "caja_fuerte lectura" ON public.caja_fuerte_movimientos FOR SELECT TO authenticated USING (( SELECT (public.tiene_permiso('caja_fuerte'::text, 'ver'::text) OR public.is_finanzas_user())));


--
-- Name: caja_fuerte_movimientos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.caja_fuerte_movimientos ENABLE ROW LEVEL SECURITY;

--
-- Name: caja_movimientos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.caja_movimientos ENABLE ROW LEVEL SECURITY;

--
-- Name: caja_movimientos caja_movimientos pagos insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "caja_movimientos pagos insert" ON public.caja_movimientos FOR INSERT TO authenticated WITH CHECK (( SELECT public.tiene_permiso('pagos'::text, 'editar'::text) AS tiene_permiso));


--
-- Name: caja_turnos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.caja_turnos ENABLE ROW LEVEL SECURITY;

--
-- Name: caja_turnos caja_turnos pagos read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "caja_turnos pagos read" ON public.caja_turnos FOR SELECT TO authenticated USING (( SELECT public.tiene_permiso('pagos'::text, 'ver'::text) AS tiene_permiso));


--
-- Name: caja_turnos_auditoria; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.caja_turnos_auditoria ENABLE ROW LEVEL SECURITY;

--
-- Name: clientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: combo_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;

--
-- Name: combos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;

--
-- Name: comprobantes_afip; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comprobantes_afip ENABLE ROW LEVEL SECURITY;

--
-- Name: comprobantes_fiscales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comprobantes_fiscales ENABLE ROW LEVEL SECURITY;

--
-- Name: device_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: device_tokens device_tokens own rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "device_tokens own rows" ON public.device_tokens TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: egresos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.egresos ENABLE ROW LEVEL SECURITY;

--
-- Name: egresos egresos pagos manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "egresos pagos manage" ON public.egresos TO authenticated USING (( SELECT public.tiene_permiso('pagos'::text, 'editar'::text) AS tiene_permiso)) WITH CHECK (( SELECT public.tiene_permiso('pagos'::text, 'editar'::text) AS tiene_permiso));


--
-- Name: empleados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.empleados ENABLE ROW LEVEL SECURITY;

--
-- Name: empleados empleados self read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "empleados self read" ON public.empleados FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: envio_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.envio_config ENABLE ROW LEVEL SECURITY;

--
-- Name: envio_config envio_config lectura publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "envio_config lectura publica" ON public.envio_config FOR SELECT TO authenticated, anon USING (true);


--
-- Name: envio_config envio_config_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY envio_config_select_auth ON public.envio_config FOR SELECT TO authenticated USING (true);


--
-- Name: envio_zonas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.envio_zonas ENABLE ROW LEVEL SECURITY;

--
-- Name: envio_zonas envio_zonas lectura publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "envio_zonas lectura publica" ON public.envio_zonas FOR SELECT TO authenticated, anon USING (true);


--
-- Name: envio_zonas envio_zonas_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY envio_zonas_select_auth ON public.envio_zonas FOR SELECT TO authenticated USING (true);


--
-- Name: escandallo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.escandallo ENABLE ROW LEVEL SECURITY;

--
-- Name: especial_pasos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.especial_pasos ENABLE ROW LEVEL SECURITY;

--
-- Name: especiales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.especiales ENABLE ROW LEVEL SECURITY;

--
-- Name: facturacion_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.facturacion_config ENABLE ROW LEVEL SECURITY;

--
-- Name: fichajes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fichajes ENABLE ROW LEVEL SECURITY;

--
-- Name: fichajes fichajes self read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fichajes self read" ON public.fichajes FOR SELECT TO authenticated USING ((empleado_id IN ( SELECT empleados.id
   FROM public.empleados
  WHERE (empleados.user_id = auth.uid()))));


--
-- Name: impresion_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.impresion_config ENABLE ROW LEVEL SECURITY;

--
-- Name: impresion_config impresion_config_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY impresion_config_select ON public.impresion_config FOR SELECT TO authenticated USING (true);


--
-- Name: impresiones_documentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.impresiones_documentos ENABLE ROW LEVEL SECURITY;

--
-- Name: ingredientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingredientes ENABLE ROW LEVEL SECURITY;

--
-- Name: liquidaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.liquidaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: liquidaciones liquidaciones self read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "liquidaciones self read" ON public.liquidaciones FOR SELECT TO authenticated USING ((empleado_id IN ( SELECT empleados.id
   FROM public.empleados
  WHERE (empleados.user_id = auth.uid()))));


--
-- Name: lista_espera; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lista_espera ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_item_variantes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_item_variantes ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

--
-- Name: mermas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mermas ENABLE ROW LEVEL SECURITY;

--
-- Name: mesas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;

--
-- Name: mozos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mozos ENABLE ROW LEVEL SECURITY;

--
-- Name: notificaciones notif_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_select ON public.notificaciones FOR SELECT TO authenticated USING (true);


--
-- Name: notificaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: mesas operacionales leen mesas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "operacionales leen mesas" ON public.mesas FOR SELECT USING (public.is_operational_user());


--
-- Name: mozos operacionales leen mozos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "operacionales leen mozos" ON public.mozos FOR SELECT USING (public.is_operational_user());


--
-- Name: salones operacionales leen salones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "operacionales leen salones" ON public.salones FOR SELECT USING (public.is_operational_user());


--
-- Name: pagos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

--
-- Name: pedido_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedido_items ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

--
-- Name: aperturas_especiales permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.aperturas_especiales TO authenticated USING (( SELECT public.puede_tabla('aperturas_especiales'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('aperturas_especiales'::text, 'editar'::text) AS puede_tabla));


--
-- Name: arca_request_log permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.arca_request_log TO authenticated USING (( SELECT public.puede_tabla('arca_request_log'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('arca_request_log'::text, 'editar'::text) AS puede_tabla));


--
-- Name: caja_movimientos permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.caja_movimientos TO authenticated USING (( SELECT public.puede_tabla('caja_movimientos'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('caja_movimientos'::text, 'editar'::text) AS puede_tabla));


--
-- Name: caja_turnos permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.caja_turnos TO authenticated USING (( SELECT public.puede_tabla('caja_turnos'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('caja_turnos'::text, 'editar'::text) AS puede_tabla));


--
-- Name: caja_turnos_auditoria permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.caja_turnos_auditoria TO authenticated USING (( SELECT public.puede_tabla('caja_turnos_auditoria'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('caja_turnos_auditoria'::text, 'editar'::text) AS puede_tabla));


--
-- Name: clientes permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.clientes TO authenticated USING (( SELECT public.puede_tabla('clientes'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('clientes'::text, 'editar'::text) AS puede_tabla));


--
-- Name: combo_items permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.combo_items TO authenticated USING (( SELECT public.puede_tabla('combo_items'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('combo_items'::text, 'editar'::text) AS puede_tabla));


--
-- Name: combos permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.combos TO authenticated USING (( SELECT public.puede_tabla('combos'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('combos'::text, 'editar'::text) AS puede_tabla));


--
-- Name: comprobantes_fiscales permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.comprobantes_fiscales TO authenticated USING (( SELECT public.puede_tabla('comprobantes_fiscales'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('comprobantes_fiscales'::text, 'editar'::text) AS puede_tabla));


--
-- Name: egresos permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.egresos TO authenticated USING (( SELECT public.puede_tabla('egresos'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('egresos'::text, 'editar'::text) AS puede_tabla));


--
-- Name: empleados permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.empleados TO authenticated USING (( SELECT public.puede_tabla('empleados'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('empleados'::text, 'editar'::text) AS puede_tabla));


--
-- Name: envio_config permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.envio_config TO authenticated USING (( SELECT public.puede_tabla('envio_config'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('envio_config'::text, 'editar'::text) AS puede_tabla));


--
-- Name: envio_zonas permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.envio_zonas TO authenticated USING (( SELECT public.puede_tabla('envio_zonas'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('envio_zonas'::text, 'editar'::text) AS puede_tabla));


--
-- Name: especial_pasos permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.especial_pasos TO authenticated USING (( SELECT public.puede_tabla('especial_pasos'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('especial_pasos'::text, 'editar'::text) AS puede_tabla));


--
-- Name: especiales permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.especiales TO authenticated USING (( SELECT public.puede_tabla('especiales'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('especiales'::text, 'editar'::text) AS puede_tabla));


--
-- Name: facturacion_config permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.facturacion_config TO authenticated USING (( SELECT public.puede_tabla('facturacion_config'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('facturacion_config'::text, 'editar'::text) AS puede_tabla));


--
-- Name: fichajes permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.fichajes TO authenticated USING (( SELECT public.puede_tabla('fichajes'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('fichajes'::text, 'editar'::text) AS puede_tabla));


--
-- Name: impresion_config permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.impresion_config TO authenticated USING (( SELECT public.puede_tabla('impresion_config'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('impresion_config'::text, 'editar'::text) AS puede_tabla));


--
-- Name: impresiones_documentos permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.impresiones_documentos TO authenticated USING (( SELECT public.puede_tabla('impresiones_documentos'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('impresiones_documentos'::text, 'editar'::text) AS puede_tabla));


--
-- Name: liquidaciones permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.liquidaciones TO authenticated USING (( SELECT public.puede_tabla('liquidaciones'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('liquidaciones'::text, 'editar'::text) AS puede_tabla));


--
-- Name: lista_espera permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.lista_espera TO authenticated USING (( SELECT public.puede_tabla('lista_espera'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('lista_espera'::text, 'editar'::text) AS puede_tabla));


--
-- Name: menu_item_variantes permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.menu_item_variantes TO authenticated USING (( SELECT public.puede_tabla('menu_item_variantes'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('menu_item_variantes'::text, 'editar'::text) AS puede_tabla));


--
-- Name: menu_items permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.menu_items TO authenticated USING (( SELECT public.puede_tabla('menu_items'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('menu_items'::text, 'editar'::text) AS puede_tabla));


--
-- Name: mesas permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.mesas TO authenticated USING (( SELECT public.puede_tabla('mesas'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('mesas'::text, 'editar'::text) AS puede_tabla));


--
-- Name: mozos permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.mozos TO authenticated USING (( SELECT public.puede_tabla('mozos'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('mozos'::text, 'editar'::text) AS puede_tabla));


--
-- Name: notificaciones permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.notificaciones TO authenticated USING (( SELECT public.puede_tabla('notificaciones'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('notificaciones'::text, 'editar'::text) AS puede_tabla));


--
-- Name: pagos permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.pagos TO authenticated USING (( SELECT public.puede_tabla('pagos'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('pagos'::text, 'editar'::text) AS puede_tabla));


--
-- Name: pedido_items permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.pedido_items TO authenticated USING (( SELECT public.puede_tabla('pedido_items'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('pedido_items'::text, 'editar'::text) AS puede_tabla));


--
-- Name: pedidos permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.pedidos TO authenticated USING (( SELECT public.puede_tabla('pedidos'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('pedidos'::text, 'editar'::text) AS puede_tabla));


--
-- Name: produccion_listas permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.produccion_listas TO authenticated USING (( SELECT public.puede_tabla('produccion_listas'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('produccion_listas'::text, 'editar'::text) AS puede_tabla));


--
-- Name: produccion_tareas permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.produccion_tareas TO authenticated USING (( SELECT public.puede_tabla('produccion_tareas'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('produccion_tareas'::text, 'editar'::text) AS puede_tabla));


--
-- Name: proveedores permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.proveedores TO authenticated USING (( SELECT public.puede_tabla('proveedores'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('proveedores'::text, 'editar'::text) AS puede_tabla));


--
-- Name: puntos_fichaje permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.puntos_fichaje TO authenticated USING (( SELECT public.puede_tabla('puntos_fichaje'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('puntos_fichaje'::text, 'editar'::text) AS puede_tabla));


--
-- Name: receta_ingredientes permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.receta_ingredientes TO authenticated USING (( SELECT public.puede_tabla('receta_ingredientes'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('receta_ingredientes'::text, 'editar'::text) AS puede_tabla));


--
-- Name: recetas permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.recetas TO authenticated USING (( SELECT public.puede_tabla('recetas'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('recetas'::text, 'editar'::text) AS puede_tabla));


--
-- Name: reservas permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.reservas TO authenticated USING (( SELECT public.puede_tabla('reservas'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('reservas'::text, 'editar'::text) AS puede_tabla));


--
-- Name: reservas_config permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.reservas_config TO authenticated USING (( SELECT public.puede_tabla('reservas_config'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('reservas_config'::text, 'editar'::text) AS puede_tabla));


--
-- Name: reservas_dias permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.reservas_dias TO authenticated USING (( SELECT public.puede_tabla('reservas_dias'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('reservas_dias'::text, 'editar'::text) AS puede_tabla));


--
-- Name: salones permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.salones TO authenticated USING (( SELECT public.puede_tabla('salones'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('salones'::text, 'editar'::text) AS puede_tabla));


--
-- Name: stock permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.stock TO authenticated USING (( SELECT public.puede_tabla('stock'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('stock'::text, 'editar'::text) AS puede_tabla));


--
-- Name: stock_movimientos permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.stock_movimientos TO authenticated USING (( SELECT public.puede_tabla('stock_movimientos'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('stock_movimientos'::text, 'editar'::text) AS puede_tabla));


--
-- Name: tipos_comprobante permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.tipos_comprobante TO authenticated USING (( SELECT public.puede_tabla('tipos_comprobante'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('tipos_comprobante'::text, 'editar'::text) AS puede_tabla));


--
-- Name: turnos permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.turnos TO authenticated USING (( SELECT public.puede_tabla('turnos'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('turnos'::text, 'editar'::text) AS puede_tabla));


--
-- Name: web_config permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.web_config TO authenticated USING (( SELECT public.puede_tabla('web_config'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('web_config'::text, 'editar'::text) AS puede_tabla));


--
-- Name: webhook_config permisos escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos escritura" ON public.webhook_config TO authenticated USING (( SELECT public.puede_tabla('webhook_config'::text, 'editar'::text) AS puede_tabla)) WITH CHECK (( SELECT public.puede_tabla('webhook_config'::text, 'editar'::text) AS puede_tabla));


--
-- Name: aperturas_especiales permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.aperturas_especiales FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('aperturas_especiales'::text, 'ver'::text) AS puede_tabla));


--
-- Name: arca_request_log permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.arca_request_log FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('arca_request_log'::text, 'ver'::text) AS puede_tabla));


--
-- Name: caja_movimientos permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.caja_movimientos FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('caja_movimientos'::text, 'ver'::text) AS puede_tabla));


--
-- Name: caja_turnos permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.caja_turnos FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('caja_turnos'::text, 'ver'::text) AS puede_tabla));


--
-- Name: caja_turnos_auditoria permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.caja_turnos_auditoria FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('caja_turnos_auditoria'::text, 'ver'::text) AS puede_tabla));


--
-- Name: clientes permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.clientes FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('clientes'::text, 'ver'::text) AS puede_tabla));


--
-- Name: combo_items permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.combo_items FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('combo_items'::text, 'ver'::text) AS puede_tabla));


--
-- Name: combos permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.combos FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('combos'::text, 'ver'::text) AS puede_tabla));


--
-- Name: comprobantes_fiscales permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.comprobantes_fiscales FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('comprobantes_fiscales'::text, 'ver'::text) AS puede_tabla));


--
-- Name: egresos permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.egresos FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('egresos'::text, 'ver'::text) AS puede_tabla));


--
-- Name: empleados permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.empleados FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('empleados'::text, 'ver'::text) AS puede_tabla));


--
-- Name: envio_config permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.envio_config FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('envio_config'::text, 'ver'::text) AS puede_tabla));


--
-- Name: envio_zonas permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.envio_zonas FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('envio_zonas'::text, 'ver'::text) AS puede_tabla));


--
-- Name: especial_pasos permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.especial_pasos FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('especial_pasos'::text, 'ver'::text) AS puede_tabla));


--
-- Name: especiales permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.especiales FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('especiales'::text, 'ver'::text) AS puede_tabla));


--
-- Name: facturacion_config permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.facturacion_config FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('facturacion_config'::text, 'ver'::text) AS puede_tabla));


--
-- Name: fichajes permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.fichajes FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('fichajes'::text, 'ver'::text) AS puede_tabla));


--
-- Name: impresion_config permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.impresion_config FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('impresion_config'::text, 'ver'::text) AS puede_tabla));


--
-- Name: impresiones_documentos permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.impresiones_documentos FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('impresiones_documentos'::text, 'ver'::text) AS puede_tabla));


--
-- Name: liquidaciones permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.liquidaciones FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('liquidaciones'::text, 'ver'::text) AS puede_tabla));


--
-- Name: lista_espera permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.lista_espera FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('lista_espera'::text, 'ver'::text) AS puede_tabla));


--
-- Name: menu_item_variantes permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.menu_item_variantes FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('menu_item_variantes'::text, 'ver'::text) AS puede_tabla));


--
-- Name: menu_items permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.menu_items FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('menu_items'::text, 'ver'::text) AS puede_tabla));


--
-- Name: mesas permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.mesas FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('mesas'::text, 'ver'::text) AS puede_tabla));


--
-- Name: mozos permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.mozos FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('mozos'::text, 'ver'::text) AS puede_tabla));


--
-- Name: notificaciones permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.notificaciones FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('notificaciones'::text, 'ver'::text) AS puede_tabla));


--
-- Name: pagos permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.pagos FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('pagos'::text, 'ver'::text) AS puede_tabla));


--
-- Name: pedido_items permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.pedido_items FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('pedido_items'::text, 'ver'::text) AS puede_tabla));


--
-- Name: pedidos permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.pedidos FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('pedidos'::text, 'ver'::text) AS puede_tabla));


--
-- Name: produccion_listas permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.produccion_listas FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('produccion_listas'::text, 'ver'::text) AS puede_tabla));


--
-- Name: produccion_tareas permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.produccion_tareas FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('produccion_tareas'::text, 'ver'::text) AS puede_tabla));


--
-- Name: proveedores permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.proveedores FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('proveedores'::text, 'ver'::text) AS puede_tabla));


--
-- Name: puntos_fichaje permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.puntos_fichaje FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('puntos_fichaje'::text, 'ver'::text) AS puede_tabla));


--
-- Name: receta_ingredientes permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.receta_ingredientes FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('receta_ingredientes'::text, 'ver'::text) AS puede_tabla));


--
-- Name: recetas permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.recetas FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('recetas'::text, 'ver'::text) AS puede_tabla));


--
-- Name: reservas permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.reservas FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('reservas'::text, 'ver'::text) AS puede_tabla));


--
-- Name: reservas_config permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.reservas_config FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('reservas_config'::text, 'ver'::text) AS puede_tabla));


--
-- Name: reservas_dias permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.reservas_dias FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('reservas_dias'::text, 'ver'::text) AS puede_tabla));


--
-- Name: salones permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.salones FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('salones'::text, 'ver'::text) AS puede_tabla));


--
-- Name: stock permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.stock FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('stock'::text, 'ver'::text) AS puede_tabla));


--
-- Name: stock_movimientos permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.stock_movimientos FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('stock_movimientos'::text, 'ver'::text) AS puede_tabla));


--
-- Name: tipos_comprobante permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.tipos_comprobante FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('tipos_comprobante'::text, 'ver'::text) AS puede_tabla));


--
-- Name: turnos permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.turnos FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('turnos'::text, 'ver'::text) AS puede_tabla));


--
-- Name: web_config permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.web_config FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('web_config'::text, 'ver'::text) AS puede_tabla));


--
-- Name: webhook_config permisos lectura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "permisos lectura" ON public.webhook_config FOR SELECT TO authenticated USING (( SELECT public.puede_tabla('webhook_config'::text, 'ver'::text) AS puede_tabla));


--
-- Name: produccion_listas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.produccion_listas ENABLE ROW LEVEL SECURITY;

--
-- Name: produccion_tareas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.produccion_tareas ENABLE ROW LEVEL SECURITY;

--
-- Name: productos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

--
-- Name: proveedores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

--
-- Name: proveedores proveedores pagos read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "proveedores pagos read" ON public.proveedores FOR SELECT TO authenticated USING (( SELECT public.tiene_permiso('pagos'::text, 'ver'::text) AS tiene_permiso));


--
-- Name: puntos_fichaje; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.puntos_fichaje ENABLE ROW LEVEL SECURITY;

--
-- Name: receta_ingredientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.receta_ingredientes ENABLE ROW LEVEL SECURITY;

--
-- Name: recetas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recetas ENABLE ROW LEVEL SECURITY;

--
-- Name: recurso_tablas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recurso_tablas ENABLE ROW LEVEL SECURITY;

--
-- Name: recurso_tablas recurso_tablas escritura service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recurso_tablas escritura service" ON public.recurso_tablas TO service_role USING (true) WITH CHECK (true);


--
-- Name: recurso_tablas recurso_tablas lectura autenticada; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recurso_tablas lectura autenticada" ON public.recurso_tablas FOR SELECT TO authenticated USING (true);


--
-- Name: recursos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recursos ENABLE ROW LEVEL SECURITY;

--
-- Name: recursos recursos escritura service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recursos escritura service" ON public.recursos TO service_role USING (true) WITH CHECK (true);


--
-- Name: recursos recursos lectura autenticada; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recursos lectura autenticada" ON public.recursos FOR SELECT TO authenticated USING (true);


--
-- Name: reservas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;

--
-- Name: reservas_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservas_config ENABLE ROW LEVEL SECURITY;

--
-- Name: reservas_config reservas_config lectura publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "reservas_config lectura publica" ON public.reservas_config FOR SELECT TO authenticated, anon USING (true);


--
-- Name: reservas_dias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservas_dias ENABLE ROW LEVEL SECURITY;

--
-- Name: reservas_dias reservas_dias lectura publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "reservas_dias lectura publica" ON public.reservas_dias FOR SELECT TO authenticated, anon USING (true);


--
-- Name: rol_permisos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rol_permisos ENABLE ROW LEVEL SECURITY;

--
-- Name: rol_permisos rol_permisos escritura permisos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rol_permisos escritura permisos" ON public.rol_permisos TO authenticated USING (public.puede_administrar_permisos()) WITH CHECK (public.puede_administrar_permisos());


--
-- Name: rol_permisos rol_permisos lectura autenticada; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rol_permisos lectura autenticada" ON public.rol_permisos FOR SELECT TO authenticated USING (true);


--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: roles roles escritura permisos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "roles escritura permisos" ON public.roles TO authenticated USING (public.puede_administrar_permisos()) WITH CHECK (public.puede_administrar_permisos());


--
-- Name: roles roles lectura autenticada; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "roles lectura autenticada" ON public.roles FOR SELECT TO authenticated USING (true);


--
-- Name: salones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.salones ENABLE ROW LEVEL SECURITY;

--
-- Name: stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movimientos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movimientos ENABLE ROW LEVEL SECURITY;

--
-- Name: tipos_comprobante; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tipos_comprobante ENABLE ROW LEVEL SECURITY;

--
-- Name: turnos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;

--
-- Name: turnos turnos self read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "turnos self read" ON public.turnos FOR SELECT TO authenticated USING ((empleado_id IN ( SELECT empleados.id
   FROM public.empleados
  WHERE (empleados.user_id = auth.uid()))));


--
-- Name: turnos_caja; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.turnos_caja ENABLE ROW LEVEL SECURITY;

--
-- Name: web_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.web_config ENABLE ROW LEVEL SECURITY;

--
-- Name: web_config web_config lectura publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "web_config lectura publica" ON public.web_config FOR SELECT TO authenticated, anon USING (true);


--
-- Name: webhook_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_config ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_config webhook_config_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhook_config_write ON public.webhook_config TO service_role USING (true) WITH CHECK (true);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION abrir_mesa(p_mesa_id uuid, p_personas integer, p_mozo_id uuid, p_cliente_nombre text, p_cliente_telefono text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.abrir_mesa(p_mesa_id uuid, p_personas integer, p_mozo_id uuid, p_cliente_nombre text, p_cliente_telefono text) TO anon;
GRANT ALL ON FUNCTION public.abrir_mesa(p_mesa_id uuid, p_personas integer, p_mozo_id uuid, p_cliente_nombre text, p_cliente_telefono text) TO authenticated;
GRANT ALL ON FUNCTION public.abrir_mesa(p_mesa_id uuid, p_personas integer, p_mozo_id uuid, p_cliente_nombre text, p_cliente_telefono text) TO service_role;


--
-- Name: FUNCTION actualizar_datos_pedido(p_pedido_id uuid, p_patch jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.actualizar_datos_pedido(p_pedido_id uuid, p_patch jsonb) TO anon;
GRANT ALL ON FUNCTION public.actualizar_datos_pedido(p_pedido_id uuid, p_patch jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.actualizar_datos_pedido(p_pedido_id uuid, p_patch jsonb) TO service_role;


--
-- Name: FUNCTION actualizar_estado_lista_espera(p_id uuid, p_estado text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.actualizar_estado_lista_espera(p_id uuid, p_estado text) TO anon;
GRANT ALL ON FUNCTION public.actualizar_estado_lista_espera(p_id uuid, p_estado text) TO authenticated;
GRANT ALL ON FUNCTION public.actualizar_estado_lista_espera(p_id uuid, p_estado text) TO service_role;


--
-- Name: FUNCTION actualizar_estado_reserva(p_reserva_id uuid, p_estado public.reserva_estado); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.actualizar_estado_reserva(p_reserva_id uuid, p_estado public.reserva_estado) TO anon;
GRANT ALL ON FUNCTION public.actualizar_estado_reserva(p_reserva_id uuid, p_estado public.reserva_estado) TO authenticated;
GRANT ALL ON FUNCTION public.actualizar_estado_reserva(p_reserva_id uuid, p_estado public.reserva_estado) TO service_role;


--
-- Name: FUNCTION acumular_cliente(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.acumular_cliente() TO anon;
GRANT ALL ON FUNCTION public.acumular_cliente() TO authenticated;
GRANT ALL ON FUNCTION public.acumular_cliente() TO service_role;


--
-- Name: FUNCTION agregar_items_pedido(p_pedido_id uuid, p_items jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.agregar_items_pedido(p_pedido_id uuid, p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.agregar_items_pedido(p_pedido_id uuid, p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.agregar_items_pedido(p_pedido_id uuid, p_items jsonb) TO service_role;


--
-- Name: FUNCTION agrupar_mesa(p_leader_id uuid, p_member_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.agrupar_mesa(p_leader_id uuid, p_member_id uuid) TO anon;
GRANT ALL ON FUNCTION public.agrupar_mesa(p_leader_id uuid, p_member_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.agrupar_mesa(p_leader_id uuid, p_member_id uuid) TO service_role;


--
-- Name: FUNCTION ajustar_caja_fuerte(p_monto numeric, p_direccion text, p_descripcion text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ajustar_caja_fuerte(p_monto numeric, p_direccion text, p_descripcion text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ajustar_caja_fuerte(p_monto numeric, p_direccion text, p_descripcion text) TO anon;
GRANT ALL ON FUNCTION public.ajustar_caja_fuerte(p_monto numeric, p_direccion text, p_descripcion text) TO authenticated;
GRANT ALL ON FUNCTION public.ajustar_caja_fuerte(p_monto numeric, p_direccion text, p_descripcion text) TO service_role;


--
-- Name: FUNCTION asignar_pagos_a_turno(p_turno_id uuid, p_pago_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.asignar_pagos_a_turno(p_turno_id uuid, p_pago_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.asignar_pagos_a_turno(p_turno_id uuid, p_pago_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.asignar_pagos_a_turno(p_turno_id uuid, p_pago_ids uuid[]) TO service_role;


--
-- Name: FUNCTION avanzar_estado_pedido(p_pedido_id uuid, p_estado_actual text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.avanzar_estado_pedido(p_pedido_id uuid, p_estado_actual text) TO anon;
GRANT ALL ON FUNCTION public.avanzar_estado_pedido(p_pedido_id uuid, p_estado_actual text) TO authenticated;
GRANT ALL ON FUNCTION public.avanzar_estado_pedido(p_pedido_id uuid, p_estado_actual text) TO service_role;


--
-- Name: FUNCTION caja_movimientos_audit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.caja_movimientos_audit() TO anon;
GRANT ALL ON FUNCTION public.caja_movimientos_audit() TO authenticated;
GRANT ALL ON FUNCTION public.caja_movimientos_audit() TO service_role;


--
-- Name: FUNCTION caja_turnos_audit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.caja_turnos_audit() TO anon;
GRANT ALL ON FUNCTION public.caja_turnos_audit() TO authenticated;
GRANT ALL ON FUNCTION public.caja_turnos_audit() TO service_role;


--
-- Name: FUNCTION cerrar_mesa(p_pedido_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cerrar_mesa(p_pedido_id uuid) TO anon;
GRANT ALL ON FUNCTION public.cerrar_mesa(p_pedido_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cerrar_mesa(p_pedido_id uuid) TO service_role;


--
-- Name: FUNCTION cerrar_sesiones_de_rol(p_rol text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cerrar_sesiones_de_rol(p_rol text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cerrar_sesiones_de_rol(p_rol text) TO anon;
GRANT ALL ON FUNCTION public.cerrar_sesiones_de_rol(p_rol text) TO authenticated;
GRANT ALL ON FUNCTION public.cerrar_sesiones_de_rol(p_rol text) TO service_role;


--
-- Name: FUNCTION cerrar_sesiones_de_usuario(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cerrar_sesiones_de_usuario(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cerrar_sesiones_de_usuario(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.cerrar_sesiones_de_usuario(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cerrar_sesiones_de_usuario(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION completar_tarea_produccion(p_tarea_id uuid, p_completada_por text, p_cantidad_real numeric, p_notas_equipo text, p_consumos jsonb, p_produccion_stock_id uuid, p_produccion_cantidad numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.completar_tarea_produccion(p_tarea_id uuid, p_completada_por text, p_cantidad_real numeric, p_notas_equipo text, p_consumos jsonb, p_produccion_stock_id uuid, p_produccion_cantidad numeric) TO anon;
GRANT ALL ON FUNCTION public.completar_tarea_produccion(p_tarea_id uuid, p_completada_por text, p_cantidad_real numeric, p_notas_equipo text, p_consumos jsonb, p_produccion_stock_id uuid, p_produccion_cantidad numeric) TO authenticated;
GRANT ALL ON FUNCTION public.completar_tarea_produccion(p_tarea_id uuid, p_completada_por text, p_cantidad_real numeric, p_notas_equipo text, p_consumos jsonb, p_produccion_stock_id uuid, p_produccion_cantidad numeric) TO service_role;


--
-- Name: FUNCTION crear_lista_espera(p_fecha date, p_personas integer, p_cliente_nombre text, p_cliente_telefono text, p_hora time without time zone, p_cliente_email text, p_notas text, p_tipo_experiencia text, p_origen text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.crear_lista_espera(p_fecha date, p_personas integer, p_cliente_nombre text, p_cliente_telefono text, p_hora time without time zone, p_cliente_email text, p_notas text, p_tipo_experiencia text, p_origen text) TO anon;
GRANT ALL ON FUNCTION public.crear_lista_espera(p_fecha date, p_personas integer, p_cliente_nombre text, p_cliente_telefono text, p_hora time without time zone, p_cliente_email text, p_notas text, p_tipo_experiencia text, p_origen text) TO authenticated;
GRANT ALL ON FUNCTION public.crear_lista_espera(p_fecha date, p_personas integer, p_cliente_nombre text, p_cliente_telefono text, p_hora time without time zone, p_cliente_email text, p_notas text, p_tipo_experiencia text, p_origen text) TO service_role;


--
-- Name: FUNCTION crear_pedido_con_items(p_canal text, p_mesa text, p_notas text, p_items jsonb, p_descuento_porcentaje numeric, p_cliente_nombre text, p_cliente_telefono text, p_cliente_direccion text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.crear_pedido_con_items(p_canal text, p_mesa text, p_notas text, p_items jsonb, p_descuento_porcentaje numeric, p_cliente_nombre text, p_cliente_telefono text, p_cliente_direccion text) TO anon;
GRANT ALL ON FUNCTION public.crear_pedido_con_items(p_canal text, p_mesa text, p_notas text, p_items jsonb, p_descuento_porcentaje numeric, p_cliente_nombre text, p_cliente_telefono text, p_cliente_direccion text) TO authenticated;
GRANT ALL ON FUNCTION public.crear_pedido_con_items(p_canal text, p_mesa text, p_notas text, p_items jsonb, p_descuento_porcentaje numeric, p_cliente_nombre text, p_cliente_telefono text, p_cliente_direccion text) TO service_role;


--
-- Name: FUNCTION crear_reserva(p_fecha date, p_hora time without time zone, p_personas integer, p_cliente_nombre text, p_cliente_telefono text, p_cliente_email text, p_notas text, p_origen text, p_duracion_min integer, p_auto_confirmar boolean, p_restricciones text, p_accesibilidad text, p_tipo_experiencia text, p_cliente_cumple date, p_acepta_marketing boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.crear_reserva(p_fecha date, p_hora time without time zone, p_personas integer, p_cliente_nombre text, p_cliente_telefono text, p_cliente_email text, p_notas text, p_origen text, p_duracion_min integer, p_auto_confirmar boolean, p_restricciones text, p_accesibilidad text, p_tipo_experiencia text, p_cliente_cumple date, p_acepta_marketing boolean) TO anon;
GRANT ALL ON FUNCTION public.crear_reserva(p_fecha date, p_hora time without time zone, p_personas integer, p_cliente_nombre text, p_cliente_telefono text, p_cliente_email text, p_notas text, p_origen text, p_duracion_min integer, p_auto_confirmar boolean, p_restricciones text, p_accesibilidad text, p_tipo_experiencia text, p_cliente_cumple date, p_acepta_marketing boolean) TO authenticated;
GRANT ALL ON FUNCTION public.crear_reserva(p_fecha date, p_hora time without time zone, p_personas integer, p_cliente_nombre text, p_cliente_telefono text, p_cliente_email text, p_notas text, p_origen text, p_duracion_min integer, p_auto_confirmar boolean, p_restricciones text, p_accesibilidad text, p_tipo_experiencia text, p_cliente_cumple date, p_acepta_marketing boolean) TO service_role;


--
-- Name: FUNCTION crear_rol(p_id text, p_nombre text, p_descripcion text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.crear_rol(p_id text, p_nombre text, p_descripcion text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.crear_rol(p_id text, p_nombre text, p_descripcion text) TO anon;
GRANT ALL ON FUNCTION public.crear_rol(p_id text, p_nombre text, p_descripcion text) TO authenticated;
GRANT ALL ON FUNCTION public.crear_rol(p_id text, p_nombre text, p_descripcion text) TO service_role;


--
-- Name: FUNCTION current_app_role(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_app_role() TO anon;
GRANT ALL ON FUNCTION public.current_app_role() TO authenticated;
GRANT ALL ON FUNCTION public.current_app_role() TO service_role;


--
-- Name: FUNCTION desagrupar_grupo(p_leader_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.desagrupar_grupo(p_leader_id uuid) TO anon;
GRANT ALL ON FUNCTION public.desagrupar_grupo(p_leader_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.desagrupar_grupo(p_leader_id uuid) TO service_role;


--
-- Name: FUNCTION descontar_stock(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.descontar_stock() TO anon;
GRANT ALL ON FUNCTION public.descontar_stock() TO authenticated;
GRANT ALL ON FUNCTION public.descontar_stock() TO service_role;


--
-- Name: FUNCTION descontar_stock_produccion(p_stock_id uuid, p_cantidad numeric, p_notas text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.descontar_stock_produccion(p_stock_id uuid, p_cantidad numeric, p_notas text) TO anon;
GRANT ALL ON FUNCTION public.descontar_stock_produccion(p_stock_id uuid, p_cantidad numeric, p_notas text) TO authenticated;
GRANT ALL ON FUNCTION public.descontar_stock_produccion(p_stock_id uuid, p_cantidad numeric, p_notas text) TO service_role;


--
-- Name: FUNCTION eliminar_notificacion(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.eliminar_notificacion(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.eliminar_notificacion(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.eliminar_notificacion(p_id uuid) TO service_role;


--
-- Name: FUNCTION eliminar_rol(p_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.eliminar_rol(p_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.eliminar_rol(p_id text) TO anon;
GRANT ALL ON FUNCTION public.eliminar_rol(p_id text) TO authenticated;
GRANT ALL ON FUNCTION public.eliminar_rol(p_id text) TO service_role;


--
-- Name: FUNCTION empleados_para_pagos(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.empleados_para_pagos() FROM PUBLIC;
GRANT ALL ON FUNCTION public.empleados_para_pagos() TO anon;
GRANT ALL ON FUNCTION public.empleados_para_pagos() TO authenticated;
GRANT ALL ON FUNCTION public.empleados_para_pagos() TO service_role;


--
-- Name: FUNCTION enviar_a_cocina(p_pedido_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enviar_a_cocina(p_pedido_id uuid) TO anon;
GRANT ALL ON FUNCTION public.enviar_a_cocina(p_pedido_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.enviar_a_cocina(p_pedido_id uuid) TO service_role;


--
-- Name: FUNCTION es_admin_permisos_de_emergencia(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.es_admin_permisos_de_emergencia() FROM PUBLIC;
GRANT ALL ON FUNCTION public.es_admin_permisos_de_emergencia() TO anon;
GRANT ALL ON FUNCTION public.es_admin_permisos_de_emergencia() TO authenticated;
GRANT ALL ON FUNCTION public.es_admin_permisos_de_emergencia() TO service_role;


--
-- Name: FUNCTION fichar(p_token text, p_lat double precision, p_lng double precision, p_precision_m double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fichar(p_token text, p_lat double precision, p_lng double precision, p_precision_m double precision) TO anon;
GRANT ALL ON FUNCTION public.fichar(p_token text, p_lat double precision, p_lng double precision, p_precision_m double precision) TO authenticated;
GRANT ALL ON FUNCTION public.fichar(p_token text, p_lat double precision, p_lng double precision, p_precision_m double precision) TO service_role;


--
-- Name: TABLE liquidaciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.liquidaciones TO anon;
GRANT ALL ON TABLE public.liquidaciones TO authenticated;
GRANT ALL ON TABLE public.liquidaciones TO service_role;


--
-- Name: FUNCTION generar_liquidacion_dia(p_empleado_id uuid, p_fecha date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generar_liquidacion_dia(p_empleado_id uuid, p_fecha date) TO anon;
GRANT ALL ON FUNCTION public.generar_liquidacion_dia(p_empleado_id uuid, p_fecha date) TO authenticated;
GRANT ALL ON FUNCTION public.generar_liquidacion_dia(p_empleado_id uuid, p_fecha date) TO service_role;


--
-- Name: FUNCTION generar_liquidacion_semanal(p_fecha date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generar_liquidacion_semanal(p_fecha date) TO anon;
GRANT ALL ON FUNCTION public.generar_liquidacion_semanal(p_fecha date) TO authenticated;
GRANT ALL ON FUNCTION public.generar_liquidacion_semanal(p_fecha date) TO service_role;


--
-- Name: FUNCTION guardar_admin_de_permisos(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guardar_admin_de_permisos() TO anon;
GRANT ALL ON FUNCTION public.guardar_admin_de_permisos() TO authenticated;
GRANT ALL ON FUNCTION public.guardar_admin_de_permisos() TO service_role;


--
-- Name: FUNCTION guardar_permisos_rol(p_rol text, p_recursos jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guardar_permisos_rol(p_rol text, p_recursos jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guardar_permisos_rol(p_rol text, p_recursos jsonb) TO anon;
GRANT ALL ON FUNCTION public.guardar_permisos_rol(p_rol text, p_recursos jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.guardar_permisos_rol(p_rol text, p_recursos jsonb) TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- Name: FUNCTION is_finanzas_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_finanzas_user() TO anon;
GRANT ALL ON FUNCTION public.is_finanzas_user() TO authenticated;
GRANT ALL ON FUNCTION public.is_finanzas_user() TO service_role;


--
-- Name: FUNCTION is_mozo(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_mozo() TO anon;
GRANT ALL ON FUNCTION public.is_mozo() TO authenticated;
GRANT ALL ON FUNCTION public.is_mozo() TO service_role;


--
-- Name: FUNCTION is_operational_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_operational_user() TO anon;
GRANT ALL ON FUNCTION public.is_operational_user() TO authenticated;
GRANT ALL ON FUNCTION public.is_operational_user() TO service_role;


--
-- Name: FUNCTION kiku_capacidad_barra(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kiku_capacidad_barra() TO anon;
GRANT ALL ON FUNCTION public.kiku_capacidad_barra() TO authenticated;
GRANT ALL ON FUNCTION public.kiku_capacidad_barra() TO service_role;


--
-- Name: FUNCTION kiku_capacidad_salon(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kiku_capacidad_salon() TO anon;
GRANT ALL ON FUNCTION public.kiku_capacidad_salon() TO authenticated;
GRANT ALL ON FUNCTION public.kiku_capacidad_salon() TO service_role;


--
-- Name: FUNCTION kiku_capacidad_salon_fecha(p_fecha date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kiku_capacidad_salon_fecha(p_fecha date) TO anon;
GRANT ALL ON FUNCTION public.kiku_capacidad_salon_fecha(p_fecha date) TO authenticated;
GRANT ALL ON FUNCTION public.kiku_capacidad_salon_fecha(p_fecha date) TO service_role;


--
-- Name: FUNCTION kiku_experiencia_en_dia(p_experiencia text, p_dow integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kiku_experiencia_en_dia(p_experiencia text, p_dow integer) TO anon;
GRANT ALL ON FUNCTION public.kiku_experiencia_en_dia(p_experiencia text, p_dow integer) TO authenticated;
GRANT ALL ON FUNCTION public.kiku_experiencia_en_dia(p_experiencia text, p_dow integer) TO service_role;


--
-- Name: FUNCTION kiku_items_recompute_total(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kiku_items_recompute_total() TO anon;
GRANT ALL ON FUNCTION public.kiku_items_recompute_total() TO authenticated;
GRANT ALL ON FUNCTION public.kiku_items_recompute_total() TO service_role;


--
-- Name: FUNCTION kiku_parse_notas_legacy(p_notas text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kiku_parse_notas_legacy(p_notas text) TO anon;
GRANT ALL ON FUNCTION public.kiku_parse_notas_legacy(p_notas text) TO authenticated;
GRANT ALL ON FUNCTION public.kiku_parse_notas_legacy(p_notas text) TO service_role;


--
-- Name: FUNCTION kiku_parse_precio_ar(p_input text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kiku_parse_precio_ar(p_input text) TO anon;
GRANT ALL ON FUNCTION public.kiku_parse_precio_ar(p_input text) TO authenticated;
GRANT ALL ON FUNCTION public.kiku_parse_precio_ar(p_input text) TO service_role;


--
-- Name: FUNCTION kiku_pedidos_set_total(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kiku_pedidos_set_total() TO anon;
GRANT ALL ON FUNCTION public.kiku_pedidos_set_total() TO authenticated;
GRANT ALL ON FUNCTION public.kiku_pedidos_set_total() TO service_role;


--
-- Name: FUNCTION kiku_reservas_touch_updated(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kiku_reservas_touch_updated() TO anon;
GRANT ALL ON FUNCTION public.kiku_reservas_touch_updated() TO authenticated;
GRANT ALL ON FUNCTION public.kiku_reservas_touch_updated() TO service_role;


--
-- Name: FUNCTION kiku_sync_precio_especial_a_producto(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kiku_sync_precio_especial_a_producto() TO anon;
GRANT ALL ON FUNCTION public.kiku_sync_precio_especial_a_producto() TO authenticated;
GRANT ALL ON FUNCTION public.kiku_sync_precio_especial_a_producto() TO service_role;


--
-- Name: FUNCTION kiku_sync_precio_producto_a_especial(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kiku_sync_precio_producto_a_especial() TO anon;
GRANT ALL ON FUNCTION public.kiku_sync_precio_producto_a_especial() TO authenticated;
GRANT ALL ON FUNCTION public.kiku_sync_precio_producto_a_especial() TO service_role;


--
-- Name: TABLE pedidos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pedidos TO anon;
GRANT ALL ON TABLE public.pedidos TO authenticated;
GRANT ALL ON TABLE public.pedidos TO service_role;


--
-- Name: FUNCTION kiku_total_pedido(p_pedido public.pedidos); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kiku_total_pedido(p_pedido public.pedidos) TO anon;
GRANT ALL ON FUNCTION public.kiku_total_pedido(p_pedido public.pedidos) TO authenticated;
GRANT ALL ON FUNCTION public.kiku_total_pedido(p_pedido public.pedidos) TO service_role;


--
-- Name: FUNCTION kiku_touch_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kiku_touch_updated_at() TO anon;
GRANT ALL ON FUNCTION public.kiku_touch_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.kiku_touch_updated_at() TO service_role;


--
-- Name: FUNCTION kiku_upsert_cliente_marketing(p_nombre text, p_telefono text, p_email text, p_cumple date, p_acepta_marketing boolean, p_origen text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kiku_upsert_cliente_marketing(p_nombre text, p_telefono text, p_email text, p_cumple date, p_acepta_marketing boolean, p_origen text) TO anon;
GRANT ALL ON FUNCTION public.kiku_upsert_cliente_marketing(p_nombre text, p_telefono text, p_email text, p_cumple date, p_acepta_marketing boolean, p_origen text) TO authenticated;
GRANT ALL ON FUNCTION public.kiku_upsert_cliente_marketing(p_nombre text, p_telefono text, p_email text, p_cumple date, p_acepta_marketing boolean, p_origen text) TO service_role;


--
-- Name: FUNCTION liquidacion_horas(p_desde date, p_hasta date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.liquidacion_horas(p_desde date, p_hasta date) TO anon;
GRANT ALL ON FUNCTION public.liquidacion_horas(p_desde date, p_hasta date) TO authenticated;
GRANT ALL ON FUNCTION public.liquidacion_horas(p_desde date, p_hasta date) TO service_role;


--
-- Name: FUNCTION lista_espera_touch_updated(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.lista_espera_touch_updated() TO anon;
GRANT ALL ON FUNCTION public.lista_espera_touch_updated() TO authenticated;
GRANT ALL ON FUNCTION public.lista_espera_touch_updated() TO service_role;


--
-- Name: FUNCTION marcar_notificacion_leida(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.marcar_notificacion_leida(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.marcar_notificacion_leida(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.marcar_notificacion_leida(p_id uuid) TO service_role;


--
-- Name: FUNCTION marcar_todas_notificaciones_leidas(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.marcar_todas_notificaciones_leidas() TO anon;
GRANT ALL ON FUNCTION public.marcar_todas_notificaciones_leidas() TO authenticated;
GRANT ALL ON FUNCTION public.marcar_todas_notificaciones_leidas() TO service_role;


--
-- Name: FUNCTION notif_on_lista_espera_insert(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notif_on_lista_espera_insert() TO anon;
GRANT ALL ON FUNCTION public.notif_on_lista_espera_insert() TO authenticated;
GRANT ALL ON FUNCTION public.notif_on_lista_espera_insert() TO service_role;


--
-- Name: FUNCTION notif_on_pedido_insert(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notif_on_pedido_insert() TO anon;
GRANT ALL ON FUNCTION public.notif_on_pedido_insert() TO authenticated;
GRANT ALL ON FUNCTION public.notif_on_pedido_insert() TO service_role;


--
-- Name: FUNCTION notif_on_reserva_insert(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notif_on_reserva_insert() TO anon;
GRANT ALL ON FUNCTION public.notif_on_reserva_insert() TO authenticated;
GRANT ALL ON FUNCTION public.notif_on_reserva_insert() TO service_role;


--
-- Name: FUNCTION pagos_reasignacion_audit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pagos_reasignacion_audit() TO anon;
GRANT ALL ON FUNCTION public.pagos_reasignacion_audit() TO authenticated;
GRANT ALL ON FUNCTION public.pagos_reasignacion_audit() TO service_role;


--
-- Name: FUNCTION pedido_web_horario_check(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pedido_web_horario_check() TO anon;
GRANT ALL ON FUNCTION public.pedido_web_horario_check() TO authenticated;
GRANT ALL ON FUNCTION public.pedido_web_horario_check() TO service_role;


--
-- Name: FUNCTION pedido_webhook_whatsapp(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pedido_webhook_whatsapp() TO anon;
GRANT ALL ON FUNCTION public.pedido_webhook_whatsapp() TO authenticated;
GRANT ALL ON FUNCTION public.pedido_webhook_whatsapp() TO service_role;


--
-- Name: FUNCTION proteger_roles_sistema(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.proteger_roles_sistema() TO anon;
GRANT ALL ON FUNCTION public.proteger_roles_sistema() TO authenticated;
GRANT ALL ON FUNCTION public.proteger_roles_sistema() TO service_role;


--
-- Name: FUNCTION puede_administrar_permisos(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.puede_administrar_permisos() FROM PUBLIC;
GRANT ALL ON FUNCTION public.puede_administrar_permisos() TO anon;
GRANT ALL ON FUNCTION public.puede_administrar_permisos() TO authenticated;
GRANT ALL ON FUNCTION public.puede_administrar_permisos() TO service_role;


--
-- Name: FUNCTION puede_cobrar(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.puede_cobrar() TO anon;
GRANT ALL ON FUNCTION public.puede_cobrar() TO authenticated;
GRANT ALL ON FUNCTION public.puede_cobrar() TO service_role;


--
-- Name: FUNCTION puede_tabla(p_tabla text, p_accion text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.puede_tabla(p_tabla text, p_accion text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.puede_tabla(p_tabla text, p_accion text) TO anon;
GRANT ALL ON FUNCTION public.puede_tabla(p_tabla text, p_accion text) TO authenticated;
GRANT ALL ON FUNCTION public.puede_tabla(p_tabla text, p_accion text) TO service_role;


--
-- Name: FUNCTION reabrir_pedido(p_pedido_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reabrir_pedido(p_pedido_id uuid) TO anon;
GRANT ALL ON FUNCTION public.reabrir_pedido(p_pedido_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.reabrir_pedido(p_pedido_id uuid) TO service_role;


--
-- Name: FUNCTION reabrir_turno(p_turno_id uuid, p_motivo text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reabrir_turno(p_turno_id uuid, p_motivo text) TO anon;
GRANT ALL ON FUNCTION public.reabrir_turno(p_turno_id uuid, p_motivo text) TO authenticated;
GRANT ALL ON FUNCTION public.reabrir_turno(p_turno_id uuid, p_motivo text) TO service_role;


--
-- Name: FUNCTION reactivar_pedido(p_pedido_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reactivar_pedido(p_pedido_id uuid) TO anon;
GRANT ALL ON FUNCTION public.reactivar_pedido(p_pedido_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.reactivar_pedido(p_pedido_id uuid) TO service_role;


--
-- Name: FUNCTION reactivar_reserva(p_reserva_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reactivar_reserva(p_reserva_id uuid) TO anon;
GRANT ALL ON FUNCTION public.reactivar_reserva(p_reserva_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.reactivar_reserva(p_reserva_id uuid) TO service_role;


--
-- Name: FUNCTION registrar_pago(p_categoria text, p_descripcion text, p_monto numeric, p_medio_pago text, p_estado text, p_fecha date, p_proveedor_id uuid, p_empleado_id uuid, p_subtipo text, p_periodo text, p_vencimiento date, p_comprobante text, p_notas text, p_origen text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_pago(p_categoria text, p_descripcion text, p_monto numeric, p_medio_pago text, p_estado text, p_fecha date, p_proveedor_id uuid, p_empleado_id uuid, p_subtipo text, p_periodo text, p_vencimiento date, p_comprobante text, p_notas text, p_origen text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrar_pago(p_categoria text, p_descripcion text, p_monto numeric, p_medio_pago text, p_estado text, p_fecha date, p_proveedor_id uuid, p_empleado_id uuid, p_subtipo text, p_periodo text, p_vencimiento date, p_comprobante text, p_notas text, p_origen text) TO anon;
GRANT ALL ON FUNCTION public.registrar_pago(p_categoria text, p_descripcion text, p_monto numeric, p_medio_pago text, p_estado text, p_fecha date, p_proveedor_id uuid, p_empleado_id uuid, p_subtipo text, p_periodo text, p_vencimiento date, p_comprobante text, p_notas text, p_origen text) TO authenticated;
GRANT ALL ON FUNCTION public.registrar_pago(p_categoria text, p_descripcion text, p_monto numeric, p_medio_pago text, p_estado text, p_fecha date, p_proveedor_id uuid, p_empleado_id uuid, p_subtipo text, p_periodo text, p_vencimiento date, p_comprobante text, p_notas text, p_origen text) TO service_role;


--
-- Name: FUNCTION reserva_webhook_whatsapp(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reserva_webhook_whatsapp() TO anon;
GRANT ALL ON FUNCTION public.reserva_webhook_whatsapp() TO authenticated;
GRANT ALL ON FUNCTION public.reserva_webhook_whatsapp() TO service_role;


--
-- Name: FUNCTION retirar_a_caja_fuerte(p_monto numeric, p_notas text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.retirar_a_caja_fuerte(p_monto numeric, p_notas text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.retirar_a_caja_fuerte(p_monto numeric, p_notas text) TO anon;
GRANT ALL ON FUNCTION public.retirar_a_caja_fuerte(p_monto numeric, p_notas text) TO authenticated;
GRANT ALL ON FUNCTION public.retirar_a_caja_fuerte(p_monto numeric, p_notas text) TO service_role;


--
-- Name: FUNCTION revertir_stock_produccion(p_stock_id uuid, p_cantidad numeric, p_notas text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.revertir_stock_produccion(p_stock_id uuid, p_cantidad numeric, p_notas text) TO anon;
GRANT ALL ON FUNCTION public.revertir_stock_produccion(p_stock_id uuid, p_cantidad numeric, p_notas text) TO authenticated;
GRANT ALL ON FUNCTION public.revertir_stock_produccion(p_stock_id uuid, p_cantidad numeric, p_notas text) TO service_role;


--
-- Name: FUNCTION revertir_tarea_produccion(p_tarea_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.revertir_tarea_produccion(p_tarea_id uuid) TO anon;
GRANT ALL ON FUNCTION public.revertir_tarea_produccion(p_tarea_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revertir_tarea_produccion(p_tarea_id uuid) TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION saldo_caja_fuerte(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.saldo_caja_fuerte() FROM PUBLIC;
GRANT ALL ON FUNCTION public.saldo_caja_fuerte() TO anon;
GRANT ALL ON FUNCTION public.saldo_caja_fuerte() TO authenticated;
GRANT ALL ON FUNCTION public.saldo_caja_fuerte() TO service_role;


--
-- Name: FUNCTION sentar_reserva(p_reserva_id uuid, p_mesa_id uuid, p_mozo_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sentar_reserva(p_reserva_id uuid, p_mesa_id uuid, p_mozo_id uuid) TO anon;
GRANT ALL ON FUNCTION public.sentar_reserva(p_reserva_id uuid, p_mesa_id uuid, p_mozo_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.sentar_reserva(p_reserva_id uuid, p_mesa_id uuid, p_mozo_id uuid) TO service_role;


--
-- Name: FUNCTION set_caja_turno_on_pago(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_caja_turno_on_pago() TO anon;
GRANT ALL ON FUNCTION public.set_caja_turno_on_pago() TO authenticated;
GRANT ALL ON FUNCTION public.set_caja_turno_on_pago() TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION siguiente_numero_comprobante(p_tipo_cbte integer, p_punto_venta integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.siguiente_numero_comprobante(p_tipo_cbte integer, p_punto_venta integer) TO anon;
GRANT ALL ON FUNCTION public.siguiente_numero_comprobante(p_tipo_cbte integer, p_punto_venta integer) TO authenticated;
GRANT ALL ON FUNCTION public.siguiente_numero_comprobante(p_tipo_cbte integer, p_punto_venta integer) TO service_role;


--
-- Name: FUNCTION slots_disponibles(p_fecha date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.slots_disponibles(p_fecha date) TO anon;
GRANT ALL ON FUNCTION public.slots_disponibles(p_fecha date) TO authenticated;
GRANT ALL ON FUNCTION public.slots_disponibles(p_fecha date) TO service_role;


--
-- Name: FUNCTION tiene_permiso(p_recurso text, p_accion text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.tiene_permiso(p_recurso text, p_accion text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.tiene_permiso(p_recurso text, p_accion text) TO anon;
GRANT ALL ON FUNCTION public.tiene_permiso(p_recurso text, p_accion text) TO authenticated;
GRANT ALL ON FUNCTION public.tiene_permiso(p_recurso text, p_accion text) TO service_role;


--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at() TO service_role;


--
-- Name: FUNCTION usuarios_por_rol(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.usuarios_por_rol() FROM PUBLIC;
GRANT ALL ON FUNCTION public.usuarios_por_rol() TO anon;
GRANT ALL ON FUNCTION public.usuarios_por_rol() TO authenticated;
GRANT ALL ON FUNCTION public.usuarios_por_rol() TO service_role;


--
-- Name: TABLE aperturas_especiales; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.aperturas_especiales TO anon;
GRANT ALL ON TABLE public.aperturas_especiales TO authenticated;
GRANT ALL ON TABLE public.aperturas_especiales TO service_role;


--
-- Name: TABLE arca_request_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.arca_request_log TO anon;
GRANT ALL ON TABLE public.arca_request_log TO authenticated;
GRANT ALL ON TABLE public.arca_request_log TO service_role;


--
-- Name: TABLE arca_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.arca_tokens TO anon;
GRANT ALL ON TABLE public.arca_tokens TO authenticated;
GRANT ALL ON TABLE public.arca_tokens TO service_role;


--
-- Name: TABLE caja_fuerte_movimientos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.caja_fuerte_movimientos TO anon;
GRANT ALL ON TABLE public.caja_fuerte_movimientos TO authenticated;
GRANT ALL ON TABLE public.caja_fuerte_movimientos TO service_role;


--
-- Name: TABLE caja_movimientos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.caja_movimientos TO anon;
GRANT ALL ON TABLE public.caja_movimientos TO authenticated;
GRANT ALL ON TABLE public.caja_movimientos TO service_role;


--
-- Name: TABLE caja_turnos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.caja_turnos TO anon;
GRANT ALL ON TABLE public.caja_turnos TO authenticated;
GRANT ALL ON TABLE public.caja_turnos TO service_role;


--
-- Name: TABLE caja_turnos_auditoria; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.caja_turnos_auditoria TO anon;
GRANT ALL ON TABLE public.caja_turnos_auditoria TO authenticated;
GRANT ALL ON TABLE public.caja_turnos_auditoria TO service_role;


--
-- Name: TABLE clientes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.clientes TO anon;
GRANT ALL ON TABLE public.clientes TO authenticated;
GRANT ALL ON TABLE public.clientes TO service_role;


--
-- Name: TABLE combo_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.combo_items TO anon;
GRANT ALL ON TABLE public.combo_items TO authenticated;
GRANT ALL ON TABLE public.combo_items TO service_role;


--
-- Name: TABLE combos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.combos TO anon;
GRANT ALL ON TABLE public.combos TO authenticated;
GRANT ALL ON TABLE public.combos TO service_role;


--
-- Name: TABLE comprobantes_afip; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comprobantes_afip TO anon;
GRANT ALL ON TABLE public.comprobantes_afip TO authenticated;
GRANT ALL ON TABLE public.comprobantes_afip TO service_role;


--
-- Name: TABLE comprobantes_fiscales; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comprobantes_fiscales TO anon;
GRANT ALL ON TABLE public.comprobantes_fiscales TO authenticated;
GRANT ALL ON TABLE public.comprobantes_fiscales TO service_role;


--
-- Name: TABLE comprobantes_fiscales_extendidos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comprobantes_fiscales_extendidos TO anon;
GRANT ALL ON TABLE public.comprobantes_fiscales_extendidos TO authenticated;
GRANT ALL ON TABLE public.comprobantes_fiscales_extendidos TO service_role;


--
-- Name: TABLE device_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.device_tokens TO anon;
GRANT ALL ON TABLE public.device_tokens TO authenticated;
GRANT ALL ON TABLE public.device_tokens TO service_role;


--
-- Name: TABLE egresos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.egresos TO anon;
GRANT ALL ON TABLE public.egresos TO authenticated;
GRANT ALL ON TABLE public.egresos TO service_role;


--
-- Name: TABLE empleados; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.empleados TO anon;
GRANT ALL ON TABLE public.empleados TO authenticated;
GRANT ALL ON TABLE public.empleados TO service_role;


--
-- Name: TABLE envio_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.envio_config TO anon;
GRANT ALL ON TABLE public.envio_config TO authenticated;
GRANT ALL ON TABLE public.envio_config TO service_role;


--
-- Name: TABLE envio_zonas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.envio_zonas TO anon;
GRANT ALL ON TABLE public.envio_zonas TO authenticated;
GRANT ALL ON TABLE public.envio_zonas TO service_role;


--
-- Name: TABLE escandallo; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.escandallo TO anon;
GRANT ALL ON TABLE public.escandallo TO authenticated;
GRANT ALL ON TABLE public.escandallo TO service_role;


--
-- Name: TABLE especial_pasos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.especial_pasos TO anon;
GRANT ALL ON TABLE public.especial_pasos TO authenticated;
GRANT ALL ON TABLE public.especial_pasos TO service_role;


--
-- Name: TABLE especiales; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.especiales TO anon;
GRANT ALL ON TABLE public.especiales TO authenticated;
GRANT ALL ON TABLE public.especiales TO service_role;


--
-- Name: TABLE facturacion_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.facturacion_config TO anon;
GRANT ALL ON TABLE public.facturacion_config TO authenticated;
GRANT ALL ON TABLE public.facturacion_config TO service_role;


--
-- Name: TABLE fichajes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fichajes TO anon;
GRANT ALL ON TABLE public.fichajes TO authenticated;
GRANT ALL ON TABLE public.fichajes TO service_role;


--
-- Name: TABLE impresion_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.impresion_config TO anon;
GRANT ALL ON TABLE public.impresion_config TO authenticated;
GRANT ALL ON TABLE public.impresion_config TO service_role;


--
-- Name: TABLE impresiones_documentos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.impresiones_documentos TO anon;
GRANT ALL ON TABLE public.impresiones_documentos TO authenticated;
GRANT ALL ON TABLE public.impresiones_documentos TO service_role;


--
-- Name: TABLE ingredientes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ingredientes TO anon;
GRANT ALL ON TABLE public.ingredientes TO authenticated;
GRANT ALL ON TABLE public.ingredientes TO service_role;


--
-- Name: TABLE lista_espera; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lista_espera TO anon;
GRANT ALL ON TABLE public.lista_espera TO authenticated;
GRANT ALL ON TABLE public.lista_espera TO service_role;


--
-- Name: TABLE menu_item_variantes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu_item_variantes TO anon;
GRANT ALL ON TABLE public.menu_item_variantes TO authenticated;
GRANT ALL ON TABLE public.menu_item_variantes TO service_role;


--
-- Name: TABLE menu_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu_items TO anon;
GRANT ALL ON TABLE public.menu_items TO authenticated;
GRANT ALL ON TABLE public.menu_items TO service_role;


--
-- Name: TABLE mermas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mermas TO anon;
GRANT ALL ON TABLE public.mermas TO authenticated;
GRANT ALL ON TABLE public.mermas TO service_role;


--
-- Name: TABLE mesas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mesas TO anon;
GRANT ALL ON TABLE public.mesas TO authenticated;
GRANT ALL ON TABLE public.mesas TO service_role;


--
-- Name: TABLE mozos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mozos TO anon;
GRANT ALL ON TABLE public.mozos TO authenticated;
GRANT ALL ON TABLE public.mozos TO service_role;


--
-- Name: TABLE notificaciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notificaciones TO anon;
GRANT ALL ON TABLE public.notificaciones TO authenticated;
GRANT ALL ON TABLE public.notificaciones TO service_role;


--
-- Name: TABLE pagos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pagos TO anon;
GRANT ALL ON TABLE public.pagos TO authenticated;
GRANT ALL ON TABLE public.pagos TO service_role;


--
-- Name: TABLE pagos_arqueo; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pagos_arqueo TO anon;
GRANT ALL ON TABLE public.pagos_arqueo TO authenticated;
GRANT ALL ON TABLE public.pagos_arqueo TO service_role;


--
-- Name: TABLE pedido_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pedido_items TO anon;
GRANT ALL ON TABLE public.pedido_items TO authenticated;
GRANT ALL ON TABLE public.pedido_items TO service_role;


--
-- Name: SEQUENCE pedidos_numero_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.pedidos_numero_seq TO anon;
GRANT ALL ON SEQUENCE public.pedidos_numero_seq TO authenticated;
GRANT ALL ON SEQUENCE public.pedidos_numero_seq TO service_role;


--
-- Name: TABLE produccion_listas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.produccion_listas TO anon;
GRANT ALL ON TABLE public.produccion_listas TO authenticated;
GRANT ALL ON TABLE public.produccion_listas TO service_role;


--
-- Name: TABLE produccion_tareas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.produccion_tareas TO anon;
GRANT ALL ON TABLE public.produccion_tareas TO authenticated;
GRANT ALL ON TABLE public.produccion_tareas TO service_role;


--
-- Name: TABLE productos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.productos TO anon;
GRANT ALL ON TABLE public.productos TO authenticated;
GRANT ALL ON TABLE public.productos TO service_role;


--
-- Name: TABLE proveedores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.proveedores TO anon;
GRANT ALL ON TABLE public.proveedores TO authenticated;
GRANT ALL ON TABLE public.proveedores TO service_role;


--
-- Name: TABLE puntos_fichaje; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.puntos_fichaje TO anon;
GRANT ALL ON TABLE public.puntos_fichaje TO authenticated;
GRANT ALL ON TABLE public.puntos_fichaje TO service_role;


--
-- Name: TABLE receta_ingredientes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.receta_ingredientes TO anon;
GRANT ALL ON TABLE public.receta_ingredientes TO authenticated;
GRANT ALL ON TABLE public.receta_ingredientes TO service_role;


--
-- Name: TABLE recetas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recetas TO anon;
GRANT ALL ON TABLE public.recetas TO authenticated;
GRANT ALL ON TABLE public.recetas TO service_role;


--
-- Name: TABLE recurso_tablas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recurso_tablas TO anon;
GRANT ALL ON TABLE public.recurso_tablas TO authenticated;
GRANT ALL ON TABLE public.recurso_tablas TO service_role;


--
-- Name: TABLE recursos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recursos TO anon;
GRANT ALL ON TABLE public.recursos TO authenticated;
GRANT ALL ON TABLE public.recursos TO service_role;


--
-- Name: TABLE reservas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reservas TO anon;
GRANT ALL ON TABLE public.reservas TO authenticated;
GRANT ALL ON TABLE public.reservas TO service_role;


--
-- Name: TABLE reservas_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reservas_config TO anon;
GRANT ALL ON TABLE public.reservas_config TO authenticated;
GRANT ALL ON TABLE public.reservas_config TO service_role;


--
-- Name: TABLE reservas_dias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reservas_dias TO anon;
GRANT ALL ON TABLE public.reservas_dias TO authenticated;
GRANT ALL ON TABLE public.reservas_dias TO service_role;


--
-- Name: TABLE rol_permisos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rol_permisos TO anon;
GRANT ALL ON TABLE public.rol_permisos TO authenticated;
GRANT ALL ON TABLE public.rol_permisos TO service_role;


--
-- Name: TABLE roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.roles TO anon;
GRANT ALL ON TABLE public.roles TO authenticated;
GRANT ALL ON TABLE public.roles TO service_role;


--
-- Name: TABLE salones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.salones TO anon;
GRANT ALL ON TABLE public.salones TO authenticated;
GRANT ALL ON TABLE public.salones TO service_role;


--
-- Name: TABLE stock; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stock TO anon;
GRANT ALL ON TABLE public.stock TO authenticated;
GRANT ALL ON TABLE public.stock TO service_role;


--
-- Name: TABLE stock_movimientos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stock_movimientos TO anon;
GRANT ALL ON TABLE public.stock_movimientos TO authenticated;
GRANT ALL ON TABLE public.stock_movimientos TO service_role;


--
-- Name: TABLE tipos_comprobante; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tipos_comprobante TO anon;
GRANT ALL ON TABLE public.tipos_comprobante TO authenticated;
GRANT ALL ON TABLE public.tipos_comprobante TO service_role;


--
-- Name: TABLE turnos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.turnos TO anon;
GRANT ALL ON TABLE public.turnos TO authenticated;
GRANT ALL ON TABLE public.turnos TO service_role;


--
-- Name: TABLE turnos_caja; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.turnos_caja TO anon;
GRANT ALL ON TABLE public.turnos_caja TO authenticated;
GRANT ALL ON TABLE public.turnos_caja TO service_role;


--
-- Name: TABLE v_alertas_stock; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_alertas_stock TO anon;
GRANT ALL ON TABLE public.v_alertas_stock TO authenticated;
GRANT ALL ON TABLE public.v_alertas_stock TO service_role;


--
-- Name: TABLE v_kpis_dia; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_kpis_dia TO anon;
GRANT ALL ON TABLE public.v_kpis_dia TO authenticated;
GRANT ALL ON TABLE public.v_kpis_dia TO service_role;


--
-- Name: TABLE v_mesas_estado; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_mesas_estado TO anon;
GRANT ALL ON TABLE public.v_mesas_estado TO authenticated;
GRANT ALL ON TABLE public.v_mesas_estado TO service_role;


--
-- Name: TABLE vista_jornadas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vista_jornadas TO anon;
GRANT ALL ON TABLE public.vista_jornadas TO authenticated;
GRANT ALL ON TABLE public.vista_jornadas TO service_role;


--
-- Name: TABLE web_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.web_config TO anon;
GRANT ALL ON TABLE public.web_config TO authenticated;
GRANT ALL ON TABLE public.web_config TO service_role;


--
-- Name: TABLE webhook_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.webhook_config TO anon;
GRANT ALL ON TABLE public.webhook_config TO authenticated;
GRANT ALL ON TABLE public.webhook_config TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

-- (limpiado) \unrestrict nYz45lZyIg5UhSvd2njM7t1Fj5oS4mtLRulBQ0QNeFhIbrsphOyTzfySbLUfESg

