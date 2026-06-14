-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Base de marketing: clientes de la web → CRM del dashboard
-- ════════════════════════════════════════════════════════════════════════════
--
-- Objetivo (pedido de Manu):
--   Cada reserva hecha desde la página pública debe alimentar AUTOMÁTICAMENTE
--   la tabla `clientes` del dashboard, para tener una base propia de email
--   marketing (promos, novedades, cumpleaños) que no dependa de las redes.
--
--   En el formulario web se piden, además del nombre/teléfono/email ya
--   existentes, dos cosas nuevas y OPCIONALES:
--     • fecha de cumpleaños  → para promos de cumple.
--     • consentimiento opt-in (checkbox desmarcado) "quiero recibir promos".
--   Si el cliente NO tilda el consentimiento, igual queda registrada la
--   reserva, pero NO se marca como apto para marketing (acepta_marketing=false).
--
-- Qué hace esta migración:
--   1. Agrega a `clientes` las columnas: acepta_marketing, origen,
--      marketing_optin_at  (cumpleanos ya existía).
--   2. Índice único parcial por teléfono normalizado → dedup del CRM.
--   3. Función `kiku_upsert_cliente_marketing(...)`: inserta o actualiza un
--      cliente deduplicando por teléfono (solo dígitos). No pisa datos buenos
--      con nulos y nunca "baja" un consentimiento ya dado.
--   4. Extiende la RPC `crear_reserva` con p_cliente_cumple + p_acepta_marketing
--      y, tras crear la reserva, llama al upsert (envuelto en EXCEPTION: si algo
--      falla en el CRM, la reserva igual se guarda).
--
-- Es idempotente y add-only: no borra ni renombra nada existente.
-- dow de Postgres: 0=Domingo .. 6=Sábado.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Columnas nuevas en clientes ─────────────────────────────────────────
alter table public.clientes
  add column if not exists acepta_marketing   boolean     not null default false,
  add column if not exists origen             text        not null default 'dashboard',
  add column if not exists marketing_optin_at timestamptz;

comment on column public.clientes.acepta_marketing   is 'TRUE si el cliente dio consentimiento explícito (opt-in) para recibir promos/novedades por email. Base legal para email marketing (Ley 25.326).';
comment on column public.clientes.origen             is 'De dónde salió el cliente: ''web'' (reserva online), ''dashboard'' (carga manual), ''telefono'', etc.';
comment on column public.clientes.marketing_optin_at is 'Momento en que el cliente aceptó recibir promos. Útil como prueba de consentimiento.';

-- ─── 2. Índice por teléfono normalizado (solo dígitos) ──────────────────────
-- Acelera el dedup por teléfono que hace kiku_upsert_cliente_marketing.
-- NO se usa UNIQUE a propósito: si la tabla ya tuviera teléfonos repetidos
-- (datos cargados a mano), un índice único haría fallar la migración. El
-- dedup lo garantiza la función vía SELECT + UPSERT.
create index if not exists idx_clientes_telefono_digits
  on public.clientes ((regexp_replace(coalesce(telefono, ''), '\D', '', 'g')))
  where telefono is not null and btrim(telefono) <> '';

-- ─── 3. Upsert de cliente desde un canal de captación ───────────────────────
-- Deduplica por teléfono (dígitos). Reglas:
--   • No sobrescribe email/cumpleaños existentes con NULL.
--   • acepta_marketing es "monótono": una vez en TRUE no vuelve a FALSE solo.
--   • Suma el tag 'Web' si el origen es web y no lo tenía.
create or replace function public.kiku_upsert_cliente_marketing(
  p_nombre            text,
  p_telefono          text,
  p_email             text    default null,
  p_cumple            date    default null,
  p_acepta_marketing  boolean default false,
  p_origen            text    default 'web'
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

comment on function public.kiku_upsert_cliente_marketing(text, text, text, date, boolean, text) is
  'Inserta o actualiza un cliente deduplicando por teléfono (solo dígitos). No pisa datos buenos con NULL y el consentimiento de marketing nunca baja solo. Usada por crear_reserva para alimentar el CRM desde la web.';

grant execute on function public.kiku_upsert_cliente_marketing(text, text, text, date, boolean, text)
  to anon, authenticated;

-- ─── 4. crear_reserva: + cumpleaños + consentimiento + alta en CRM ──────────
-- Soltamos cualquier firma previa de crear_reserva para evitar overloads
-- ambiguos en PostgREST y recreamos la versión consolidada.
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

  -- ─── Alta/actualización del cliente en el CRM (no bloqueante) ────────────
  -- La reserva ya está guardada. Si algo falla acá, la atrapamos para no
  -- tirar abajo la reserva. Solo alimentamos el CRM desde canales de cliente
  -- real (web/whatsapp/telefono), no cuando carga el propio dashboard.
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
  'Crea una reserva (con validaciones de día/experiencia/anticipación para canal web) y, para canales de cliente real, alimenta el CRM vía kiku_upsert_cliente_marketing. Acepta cumpleaños y consentimiento opt-in de marketing.';

-- ─── 5. Recargar schema cache de PostgREST ──────────────────────────────────
notify pgrst, 'reload schema';
