-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Tipo de experiencia en reservas
-- ════════════════════════════════════════════════════════════════════════════
--
-- Suma columna `tipo_experiencia` a `reservas` para distinguir entre los 4
-- menús específicos del local y la opción "carta abierta".
--
-- Valores válidos:
--   - omakase                → menú degustación del chef
--   - umami_del_sur          → cocina argentina con técnica japonesa
--   - pacifico_y_patagonia   → sushi de pescados frescos
--   - kiku_libre             → sushi ilimitado (precio fijo $53.500)
--   - carta_abierta          → reserva sin menú específico, pide al llegar
--
-- Compatible hacia atrás: las reservas viejas quedan con tipo NULL, no rompen
-- nada. El form V2 manda el tipo siempre. El dashboard lo muestra cuando existe.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Columna ─────────────────────────────────────────────────────────────
alter table public.reservas
  add column if not exists tipo_experiencia text;

-- Check constraint con los 5 valores válidos (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reservas_tipo_experiencia_check'
  ) then
    alter table public.reservas
      add constraint reservas_tipo_experiencia_check
      check (tipo_experiencia is null or tipo_experiencia in (
        'omakase',
        'umami_del_sur',
        'pacifico_y_patagonia',
        'kiku_libre',
        'carta_abierta'
      ));
  end if;
end$$;

comment on column public.reservas.tipo_experiencia is
  'Experiencia gastronómica reservada: omakase | umami_del_sur | pacifico_y_patagonia | kiku_libre | carta_abierta. NULL en reservas previas a esta migración.';

create index if not exists idx_reservas_tipo_experiencia
  on public.reservas(tipo_experiencia)
  where tipo_experiencia is not null;

-- ─── 2. Drop firma vieja de crear_reserva (cambia la firma) ────────────────
drop function if exists public.crear_reserva(
  date, time, integer, text, text, text, text, text, integer, boolean, text, text
);

-- ─── 3. Nueva versión de crear_reserva con tipo_experiencia ────────────────
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

-- ─── 4. Actualizar trigger de notificación para incluir tipo_experiencia ───
create or replace function public.notif_on_reserva_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

-- (El trigger trg_notif_reserva_insert ya existe desde la migración anterior;
-- esta REPLACE FUNCTION actualiza el cuerpo sin necesidad de recrearlo.)

-- ─── 5. Reload schema ──────────────────────────────────────────────────────
notify pgrst, 'reload schema';
