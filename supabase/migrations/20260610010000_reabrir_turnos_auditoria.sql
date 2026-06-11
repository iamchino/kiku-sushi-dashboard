-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Reapertura de turnos de caja + auditoría
-- ════════════════════════════════════════════════════════════════════════════
--
-- Permite reabrir un turno YA CERRADO para corregirlo (editar movimientos,
-- ajustar el monto contado / diferencia, reasignar pagos) y volver a cerrarlo,
-- dejando un registro completo de quién lo hizo, cuándo y qué cambió.
--
-- Decisiones implementadas:
--   • Nuevo estado 'reabierto' (distinto de 'abierto'): así reabrir un turno
--     viejo NO interfiere con el turno activo del día ni con el índice único
--     de "una sola caja abierta".
--   • Reapertura SOLO admin y con MOTIVO obligatorio (vía RPC reabrir_turno).
--   • Auditoría automática por triggers: cada cambio hecho mientras el turno
--     está 'reabierto' (alta/edición/baja de movimiento, reasignación de pago,
--     edición del cierre y el re-cierre) queda registrado con usuario y
--     antes/después. La reapertura se registra con su motivo.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Permitir el estado 'reabierto' ───────────────────────────────────────
-- Borramos cualquier CHECK sobre la columna estado (el nombre auto-generado
-- suele ser caja_turnos_estado_check, pero lo resolvemos dinámicamente por las
-- dudas) y lo recreamos incluyendo 'reabierto'.
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'caja_turnos'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%estado%'
       and pg_get_constraintdef(con.oid) ilike '%abierto%'
       and pg_get_constraintdef(con.oid) not ilike '%cierre_at%'
  loop
    execute format('alter table public.caja_turnos drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.caja_turnos
  add constraint caja_turnos_estado_check
  check (estado in ('abierto', 'cerrado', 'reabierto'));

-- Ajustar la consistencia: un turno 'reabierto' conserva sus datos de cierre
-- previos pero vuelve a ser editable.
alter table public.caja_turnos
  drop constraint if exists caja_turnos_cierre_consistente;

alter table public.caja_turnos
  add constraint caja_turnos_cierre_consistente check (
    (estado = 'abierto'   and cierre_at is null)
    or (estado = 'cerrado'  and cierre_at is not null and cierre_monto is not null)
    or (estado = 'reabierto')
  );

-- ── 2) Tabla de auditoría ────────────────────────────────────────────────────
create table if not exists public.caja_turnos_auditoria (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references public.caja_turnos(id) on delete cascade,
  evento text not null check (evento in (
    'reapertura',
    'recierre',
    'cierre_editado',
    'movimiento_creado',
    'movimiento_editado',
    'movimiento_eliminado',
    'pago_reasignado'
  )),
  motivo text,
  detalle jsonb not null default '{}'::jsonb,
  usuario_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists caja_turnos_auditoria_turno_idx
  on public.caja_turnos_auditoria (turno_id, created_at desc);

alter table public.caja_turnos_auditoria enable row level security;

drop policy if exists "auditoria admin read" on public.caja_turnos_auditoria;
create policy "auditoria admin read"
  on public.caja_turnos_auditoria
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "auditoria admin insert" on public.caja_turnos_auditoria;
create policy "auditoria admin insert"
  on public.caja_turnos_auditoria
  for insert
  to authenticated
  with check (public.is_admin());

comment on table public.caja_turnos_auditoria is
  'Registro de auditoría de turnos de caja: reaperturas (con motivo), re-cierres y '
  'cambios hechos mientras el turno está reabierto. Guarda usuario, fecha y antes/después.';

-- ── 3) RPC reabrir_turno(id, motivo) ────────────────────────────────────────
create or replace function public.reabrir_turno(
  p_turno_id uuid,
  p_motivo   text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede reabrir turnos de caja';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'El motivo de reapertura es obligatorio';
  end if;

  select estado
    into v_estado
    from public.caja_turnos
   where id = p_turno_id
   for update;

  if not found then
    raise exception 'Turno no encontrado';
  end if;

  if v_estado <> 'cerrado' then
    raise exception 'Solo se puede reabrir un turno cerrado (estado actual: %)', v_estado;
  end if;

  update public.caja_turnos
     set estado = 'reabierto',
         updated_at = now()
   where id = p_turno_id;

  -- La reapertura se registra acá con su motivo (los triggers NO la duplican).
  insert into public.caja_turnos_auditoria (turno_id, evento, motivo, detalle)
  values (
    p_turno_id,
    'reapertura',
    btrim(p_motivo),
    jsonb_build_object('estado_anterior', 'cerrado')
  );
end;
$$;

grant execute on function public.reabrir_turno(uuid, text) to authenticated;

comment on function public.reabrir_turno(uuid, text) is
  'Reabre un turno cerrado (estado -> reabierto). Solo admin, motivo obligatorio. '
  'Deja registro en caja_turnos_auditoria.';

-- ── 4) Triggers de auditoría ─────────────────────────────────────────────────

-- 4.a) Movimientos: solo se auditan los cambios hechos mientras el turno está
--      'reabierto' (para no ensuciar el log con la operación normal).
create or replace function public.caja_movimientos_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_turno_id uuid := coalesce(NEW.turno_id, OLD.turno_id);
  v_estado   text;
begin
  if v_turno_id is null then
    return coalesce(NEW, OLD);
  end if;

  select estado into v_estado from public.caja_turnos where id = v_turno_id;

  if v_estado is distinct from 'reabierto' then
    return coalesce(NEW, OLD);
  end if;

  if TG_OP = 'INSERT' then
    insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
    values (NEW.turno_id, 'movimiento_creado',
            jsonb_build_object('nuevo', to_jsonb(NEW)));
  elsif TG_OP = 'UPDATE' then
    insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
    values (NEW.turno_id, 'movimiento_editado',
            jsonb_build_object('anterior', to_jsonb(OLD), 'nuevo', to_jsonb(NEW)));
  elsif TG_OP = 'DELETE' then
    insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
    values (OLD.turno_id, 'movimiento_eliminado',
            jsonb_build_object('anterior', to_jsonb(OLD)));
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_caja_movimientos_audit on public.caja_movimientos;
create trigger trg_caja_movimientos_audit
  after insert or update or delete on public.caja_movimientos
  for each row execute function public.caja_movimientos_audit();

-- 4.b) Turnos: re-cierre (reabierto -> cerrado) y ediciones del cierre mientras
--      sigue reabierto. La reapertura (cerrado -> reabierto) NO se loguea acá
--      porque ya la registra la RPC con su motivo.
create or replace function public.caja_turnos_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if OLD.estado = 'reabierto' and NEW.estado = 'cerrado' then
    insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
    values (NEW.id, 'recierre', jsonb_build_object(
      'cierre_monto',      jsonb_build_object('antes', OLD.cierre_monto,      'despues', NEW.cierre_monto),
      'efectivo_esperado', jsonb_build_object('antes', OLD.efectivo_esperado, 'despues', NEW.efectivo_esperado),
      'diferencia',        jsonb_build_object('antes', OLD.diferencia,        'despues', NEW.diferencia),
      'notas_cierre',      jsonb_build_object('antes', OLD.notas_cierre,      'despues', NEW.notas_cierre)
    ));
  elsif OLD.estado = 'reabierto' and NEW.estado = 'reabierto' and (
       OLD.cierre_monto         is distinct from NEW.cierre_monto
    or OLD.efectivo_esperado    is distinct from NEW.efectivo_esperado
    or OLD.diferencia           is distinct from NEW.diferencia
    or OLD.notas_cierre         is distinct from NEW.notas_cierre
    or OLD.denominaciones_cierre is distinct from NEW.denominaciones_cierre
  ) then
    insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
    values (NEW.id, 'cierre_editado', jsonb_build_object(
      'cierre_monto', jsonb_build_object('antes', OLD.cierre_monto, 'despues', NEW.cierre_monto),
      'diferencia',   jsonb_build_object('antes', OLD.diferencia,   'despues', NEW.diferencia)
    ));
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_caja_turnos_audit on public.caja_turnos;
create trigger trg_caja_turnos_audit
  after update on public.caja_turnos
  for each row execute function public.caja_turnos_audit();

-- 4.c) Pagos: reasignación de un pago a un turno reabierto.
create or replace function public.pagos_reasignacion_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado text;
begin
  if NEW.caja_turno_id is distinct from OLD.caja_turno_id
     and NEW.caja_turno_id is not null then
    select estado into v_estado from public.caja_turnos where id = NEW.caja_turno_id;
    if v_estado = 'reabierto' then
      insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
      values (NEW.caja_turno_id, 'pago_reasignado', jsonb_build_object(
        'pago_id',        NEW.id,
        'turno_anterior', OLD.caja_turno_id,
        'monto',          NEW.monto,
        'medio_pago',     NEW.medio_pago
      ));
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_pagos_reasignacion_audit on public.pagos;
create trigger trg_pagos_reasignacion_audit
  after update on public.pagos
  for each row execute function public.pagos_reasignacion_audit();

notify pgrst, 'reload schema';
