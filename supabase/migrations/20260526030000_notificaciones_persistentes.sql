-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Sistema de notificaciones persistentes
-- ════════════════════════════════════════════════════════════════════════════
--
-- Objetivo: cada evento relevante (nueva reserva, nuevo pedido) queda guardado
-- en la tabla `notificaciones` con su contexto completo en `metadata` (jsonb).
-- El frontend lee esta tabla y la escucha por Realtime.
--
-- Eventos cubiertos:
--   - INSERT en reservas (cualquier origen: web/dashboard/teléfono/whatsapp)
--   - INSERT en pedidos
--
-- Retención: ninguna (todo se guarda permanentemente).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabla ──────────────────────────────────────────────────────────────
create table if not exists public.notificaciones (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null,            -- 'reserva_nueva' | 'pedido_nuevo' | ...
  titulo            text not null,
  mensaje           text not null,
  referencia_id     uuid,                     -- id del registro original (reserva/pedido)
  referencia_tabla  text,                     -- 'reservas' | 'pedidos'
  metadata          jsonb not null default '{}'::jsonb,
  leida             bool not null default false,
  leida_at          timestamptz,
  created_at        timestamptz not null default now()
);

comment on table public.notificaciones is
  'Historial persistente de notificaciones del dashboard. Trigger-driven desde reservas y pedidos.';

create index if not exists idx_notif_created_at on public.notificaciones(created_at desc);
create index if not exists idx_notif_no_leidas  on public.notificaciones(created_at desc) where leida = false;
create index if not exists idx_notif_tipo       on public.notificaciones(tipo);
create index if not exists idx_notif_referencia on public.notificaciones(referencia_id);

-- ─── 2. Trigger function: nueva reserva ────────────────────────────────────
create or replace function public.notif_on_reserva_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_titulo text;
  v_emoji  text;
begin
  v_emoji  := case when new.origen = 'web' then '🌐' else '📅' end;
  v_titulo := case
    when new.origen = 'web'       then 'Nueva reserva desde la web'
    when new.origen = 'whatsapp'  then 'Nueva reserva por WhatsApp'
    when new.origen = 'telefono'  then 'Nueva reserva por teléfono'
    else                               'Nueva reserva'
  end;

  insert into public.notificaciones (
    tipo, titulo, mensaje, referencia_id, referencia_tabla, metadata
  ) values (
    'reserva_nueva',
    v_emoji || ' ' || v_titulo,
    coalesce(new.cliente_nombre, 'Sin nombre') || ' · ' ||
      to_char(new.fecha, 'DD/MM') || ' ' || to_char(new.hora, 'HH24:MI') ||
      ' · ' || new.personas || (case when new.personas = 1 then ' persona' else ' personas' end),
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
      'notas',             new.notas
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notif_reserva_insert on public.reservas;
create trigger trg_notif_reserva_insert
  after insert on public.reservas
  for each row execute function public.notif_on_reserva_insert();

-- ─── 3. Trigger function: nuevo pedido ─────────────────────────────────────
create or replace function public.notif_on_pedido_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_emoji  text;
  v_titulo text;
  v_canal  text;
begin
  v_canal := coalesce(new.canal, 'pedido');
  v_emoji := case v_canal
    when 'delivery'   then '🛵'
    when 'takeaway'   then '🛍️'
    when 'salon'      then '🍽️'
    when 'whatsapp'   then '💬'
    when 'pedidosya'  then '🟢'
    when 'rappi'      then '🟠'
    else                   '🔔'
  end;

  v_titulo := 'Nuevo pedido' ||
              case when v_canal = 'pedido' then '' else ' · ' || initcap(v_canal) end;

  insert into public.notificaciones (
    tipo, titulo, mensaje, referencia_id, referencia_tabla, metadata
  ) values (
    'pedido_nuevo',
    v_emoji || ' ' || v_titulo,
    coalesce(new.cliente_nombre, 'Sin nombre') ||
      ' · $' || coalesce(new.total, 0)::text ||
      case when new.numero is not null then ' · #' || new.numero::text else '' end,
    new.id,
    'pedidos',
    jsonb_build_object(
      'canal',             new.canal,
      'numero',            new.numero,
      'total',             new.total,
      'cliente_nombre',    new.cliente_nombre,
      'cliente_telefono',  new.cliente_telefono,
      'cliente_direccion', new.cliente_direccion,
      'estado',            new.estado,
      'mesa_id',           new.mesa_id,
      'notas',             new.notas
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notif_pedido_insert on public.pedidos;
create trigger trg_notif_pedido_insert
  after insert on public.pedidos
  for each row execute function public.notif_on_pedido_insert();

-- ─── 4. RPCs de gestión ────────────────────────────────────────────────────
create or replace function public.marcar_notificacion_leida(p_id uuid)
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  update public.notificaciones
     set leida = true,
         leida_at = now()
   where id = p_id and leida = false;
$$;

create or replace function public.marcar_todas_notificaciones_leidas()
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  update public.notificaciones
     set leida = true,
         leida_at = now()
   where leida = false;
$$;

create or replace function public.eliminar_notificacion(p_id uuid)
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  delete from public.notificaciones where id = p_id;
$$;

grant execute on function public.marcar_notificacion_leida(uuid)         to authenticated;
grant execute on function public.marcar_todas_notificaciones_leidas()    to authenticated;
grant execute on function public.eliminar_notificacion(uuid)             to authenticated;

-- ─── 5. RLS ────────────────────────────────────────────────────────────────
alter table public.notificaciones enable row level security;

drop policy if exists notif_select on public.notificaciones;
create policy notif_select on public.notificaciones
  for select to authenticated using (true);

drop policy if exists notif_insert on public.notificaciones;
create policy notif_insert on public.notificaciones
  for insert to authenticated with check (true);

drop policy if exists notif_update on public.notificaciones;
create policy notif_update on public.notificaciones
  for update to authenticated using (true) with check (true);

drop policy if exists notif_delete on public.notificaciones;
create policy notif_delete on public.notificaciones
  for delete to authenticated using (true);

-- ─── 6. Realtime publication ───────────────────────────────────────────────
do $$
begin
  begin
    alter publication supabase_realtime add table public.notificaciones;
  exception when duplicate_object then null;
  end;
end$$;

-- ─── 7. Reload schema ──────────────────────────────────────────────────────
notify pgrst, 'reload schema';
