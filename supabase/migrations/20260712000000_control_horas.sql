-- ============================================================
-- Migración: Control de Horas y Fichaje (QR fijo + geocerca)
--
--   * empleados       → +user_id (vínculo con el login de Supabase)
--                       (el valor hora YA existe: sueldo_base cuando
--                        tipo_sueldo = 'hora' — migración 20260711)
--   * puntos_fichaje  → el/los QR fijos del local, con geocerca
--                       (lat/lng/radio_m) para validar presencia física
--   * fichajes        → log inmutable de marcas (entrada/salida)
--   * turnos          → turnos de referencia (fase futura, no bloquea)
--   * vista_jornadas  → empareja entrada→salida y calcula minutos
--                       (redondeo a bloques de 30 min, al más cercano)
--   * liquidaciones   → cierres SEMANALES (martes → lunes) con estado
--                       pendiente | pagado ("en curso" = semana actual,
--                       se calcula en el front, no se persiste)
--   * fichar()        → RPC que registra una marca de forma segura
--                       (login + token QR + geocerca + anti doble-scan)
--   * liquidacion_horas()          → horas y $ por empleado en un rango
--   * generar_liquidacion_semanal()→ materializa la semana en liquidaciones
--
-- Add-only: no toca datos existentes. Usa helpers ya presentes:
-- is_finanzas_user() y set_updated_at().
-- RLS: Finanzas administra TODO; el empleado solo lee/crea lo suyo.
-- ============================================================

-- ── 1) EMPLEADOS: vínculo con el login ───────────────────────────────────────
alter table public.empleados
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists empleados_user_id_uidx
  on public.empleados (user_id) where user_id is not null;

comment on column public.empleados.user_id is
  'Usuario de auth vinculado. El fichaje se registra siempre a nombre de este usuario.';

-- El empleado puede leer SOLO su propia ficha (para ver nombre y valor hora).
-- La política "empleados finanzas manage" (FOR ALL) ya existe y se conserva.
drop policy if exists "empleados self read" on public.empleados;
create policy "empleados self read"
  on public.empleados
  for select
  to authenticated
  using (user_id = auth.uid());

-- ── 2) PUNTOS DE FICHAJE (QR fijos del local, con geocerca) ──────────────────
create table if not exists public.puntos_fichaje (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,                    -- 'Puerta local', 'Cocina', etc.
  token      text not null unique,             -- lo que codifica el QR
  lat        double precision,                 -- geocerca: centro
  lng        double precision,
  radio_m    integer not null default 100 check (radio_m between 10 and 1000),
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.puntos_fichaje is
  'QR fijos del local. Si lat/lng están seteados, fichar() exige estar dentro del radio (geocerca).';

alter table public.puntos_fichaje enable row level security;

drop policy if exists "puntos finanzas manage" on public.puntos_fichaje;
create policy "puntos finanzas manage"
  on public.puntos_fichaje
  for all
  to authenticated
  using (public.is_finanzas_user())
  with check (public.is_finanzas_user());

-- Semilla: un punto por defecto con token aleatorio (sin geocerca hasta que
-- Finanzas capture la ubicación del local desde la página Personal).
insert into public.puntos_fichaje (nombre, token)
select 'Puerta local', encode(gen_random_bytes(12), 'hex')
where not exists (select 1 from public.puntos_fichaje);

-- ── 3) FICHAJES (log inmutable de marcas) ────────────────────────────────────
create table if not exists public.fichajes (
  id             uuid primary key default gen_random_uuid(),
  empleado_id    uuid not null references public.empleados(id) on delete cascade,
  tipo           text not null check (tipo in ('entrada','salida')),
  ts             timestamptz not null default now(),
  punto_id       uuid references public.puntos_fichaje(id) on delete set null,
  origen         text not null default 'qr' check (origen in ('qr','manual')),
  lat            double precision,              -- ubicación reportada al fichar
  lng            double precision,
  precision_m    double precision,              -- accuracy del GPS
  distancia_m    integer,                       -- distancia al punto (auditoría)
  nota           text,
  registrado_por uuid default auth.uid(),       -- quién creó/corrigió la marca
  created_at     timestamptz not null default now()
);

create index if not exists fichajes_empleado_ts_idx
  on public.fichajes (empleado_id, ts desc);

create index if not exists fichajes_ts_idx
  on public.fichajes (ts desc);

alter table public.fichajes enable row level security;

-- Finanzas administra todo (ver/crear/corregir/borrar).
drop policy if exists "fichajes finanzas manage" on public.fichajes;
create policy "fichajes finanzas manage"
  on public.fichajes
  for all
  to authenticated
  using (public.is_finanzas_user())
  with check (public.is_finanzas_user());

-- El empleado puede LEER solo sus propias marcas (las crea vía fichar()).
drop policy if exists "fichajes self read" on public.fichajes;
create policy "fichajes self read"
  on public.fichajes
  for select
  to authenticated
  using (empleado_id in (select id from public.empleados where user_id = auth.uid()));

-- ── 4) TURNOS de referencia (mixto, no bloqueante — UI en fase futura) ───────
create table if not exists public.turnos (
  id          uuid primary key default gen_random_uuid(),
  empleado_id uuid references public.empleados(id) on delete cascade,
  dia_semana  smallint check (dia_semana between 0 and 6),  -- 0=domingo … 6=sábado
  hora_inicio time not null,
  hora_fin    time not null,
  activo      boolean not null default true,
  nota        text,
  created_at  timestamptz not null default now()
);

alter table public.turnos enable row level security;

drop policy if exists "turnos finanzas manage" on public.turnos;
create policy "turnos finanzas manage"
  on public.turnos
  for all
  to authenticated
  using (public.is_finanzas_user())
  with check (public.is_finanzas_user());

drop policy if exists "turnos self read" on public.turnos;
create policy "turnos self read"
  on public.turnos
  for select
  to authenticated
  using (empleado_id in (select id from public.empleados where user_id = auth.uid()));

-- ── 5) VISTA_JORNADAS: empareja cada 'entrada' con la 'salida' siguiente ─────
-- security_invoker: la vista respeta el RLS de fichajes (el empleado solo ve
-- sus jornadas; Finanzas ve todas).
-- Redondeo acordado: bloques de 30 min AL MÁS CERCANO por jornada
-- (4h14m → 4h00m · 4h16m → 4h30m).
create or replace view public.vista_jornadas
with (security_invoker = on) as
with ordenados as (
  select
    empleado_id,
    tipo,
    ts,
    lead(tipo) over (partition by empleado_id order by ts, created_at) as sig_tipo,
    lead(ts)   over (partition by empleado_id order by ts, created_at) as sig_ts
  from public.fichajes
)
select
  empleado_id,
  ts     as entrada,
  sig_ts as salida,
  round(extract(epoch from (sig_ts - ts)) / 60.0)::int as minutos_reales,
  (round((extract(epoch from (sig_ts - ts)) / 60.0) / 30.0) * 30)::int as minutos
from ordenados
where tipo = 'entrada' and (sig_tipo is null or sig_tipo = 'salida');

comment on view public.vista_jornadas is
  'Jornadas derivadas del log de fichajes. minutos = redondeo a bloques de 30 min (más cercano); salida null = jornada abierta.';

grant select on public.vista_jornadas to authenticated;

-- ── 6) fichar(token, lat, lng, precision): registra una marca segura ─────────
create or replace function public.fichar(
  p_token       text,
  p_lat         double precision default null,
  p_lng         double precision default null,
  p_precision_m double precision default null
)
returns table (fichaje_id uuid, tipo text, ts timestamptz, mensaje text)
language plpgsql
security definer
set search_path = public
as $$
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

grant execute on function public.fichar(text, double precision, double precision, double precision) to authenticated;

-- ── 7) LIQUIDACIONES semanales (martes → lunes) con estado ───────────────────
create table if not exists public.liquidaciones (
  id            uuid primary key default gen_random_uuid(),
  empleado_id   uuid not null references public.empleados(id) on delete cascade,
  semana_inicio date not null,                  -- siempre un MARTES
  semana_fin    date not null,                  -- lunes siguiente (inicio + 6)
  minutos       integer       not null default 0,
  horas         numeric(10,2) not null default 0,
  valor_hora    numeric(12,2) not null default 0,
  total         numeric(12,2) not null default 0,
  estado        text not null default 'pendiente' check (estado in ('pendiente','pagado')),
  egreso_id     uuid references public.egresos(id) on delete set null,
  pagado_at     timestamptz,
  nota          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (empleado_id, semana_inicio)
);

comment on table public.liquidaciones is
  'Cierre semanal de horas por empleado (semana martes→lunes). La semana actual no se persiste: es "en curso" en el front.';

create index if not exists liquidaciones_semana_idx
  on public.liquidaciones (semana_inicio desc, estado);

drop trigger if exists liquidaciones_set_updated_at on public.liquidaciones;
create trigger liquidaciones_set_updated_at
  before update on public.liquidaciones
  for each row execute function public.set_updated_at();

alter table public.liquidaciones enable row level security;

drop policy if exists "liquidaciones finanzas manage" on public.liquidaciones;
create policy "liquidaciones finanzas manage"
  on public.liquidaciones
  for all
  to authenticated
  using (public.is_finanzas_user())
  with check (public.is_finanzas_user());

-- El empleado ve sus propias liquidaciones (sabe si su semana está paga).
drop policy if exists "liquidaciones self read" on public.liquidaciones;
create policy "liquidaciones self read"
  on public.liquidaciones
  for select
  to authenticated
  using (empleado_id in (select id from public.empleados where user_id = auth.uid()));

-- ── 8) liquidacion_horas(desde, hasta): horas y pago por empleado ────────────
-- Solo jornadas CERRADAS (salida no nula), agrupadas por fecha de ENTRADA
-- (los turnos que cruzan medianoche cuentan en el día que empezaron).
-- valor_hora = sueldo_base cuando tipo_sueldo = 'hora'; para 'fijo' el total
-- queda en 0 (sus horas son informativas, el sueldo se paga por Finanzas).
create or replace function public.liquidacion_horas(p_desde date, p_hasta date)
returns table (
  empleado_id uuid,
  nombre      text,
  tipo_sueldo text,
  minutos     int,
  horas       numeric,
  valor_hora  numeric,
  total       numeric
)
language sql
stable
as $$
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
    -- el día se corta con hora ARGENTINA (la BD corre en UTC): un turno que
    -- entra 22:00 del lunes pertenece al lunes, no al martes UTC
    and (j.entrada at time zone 'America/Argentina/Buenos_Aires')::date
        between p_desde and p_hasta
  where e.activo
  group by e.id, e.nombre, e.apellido, e.tipo_sueldo, e.sueldo_base
  order by 2;
$$;

grant execute on function public.liquidacion_horas(date, date) to authenticated;

-- ── 9) generar_liquidacion_semanal(fecha): cierra la semana martes→lunes ─────
-- Recibe cualquier fecha de la semana a liquidar; la normaliza al MARTES.
-- Crea/actualiza filas 'pendiente' para empleados por hora con minutos > 0.
-- Las filas ya PAGADAS no se tocan.
create or replace function public.generar_liquidacion_semanal(p_fecha date)
returns setof public.liquidaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio date;
  v_fin    date;
begin
  if not public.is_finanzas_user() then
    raise exception 'Solo el usuario de Finanzas puede generar liquidaciones.';
  end if;

  -- normalizar al martes de esa semana (date_trunc('week') da lunes ISO)
  v_inicio := (date_trunc('week', (p_fecha - 1)::timestamp))::date + 1;
  v_fin    := v_inicio + 6;   -- lunes siguiente

  return query
  insert into public.liquidaciones as l
    (empleado_id, semana_inicio, semana_fin, minutos, horas, valor_hora, total, estado)
  select
    lh.empleado_id, v_inicio, v_fin, lh.minutos, lh.horas, lh.valor_hora, lh.total, 'pendiente'
  from public.liquidacion_horas(v_inicio, v_fin) lh
  where lh.tipo_sueldo = 'hora' and lh.minutos > 0
  on conflict (empleado_id, semana_inicio) do update
    set minutos    = excluded.minutos,
        horas      = excluded.horas,
        valor_hora = excluded.valor_hora,
        total      = excluded.total,
        semana_fin = excluded.semana_fin
    where l.estado <> 'pagado'
  returning l.*;
end;
$$;

grant execute on function public.generar_liquidacion_semanal(date) to authenticated;

notify pgrst, 'reload schema';
