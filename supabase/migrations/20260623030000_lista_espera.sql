-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Lista de espera (web → dashboard, gestión manual)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pedido de Manu: cuando una fecha/turno ya no tiene cupo, el cliente puede
-- ANOTARSE en una lista de espera desde la web (nombre + teléfono + fecha +
-- personas). Kiku la ve en el dashboard y, si se libera un lugar, lo contacta a
-- mano (no hay aviso automático en esta versión).
--
-- Esta migración crea:
--   1. Tabla `lista_espera` con estado de gestión.
--   2. RPC `crear_lista_espera(...)` para el canal web (anon), SECURITY DEFINER.
--   3. Trigger de notificación al dashboard (reusa la tabla `notificaciones`).
--   4. RPC `actualizar_estado_lista_espera(...)` para gestionar desde el dashboard.
--   5. RLS + trigger de updated_at.
--
-- Add-only e idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabla ───────────────────────────────────────────────────────────────
create table if not exists public.lista_espera (
  id                uuid primary key default gen_random_uuid(),
  fecha             date        not null,
  hora              time,                       -- horario preferido (opcional)
  personas          integer     not null,
  tipo_experiencia  text,
  cliente_nombre    text        not null,
  cliente_telefono  text,
  cliente_email     text,
  notas             text,
  estado            text        not null default 'esperando',
    -- 'esperando' | 'contactado' | 'convertida' | 'cancelada'
  origen            text        not null default 'web',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint lista_espera_estado_check
    check (estado in ('esperando', 'contactado', 'convertida', 'cancelada')),
  constraint lista_espera_personas_check
    check (personas >= 1),
  constraint lista_espera_tipo_check
    check (tipo_experiencia is null or tipo_experiencia in
      ('omakase', 'umami_del_sur', 'pacifico_y_patagonia', 'kiku_libre', 'carta_abierta'))
);

comment on table public.lista_espera is
  'Anotaciones de lista de espera (web) cuando una fecha/turno no tiene cupo. Gestión manual desde el dashboard.';

create index if not exists idx_lista_espera_fecha  on public.lista_espera(fecha);
create index if not exists idx_lista_espera_estado on public.lista_espera(estado);
create index if not exists idx_lista_espera_pendientes
  on public.lista_espera(created_at desc) where estado = 'esperando';

-- ─── 2. Trigger de updated_at ───────────────────────────────────────────────
create or replace function public.lista_espera_touch_updated()
returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_lista_espera_updated on public.lista_espera;
create trigger trg_lista_espera_updated
  before update on public.lista_espera
  for each row execute function public.lista_espera_touch_updated();

-- ─── 3. RPC crear_lista_espera (canal web) ──────────────────────────────────
create or replace function public.crear_lista_espera(
  p_fecha             date,
  p_personas          integer,
  p_cliente_nombre    text,
  p_cliente_telefono  text    default null,
  p_hora              time    default null,
  p_cliente_email     text    default null,
  p_notas             text    default null,
  p_tipo_experiencia  text    default null,
  p_origen            text    default 'web'
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
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

grant execute on function public.crear_lista_espera(date, integer, text, text, time, text, text, text, text)
  to anon, authenticated;

comment on function public.crear_lista_espera(date, integer, text, text, time, text, text, text, text) is
  'Anota a un cliente en la lista de espera (canal web). No valida cupo (justamente se usa cuando no hay). Dispara notificación al dashboard.';

-- ─── 4. Notificación al dashboard al anotarse ───────────────────────────────
create or replace function public.notif_on_lista_espera_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notificaciones (
    tipo, titulo, mensaje, referencia_id, referencia_tabla, metadata
  ) values (
    'lista_espera_nueva',
    '⏳ Nueva lista de espera',
    coalesce(new.cliente_nombre, 'Sin nombre') || ' · ' ||
      to_char(new.fecha, 'DD/MM') ||
      coalesce(' ' || to_char(new.hora, 'HH24:MI'), '') ||
      ' · ' || new.personas || (case when new.personas = 1 then ' persona' else ' personas' end),
    new.id,
    'lista_espera',
    jsonb_build_object(
      'origen',           new.origen,
      'cliente_nombre',   new.cliente_nombre,
      'cliente_telefono', new.cliente_telefono,
      'cliente_email',    new.cliente_email,
      'fecha',            new.fecha,
      'hora',             new.hora,
      'personas',         new.personas,
      'tipo_experiencia', new.tipo_experiencia,
      'notas',            new.notas
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_notif_lista_espera_insert on public.lista_espera;
create trigger trg_notif_lista_espera_insert
  after insert on public.lista_espera
  for each row execute function public.notif_on_lista_espera_insert();

-- ─── 5. RPC de gestión desde el dashboard ───────────────────────────────────
create or replace function public.actualizar_estado_lista_espera(
  p_id     uuid,
  p_estado text
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_id is null or p_estado is null then
    raise exception 'id y estado son requeridos';
  end if;
  if p_estado not in ('esperando', 'contactado', 'convertida', 'cancelada') then
    raise exception 'Estado inválido: %', p_estado;
  end if;

  update public.lista_espera
     set estado = p_estado
   where id = p_id;
end;
$$;

grant execute on function public.actualizar_estado_lista_espera(uuid, text) to authenticated;

-- ─── 6. RLS ─────────────────────────────────────────────────────────────────
alter table public.lista_espera enable row level security;

-- Gestión completa desde el dashboard (usuarios autenticados).
drop policy if exists lista_espera_select on public.lista_espera;
create policy lista_espera_select on public.lista_espera
  for select to authenticated using (true);

drop policy if exists lista_espera_update on public.lista_espera;
create policy lista_espera_update on public.lista_espera
  for update to authenticated using (true) with check (true);

drop policy if exists lista_espera_delete on public.lista_espera;
create policy lista_espera_delete on public.lista_espera
  for delete to authenticated using (true);

-- El alta desde la web va por la RPC SECURITY DEFINER (no hace falta policy de
-- insert para anon). Igual permitimos insert a authenticated por si se carga a mano.
drop policy if exists lista_espera_insert on public.lista_espera;
create policy lista_espera_insert on public.lista_espera
  for insert to authenticated with check (true);

-- ─── 7. Realtime ────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.lista_espera;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;

notify pgrst, 'reload schema';
