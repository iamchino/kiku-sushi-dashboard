-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Horarios de reserva configurables + experiencias dinámicas
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta ahora, qué experiencias se podían reservar, en qué días y en qué
-- horarios estaba HARDCODEADO en tres lugares a la vez: el form web, esta
-- función crear_reserva, y un CHECK en la tabla reservas. Por eso un especial
-- borrado del dashboard (ej. "Pasta Nikkei") seguía apareciendo en el form, y
-- no había forma de agregar un turno de mediodía sin tocar código.
--
-- Esta migración mueve esas reglas a datos que el dashboard, el form web y esta
-- misma función leen:
--
--   • reservas_config (fila única): los turnos (slots) de cada franja
--       - mediodia_slots       : horarios de mediodía          (nuevo)
--       - noche_slots          : horarios de noche con mesa
--       - orden_llegada_slots  : horarios de noche por orden de llegada
--   • reservas_dias (7 filas, dow 0=Dom..6=Sáb): qué franjas abre cada día
--       - mediodia / noche : booleanos. El día "abre" si alguno es true.
--   • especiales.dias (int[]): en qué días de la semana se ofrece cada especial
--       rotativo. Vacío = cualquier día abierto.
--
-- Experiencias FIJAS (siempre disponibles, no dependen de la lista de
-- especiales): carta_abierta, omakase, kiku_libre. Sus días siguen definidos
-- acá (son estables). El resto sale de la tabla especiales: si se desactiva un
-- especial, deja de ser reservable.
--
-- Se preserva intacta la lógica de CUPOS y el alta de cliente en el CRM.
--
-- Idempotente. Correr después de 20260623000000_reservas_cupos_v2.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) reservas_config: los turnos de cada franja ───────────────────────────
create table if not exists public.reservas_config (
  id                   integer primary key default 1,
  mediodia_slots       text[]  not null default array['12:30','13:00','13:30','14:00','14:30','15:00'],
  noche_slots          text[]  not null default array['20:00','20:30','21:00','21:30','22:00'],
  orden_llegada_slots  text[]  not null default array['22:30','23:00'],
  updated_at           timestamptz not null default now(),
  constraint reservas_config_singleton check (id = 1)
);

insert into public.reservas_config (id) values (1) on conflict (id) do nothing;

comment on table public.reservas_config is
  'Turnos de reserva por franja (fila única id=1). Editable desde el dashboard → Configuración → Reservas.';
comment on column public.reservas_config.mediodia_slots is
  'Horarios de mediodía disponibles para reservar, como "HH:MM". Ej: {12:30,13:00,...}.';
comment on column public.reservas_config.noche_slots is
  'Horarios de noche con mesa asignada.';
comment on column public.reservas_config.orden_llegada_slots is
  'Horarios de noche que se toman por orden de llegada (sin mesa fija).';

-- ── 2) reservas_dias: qué franjas abre cada día de la semana ────────────────
create table if not exists public.reservas_dias (
  dow       integer primary key check (dow between 0 and 6),  -- 0=Dom .. 6=Sáb
  mediodia  boolean not null default false,
  noche     boolean not null default false
);

comment on table public.reservas_dias is
  'Franjas habilitadas por día de la semana (dow 0=Dom..6=Sáb). El día abre si mediodia o noche es true. Editable desde Configuración → Reservas.';

-- Seed = horario vigente + el mediodía que pidió el local (miércoles y sábado).
-- Noche: martes a sábado (2..6). Mediodía: miércoles (3) y sábado (6).
insert into public.reservas_dias (dow, mediodia, noche) values
  (0, false, false),   -- Domingo: cerrado
  (1, false, false),   -- Lunes: cerrado
  (2, false, true),    -- Martes: noche
  (3, true,  true),    -- Miércoles: mediodía + noche
  (4, false, true),    -- Jueves: noche
  (5, false, true),    -- Viernes: noche
  (6, true,  true)     -- Sábado: mediodía + noche
on conflict (dow) do nothing;

-- ── 3) especiales.dias: en qué días se ofrece cada especial rotativo ────────
alter table public.especiales
  add column if not exists dias int[] not null default '{}';

comment on column public.especiales.dias is
  'Días de la semana en que se ofrece el especial (0=Dom..6=Sáb). Vacío = cualquier día abierto. Define en qué fechas aparece en el form de reservas.';

-- Seed: los especiales rotativos actuales se ofrecían los martes.
update public.especiales
   set dias = array[2]
 where experiencia in ('umami_del_sur', 'pacifico_y_patagonia')
   and (dias is null or dias = '{}');

-- ── 4) RLS de las tablas nuevas: lectura pública, escritura solo admin ──────
alter table public.reservas_config enable row level security;
alter table public.reservas_dias   enable row level security;

drop policy if exists "reservas_config lectura publica" on public.reservas_config;
create policy "reservas_config lectura publica"
  on public.reservas_config for select to anon, authenticated using (true);

drop policy if exists "reservas_config admin escribe" on public.reservas_config;
create policy "reservas_config admin escribe"
  on public.reservas_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "reservas_dias lectura publica" on public.reservas_dias;
create policy "reservas_dias lectura publica"
  on public.reservas_dias for select to anon, authenticated using (true);

drop policy if exists "reservas_dias admin escribe" on public.reservas_dias;
create policy "reservas_dias admin escribe"
  on public.reservas_dias for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── 5) Helper: ¿la experiencia se ofrece ese día de la semana? ──────────────
-- Centraliza la regla día↔experiencia. La usan crear_reserva (server) y, por
-- reflejo, el form web (que arma la misma lógica en JS con los mismos datos).
create or replace function public.kiku_experiencia_en_dia(p_experiencia text, p_dow int)
returns boolean
language sql stable
security definer
set search_path = public, pg_temp
as $$
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

grant execute on function public.kiku_experiencia_en_dia(text, int) to anon, authenticated;

-- ── 6) crear_reserva: valida día/experiencia/turno desde los datos ──────────
-- Misma firma y misma lógica de CUPOS y CRM que 20260623000000. Cambian solo
-- las validaciones de experiencia, día y horario, que ahora leen las tablas.
do $$
declare v_sig text;
begin
  for v_sig in
    select format('public.crear_reserva(%s)', pg_get_function_identity_arguments(p.oid))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'crear_reserva'
  loop
    execute format('drop function if exists %s', v_sig);
  end loop;
end $$;

create function public.crear_reserva(
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

grant execute on function public.crear_reserva(
  date, time, integer, text, text, text, text, text, integer, boolean, text, text, text, date, boolean
) to anon, authenticated;

comment on function public.crear_reserva(
  date, time, integer, text, text, text, text, text, integer, boolean, text, text, text, date, boolean
) is
  'Crea una reserva validando experiencia, día y turno contra reservas_dias/reservas_config/especiales (canal web/whatsapp), más cupo por día. Staff (dashboard/telefono) sin restricción de día/horario.';

-- ── 7) Soltar el CHECK rígido de tipo_experiencia ───────────────────────────
-- Listaba 5 valores fijos; ahora la validez la decide crear_reserva contra la
-- tabla especiales, así que un especial nuevo ya no rompe. Reservas de staff
-- (dashboard) tampoco quedan atadas a la lista vieja.
alter table public.reservas
  drop constraint if exists reservas_tipo_experiencia_check;

notify pgrst, 'reload schema';
