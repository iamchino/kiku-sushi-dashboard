-- ============================================================
-- Migración: el turno de caja ABIERTO se puede corregir, y queda auditado
--
-- Hasta ahora, para tocar cualquier cosa de un turno había que cerrarlo y
-- reabrirlo: solo en estado 'reabierto' se podían editar los movimientos y
-- sacar pagos, y la apertura (caja, fecha operativa, fondo inicial, hora,
-- notas) no se podía cambiar nunca después de abrir el turno.
--
-- El permiso para editar ya existía (la policy de `caja_turnos` nunca miró el
-- estado): lo que faltaba era la pantalla, que ya está. Lo que faltaba del
-- lado de la base es la AUDITORÍA — los tres triggers de auditoría se
-- cortaban si el turno no estaba 'reabierto', así que una corrección sobre un
-- turno abierto no dejaba ningún rastro.
--
-- Esta migración:
--   1) suma el evento 'turno_editado'
--   2) registra los cambios de apertura en cualquier estado
--   3) registra editar/borrar movimientos también con el turno abierto
--      (el alta de un movimiento NO se audita en un turno abierto: es la
--       operación normal del día, no una corrección)
--   4) registra también cuando se SACA un pago de un turno, que antes no
--      quedaba asentado en ningún lado
--
-- Solo agrega registro: no cambia ningún dato ni ningún permiso.
-- Es idempotente.
-- ============================================================

-- ── 1) Nuevo evento en la auditoría ─────────────────────────────────────────
alter table public.caja_turnos_auditoria
  drop constraint if exists caja_turnos_auditoria_evento_check;

alter table public.caja_turnos_auditoria
  add constraint caja_turnos_auditoria_evento_check check (evento = any (array[
    'reapertura',
    'recierre',
    'cierre_editado',
    'turno_editado',
    'movimiento_creado',
    'movimiento_editado',
    'movimiento_eliminado',
    'pago_reasignado'
  ]));

-- ── 2) Cambios sobre el turno ───────────────────────────────────────────────
-- Se conservan tal cual los dos casos que ya existían (recierre y
-- cierre_editado) y se suma 'turno_editado' para los datos de apertura.
create or replace function public.caja_turnos_audit() returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
       OLD.cierre_monto          is distinct from NEW.cierre_monto
    or OLD.efectivo_esperado     is distinct from NEW.efectivo_esperado
    or OLD.diferencia            is distinct from NEW.diferencia
    or OLD.notas_cierre          is distinct from NEW.notas_cierre
    or OLD.denominaciones_cierre is distinct from NEW.denominaciones_cierre
  ) then
    insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
    values (NEW.id, 'cierre_editado', jsonb_build_object(
      'cierre_monto', jsonb_build_object('antes', OLD.cierre_monto, 'despues', NEW.cierre_monto),
      'diferencia',   jsonb_build_object('antes', OLD.diferencia,   'despues', NEW.diferencia)
    ));
  end if;

  -- Corrección de los datos de apertura, en cualquier estado. El fondo
  -- inicial mueve el efectivo esperado del arqueo: tiene que dejar rastro.
  if OLD.caja_nombre    is distinct from NEW.caja_nombre
  or OLD.business_date  is distinct from NEW.business_date
  or OLD.apertura_monto is distinct from NEW.apertura_monto
  or OLD.apertura_at    is distinct from NEW.apertura_at
  or OLD.notas_apertura is distinct from NEW.notas_apertura then
    insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
    values (NEW.id, 'turno_editado', jsonb_build_object(
      'estado',         NEW.estado,
      'caja_nombre',    jsonb_build_object('antes', OLD.caja_nombre,    'despues', NEW.caja_nombre),
      'business_date',  jsonb_build_object('antes', OLD.business_date,  'despues', NEW.business_date),
      'apertura_monto', jsonb_build_object('antes', OLD.apertura_monto, 'despues', NEW.apertura_monto),
      'apertura_at',    jsonb_build_object('antes', OLD.apertura_at,    'despues', NEW.apertura_at),
      'notas_apertura', jsonb_build_object('antes', OLD.notas_apertura, 'despues', NEW.notas_apertura)
    ));
  end if;

  return NEW;
end;
$$;

-- ── 3) Movimientos: editar y borrar también se auditan con turno abierto ────
create or replace function public.caja_movimientos_audit() returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_turno_id uuid := coalesce(NEW.turno_id, OLD.turno_id);
  v_estado   text;
begin
  if v_turno_id is null then
    return coalesce(NEW, OLD);
  end if;

  select estado into v_estado from public.caja_turnos where id = v_turno_id;

  if v_estado is null or v_estado not in ('abierto', 'reabierto') then
    return coalesce(NEW, OLD);
  end if;

  if TG_OP = 'INSERT' then
    -- En un turno abierto, cargar un movimiento es la operación normal del
    -- día: no es una corrección y no ensucia la auditoría.
    if v_estado = 'reabierto' then
      insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
      values (NEW.turno_id, 'movimiento_creado',
              jsonb_build_object('nuevo', to_jsonb(NEW)));
    end if;
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

-- ── 4) Pagos: sacar un pago de un turno también queda asentado ──────────────
-- Antes solo se registraba al ASIGNAR un pago a un turno reabierto. Sacar un
-- pago no dejaba rastro en ningún lado, y mover uno de un turno a otro
-- tampoco quedaba anotado en el turno de origen.
create or replace function public.pagos_reasignacion_audit() returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_estado_nuevo text;
begin
  if NEW.caja_turno_id is not distinct from OLD.caja_turno_id then
    return NEW;
  end if;

  -- Se fue de un turno: siempre se asienta en el turno de origen.
  if OLD.caja_turno_id is not null then
    insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
    values (OLD.caja_turno_id, 'pago_reasignado', jsonb_build_object(
      'pago_id',       NEW.id,
      'movimiento',    case when NEW.caja_turno_id is null then 'quitado' else 'movido' end,
      'turno_destino', NEW.caja_turno_id,
      'monto',         NEW.monto,
      'medio_pago',    NEW.medio_pago
    ));
  end if;

  -- Llegó a un turno. Cuando el pago no venía de ningún turno (adjudicar
  -- pagos sueltos) solo se asienta si el turno está reabierto: en un turno
  -- abierto eso es la operación normal de conciliación del día.
  if NEW.caja_turno_id is not null then
    select estado into v_estado_nuevo from public.caja_turnos where id = NEW.caja_turno_id;
    if OLD.caja_turno_id is not null or v_estado_nuevo = 'reabierto' then
      insert into public.caja_turnos_auditoria (turno_id, evento, detalle)
      values (NEW.caja_turno_id, 'pago_reasignado', jsonb_build_object(
        'pago_id',        NEW.id,
        'movimiento',     'asignado',
        'turno_anterior', OLD.caja_turno_id,
        'monto',          NEW.monto,
        'medio_pago',     NEW.medio_pago
      ));
    end if;
  end if;

  return NEW;
end;
$$;

notify pgrst, 'reload schema';
