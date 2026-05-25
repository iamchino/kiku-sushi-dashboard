-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Sistema de reservas
-- ════════════════════════════════════════════════════════════════════════════
--
-- Reservas con flujo:
--   pendiente → confirmada → sentada (abre la mesa)
--                          → no_show
--                          → cancelada
--
-- Reglas de negocio:
--   - Anticipación mínima: 2 horas (validación en RPC `crear_reserva`)
--   - Anticipación máxima: 30 días
--   - Duración por defecto: 90 minutos
--   - Origen: 'web' | 'dashboard' | 'telefono' | 'whatsapp'
--
-- La web pública puede insertar directamente (vía rol `anon` con RLS) usando
-- `crear_reserva` (security definer). El dashboard tiene control completo.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. ENUM de estado ─────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'reserva_estado') then
    create type public.reserva_estado as enum (
      'pendiente', 'confirmada', 'sentada', 'no_show', 'cancelada'
    );
  end if;
end$$;

-- ─── 2. Tabla reservas ─────────────────────────────────────────────────────
create table if not exists public.reservas (
  id                uuid primary key default gen_random_uuid(),
  fecha             date        not null,
  hora              time        not null,
  duracion_min      integer     not null default 90 check (duracion_min between 15 and 480),
  personas          integer     not null check (personas between 1 and 100),
  cliente_nombre    text        not null,
  cliente_telefono  text,
  cliente_email     text,
  notas             text,
  estado            reserva_estado not null default 'pendiente',
  origen            text        not null default 'dashboard'
    check (origen in ('web', 'dashboard', 'telefono', 'whatsapp')),
  salon_id          uuid        references public.salones(id) on delete set null,
  mesa_id           uuid        references public.mesas(id)   on delete set null,
  pedido_id         uuid        references public.pedidos(id) on delete set null,
  confirmada_at     timestamptz,
  sentada_at        timestamptz,
  cancelada_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.reservas is
  'Reservas de mesa. Insertadas por la web pública (origen=web) o cargadas a mano desde el dashboard.';

create index if not exists idx_reservas_fecha          on public.reservas(fecha);
create index if not exists idx_reservas_fecha_hora     on public.reservas(fecha, hora);
create index if not exists idx_reservas_estado         on public.reservas(estado);
create index if not exists idx_reservas_telefono       on public.reservas(cliente_telefono)
  where cliente_telefono is not null;
create index if not exists idx_reservas_mesa           on public.reservas(mesa_id)
  where mesa_id is not null;

-- ─── 3. Trigger updated_at ─────────────────────────────────────────────────
create or replace function public.kiku_reservas_touch_updated()
returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_reservas_updated on public.reservas;
create trigger trg_reservas_updated
  before update on public.reservas
  for each row execute function public.kiku_reservas_touch_updated();

-- ─── 4. RPC crear_reserva (SECURITY DEFINER, callable desde web) ───────────
create or replace function public.crear_reserva(
  p_fecha            date,
  p_hora             time,
  p_personas         integer,
  p_cliente_nombre   text,
  p_cliente_telefono text default null,
  p_cliente_email    text default null,
  p_notas            text default null,
  p_origen           text default 'web',
  p_duracion_min     integer default 90,
  p_auto_confirmar   boolean default true
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
    notas, estado, origen, confirmada_at
  ) values (
    p_fecha, p_hora, p_personas, coalesce(p_duracion_min, 90),
    btrim(p_cliente_nombre),
    nullif(btrim(coalesce(p_cliente_telefono, '')), ''),
    nullif(btrim(coalesce(p_cliente_email,    '')), ''),
    nullif(btrim(coalesce(p_notas,           '')), ''),
    v_estado_inicial,
    p_origen,
    case when v_estado_inicial = 'confirmada' then now() else null end
  ) returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.crear_reserva(
  date, time, integer, text, text, text, text, text, integer, boolean
) to anon, authenticated;

-- ─── 5. RPC actualizar_estado_reserva ──────────────────────────────────────
create or replace function public.actualizar_estado_reserva(
  p_reserva_id uuid,
  p_estado     reserva_estado
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  if p_reserva_id is null or p_estado is null then
    raise exception 'reserva_id y estado son requeridos';
  end if;

  update public.reservas
     set estado        = p_estado,
         confirmada_at = case when p_estado = 'confirmada' then v_now else confirmada_at end,
         sentada_at    = case when p_estado = 'sentada'    then v_now else sentada_at end,
         cancelada_at  = case when p_estado in ('cancelada','no_show') then v_now else cancelada_at end
   where id = p_reserva_id;
end;
$$;

grant execute on function public.actualizar_estado_reserva(uuid, reserva_estado) to authenticated;

-- ─── 6. RPC sentar_reserva — abre la mesa con datos de la reserva ──────────
-- Devuelve el pedido_id creado.
create or replace function public.sentar_reserva(
  p_reserva_id uuid,
  p_mesa_id    uuid,
  p_mozo_id    uuid default null
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_reserva         record;
  v_pedido_id       uuid;
begin
  select * into v_reserva from public.reservas where id = p_reserva_id;
  if not found then
    raise exception 'Reserva no encontrada';
  end if;

  if v_reserva.estado in ('cancelada', 'no_show', 'sentada') then
    raise exception 'La reserva no se puede sentar (estado: %)', v_reserva.estado;
  end if;

  -- Abrir la mesa con los datos de la reserva (reusa la RPC abrir_mesa)
  v_pedido_id := public.abrir_mesa(
    p_mesa_id          := p_mesa_id,
    p_personas         := v_reserva.personas,
    p_mozo_id          := p_mozo_id,
    p_cliente_nombre   := v_reserva.cliente_nombre,
    p_cliente_telefono := v_reserva.cliente_telefono
  );

  -- Marcar reserva como sentada y vincular mesa + pedido
  update public.reservas
     set estado     = 'sentada',
         mesa_id    = p_mesa_id,
         pedido_id  = v_pedido_id,
         sentada_at = now()
   where id = p_reserva_id;

  return v_pedido_id;
end;
$$;

grant execute on function public.sentar_reserva(uuid, uuid, uuid) to authenticated;

-- ─── 7. RLS ────────────────────────────────────────────────────────────────
alter table public.reservas enable row level security;

-- SELECT: cualquier usuario autenticado del dash ve todas las reservas
drop policy if exists reservas_select_authenticated on public.reservas;
create policy reservas_select_authenticated on public.reservas
  for select to authenticated using (true);

-- INSERT directo solo desde authenticated (la web debería usar la RPC).
-- Si querés permitir INSERT anónimo (no recomendado), agregar policy anon.
drop policy if exists reservas_insert_authenticated on public.reservas;
create policy reservas_insert_authenticated on public.reservas
  for insert to authenticated with check (true);

drop policy if exists reservas_update_authenticated on public.reservas;
create policy reservas_update_authenticated on public.reservas
  for update to authenticated using (true) with check (true);

drop policy if exists reservas_delete_authenticated on public.reservas;
create policy reservas_delete_authenticated on public.reservas
  for delete to authenticated using (true);

-- ─── 8. Reload schema cache ────────────────────────────────────────────────
notify pgrst, 'reload schema';
