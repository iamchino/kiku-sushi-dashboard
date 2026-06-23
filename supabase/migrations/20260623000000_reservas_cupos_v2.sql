-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Cupos v2: salón 34 (28 vie/sáb) + omakase 6 asientos (multi)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pedido de Manu (2026-06-22):
--   • Omakase: 6 asientos en la barra. Pueden entrar VARIAS reservas el mismo
--     día mientras la suma de comensales no supere 6 (ej: 2 + 4). Antes era
--     "una sola reserva de omakase por día".
--   • Resto de menús + Kiku Libre: 34 asientos por DÍA en total… EXCEPTO viernes
--     y sábado, que son 28 (porque esos días la barra de 6 va a omakase).
--
-- Modelo de cupo: POR DÍA (igual que hasta ahora). Una reserva ocupa cupo para
-- toda la fecha, sin importar la hora. Solo aplica al canal web/whatsapp; el
-- dashboard puede cargar a dedo sin tope.
--
-- IMPORTANTE: la validación de cupo del lado del servidor se había perdido al
-- redefinir crear_reserva en migraciones posteriores (20260531040000 y
-- 20260614000000 recrearon la función SIN el bloque de cupo). Esta migración la
-- vuelve a incorporar sobre la firma vigente de 15 parámetros.
--
-- dow de Postgres: 0=Domingo .. 6=Sábado. Omakase corre viernes (5) y sábado (6).
-- Es idempotente y add-only.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Capacidades ─────────────────────────────────────────────────────────
-- Capacidad del salón (menús que NO son omakase) según la fecha:
--   viernes/sábado → 28 (la barra de 6 queda para omakase)
--   resto          → 34 (la barra puede usarse como salón común)
create or replace function public.kiku_capacidad_salon_fecha(p_fecha date)
returns int language sql immutable as $$
  select case when extract(dow from p_fecha)::int in (5, 6) then 28 else 34 end
$$;

comment on function public.kiku_capacidad_salon_fecha(date) is
  'Cupo de salón POR DÍA para menús no-omakase. 28 los viernes/sábado (la barra va a omakase), 34 el resto de los días.';

-- Capacidad de la barra del itamae (omakase). 6 asientos por día.
create or replace function public.kiku_capacidad_barra()
returns int language sql immutable as $$ select 6 $$;

-- Compat: dejamos kiku_capacidad_salon() devolviendo el máximo (34) por si algo
-- viejo todavía lo llama. La lógica nueva usa kiku_capacidad_salon_fecha().
create or replace function public.kiku_capacidad_salon()
returns int language sql immutable as $$ select 34 $$;

-- ─── 2. slots_disponibles v2 ────────────────────────────────────────────────
-- Cupo por slot fijo. Como el cupo es por DÍA, todos los slots devuelven el
-- mismo número. Ahora:
--   cupo_salon  = capacidad de la fecha (34 / 28) menos lo ya reservado no-omakase.
--   cupo_barra  = 6 menos los comensales de omakase ya reservados ese día.
--   hay_omakase = true cuando la barra de omakase quedó SIN lugar (>= 6).
create or replace function public.slots_disponibles(p_fecha date)
returns table (
  hora        time,
  cupo_salon  int,
  cupo_barra  int,
  hay_omakase boolean
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
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

grant execute on function public.slots_disponibles(date) to anon, authenticated;

comment on function public.slots_disponibles(date) is
  'Cupo por slot para la fecha (por DÍA). cupo_salon = 34/28 menos reservas no-omakase; cupo_barra = 6 menos comensales de omakase; hay_omakase = barra de omakase llena.';

-- ─── 3. crear_reserva: re-incorpora validación de cupo ──────────────────────
-- Soltamos cualquier firma previa para evitar overloads ambiguos en PostgREST.
do $$
declare
  v_sig text;
begin
  for v_sig in
    select format('public.crear_reserva(%s)', pg_get_function_identity_arguments(p.oid))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'crear_reserva'
  loop
    execute format('drop function if exists %s', v_sig);
  end loop;
end;
$$;

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
  if p_tipo_experiencia is not null
     and p_tipo_experiencia not in ('omakase', 'umami_del_sur', 'pacifico_y_patagonia', 'kiku_libre', 'carta_abierta') then
    raise exception 'Tipo de experiencia inválido: %', p_tipo_experiencia;
  end if;

  -- ─── Restricciones de día/experiencia (solo canal web) ───────────────────
  if p_origen in ('web', 'whatsapp') then
    v_dow := extract(dow from p_fecha)::int;

    -- Domingo (0) y Lunes (1): cerrado.
    if v_dow in (0, 1) then
      raise exception 'El local está cerrado ese día. Abrimos de martes a sábado.';
    end if;

    -- La experiencia tiene que estar disponible ese día.
    if p_tipo_experiencia is not null and not (
         (v_dow = 2 and p_tipo_experiencia in ('umami_del_sur', 'pacifico_y_patagonia', 'carta_abierta'))
      or (v_dow = 3 and p_tipo_experiencia in ('kiku_libre', 'carta_abierta'))
      or (v_dow = 4 and p_tipo_experiencia in ('kiku_libre', 'carta_abierta'))
      or (v_dow = 5 and p_tipo_experiencia in ('omakase', 'carta_abierta'))
      or (v_dow = 6 and p_tipo_experiencia in ('omakase', 'carta_abierta'))
    ) then
      raise exception 'Esa experiencia no está disponible ese día.';
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

  -- ─── Validación de cupo POR DÍA (solo web/whatsapp) ──────────────────────
  if p_origen in ('web', 'whatsapp') then
    if p_tipo_experiencia = 'omakase' then
      -- Omakase: 6 asientos por día, varias reservas permitidas mientras sumen <= 6.
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
      -- Salón: cupo por día (34, o 28 los viernes/sábado).
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

  -- ─── Alta/actualización del cliente en el CRM (no bloqueante) ────────────
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
  'Crea una reserva con validación de día/experiencia, anticipación (2h–30d) y cupo POR DÍA (salón 34/28, omakase 6 asientos permitiendo varias reservas). Alimenta el CRM para canales de cliente real.';

-- ─── 4. Recargar schema cache de PostgREST ──────────────────────────────────
notify pgrst, 'reload schema';
