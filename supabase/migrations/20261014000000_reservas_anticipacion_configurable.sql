-- ════════════════════════════════════════════════════════════════════════════
-- RESERVAS — Anticipación mínima configurable (y sin las "2 horas" fijas)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pedido del local: que se pueda reservar sin el mínimo de 2 horas, y que
-- eso se maneje desde el dashboard. Dos cosas:
--
-- 1) reservas_config.anticipacion_min_minutos (default 0 = sin mínimo) y
--    anticipacion_max_dias (default 30). Se editan en Configuración → Reservas.
--    La web los lee para no ofrecer horarios que ya no se pueden reservar.
--
-- 2) Bug de zona horaria en crear_reserva: la fecha+hora pedida (hora de
--    Argentina) se comparaba con now() como si fuera UTC. Como el servidor
--    está en UTC, "2 horas de anticipación" eran en la práctica 5 horas: a las
--    18:00 no se podía reservar para las 20:00. Ahora el instante se arma en
--    America/Argentina/Buenos_Aires. Con mínimo 0 solo se rechaza un horario
--    que ya pasó.
--
-- Misma firma, misma lógica de cupos, experiencias, días, turnos y CRM que
-- 20260718000000 (solo cambia el bloque de anticipación). Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.reservas_config
  add column if not exists anticipacion_min_minutos integer not null default 0
    check (anticipacion_min_minutos between 0 and 1440),
  add column if not exists anticipacion_max_dias integer not null default 30
    check (anticipacion_max_dias between 1 and 365);

comment on column public.reservas_config.anticipacion_min_minutos is
  'Minutos mínimos entre el momento de reservar (web) y el turno. 0 = sin mínimo (solo se rechaza un horario pasado). Configuración → Reservas.';
comment on column public.reservas_config.anticipacion_max_dias is
  'Hasta cuántos días adelante se puede reservar por la web. Configuración → Reservas.';

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

grant execute on function public.crear_reserva(
  date, time, integer, text, text, text, text, text, integer, boolean, text, text, text, date, boolean
) to anon, authenticated;

notify pgrst, 'reload schema';
