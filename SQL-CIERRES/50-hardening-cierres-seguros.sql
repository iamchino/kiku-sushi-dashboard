-- ════════════════════════════════════════════════════════════════════════════
-- 50 — HARDENING capa 3a: cierres seguros (no cambian lo que ve nadie del local)
-- Correr después del diagnóstico 49. Idempotente. De día, antes del servicio.
--
-- 1) Las funciones nuevas dejan de ser ejecutables por anon/public por defecto.
-- 2) Se revoca anon en las funciones que lo tenían por ese default.
-- 3) kiku_upsert_cliente_marketing deja de ser llamable desde el front.
-- 4) crear_reserva y crear_lista_espera: anon no elige origen ni autoconfirma;
--    lista de espera con largos, fecha y freno por abuso.
-- 5) web_config.banco_cuenta se vacía (ya vive en cuentas_negocio; anon la leía).
-- 6) notificaciones: solo usuarios con rol (antes cualquiera logueado).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Default privileges: nada nuevo queda abierto a anon ───────────────────
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- ── 2) Lo que quedó abierto por ese default ───────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and has_function_privilege('anon', p.oid, 'execute')
       and p.proname not in ('crear_pedido_web', 'crear_reserva', 'crear_lista_espera', 'slots_disponibles')
  loop
    execute format('revoke execute on function %s from anon, public', r.firma);
    raise notice 'anon ya no ejecuta %', r.firma;
  end loop;
end $$;

-- ── 3) Función interna: solo la llaman otras funciones (security definer) ────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'kiku_upsert_cliente_marketing'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.firma);
  end loop;
end $$;

-- ── 4) RPCs públicas con guarda para anon ─────────────────────────────────────
create or replace function public.crear_reserva(
  p_fecha             date,
  p_hora              time,
  p_personas          integer,
  p_cliente_nombre    text,
  p_cliente_telefono  text    default null,
  p_cliente_email     text    default null,
  p_notas             text    default null,
  p_origen            text    default 'web',
  p_duracion_min      integer default 90,
  p_auto_confirmar    boolean default true,
  p_restricciones     text    default null,
  p_accesibilidad     text    default null,
  p_tipo_experiencia  text    default null,
  p_cliente_cumple    date    default null,
  p_acepta_marketing  boolean default false
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id               uuid;
  v_combined_ts      timestamp;
  v_min_anticip      interval;
  v_max_anticip      interval;
  v_ts               timestamptz;
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
  -- Hardening 01/11/2026: lo que viene de la web (anon) no elige su origen
  -- ni si se autoconfirma: eso lo decide el local. Antes, mandando
  -- p_origen = 'dashboard' desde el navegador se salteaban día, horario,
  -- cupo y anticipación.
  if auth.role() = 'anon' or public.current_app_role() is null then
    p_origen := 'web';
    p_auto_confirmar := true;
    p_duracion_min := 90;
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
  -- La fecha y hora pedidas son hora de Argentina. Antes se comparaban como
  -- si fueran UTC (el servidor está en UTC): el "mínimo de 2 horas" exigía en
  -- la práctica 5 horas. Ahora el instante se arma en la zona correcta.
  v_ts := v_combined_ts at time zone 'America/Argentina/Buenos_Aires';

  if p_origen in ('web', 'whatsapp') then
    -- Anticipación configurable desde Configuración → Reservas.
    -- 0 minutos = sin mínimo (solo se rechaza un horario que ya pasó).
    v_min_anticip := make_interval(mins => coalesce(v_cfg.anticipacion_min_minutos, 0));
    v_max_anticip := make_interval(days => coalesce(v_cfg.anticipacion_max_dias, 30));
    if v_ts < now() then
      raise exception 'Ese horario ya pasó. Elegí uno más adelante.';
    end if;
    if v_ts < (now() + v_min_anticip) then
      raise exception 'La reserva debe ser con al menos % de anticipación',
        case when coalesce(v_cfg.anticipacion_min_minutos, 0) >= 60
             then (coalesce(v_cfg.anticipacion_min_minutos, 0) / 60)::text || ' hora(s)'
             else coalesce(v_cfg.anticipacion_min_minutos, 0)::text || ' minutos' end;
    end if;
    if v_ts > (now() + v_max_anticip) then
      raise exception 'No se pueden hacer reservas con más de % días de anticipación',
        coalesce(v_cfg.anticipacion_max_dias, 30);
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

create or replace function public.crear_lista_espera(p_fecha date, p_personas integer, p_cliente_nombre text, p_cliente_telefono text DEFAULT NULL::text, p_hora time without time zone DEFAULT NULL::time without time zone, p_cliente_email text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_tipo_experiencia text DEFAULT NULL::text, p_origen text DEFAULT 'web'::text) RETURNS uuid
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
  -- Hardening 01/11/2026: largos acotados, sin fechas pasadas, origen
  -- forzado para anon y freno por abuso (5 por teléfono cada 10 minutos,
  -- igual que crear_pedido_web).
  if length(btrim(p_cliente_nombre)) > 120 then raise exception 'Nombre demasiado largo'; end if;
  if length(coalesce(p_cliente_telefono, '')) > 40 then raise exception 'Teléfono demasiado largo'; end if;
  if length(coalesce(p_cliente_email, '')) > 160 then raise exception 'Email demasiado largo'; end if;
  if length(coalesce(p_notas, '')) > 500 then raise exception 'Las notas no pueden superar los 500 caracteres'; end if;
  if p_personas > 40 then raise exception 'Cantidad de personas inválida'; end if;
  if p_fecha < current_date then raise exception 'La fecha ya pasó'; end if;
  if auth.role() = 'anon' or public.current_app_role() is null then
    p_origen := 'web';
    if coalesce(btrim(p_cliente_telefono), '') <> '' and (
      select count(*) from public.lista_espera le
       where le.cliente_telefono = btrim(p_cliente_telefono)
         and le.created_at > now() - interval '10 minutes') >= 5 then
      raise exception 'Demasiados pedidos seguidos. Probá de nuevo en unos minutos.';
    end if;
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

revoke execute on function public.crear_lista_espera(date, integer, text, text, time, text, text, text, text) from public;
grant execute on function public.crear_lista_espera(date, integer, text, text, time, text, text, text, text) to anon, authenticated, service_role;

-- ── 5) web_config: la etiqueta de la cuenta ya vive en cuentas_negocio ───────
update public.web_config set banco_cuenta = null where id = 1 and banco_cuenta is not null;
comment on column public.web_config.banco_cuenta is
  'OBSOLETA desde 20/10/2026 (cuentas_negocio). Se dejó en null porque la tabla es legible por anon.';

-- ── 6) notificaciones: lectura solo con rol ───────────────────────────────────
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'notificaciones'
       and cmd = 'SELECT' and (qual = 'true' or qual ilike '%auth.role()%')
  loop
    execute format('drop policy %I on public.notificaciones', r.policyname);
    raise notice 'policy borrada: notificaciones.%', r.policyname;
  end loop;
end $$;
drop policy if exists "notificaciones lectura con rol" on public.notificaciones;
create policy "notificaciones lectura con rol"
  on public.notificaciones for select to authenticated
  using (public.current_app_role() is not null);

notify pgrst, 'reload schema';

-- Verificación: anon solo debe ejecutar las 4 funciones públicas.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1;
