-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Restricciones de días y horarios (web)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Reglas:
--   • Local abierto MARTES a SÁBADO. Domingo y Lunes cerrado.
--   • Reservas por día (origen web/whatsapp):
--       Martes (2): umami_del_sur, pacifico_y_patagonia, carta_abierta
--       Miércoles (3) y Jueves (4): kiku_libre, carta_abierta
--       Viernes (5) y Sábado (6): omakase, carta_abierta
--       (Especial Otoño es solo informativo, no reservable.)
--   • Pedidos web (delivery/takeaway), hora Argentina:
--       Martes a Jueves: 19:30 → 00:00 (medianoche)
--       Viernes y Sábado: 19:30 → 01:00 (la madrugada cae en sáb y dom)
--
-- Estas validaciones se aplican SOLO al canal web (origen='web'/'whatsapp').
-- El dashboard sigue pudiendo cargar reservas/pedidos cualquier día/hora.
--
-- dow de Postgres: 0=Domingo, 1=Lunes, 2=Martes, ... 6=Sábado.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. crear_reserva: + validación de día y experiencia ────────────────────
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
  v_id               uuid;
  v_combined_ts      timestamp;
  v_min_anticip      interval := interval '2 hours';
  v_max_anticip      interval := interval '30 days';
  v_estado_inicial   reserva_estado;
  v_dow              int;
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

-- ─── 2. Pedidos web: horario de atención (hora Argentina) ───────────────────
-- Mar–Jue: 19:30 a 00:00 (medianoche).
-- Vie–Sáb: 19:30 a 01:00; esa madrugada cae en sábado (dow 6) y domingo (dow 0).
create or replace function public.pedido_web_horario_check()
returns trigger
language plpgsql
as $$
declare
  v_local   timestamp := (now() at time zone 'America/Argentina/Buenos_Aires');
  v_dow     int        := extract(dow from v_local)::int;   -- 0=Dom .. 6=Sáb
  v_t       time       := v_local::time;
  v_abierto boolean;
begin
  if new.origen = 'web' and coalesce(new.canal, '') in ('delivery', 'takeaway') then
    -- Noche de martes a sábado desde las 19:30.
    -- Madrugadas abiertas hasta la 01:00 solo en sábado (cola del viernes)
    -- y domingo (cola del sábado).
    v_abierto :=
         (v_dow in (2, 3, 4, 5, 6) and v_t >= time '19:30')
      or (v_dow in (6, 0)          and v_t <= time '01:00');

    if not v_abierto then
      raise exception 'Pedidos: martes a jueves 19:30–00:00; viernes y sábado 19:30–01:00 (hora Argentina).';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pedido_web_horario on public.pedidos;
create trigger trg_pedido_web_horario
  before insert on public.pedidos
  for each row execute function public.pedido_web_horario_check();

notify pgrst, 'reload schema';
