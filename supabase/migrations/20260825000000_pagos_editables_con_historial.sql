-- ============================================================
-- Migración: los pagos se pueden editar y anular SIN romper la caja,
--            y cada cambio queda en un historial
--
-- El problema de fondo: al registrar un pago, `registrar_pago()` escribe DOS
-- filas — el egreso y su reflejo, que puede ser un movimiento de la caja del
-- día (`caja_movimientos`) o uno de la caja fuerte (`caja_fuerte_movimientos`).
-- Editar el egreso desde Finanzas tocaba SOLO la primera: el reflejo quedaba
-- con el monto viejo y el arqueo y el saldo de la caja fuerte pasaban a estar
-- mal, sin que nadie se enterara. El propio cartel de borrar lo admitía:
-- "Si salió de una caja, el movimiento de esa caja NO se revierte solo."
--
-- Además la caja fuerte no tiene policy de escritura a propósito (todo pasa
-- por RPC), así que su reflejo era directamente intocable desde la pantalla.
--
-- Esta migración agrega:
--   1) `egresos_auditoria` + trigger: historial de TODO cambio sobre un pago,
--      con el antes y el después de cada campo, el usuario y la fecha. Escucha
--      a la tabla, así que también registra las ediciones que no pasan por el
--      RPC. Sobrevive al borrado del pago: el historial no se va con él.
--   2) `editar_pago()`: corrige el pago Y su reflejo en la misma operación,
--      moviéndolo entre caja / caja fuerte / banco si cambia el origen.
--      También resuelve el agujero de marcar "pagado" un pendiente: hasta
--      ahora la plata salía sin dejar ningún movimiento de caja.
--   3) `anular_pago()`: borra el pago y revierte su reflejo, con motivo.
--
-- No toca datos existentes. Es idempotente.
-- ============================================================

-- ── 1) El historial ─────────────────────────────────────────────────────────
-- Sin foreign key a propósito: si el pago se anula, su historial tiene que
-- quedar (es justamente cuando más importa saber qué pasó y quién lo hizo).
create table if not exists public.egresos_auditoria (
  id          uuid primary key default gen_random_uuid(),
  egreso_id   uuid not null,
  evento      text not null,
  motivo      text,
  detalle     jsonb not null default '{}'::jsonb,
  usuario_id  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint egresos_auditoria_evento_check
    check (evento = any (array['creado', 'editado', 'anulado']))
);

comment on table public.egresos_auditoria is
  'Historial de los pagos del negocio: alta, cada edición (con el antes y el después de cada campo) y la anulación con su motivo. Se conserva aunque el pago se borre.';

create index if not exists egresos_auditoria_egreso_idx
  on public.egresos_auditoria (egreso_id, created_at desc);

alter table public.egresos_auditoria enable row level security;

-- Lo lee quien puede ver pagos o egresos. ESCRITURA: sin policy a propósito —
-- solo escribe el trigger, que es security definer. El historial no se toca
-- a mano ni se puede maquillar.
drop policy if exists "egresos_auditoria lectura" on public.egresos_auditoria;
create policy "egresos_auditoria lectura"
  on public.egresos_auditoria
  for select
  to authenticated
  using (
    public.tiene_permiso('pagos', 'ver')
    or public.puede_tabla('egresos', 'ver')
    or public.is_finanzas_user()
  );

grant select on public.egresos_auditoria to authenticated;

-- ── 2) El trigger que llena el historial ────────────────────────────────────
-- Escucha a la tabla, no al RPC: así queda registrada cualquier edición,
-- venga de donde venga.
create or replace function public.egresos_audit() returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_cambios jsonb;
  v_motivo  text;
begin
  if TG_OP = 'INSERT' then
    insert into public.egresos_auditoria (egreso_id, evento, detalle)
    values (NEW.id, 'creado', jsonb_build_object('nuevo', to_jsonb(NEW)));
    return NEW;
  end if;

  if TG_OP = 'DELETE' then
    -- anular_pago() deja el motivo acá para que quede junto al registro.
    v_motivo := nullif(current_setting('app.motivo_anulacion', true), '');
    insert into public.egresos_auditoria (egreso_id, evento, motivo, detalle)
    values (OLD.id, 'anulado', v_motivo, jsonb_build_object('anterior', to_jsonb(OLD)));
    return OLD;
  end if;

  -- UPDATE: solo los campos que realmente cambiaron, con antes y después.
  -- updated_at cambia en cada guardado por su propio trigger: no es un cambio.
  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  select coalesce(
           jsonb_object_agg(e.key, jsonb_build_object('antes', v_old -> e.key, 'despues', e.value)),
           '{}'::jsonb)
    into v_cambios
    from jsonb_each(v_new) e
   where e.key <> 'updated_at'
     and (v_old -> e.key) is distinct from e.value;

  if v_cambios = '{}'::jsonb then
    return NEW;
  end if;

  insert into public.egresos_auditoria (egreso_id, evento, motivo, detalle)
  values (
    NEW.id,
    'editado',
    nullif(current_setting('app.motivo_edicion', true), ''),
    jsonb_build_object('cambios', v_cambios)
  );
  return NEW;
end;
$$;

drop trigger if exists trg_egresos_audit on public.egresos;
create trigger trg_egresos_audit
  after insert or update or delete on public.egresos
  for each row execute function public.egresos_audit();

-- ── 3) editar_pago: corrige el pago y su reflejo, todo o nada ───────────────
-- Espeja a registrar_pago(): mismos campos, mismas validaciones y la misma
-- resolución del origen de la plata.
create or replace function public.editar_pago(
  p_egreso_id    uuid,
  p_categoria    text,
  p_descripcion  text,
  p_monto        numeric,
  p_medio_pago   text default 'efectivo',
  p_estado       text default 'pagado',
  p_fecha        date default null,
  p_proveedor_id uuid default null,
  p_empleado_id  uuid default null,
  p_subtipo      text default null,
  p_periodo      text default null,
  p_vencimiento  date default null,
  p_comprobante  text default null,
  p_notas        text default null,
  p_origen       text default 'auto',
  p_motivo       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_egreso       public.egresos%rowtype;
  v_turno_ab     uuid;
  v_turno_dest   uuid;
  v_origen       text;
  v_es_cash      boolean;
  v_es_pagado    boolean;
  v_turno_egreso uuid;
  v_mov_id       uuid;
  v_cf_id        uuid;
  v_desc         text := trim(p_descripcion);
begin
  if not (public.tiene_permiso('pagos', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para editar pagos.';
  end if;

  select * into v_egreso from public.egresos where id = p_egreso_id for update;
  if not found then
    raise exception 'No encontré ese pago.';
  end if;

  if coalesce(v_desc, '') = '' then
    raise exception 'Falta la descripción del pago.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.';
  end if;
  if p_estado not in ('pagado', 'pendiente') then
    raise exception 'Estado inválido: %', p_estado;
  end if;
  if p_categoria = 'sueldos' and p_empleado_id is null then
    raise exception 'Un pago de sueldos necesita el empleado.';
  end if;
  if p_origen not in ('auto', 'caja', 'caja_fuerte', 'banco', 'ninguno') then
    raise exception 'Origen inválido: %', p_origen;
  end if;

  select ct.id into v_turno_ab
  from public.caja_turnos ct
  where ct.estado = 'abierto'
  order by ct.created_at desc
  limit 1;

  -- Si el pago ya estaba enganchado a un turno, se queda en ESE turno: un pago
  -- de la semana pasada no se muda al turno de hoy porque se corrigió un monto.
  v_turno_dest := coalesce(v_egreso.caja_turno_id, v_turno_ab);

  v_es_pagado := (p_estado = 'pagado');
  v_es_cash   := (v_es_pagado and p_medio_pago = 'efectivo');

  -- 'auto' en una edición = mantener el origen que ya tenía, si sigue teniendo
  -- sentido con el medio de pago nuevo.
  if not v_es_pagado then
    v_origen := null;
  elsif p_origen = 'banco'
     or (p_origen = 'auto' and v_egreso.pagado_desde = 'banco') then
    if p_medio_pago <> 'transferencia' then
      if p_origen = 'banco' then
        raise exception 'El origen "banco" es solo para pagos por transferencia.';
      end if;
      v_origen := null;
    else
      v_origen := 'banco';
    end if;
  elsif not v_es_cash then
    v_origen := null;
  elsif p_origen = 'caja_fuerte'
     or (p_origen = 'auto' and v_egreso.pagado_desde = 'caja_fuerte') then
    v_origen := 'caja_fuerte';
  elsif p_origen = 'caja'
     or (p_origen = 'auto' and v_egreso.pagado_desde = 'caja') then
    if v_turno_dest is null then
      raise exception 'Ese pago salía de la caja del día y no hay ningún turno al que engancharlo: abrí un turno o elegí caja fuerte.';
    end if;
    v_origen := 'caja';
  elsif p_origen = 'auto' and v_turno_ab is not null then
    v_origen := 'caja';
  else
    v_origen := null;
  end if;

  v_turno_egreso := case
    when v_origen in ('caja', 'banco') then v_turno_dest
    else null
  end;

  if p_motivo is not null and trim(p_motivo) <> '' then
    perform set_config('app.motivo_edicion', trim(p_motivo), true);
  end if;

  update public.egresos
  set fecha           = coalesce(p_fecha, v_egreso.fecha),
      categoria       = p_categoria,
      subtipo         = p_subtipo,
      descripcion     = v_desc,
      monto           = p_monto,
      medio_pago      = p_medio_pago,
      estado          = p_estado,
      vencimiento     = case when p_estado = 'pendiente' then p_vencimiento else null end,
      periodo         = coalesce(p_periodo, v_egreso.periodo),
      proveedor_id    = p_proveedor_id,
      empleado_id     = p_empleado_id,
      comprobante_nro = p_comprobante,
      notas           = p_notas,
      caja_turno_id   = v_turno_egreso,
      pagado_desde    = v_origen
  where id = p_egreso_id;

  -- ── El reflejo ───────────────────────────────────────────────────────────
  -- Se corrige el que ya existe (queda como edición del movimiento) y se
  -- elimina el del otro origen si el pago se mudó de caja.
  select cm.id into v_mov_id
  from public.caja_movimientos cm where cm.egreso_id = p_egreso_id limit 1;
  select cf.id into v_cf_id
  from public.caja_fuerte_movimientos cf where cf.egreso_id = p_egreso_id limit 1;

  if v_origen in ('caja', 'banco') then
    if v_cf_id is not null then
      delete from public.caja_fuerte_movimientos where id = v_cf_id;
      v_cf_id := null;
    end if;
    if v_mov_id is not null then
      update public.caja_movimientos
      set turno_id    = v_turno_dest,
          monto       = p_monto,
          categoria   = p_categoria,
          medio_pago  = case when v_origen = 'banco' then 'transferencia' else 'efectivo' end,
          descripcion = case when v_origen = 'banco'
                             then 'Pago por transferencia: ' || v_desc
                             else 'Pago: ' || v_desc end
      where id = v_mov_id;
    else
      insert into public.caja_movimientos (
        turno_id, tipo, medio_pago, monto, categoria, descripcion, egreso_id, usuario_id
      ) values (
        v_turno_dest, 'egreso',
        case when v_origen = 'banco' then 'transferencia' else 'efectivo' end,
        p_monto, p_categoria,
        case when v_origen = 'banco'
             then 'Pago por transferencia: ' || v_desc
             else 'Pago: ' || v_desc end,
        p_egreso_id, auth.uid()
      )
      returning id into v_mov_id;
    end if;

  elsif v_origen = 'caja_fuerte' then
    if v_mov_id is not null then
      delete from public.caja_movimientos where id = v_mov_id;
      v_mov_id := null;
    end if;
    if v_cf_id is not null then
      update public.caja_fuerte_movimientos
      set monto = p_monto, descripcion = 'Pago: ' || v_desc
      where id = v_cf_id;
    else
      insert into public.caja_fuerte_movimientos (tipo, monto, descripcion, egreso_id, usuario_id)
      values ('egreso', p_monto, 'Pago: ' || v_desc, p_egreso_id, auth.uid())
      returning id into v_cf_id;
    end if;

  else
    -- Volvió a pendiente, o pasó a un medio que no mueve efectivo: la plata
    -- vuelve a la caja de donde había salido.
    if v_mov_id is not null then
      delete from public.caja_movimientos where id = v_mov_id;
      v_mov_id := null;
    end if;
    if v_cf_id is not null then
      delete from public.caja_fuerte_movimientos where id = v_cf_id;
      v_cf_id := null;
    end if;
  end if;

  return jsonb_build_object(
    'egreso_id', p_egreso_id,
    'origen', v_origen,
    'caja_turno_id', v_turno_egreso,
    'movimiento_id', v_mov_id,
    'caja_fuerte_movimiento_id', v_cf_id,
    'descuenta_arqueo', v_mov_id is not null
  );
end $$;

comment on function public.editar_pago(uuid, text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text, text) is
  'Corrige un egreso Y su reflejo en la caja del día o en la caja fuerte, en una sola operación. p_origen: auto (mantiene el que tenía) | caja | caja_fuerte | banco | ninguno. Todo o nada.';

revoke all on function public.editar_pago(uuid, text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text, text) from public;
grant execute on function public.editar_pago(uuid, text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text, text) to authenticated;
grant execute on function public.editar_pago(uuid, text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text, text) to service_role;

-- ── 4) anular_pago: borra el pago y devuelve la plata a su caja ─────────────
create or replace function public.anular_pago(
  p_egreso_id uuid,
  p_motivo    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_egreso public.egresos%rowtype;
  v_movs   int := 0;
  v_cfs    int := 0;
begin
  if not (public.tiene_permiso('pagos', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para anular pagos.';
  end if;

  select * into v_egreso from public.egresos where id = p_egreso_id for update;
  if not found then
    raise exception 'No encontré ese pago.';
  end if;

  -- El reflejo se va con el pago: si no, la caja quedaría descontada por un
  -- pago que ya no existe.
  delete from public.caja_movimientos where egreso_id = p_egreso_id;
  get diagnostics v_movs = row_count;
  delete from public.caja_fuerte_movimientos where egreso_id = p_egreso_id;
  get diagnostics v_cfs = row_count;

  -- El motivo viaja al trigger, que es quien escribe el historial.
  if p_motivo is not null and trim(p_motivo) <> '' then
    perform set_config('app.motivo_anulacion', trim(p_motivo), true);
  end if;

  delete from public.egresos where id = p_egreso_id;

  return jsonb_build_object(
    'egreso_id', p_egreso_id,
    'monto', v_egreso.monto,
    'origen', v_egreso.pagado_desde,
    'movimientos_revertidos', v_movs + v_cfs
  );
end $$;

comment on function public.anular_pago(uuid, text) is
  'Anula un egreso y revierte su movimiento de caja o de caja fuerte. El motivo queda en egresos_auditoria junto con el pago completo.';

revoke all on function public.anular_pago(uuid, text) from public;
grant execute on function public.anular_pago(uuid, text) to authenticated;
grant execute on function public.anular_pago(uuid, text) to service_role;

notify pgrst, 'reload schema';
