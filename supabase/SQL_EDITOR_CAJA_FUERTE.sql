-- ############################################################################
--  KIKU SUSHI — Caja fuerte
--
--  Pegalo entero en Supabase → SQL Editor y dale Run, una sola vez.
--  Idempotente. Después mergeá/deployá el front.
--
--  Qué crea: la caja fuerte (tabla + saldo), el retiro al cierre de turno,
--  los ajustes, y la versión nueva de registrar_pago que acepta el origen
--  del efectivo (caja | caja_fuerte).
-- ############################################################################

begin;

-- ============================================================================
-- Caja fuerte
--
--   El circuito del efectivo, completo:
--
--     venta en efectivo → CAJA (turno) → retiro al cierre → CAJA FUERTE → pagos
--
--   · Al finalizar el turno se retira el efectivo y se deposita en la caja
--     fuerte (retirar_a_caja_fuerte: movimiento de caja negativo + depósito,
--     atómico, todo o nada).
--   · Si NO se retira, el efectivo queda en el cajón: el próximo turno abre
--     con ese efectivo como fondo inicial (el front lo precarga leyendo el
--     efectivo CONTADO del último cierre, menos lo depositado después).
--   · Desde la caja fuerte se pagan egresos: registrar_pago acepta el origen
--     del efectivo ('caja' | 'caja_fuerte') y crea el movimiento donde
--     corresponde. Un pago sigue siendo un egreso: Finanzas ve todo.
-- ============================================================================

-- ─── 1. La tabla ────────────────────────────────────────────────────────────
create table if not exists public.caja_fuerte_movimientos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('deposito', 'egreso', 'ajuste')),
  -- ajuste usa categoria para el signo, igual que los ajustes de caja:
  --   'sobrante' suma, 'faltante' resta.
  categoria   text check (categoria in ('sobrante', 'faltante')),
  monto       numeric(12,2) not null check (monto > 0),
  descripcion text not null,
  -- de qué turno vino el depósito (retiro al cierre)
  turno_id    uuid references public.caja_turnos(id) on delete set null,
  -- qué pago salió de acá (egreso)
  egreso_id   uuid references public.egresos(id) on delete set null,
  usuario_id  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint caja_fuerte_ajuste_categoria check (
    (tipo = 'ajuste') = (categoria is not null)
  )
);

create index if not exists caja_fuerte_movs_created_idx
  on public.caja_fuerte_movimientos (created_at desc);
create index if not exists caja_fuerte_movs_turno_idx
  on public.caja_fuerte_movimientos (turno_id);

alter table public.caja_fuerte_movimientos enable row level security;

-- Lectura para quien tenga el permiso. ESCRITURA: sin policy a propósito —
-- todo pasa por los RPC de abajo, que son atómicos y validan. Nadie inserta
-- a mano.
drop policy if exists "caja_fuerte lectura" on public.caja_fuerte_movimientos;
create policy "caja_fuerte lectura"
  on public.caja_fuerte_movimientos for select to authenticated
  using ((select public.tiene_permiso('caja_fuerte', 'ver') or public.is_finanzas_user()));

-- OJO: esta tabla NO va al mapa recurso_tablas de la fase 4. El generador de
-- policies de esa fase crearía una policy de escritura directa, y acá la
-- escritura es solo por RPC.

-- ─── 2. El recurso ──────────────────────────────────────────────────────────
insert into public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) values
  ('caja_fuerte', 'Caja fuerte',
   'El efectivo del negocio fuera de la caja registradora: depósitos al cierre de turno, pagos y saldo. Vive dentro de Caja y facturación.',
   null, 'Dinero', true, 216)
on conflict (id) do update
  set nombre = excluded.nombre, descripcion = excluded.descripcion,
      grupo = excluded.grupo, sensible = excluded.sensible, orden = excluded.orden;

insert into public.rol_permisos (rol_id, recurso_id, ver, editar)
select r.rol, 'caja_fuerte', true, true
from (values ('admin'), ('finanzas')) as r(rol)
where exists (select 1 from public.roles where id = r.rol)
on conflict (rol_id, recurso_id) do nothing;

-- ─── 3. De dónde salió el efectivo de cada pago ─────────────────────────────
alter table public.egresos
  add column if not exists pagado_desde text
  check (pagado_desde is null or pagado_desde in ('caja', 'caja_fuerte'));

comment on column public.egresos.pagado_desde is
  'De dónde salió el efectivo: caja (turno abierto, descuenta arqueo) o '
  'caja_fuerte. Null para medios no-efectivo o efectivo sin origen registrado.';

-- Backfill: los pagos en efectivo ya vinculados a un turno salieron de la caja.
update public.egresos
   set pagado_desde = 'caja'
 where pagado_desde is null
   and medio_pago = 'efectivo'
   and estado = 'pagado'
   and caja_turno_id is not null
   and exists (select 1 from public.caja_movimientos cm where cm.egreso_id = egresos.id);

-- ─── 4. Saldo ───────────────────────────────────────────────────────────────
create or replace function public.saldo_caja_fuerte()
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v numeric;
begin
  if not (public.tiene_permiso('caja_fuerte', 'ver') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para ver la caja fuerte.';
  end if;
  select coalesce(sum(
    case
      when tipo = 'deposito' then monto
      when tipo = 'egreso'   then -monto
      when categoria = 'faltante' then -monto
      else monto
    end), 0)
    into v
  from public.caja_fuerte_movimientos;
  return v;
end $$;

revoke execute on function public.saldo_caja_fuerte() from public;
grant  execute on function public.saldo_caja_fuerte() to authenticated;

-- ─── 5. Retirar de la caja a la caja fuerte ─────────────────────────────────
-- El movimiento de fin de turno. Atómico: resta de la caja (tipo 'retiro',
-- que el arqueo descuenta) y deposita en la caja fuerte, o no hace nada.
create or replace function public.retirar_a_caja_fuerte(
  p_monto numeric,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno_id uuid;
  v_mov_id   uuid;
  v_dep_id   uuid;
begin
  if not (public.tiene_permiso('caja_fuerte', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para operar la caja fuerte.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.';
  end if;

  select ct.id into v_turno_id
  from public.caja_turnos ct
  where ct.estado = 'abierto'
  order by ct.created_at desc
  limit 1;

  if v_turno_id is null then
    raise exception
      'No hay un turno de caja abierto. El retiro a caja fuerte sale del efectivo del turno; si la caja ya se cerró, registrá el depósito como ajuste.';
  end if;

  insert into public.caja_movimientos (turno_id, tipo, medio_pago, monto, categoria, descripcion, usuario_id)
  values (v_turno_id, 'retiro', 'efectivo', p_monto, 'caja_fuerte',
          coalesce('Retiro a caja fuerte · ' || nullif(trim(p_notas), ''), 'Retiro a caja fuerte'),
          auth.uid())
  returning id into v_mov_id;

  insert into public.caja_fuerte_movimientos (tipo, monto, descripcion, turno_id, usuario_id)
  values ('deposito', p_monto,
          coalesce('Depósito desde caja · ' || nullif(trim(p_notas), ''), 'Depósito desde caja'),
          v_turno_id, auth.uid())
  returning id into v_dep_id;

  return jsonb_build_object(
    'turno_id', v_turno_id,
    'movimiento_caja_id', v_mov_id,
    'deposito_id', v_dep_id,
    'saldo', public.saldo_caja_fuerte()
  );
end $$;

revoke execute on function public.retirar_a_caja_fuerte(numeric, text) from public;
grant  execute on function public.retirar_a_caja_fuerte(numeric, text) to authenticated;

-- ─── 6. Ajuste de caja fuerte ───────────────────────────────────────────────
-- Correcciones y casos sin turno (conteo real distinto al saldo, depósito de
-- efectivo con la caja ya cerrada, etc.).
create or replace function public.ajustar_caja_fuerte(
  p_monto       numeric,
  p_direccion   text,               -- 'sobrante' suma | 'faltante' resta
  p_descripcion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.tiene_permiso('caja_fuerte', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para operar la caja fuerte.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.';
  end if;
  if p_direccion not in ('sobrante', 'faltante') then
    raise exception 'Dirección inválida: usá sobrante (suma) o faltante (resta).';
  end if;
  if coalesce(trim(p_descripcion), '') = '' then
    raise exception 'Explicá el motivo del ajuste.';
  end if;

  insert into public.caja_fuerte_movimientos (tipo, categoria, monto, descripcion, usuario_id)
  values ('ajuste', p_direccion, p_monto, trim(p_descripcion), auth.uid());

  return jsonb_build_object('saldo', public.saldo_caja_fuerte());
end $$;

revoke execute on function public.ajustar_caja_fuerte(numeric, text, text) from public;
grant  execute on function public.ajustar_caja_fuerte(numeric, text, text) to authenticated;

-- ─── 7. registrar_pago aprende el origen del efectivo ───────────────────────
-- Se agrega p_origen:
--   'auto'        → como hasta ahora: turno abierto ⇒ caja; si no, sin origen
--   'caja'        → exige turno abierto (error claro si no hay)
--   'caja_fuerte' → el efectivo sale de la caja fuerte; no toca el arqueo
--   'ninguno'     → efectivo sin origen registrado (compat)
-- Cambia la firma: hay que dropear la anterior para no dejar dos overloads
-- (PostgREST no sabría cuál llamar).
drop function if exists public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text);

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
  p_origen       text default 'auto'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno_id   uuid;
  v_egreso_id  uuid;
  v_mov_id     uuid;
  v_cf_id      uuid;
  v_origen     text;
  v_es_cash    boolean;
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
  if p_origen not in ('auto', 'caja', 'caja_fuerte', 'ninguno') then
    raise exception 'Origen inválido: %', p_origen;
  end if;

  select ct.id into v_turno_id
  from public.caja_turnos ct
  where ct.estado = 'abierto'
  order by ct.created_at desc
  limit 1;

  v_es_cash := (p_estado = 'pagado' and p_medio_pago = 'efectivo');

  -- Resolver el origen del efectivo
  if not v_es_cash then
    v_origen := null;                    -- transferencias/tarjetas no tienen origen de efectivo
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

  insert into public.egresos (
    fecha, categoria, subtipo, descripcion, monto, medio_pago, estado,
    vencimiento, periodo, proveedor_id, empleado_id, comprobante_nro, notas,
    caja_turno_id, pagado_desde, usuario_id
  ) values (
    coalesce(p_fecha, current_date), p_categoria, p_subtipo, trim(p_descripcion),
    p_monto, p_medio_pago, p_estado,
    p_vencimiento, p_periodo, p_proveedor_id, p_empleado_id, p_comprobante, p_notas,
    case when v_origen = 'caja' then v_turno_id else null end,
    v_origen, auth.uid()
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
  elsif v_origen = 'caja_fuerte' then
    insert into public.caja_fuerte_movimientos (tipo, monto, descripcion, egreso_id, usuario_id)
    values ('egreso', p_monto, 'Pago: ' || trim(p_descripcion), v_egreso_id, auth.uid())
    returning id into v_cf_id;
  end if;

  return jsonb_build_object(
    'egreso_id', v_egreso_id,
    'origen', v_origen,
    'caja_turno_id', case when v_origen = 'caja' then v_turno_id else null end,
    'movimiento_id', v_mov_id,
    'caja_fuerte_movimiento_id', v_cf_id,
    'descuenta_arqueo', v_mov_id is not null
  );
end $$;

revoke execute on function public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text) from public;
grant  execute on function public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text) to authenticated;

comment on function public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text) is
  'Alta centralizada de egresos. p_origen: auto | caja | caja_fuerte | ninguno. '
  'Caja descuenta del arqueo del turno abierto; caja fuerte descuenta de su saldo. Todo o nada.';

notify pgrst, 'reload schema';

commit;
