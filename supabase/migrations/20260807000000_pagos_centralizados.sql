-- ============================================================================
-- Pagos centralizados en Caja
--
--   Todos los egresos del negocio (sueldos, proveedores, servicios, lo que
--   sea) se registran desde un único lugar: el botón "Pagos" de la sección
--   Caja, disponible con la caja abierta o cerrada. Finanzas deja de crear
--   egresos y pasa a ver + corregir. La sección se renombra a
--   "Caja y facturación".
--
--   La conexión entre secciones queda en los datos:
--     · un pago ES un egreso (misma tabla, `egresos`): Finanzas lo ve al
--       instante con todo su detalle, sin sincronización ni duplicados.
--     · si al momento de pagar hay un turno de caja abierto, el egreso queda
--       vinculado a ese turno (egresos.caja_turno_id) — en Finanzas se ve de
--       qué caja salió.
--     · si además el pago es en efectivo, se descuenta del arqueo: se crea un
--       movimiento de caja tipo 'egreso' apuntando al pago
--       (caja_movimientos.egreso_id). El efectivo esperado del cierre cuadra.
--     · los sueldos que liquida Personal ya crean su egreso; ahora aparecen
--       también en el historial de Pagos, como todo lo demás.
--
--   El alta va por un RPC transaccional (registrar_pago): egreso y movimiento
--   de caja se crean juntos o no se crea nada. Sin estados a medias.
-- ============================================================================

-- ─── 1. Columnas de vínculo ─────────────────────────────────────────────────
alter table public.egresos
  add column if not exists caja_turno_id uuid references public.caja_turnos(id) on delete set null;

create index if not exists egresos_caja_turno_idx
  on public.egresos (caja_turno_id, created_at desc);

alter table public.caja_movimientos
  add column if not exists egreso_id uuid references public.egresos(id) on delete set null;

create index if not exists caja_movimientos_egreso_idx
  on public.caja_movimientos (egreso_id);

-- ─── 2. El recurso 'pagos' y el rename de la sección ────────────────────────
-- 'pagos' vive dentro de Caja (sin pantalla propia). Es sensible: la lista de
-- pagos incluye sueldos. Arranca en admin y finanzas; se administra desde
-- Personal → Permisos como cualquier otro.
insert into public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) values
  ('pagos', 'Pagos',
   'Registrar egresos (sueldos, proveedores, servicios) desde Caja, con caja abierta o cerrada. Incluye los montos de sueldos.',
   null, 'Dinero', true, 215)
on conflict (id) do update
  set nombre = excluded.nombre, descripcion = excluded.descripcion,
      grupo = excluded.grupo, sensible = excluded.sensible, orden = excluded.orden;

update public.recursos
   set nombre = 'Caja y facturación',
       descripcion = 'Arqueo, turnos de caja y facturación fiscal. El botón Pagos registra todos los egresos.'
 where id = 'caja';

insert into public.rol_permisos (rol_id, recurso_id, ver, editar)
select r.rol, 'pagos', true, true
from (values ('admin'), ('finanzas')) as r(rol)
where exists (select 1 from public.roles where id = r.rol)
on conflict (rol_id, recurso_id) do nothing;

-- Mapa de la fase 4, si está aplicada (si no, el bloque no hace nada y las
-- policies del punto 3 cubren el acceso igual).
do $$
begin
  if to_regclass('public.recurso_tablas') is not null then
    insert into public.recurso_tablas (recurso_id, tabla, escribe) values
      ('pagos', 'egresos', true),
      ('pagos', 'proveedores', false),
      ('pagos', 'caja_turnos', false),
      ('pagos', 'caja_movimientos', true)
    on conflict (recurso_id, tabla) do update set escribe = excluded.escribe;
  end if;
end $$;

-- ─── 3. Policies del permiso 'pagos' ────────────────────────────────────────
-- Independientes de la fase 4: funcionan con las policies viejas (conviven en
-- OR) y con las nuevas. tiene_permiso() existe desde la fase 1.

drop policy if exists "egresos pagos manage" on public.egresos;
create policy "egresos pagos manage"
  on public.egresos for all to authenticated
  using ((select public.tiene_permiso('pagos', 'editar')))
  with check ((select public.tiene_permiso('pagos', 'editar')));

drop policy if exists "proveedores pagos read" on public.proveedores;
create policy "proveedores pagos read"
  on public.proveedores for select to authenticated
  using ((select public.tiene_permiso('pagos', 'ver')));

drop policy if exists "caja_turnos pagos read" on public.caja_turnos;
create policy "caja_turnos pagos read"
  on public.caja_turnos for select to authenticated
  using ((select public.tiene_permiso('pagos', 'ver')));

drop policy if exists "caja_movimientos pagos insert" on public.caja_movimientos;
create policy "caja_movimientos pagos insert"
  on public.caja_movimientos for insert to authenticated
  with check ((select public.tiene_permiso('pagos', 'editar')));

-- ─── 4. Empleados para el selector de sueldos, sin abrir la tabla ───────────
-- Un pago de sueldo necesita elegir al empleado, pero darle SELECT sobre
-- `empleados` a quien tenga 'pagos' expondría sueldo_base y datos del legajo
-- (RLS es por tabla, no por columna). Este RPC devuelve solo id y nombre.
create or replace function public.empleados_para_pagos()
returns table (id uuid, nombre text, apellido text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.tiene_permiso('pagos', 'ver') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para registrar pagos.';
  end if;
  return query
    select e.id, e.nombre, e.apellido
    from public.empleados e
    where e.activo
    order by e.nombre, e.apellido;
end $$;

revoke execute on function public.empleados_para_pagos() from public;
grant  execute on function public.empleados_para_pagos() to authenticated;

comment on function public.empleados_para_pagos() is
  'Solo id y nombre de los empleados activos, para el selector de pagos de '
  'sueldos. No expone sueldo_base ni el resto del legajo.';

-- ─── 5. registrar_pago(): el alta, atómica ──────────────────────────────────
-- Crea el egreso y, si corresponde, el movimiento de caja, en una sola
-- transacción. Reglas:
--   · si hay un turno de caja abierto, el egreso queda vinculado a él
--   · si además el pago está `pagado` y es en efectivo, se crea el movimiento
--     de caja (tipo 'egreso') que lo descuenta del arqueo
--   · un pago `pendiente` (cuenta por pagar) nunca toca el arqueo
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
  p_notas        text default null
)
returns jsonb
language plpgsql
security definer          -- inserta en egresos y caja_movimientos con las
                          -- validaciones de acá; el permiso se chequea explícito
set search_path = ''
as $$
declare
  v_turno_id   uuid;
  v_egreso_id  uuid;
  v_mov_id     uuid;
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

  -- Turno abierto, si hay. Con más de uno (no debería), el más reciente.
  select ct.id into v_turno_id
  from public.caja_turnos ct
  where ct.estado = 'abierto'
  order by ct.created_at desc
  limit 1;

  insert into public.egresos (
    fecha, categoria, subtipo, descripcion, monto, medio_pago, estado,
    vencimiento, periodo, proveedor_id, empleado_id, comprobante_nro, notas,
    caja_turno_id, usuario_id
  ) values (
    coalesce(p_fecha, current_date), p_categoria, p_subtipo, trim(p_descripcion),
    p_monto, p_medio_pago, p_estado,
    p_vencimiento, p_periodo, p_proveedor_id, p_empleado_id, p_comprobante, p_notas,
    v_turno_id, auth.uid()
  )
  returning id into v_egreso_id;

  -- Solo un pago efectivamente PAGADO, EN EFECTIVO y CON turno abierto mueve
  -- el arqueo. Transferencias y tarjetas no tocan el efectivo de la caja.
  if p_estado = 'pagado' and p_medio_pago = 'efectivo' and v_turno_id is not null then
    insert into public.caja_movimientos (
      turno_id, tipo, medio_pago, monto, categoria, descripcion, egreso_id, usuario_id
    ) values (
      v_turno_id, 'egreso', 'efectivo', p_monto, p_categoria,
      'Pago: ' || trim(p_descripcion), v_egreso_id, auth.uid()
    )
    returning id into v_mov_id;
  end if;

  return jsonb_build_object(
    'egreso_id', v_egreso_id,
    'caja_turno_id', v_turno_id,
    'movimiento_id', v_mov_id,
    'descuenta_arqueo', v_mov_id is not null
  );
end $$;

revoke execute on function public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text) from public;
grant  execute on function public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text) to authenticated;

comment on function public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text) is
  'Alta centralizada de egresos desde Caja → Pagos. Vincula el turno abierto si '
  'hay, y si el pago es en efectivo crea el movimiento que lo descuenta del '
  'arqueo. Todo o nada.';

notify pgrst, 'reload schema';
