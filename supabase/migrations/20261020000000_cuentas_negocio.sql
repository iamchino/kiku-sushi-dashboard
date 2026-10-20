-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Cuentas del negocio (de dónde salen las transferencias)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta ahora había UNA sola cuenta, escrita como texto en
-- web_config.banco_cuenta ("Kiku SAS — Galicia"). Al registrar un pago por
-- transferencia se elegía esa o "otra cuenta". El equipo pide poder cargar
-- más cuentas (ej. "Mercado Pago KIKU SUSHI") desde el dashboard.
--
-- Qué hace:
--   1) Tabla `cuentas_negocio`: nombre, tipo (banco / billetera / otro),
--      activa, orden. La administran admin y finanzas desde
--      Configuración → Negocio. Se siembra con la cuenta que ya existía en
--      web_config.banco_cuenta y con "Mercado Pago KIKU SUSHI".
--   2) `egresos.cuenta_id`: de qué cuenta salió el pago (solo con
--      pagado_desde = 'banco'). Backfill: los pagos viejos con origen banco
--      quedan en la primera cuenta (la única que existía).
--   3) `registrar_pago()` y `editar_pago()` reciben `p_cuenta_id`. Toda la
--      lógica de caja / arqueo queda EXACTAMENTE igual: origen 'banco' sigue
--      siendo origen 'banco' (el trigger caja_mov_afecta_arqueo no cambia); lo
--      único nuevo es que el pago sabe de qué cuenta salió y el movimiento del
--      turno lo dice en la descripción.
--      Si no se manda cuenta (dashboard viejo), usa la primera activa.
--   4) web_config.banco_cuenta queda en la tabla pero el dashboard ya no la
--      usa (la lista manda).
--
-- Idempotente: se puede correr más de una vez.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) La tabla ─────────────────────────────────────────────────────────────
create table if not exists public.cuentas_negocio (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  tipo        text not null default 'banco',
  activa      boolean not null default true,
  orden       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint cuentas_negocio_tipo_check check (tipo in ('banco', 'billetera', 'otro')),
  constraint cuentas_negocio_nombre_check check (length(trim(nombre)) between 1 and 80)
);

comment on table public.cuentas_negocio is
  'Cuentas desde las que el negocio hace transferencias (banco, Mercado Pago, etc.). Se eligen al registrar un pago por transferencia. Solo etiqueta: el dashboard no se conecta a ninguna cuenta.';
comment on column public.cuentas_negocio.tipo is 'banco | billetera (Mercado Pago, Ualá…) | otro';
comment on column public.cuentas_negocio.activa is 'false = no se ofrece al registrar pagos nuevos; los pagos viejos la siguen mostrando';
comment on column public.cuentas_negocio.orden is 'Orden en el desplegable (menor primero). La primera activa es la que se usa si no se elige ninguna.';

create unique index if not exists cuentas_negocio_nombre_unico
  on public.cuentas_negocio (lower(trim(nombre)));

create index if not exists cuentas_negocio_activas_idx
  on public.cuentas_negocio (activa, orden, nombre);

-- updated_at automático (misma función que usan las demás tablas si existe;
-- si no, una propia).
create or replace function public.cuentas_negocio_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_cuentas_negocio_touch on public.cuentas_negocio;
create trigger trg_cuentas_negocio_touch
  before update on public.cuentas_negocio
  for each row execute function public.cuentas_negocio_touch();

-- RLS: la ve cualquier usuario logueado (hace falta para el desplegable de
-- pagos); la escriben admin y finanzas.
alter table public.cuentas_negocio enable row level security;

drop policy if exists "cuentas_negocio lectura" on public.cuentas_negocio;
create policy "cuentas_negocio lectura"
  on public.cuentas_negocio for select
  to authenticated
  using (true);

drop policy if exists "cuentas_negocio escriben admin y finanzas" on public.cuentas_negocio;
create policy "cuentas_negocio escriben admin y finanzas"
  on public.cuentas_negocio for all
  to authenticated
  using (public.is_admin() or public.is_finanzas_user())
  with check (public.is_admin() or public.is_finanzas_user());

revoke all on public.cuentas_negocio from anon;
grant select, insert, update, delete on public.cuentas_negocio to authenticated;
grant all on public.cuentas_negocio to service_role;

-- ── 2) Siembra: la cuenta que ya existía + Mercado Pago ─────────────────────
do $$
declare
  v_banco text;
begin
  select nullif(trim(banco_cuenta), '') into v_banco
    from public.web_config where id = 1;
  v_banco := coalesce(v_banco, 'Kiku SAS — Galicia');

  if not exists (select 1 from public.cuentas_negocio where lower(trim(nombre)) = lower(trim(v_banco))) then
    insert into public.cuentas_negocio (nombre, tipo, activa, orden)
    values (v_banco, 'banco', true, 0);
  end if;

  if not exists (select 1 from public.cuentas_negocio where lower(trim(nombre)) = lower('Mercado Pago KIKU SUSHI')) then
    insert into public.cuentas_negocio (nombre, tipo, activa, orden)
    values ('Mercado Pago KIKU SUSHI', 'billetera', true, 1);
  end if;
end $$;

-- ── 3) egresos.cuenta_id ────────────────────────────────────────────────────
alter table public.egresos
  add column if not exists cuenta_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'egresos_cuenta_id_fkey' and conrelid = 'public.egresos'::regclass
  ) then
    alter table public.egresos
      add constraint egresos_cuenta_id_fkey
      foreign key (cuenta_id) references public.cuentas_negocio(id)
      on delete set null;
  end if;
end $$;

create index if not exists egresos_cuenta_id_idx on public.egresos (cuenta_id);

comment on column public.egresos.cuenta_id is
  'Cuenta del negocio de la que salió la transferencia (solo con pagado_desde = banco). Null si no se registró.';

-- Backfill: los pagos viejos con origen banco salieron de la única cuenta que
-- existía (la primera por orden). Sin motivo de edición: el trigger de
-- auditoría igual deja constancia del cambio.
update public.egresos e
   set cuenta_id = (
     select c.id from public.cuentas_negocio c
     order by c.orden, c.created_at limit 1
   )
 where e.pagado_desde = 'banco'
   and e.cuenta_id is null;

-- ── 4) registrar_pago / editar_pago con p_cuenta_id ─────────────────────────
-- Se borran TODAS las versiones anteriores (cualquier firma) para que no quede
-- una sobrecarga ambigua para PostgREST, y se vuelven a crear con el parámetro
-- nuevo al final (default null: el dashboard viejo sigue funcionando).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('registrar_pago', 'editar_pago')
  loop
    execute format('drop function %s', r.firma);
  end loop;
end $$;

-- Resuelve la cuenta de un pago con origen banco:
--   · si viene p_cuenta_id, tiene que existir (y estar activa, salvo que sea
--     la que el pago ya tenía);
--   · si no viene, la primera activa (compatibilidad con el dashboard viejo);
--   · si no hay ninguna cuenta, null (el pago igual se registra).
create or replace function public.resolver_cuenta_negocio(p_cuenta_id uuid, p_cuenta_actual uuid default null)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id uuid;
  v_activa boolean;
begin
  if p_cuenta_id is not null then
    select c.id, c.activa into v_id, v_activa
      from public.cuentas_negocio c where c.id = p_cuenta_id;
    if v_id is null then
      raise exception 'Esa cuenta del negocio no existe.';
    end if;
    if not v_activa and p_cuenta_id is distinct from p_cuenta_actual then
      raise exception 'Esa cuenta está desactivada: activala en Configuración → Negocio o elegí otra.';
    end if;
    return v_id;
  end if;
  if p_cuenta_actual is not null then
    return p_cuenta_actual;
  end if;
  select c.id into v_id
    from public.cuentas_negocio c
   where c.activa
   order by c.orden, c.created_at
   limit 1;
  return v_id;
end $$;

revoke all on function public.resolver_cuenta_negocio(uuid, uuid) from public;
grant execute on function public.resolver_cuenta_negocio(uuid, uuid) to authenticated, service_role;

-- Texto para la descripción del movimiento del turno.
create or replace function public.nombre_cuenta_negocio(p_cuenta_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select c.nombre from public.cuentas_negocio c where c.id = p_cuenta_id
$$;

revoke all on function public.nombre_cuenta_negocio(uuid) from public;
grant execute on function public.nombre_cuenta_negocio(uuid) to authenticated, service_role;

create or replace function public.registrar_pago(
  p_categoria    text,
  p_descripcion  text,
  p_monto        numeric,
  p_medio_pago   text default 'efectivo',
  p_estado       text default 'pagado',
  p_fecha        date default current_date,
  p_proveedor_id uuid default null,
  p_empleado_id  uuid default null,
  p_subtipo      text default null,
  p_periodo      text default null,
  p_vencimiento  date default null,
  p_comprobante  text default null,
  p_notas        text default null,
  p_origen       text default 'auto',
  p_cuenta_id    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno_id      uuid;
  v_egreso_id     uuid;
  v_mov_id        uuid;
  v_cf_id         uuid;
  v_origen        text;
  v_es_cash       boolean;
  v_es_pagado     boolean;
  v_turno_egreso  uuid;
  v_cuenta_id     uuid;
  v_cuenta_nombre text;
begin
  if not (public.tiene_permiso('pagos', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para registrar pagos.';
  end if;
  if coalesce(trim(p_descripcion), '') = '' then
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

  select ct.id into v_turno_id
  from public.caja_turnos ct
  where ct.estado = 'abierto'
  order by ct.created_at desc
  limit 1;

  v_es_pagado := (p_estado = 'pagado');
  v_es_cash   := (v_es_pagado and p_medio_pago = 'efectivo');

  -- Resolver el origen de la plata
  if not v_es_pagado then
    v_origen := null;                    -- pendiente: todavía no salió nada
  elsif p_origen = 'banco' then
    if p_medio_pago <> 'transferencia' then
      raise exception 'El origen "banco" es solo para pagos por transferencia.';
    end if;
    v_origen := 'banco';
  elsif not v_es_cash then
    v_origen := null;                    -- tarjetas/cheque: no descuentan efectivo
  elsif p_origen = 'caja_fuerte' then
    v_origen := 'caja_fuerte';
  elsif p_origen = 'caja' then
    if v_turno_id is null then
      raise exception 'No hay un turno de caja abierto: elegí caja fuerte u otro origen.';
    end if;
    v_origen := 'caja';
  elsif p_origen = 'auto' and v_turno_id is not null then
    v_origen := 'caja';
  else
    v_origen := null;                    -- 'ninguno', o auto sin turno
  end if;

  -- La cuenta solo tiene sentido con origen banco.
  if v_origen = 'banco' then
    v_cuenta_id     := public.resolver_cuenta_negocio(p_cuenta_id, null);
    v_cuenta_nombre := public.nombre_cuenta_negocio(v_cuenta_id);
  else
    v_cuenta_id := null;
  end if;

  -- El egreso se vincula al turno cuando la plata sale de la caja del día o
  -- del banco con el turno abierto (en ambos casos mueve el arqueo).
  v_turno_egreso := case
    when v_origen = 'caja' then v_turno_id
    when v_origen = 'banco' then v_turno_id
    else null
  end;

  insert into public.egresos (
    fecha, categoria, subtipo, descripcion, monto, medio_pago, estado,
    vencimiento, periodo, proveedor_id, empleado_id, comprobante_nro, notas,
    caja_turno_id, pagado_desde, cuenta_id, usuario_id
  ) values (
    coalesce(p_fecha, current_date), p_categoria, p_subtipo, trim(p_descripcion),
    p_monto, p_medio_pago, p_estado,
    p_vencimiento, p_periodo, p_proveedor_id, p_empleado_id, p_comprobante, p_notas,
    v_turno_egreso, v_origen, v_cuenta_id, auth.uid()
  )
  returning id into v_egreso_id;

  if v_origen = 'caja' then
    insert into public.caja_movimientos (
      turno_id, tipo, medio_pago, monto, categoria, descripcion, egreso_id, usuario_id
    ) values (
      v_turno_id, 'egreso', 'efectivo', p_monto, p_categoria,
      'Pago: ' || trim(p_descripcion), v_egreso_id, auth.uid()
    )
    returning id into v_mov_id;

  elsif v_origen = 'banco' and v_turno_id is not null then
    -- Se lista en el turno; el trigger caja_mov_afecta_arqueo lo deja fuera
    -- de las sumas del arqueo (la cuenta no pasa por la caja del local).
    insert into public.caja_movimientos (
      turno_id, tipo, medio_pago, monto, categoria, descripcion, egreso_id, usuario_id
    ) values (
      v_turno_id, 'egreso', 'transferencia', p_monto, p_categoria,
      'Pago por transferencia'
        || coalesce(' (' || v_cuenta_nombre || ')', '')
        || ': ' || trim(p_descripcion),
      v_egreso_id, auth.uid()
    )
    returning id into v_mov_id;

  elsif v_origen = 'caja_fuerte' then
    insert into public.caja_fuerte_movimientos (tipo, monto, descripcion, egreso_id, usuario_id)
    values ('egreso', p_monto, 'Pago: ' || trim(p_descripcion), v_egreso_id, auth.uid())
    returning id into v_cf_id;
  end if;

  return jsonb_build_object(
    'egreso_id', v_egreso_id,
    'origen', v_origen,
    'cuenta_id', v_cuenta_id,
    'cuenta_nombre', v_cuenta_nombre,
    'caja_turno_id', v_turno_egreso,
    'movimiento_id', v_mov_id,
    'caja_fuerte_movimiento_id', v_cf_id,
    'descuenta_arqueo', v_mov_id is not null
  );
end $$;

comment on function public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text, uuid) is
  'Alta centralizada de egresos. p_origen: auto | caja | caja_fuerte | banco | ninguno. Caja descuenta el efectivo del arqueo; caja fuerte descuenta su saldo; banco (solo transferencias) se lista en el turno sin afectar el arqueo y guarda de qué cuenta salió (p_cuenta_id; si falta, la primera activa). Todo o nada.';

revoke all on function public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text, uuid) from public;
grant execute on function public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text, uuid) to authenticated;
grant execute on function public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text, uuid) to service_role;

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
  p_motivo       text default null,
  p_cuenta_id    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_egreso        public.egresos%rowtype;
  v_turno_ab      uuid;
  v_turno_dest    uuid;
  v_origen        text;
  v_es_cash       boolean;
  v_es_pagado     boolean;
  v_turno_egreso  uuid;
  v_mov_id        uuid;
  v_cf_id         uuid;
  v_desc          text := trim(p_descripcion);
  v_cuenta_id     uuid;
  v_cuenta_nombre text;
  v_desc_mov      text;
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

  -- Cuenta: la que viene; si no viene, la que ya tenía; si tampoco, la primera activa.
  if v_origen = 'banco' then
    v_cuenta_id     := public.resolver_cuenta_negocio(p_cuenta_id, v_egreso.cuenta_id);
    v_cuenta_nombre := public.nombre_cuenta_negocio(v_cuenta_id);
  else
    v_cuenta_id := null;
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
      pagado_desde    = v_origen,
      cuenta_id       = v_cuenta_id
  where id = p_egreso_id;

  v_desc_mov := case when v_origen = 'banco'
                     then 'Pago por transferencia'
                          || coalesce(' (' || v_cuenta_nombre || ')', '')
                          || ': ' || v_desc
                     else 'Pago: ' || v_desc end;

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
          descripcion = v_desc_mov
      where id = v_mov_id;
    else
      insert into public.caja_movimientos (
        turno_id, tipo, medio_pago, monto, categoria, descripcion, egreso_id, usuario_id
      ) values (
        v_turno_dest, 'egreso',
        case when v_origen = 'banco' then 'transferencia' else 'efectivo' end,
        p_monto, p_categoria, v_desc_mov,
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
    'cuenta_id', v_cuenta_id,
    'cuenta_nombre', v_cuenta_nombre,
    'caja_turno_id', v_turno_egreso,
    'movimiento_id', v_mov_id,
    'caja_fuerte_movimiento_id', v_cf_id,
    'descuenta_arqueo', v_mov_id is not null
  );
end $$;

comment on function public.editar_pago(uuid, text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text, text, uuid) is
  'Corrige un pago y su reflejo en la caja (movimiento del turno o de la caja fuerte) en una sola transacción. p_origen auto = mantener el que tenía. p_cuenta_id: cuenta del negocio (solo origen banco; si falta, mantiene la que tenía). p_motivo queda en el historial.';

revoke all on function public.editar_pago(uuid, text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text, text, uuid) from public;
grant execute on function public.editar_pago(uuid, text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text, text, uuid) to authenticated;
grant execute on function public.editar_pago(uuid, text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text, text, uuid) to service_role;

notify pgrst, 'reload schema';

-- Verificación: las cuentas cargadas y cuántos pagos viejos quedaron asignados.
select c.nombre, c.tipo, c.activa, c.orden,
       (select count(*) from public.egresos e where e.cuenta_id = c.id) as pagos
  from public.cuentas_negocio c
 order by c.orden, c.nombre;
