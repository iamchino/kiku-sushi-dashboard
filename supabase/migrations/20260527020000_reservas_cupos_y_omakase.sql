-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Sistema de cupos por DÍA + bloqueo de omakase
-- ════════════════════════════════════════════════════════════════════════════
--
-- Reglas de capacidad del local:
--   - Salón (mesas 1-13 arriba + 20-21 pared abajo): 28 personas por DÍA.
--     Una reserva bloquea cupo para todo el día, sin importar la hora elegida.
--     (Modelo simple: con pocos turnos, preferimos no reusar mesas entre turnos
--      para evitar confusión.)
--   - Barra del itamae (mesas 14-19, omakase): 6 personas, UNA reserva por día
--     (omakase es experiencia única; al confirmarse una, se bloquea el día).
--
-- Horarios online aceptados:
--   20:00 / 20:30 / 21:00 / 21:30 / 22:00 → con mesa asignada.
--   22:30 / 23:00                         → por ORDEN DE LLEGADA (igual se
--                                            registra la reserva y cuenta cupo).
--
-- Este archivo agrega:
--   1. RPC `slots_disponibles(p_fecha)` — devuelve cupo (mismo número en todos
--       los slots, refleja "lugares libres ese día").
--   2. `crear_reserva` v3 con validación de cupo por día para origen=web/whatsapp.
--
-- El dashboard (origen='dashboard') sigue pudiendo crear reservas a cualquier
-- horario sin chequear cupo (caso atípico / fuerza).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Constantes de capacidad (helpers IMMUTABLE) ────────────────────────
create or replace function public.kiku_capacidad_salon()
returns int language sql immutable as $$ select 28 $$;

create or replace function public.kiku_capacidad_barra()
returns int language sql immutable as $$ select 6 $$;

comment on function public.kiku_capacidad_salon() is
  'Capacidad total del salón POR DÍA (24 arriba + 4 pared abajo). Cambiar acá si se reconfigura el local.';
comment on function public.kiku_capacidad_barra() is
  'Capacidad de la barra del itamae (omakase). Una sola reserva de omakase por día.';

-- ─── 2. RPC slots_disponibles ──────────────────────────────────────────────
-- Devuelve una fila por cada slot fijo. Como el cupo es POR DÍA, todos los
-- slots devuelven el mismo número de cupo_salon (refleja lo que queda libre
-- para esa fecha sin importar la hora). El frontend lo usa igual para mostrar
-- "X lugares" / "Sin cupos" en el select.

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
  v_capacidad_sal  int    := public.kiku_capacidad_salon();
  v_capacidad_bar  int    := public.kiku_capacidad_barra();
  v_omakase_existe boolean;
  v_ocupados_dia   int;
  v_slot           time;
begin
  -- ¿Hay omakase reservado ese día? (Cualquier estado salvo cancelada/no_show.)
  select exists (
    select 1
      from public.reservas
     where fecha = p_fecha
       and tipo_experiencia = 'omakase'
       and estado not in ('cancelada', 'no_show')
  ) into v_omakase_existe;

  -- Total de personas ocupando el salón ese día (todas las reservas activas
  -- no-omakase, sin importar la hora — porque el cupo es por día).
  select coalesce(sum(personas), 0)
    into v_ocupados_dia
    from public.reservas
   where fecha = p_fecha
     and (tipo_experiencia is null or tipo_experiencia <> 'omakase')
     and estado not in ('cancelada', 'no_show');

  foreach v_slot in array v_slots loop
    hora        := v_slot;
    cupo_salon  := greatest(0, v_capacidad_sal - v_ocupados_dia);
    cupo_barra  := case when v_omakase_existe then 0 else v_capacidad_bar end;
    hay_omakase := v_omakase_existe;
    return next;
  end loop;
end;
$$;

grant execute on function public.slots_disponibles(date) to anon, authenticated;

comment on function public.slots_disponibles(date) is
  'Devuelve cupo por slot fijo para la fecha indicada. El cupo de salón es por DÍA (mismo valor en todos los slots).';

-- ─── 3. crear_reserva v3 — con validación de cupo por día ──────────────────
-- Drop firma anterior (la firma no cambia, pero REPLACE explícito).
drop function if exists public.crear_reserva(
  date, time, integer, text, text, text, text, text, integer, boolean, text, text, text
);

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
  p_tipo_experiencia  text    default null
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id              uuid;
  v_combined_ts     timestamp;
  v_min_anticip     interval := interval '2 hours';
  v_max_anticip     interval := interval '30 days';
  v_estado_inicial  reserva_estado;
  v_capacidad_sal   int      := public.kiku_capacidad_salon();
  v_capacidad_bar   int      := public.kiku_capacidad_barra();
  v_slots_web       time[]   := array[
                                  '20:00','20:30','21:00','21:30','22:00','22:30','23:00'
                                ]::time[];
  v_ocupados_dia    int;
begin
  -- ─── Validaciones básicas ──────────────────────────────────────────────
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
     and p_tipo_experiencia not in ('omakase','umami_del_sur','pacifico_y_patagonia','kiku_libre','carta_abierta') then
    raise exception 'Tipo de experiencia inválido: %', p_tipo_experiencia;
  end if;

  v_combined_ts := (p_fecha + p_hora);

  -- ─── Validaciones de anticipación + horario (solo web/whatsapp) ───────
  if p_origen in ('web', 'whatsapp') then
    if v_combined_ts < (now() + v_min_anticip) then
      raise exception 'La reserva debe ser con al menos 2 horas de anticipación';
    end if;
    if v_combined_ts > (now() + v_max_anticip) then
      raise exception 'No se pueden hacer reservas con más de 30 días de anticipación';
    end if;

    -- Solo permitimos los slots fijos del local desde la web.
    if not (p_hora = any(v_slots_web)) then
      raise exception 'Horario no disponible para reserva online. Los horarios son entre 20:00 y 23:00 (cada 30 min).';
    end if;
  end if;

  -- ─── Validación de cupo (solo web/whatsapp, no para dashboard) ────────
  if p_origen in ('web', 'whatsapp') then
    if p_tipo_experiencia = 'omakase' then
      -- Omakase: máx 6 personas y una sola reserva por día.
      if p_personas > v_capacidad_bar then
        raise exception 'El omakase es para un máximo de % personas.', v_capacidad_bar;
      end if;
      if exists (
        select 1 from public.reservas
         where fecha = p_fecha
           and tipo_experiencia = 'omakase'
           and estado not in ('cancelada', 'no_show')
      ) then
        raise exception 'Ya hay una reserva de omakase para esa fecha. Por favor elegí otro día.';
      end if;
    else
      -- Salón: cupo POR DÍA. Sumamos personas de todas las reservas activas
      -- no-omakase de ese día (sin importar la hora). Si supera 28, rechazamos.
      select coalesce(sum(personas), 0)
        into v_ocupados_dia
        from public.reservas
       where fecha = p_fecha
         and (tipo_experiencia is null or tipo_experiencia <> 'omakase')
         and estado not in ('cancelada', 'no_show');

      if v_ocupados_dia + p_personas > v_capacidad_sal then
        raise exception 'No hay cupo suficiente en el salón para esa fecha. Quedan % lugares libres.',
          greatest(0, v_capacidad_sal - v_ocupados_dia);
      end if;
    end if;
  end if;

  -- ─── Insert ───────────────────────────────────────────────────────────
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

  return v_id;
end;
$$;

grant execute on function public.crear_reserva(
  date, time, integer, text, text, text, text, text, integer, boolean, text, text, text
) to anon, authenticated;

comment on function public.crear_reserva(
  date, time, integer, text, text, text, text, text, integer, boolean, text, text, text
) is
  'Crea una reserva. Para origen=web/whatsapp valida anticipación (2h-30d), horarios permitidos (20:00–23:00 cada 30 min), capacidad de salón POR DÍA (28 personas) y exclusividad de omakase (1 reserva por día, 6 personas máx). Horarios 22:30 y 23:00 son por orden de llegada (la web debe avisar al cliente).';

-- ─── 4. Reload schema cache ────────────────────────────────────────────────
notify pgrst, 'reload schema';
