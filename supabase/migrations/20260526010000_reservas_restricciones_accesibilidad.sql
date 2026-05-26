-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Extensión de reservas: restricciones + accesibilidad
-- ════════════════════════════════════════════════════════════════════════════
--
-- Suma dos columnas opcionales a `reservas` y extiende la RPC `crear_reserva`
-- para aceptar los nuevos campos desde la web.
--
-- Compatibilidad: la firma original de crear_reserva queda eliminada y se
-- reemplaza por una nueva con dos params opcionales más al final (default null),
-- por lo que el form V1 actual sigue funcionando sin tocar (los params extra
-- se omiten y quedan en null).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Columnas nuevas ─────────────────────────────────────────────────────
alter table public.reservas
  add column if not exists restricciones text,
  add column if not exists accesibilidad text;

comment on column public.reservas.restricciones is
  'Restricciones alimentarias declaradas por el cliente (vegetariano, celiaco, etc.). Opcional.';
comment on column public.reservas.accesibilidad is
  'Necesidades de accesibilidad declaradas por el cliente (silla de ruedas, planta baja, etc.). Opcional.';

-- ─── 2. Drop de la firma vieja de crear_reserva ─────────────────────────────
-- Es necesario hacer drop porque la firma cambia (params nuevos).
drop function if exists public.crear_reserva(
  date, time, integer, text, text, text, text, text, integer, boolean
);

-- ─── 3. Nueva versión de crear_reserva con restricciones + accesibilidad ────
create or replace function public.crear_reserva(
  p_fecha            date,
  p_hora             time,
  p_personas         integer,
  p_cliente_nombre   text,
  p_cliente_telefono text    default null,
  p_cliente_email    text    default null,
  p_notas            text    default null,
  p_origen           text    default 'web',
  p_duracion_min     integer default 90,
  p_auto_confirmar   boolean default true,
  p_restricciones    text    default null,
  p_accesibilidad    text    default null
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

  v_combined_ts := (p_fecha + p_hora);

  -- Anticipación: solo aplicar a reservas de web/whatsapp; el dashboard
  -- puede cargar reservas para "ahora mismo" o pasadas (caso atípico).
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
    notas, restricciones, accesibilidad,
    estado, origen, confirmada_at
  ) values (
    p_fecha, p_hora, p_personas, coalesce(p_duracion_min, 90),
    btrim(p_cliente_nombre),
    nullif(btrim(coalesce(p_cliente_telefono, '')), ''),
    nullif(btrim(coalesce(p_cliente_email,    '')), ''),
    nullif(btrim(coalesce(p_notas,           '')), ''),
    nullif(btrim(coalesce(p_restricciones,   '')), ''),
    nullif(btrim(coalesce(p_accesibilidad,   '')), ''),
    v_estado_inicial,
    p_origen,
    case when v_estado_inicial = 'confirmada' then now() else null end
  ) returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.crear_reserva(
  date, time, integer, text, text, text, text, text, integer, boolean, text, text
) to anon, authenticated;

-- ─── 4. Reload schema cache para que PostgREST tome los cambios ─────────────
notify pgrst, 'reload schema';
