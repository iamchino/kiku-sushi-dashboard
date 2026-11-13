-- ════════════════════════════════════════════════════════════════════════════
-- 56 — Stock: la boleta con sus productos, quién movió el stock y reporte de
-- faltantes. Idempotente. = migración 20261114000000. Sin este SQL el
-- dashboard sigue como antes: Registrar pago no ofrece cargar productos y en
-- Inventario no aparece el reporte.
-- ════════════════════════════════════════════════════════════════════════════
--
-- El pago a un proveedor y la entrada de mercadería eran dos cargas sueltas:
-- una en Caja → Pagos (cuánto se pagó) y otra en Inventario (qué entró). Nada
-- las unía, así que el stock se podía cargar sin boleta, la boleta sin stock,
-- y los precios de costo quedaban viejos. Tampoco se sabía QUIÉN había hecho
-- cada movimiento manual.
--
-- Qué hace:
--   1) `stock_movimientos` suma quién (usuario_id / usuario_nombre), a qué
--      pago pertenece (egreso_id), el origen ('compra') y el costo del momento.
--      Un trigger los completa solo en CUALQUIER alta — venta, producción,
--      conteo o movimiento manual — sin tocar las funciones que ya existen.
--   2) `compra_items`: los productos de una boleta, atados al pago (egreso).
--      Un trigger mantiene el stock al día: alta → entrada, corrección →
--      diferencia, baja o pago anulado → se revierte. También actualiza el
--      precio de costo del producto.
--   3) `compra_guardar_items()`, `registrar_compra()` y `editar_compra()`:
--      pago + productos en una sola transacción (todo o nada).
--   4) `compra_productos(proveedor)`: los productos para armar la boleta, con
--      lo que se le compra habitualmente a ese proveedor y su último precio.
--   5) `stock_faltantes(desde, hasta)`: por producto, lo comprado, lo vendido,
--      la merma declarada y lo que faltó o sobró en los conteos, en pesos.
--
-- Permisos: cargar productos = los mismos de Pagos. El reporte lo ve quien ve
-- Inventario o Finanzas. Las tablas nuevas solo se escriben por las funciones.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Quién, de qué pago y a qué costo, en cada movimiento de stock ────────
alter table public.stock_movimientos
  add column if not exists usuario_id      uuid,
  add column if not exists usuario_nombre  text,
  add column if not exists egreso_id       uuid,
  add column if not exists origen          text,
  add column if not exists costo_unitario  numeric(14,4);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_movimientos_egreso_id_fkey') then
    alter table public.stock_movimientos
      add constraint stock_movimientos_egreso_id_fkey
      foreign key (egreso_id) references public.egresos(id) on delete set null;
  end if;
end $$;

comment on column public.stock_movimientos.usuario_id is
  'Quién hizo el movimiento (auth.uid() al momento del alta). Null en los movimientos anteriores al SQL 56 y en los que no vienen de una sesión (pedidos de la web).';
comment on column public.stock_movimientos.usuario_nombre is
  'Nombre para mostrar de quien hizo el movimiento, guardado al momento: el empleado vinculado al usuario o, si no tiene, la parte del mail antes de la arroba.';
comment on column public.stock_movimientos.egreso_id is
  'El pago (boleta) que originó el movimiento, cuando viene de una compra con productos. Queda en null si el pago se anula.';
comment on column public.stock_movimientos.origen is
  '''compra'' = lo generó una boleta con productos (alta, corrección o anulación). Null = venta, producción, conteo o movimiento manual.';
comment on column public.stock_movimientos.costo_unitario is
  'Precio de costo del producto al momento del movimiento. Sirve para valuar faltantes con el precio de ese día y no con el de hoy.';

create index if not exists stock_movimientos_created_at_idx on public.stock_movimientos (created_at);
create index if not exists stock_movimientos_egreso_idx on public.stock_movimientos (egreso_id) where egreso_id is not null;

-- Nombre para mostrar del usuario de la sesión. Lee `empleados` (que tiene RLS
-- de Finanzas), por eso es security definer; solo devuelve un nombre.
create or replace function public.nombre_usuario_actual()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_nombre text;
  v_email  text;
begin
  if v_uid is null then
    return null;
  end if;
  select nullif(trim(e.nombre || ' ' || coalesce(e.apellido, '')), '')
    into v_nombre
    from public.empleados e
   where e.user_id = v_uid
   order by e.activo desc, e.created_at
   limit 1;
  if v_nombre is not null then
    return v_nombre;
  end if;
  begin
    v_email := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
  exception when others then
    v_email := null;
  end;
  return nullif(split_part(coalesce(v_email, ''), '@', 1), '');
end $$;

revoke all on function public.nombre_usuario_actual() from public, anon;
grant execute on function public.nombre_usuario_actual() to authenticated, service_role;

-- Completa quién y a qué costo. Va por trigger (y no por default de columna)
-- para que alcance a TODAS las funciones que ya insertan movimientos sin
-- tocarlas. Nunca frena el alta: una venta no puede fallar por un dato de
-- auditoría.
create or replace function public.stock_movimientos_completar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.usuario_id is null then
      new.usuario_id := auth.uid();
    end if;
    if new.usuario_nombre is null then
      new.usuario_nombre := public.nombre_usuario_actual();
    end if;
    if new.costo_unitario is null then
      select s.precio_unitario into new.costo_unitario
        from public.stock s where s.id = new.stock_id;
    end if;
  exception when others then
    null;
  end;
  return new;
end $$;

revoke all on function public.stock_movimientos_completar() from public, anon, authenticated;

drop trigger if exists trg_stock_movimientos_completar on public.stock_movimientos;
create trigger trg_stock_movimientos_completar
  before insert on public.stock_movimientos
  for each row execute function public.stock_movimientos_completar();

-- ── 2) Los productos de una boleta ──────────────────────────────────────────
create table if not exists public.compra_items (
  id               uuid primary key default gen_random_uuid(),
  egreso_id        uuid not null references public.egresos(id) on delete cascade,
  -- Si el producto se borra de Inventario, el renglón queda con su nombre.
  stock_id         uuid references public.stock(id) on delete set null,
  nombre           text not null,
  unidad           text,
  cantidad         numeric(10,2) not null,
  precio_unitario  numeric(14,4) not null default 0,
  subtotal         numeric(14,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  -- El precio de costo que tenía el producto antes de esta compra: si la
  -- boleta se anula y nadie lo tocó después, se vuelve a ese.
  precio_anterior  numeric(14,4),
  usuario_id       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint compra_items_cantidad_check check (cantidad > 0),
  constraint compra_items_precio_check check (precio_unitario >= 0)
);

comment on table public.compra_items is
  'Productos de una boleta de compra, atados al pago (egresos). Cada renglón mete su cantidad al stock por trigger; corregirlo o anular el pago lo revierte. Se escribe solo por compra_guardar_items().';

create unique index if not exists compra_items_egreso_stock_uidx
  on public.compra_items (egreso_id, stock_id) where stock_id is not null;
create index if not exists compra_items_egreso_idx on public.compra_items (egreso_id);
create index if not exists compra_items_stock_idx on public.compra_items (stock_id);

insert into public.recurso_tablas (recurso_id, tabla, escribe) values
  ('pagos',       'compra_items', false),
  ('finanzas',    'compra_items', false),
  ('stock',       'compra_items', false),
  ('proveedores', 'compra_items', false)
on conflict do nothing;

alter table public.compra_items enable row level security;

-- Solo lectura por la API: las altas, cambios y bajas van por las funciones
-- de abajo (security definer), que son las que mantienen el stock.
drop policy if exists "compra_items lectura" on public.compra_items;
create policy "compra_items lectura" on public.compra_items for select to authenticated
  using ((select public.puede_tabla('compra_items', 'ver')));

revoke all on public.compra_items from anon, public;
revoke all on public.compra_items from authenticated;
grant select on public.compra_items to authenticated;
grant all on public.compra_items to service_role;

-- Antes de guardar: nombre y unidad del producto (foto del momento) y el
-- precio de costo que tenía.
create or replace function public.compra_items_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock public.stock%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into v_stock from public.stock where id = new.stock_id;
    if not found then
      raise exception 'Ese producto ya no existe en Inventario.';
    end if;
    new.nombre          := v_stock.nombre;
    new.unidad          := v_stock.unidad;
    new.precio_anterior := v_stock.precio_unitario;
  else
    new.updated_at := now();
  end if;
  return new;
end $$;

revoke all on function public.compra_items_antes() from public, anon, authenticated;

drop trigger if exists trg_compra_items_antes on public.compra_items;
create trigger trg_compra_items_antes
  before insert or update on public.compra_items
  for each row execute function public.compra_items_antes();

-- Después de guardar: el stock y el precio de costo.
create or replace function public.compra_items_sync_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila        public.compra_items%rowtype;
  v_stock_id    uuid;
  v_delta       numeric;
  v_actual      numeric;
  v_nuevo       numeric;
  v_precio_hoy  numeric;
  v_egreso      public.egresos%rowtype;
  v_hay_egreso  boolean;
  v_ref         text;
  v_nota        text;
  v_ultimo      uuid;
  v_precio_prev numeric;
  v_cambio_precio boolean := false;
begin
  if tg_op = 'DELETE' then
    v_fila := old;
    v_delta := -old.cantidad;
  elsif tg_op = 'INSERT' then
    v_fila := new;
    v_delta := new.cantidad;
    v_cambio_precio := true;
  else
    v_fila := new;
    if new.stock_id is distinct from old.stock_id then
      -- El único cambio de producto que existe es que lo hayan borrado de
      -- Inventario (el FK lo deja en null): no hay stock que tocar.
      if new.stock_id is null then
        return null;
      end if;
      raise exception 'No se puede cambiar el producto de un renglón: se borra y se agrega de nuevo.';
    end if;
    v_delta := new.cantidad - old.cantidad;
    v_cambio_precio := new.precio_unitario is distinct from old.precio_unitario;
  end if;

  v_stock_id := v_fila.stock_id;
  if v_stock_id is null then
    return null;
  end if;

  -- El pago puede no existir ya: cuando se anula, sus renglones se van en
  -- cascada y este trigger corre después de borrado el egreso.
  select * into v_egreso from public.egresos where id = v_fila.egreso_id;
  v_hay_egreso := found;
  if v_hay_egreso then
    v_ref := coalesce(
      (select p.razon_social from public.proveedores p where p.id = v_egreso.proveedor_id),
      v_egreso.descripcion, '');
    if nullif(trim(coalesce(v_egreso.comprobante_nro, '')), '') is not null then
      v_ref := v_ref || ' · comp. ' || trim(v_egreso.comprobante_nro);
    end if;
  end if;

  if v_delta <> 0 then
    select s.stock_actual, s.precio_unitario into v_actual, v_precio_hoy
      from public.stock s where s.id = v_stock_id for update;
    if found then
      v_nuevo := v_actual + v_delta;
      v_nota := case tg_op
        when 'INSERT' then 'Compra'
        when 'DELETE' then 'Compra anulada'
        else 'Corrección de compra' end
        || case when coalesce(v_ref, '') <> '' then ': ' || v_ref else '' end;
      update public.stock set stock_actual = v_nuevo, updated_at = now() where id = v_stock_id;
      insert into public.stock_movimientos
        (stock_id, tipo, cantidad, stock_antes, stock_despues, notas, egreso_id, origen, costo_unitario)
      values
        (v_stock_id, case when v_delta > 0 then 'entrada' else 'salida' end, abs(v_delta),
         v_actual, v_nuevo, v_nota,
         case when v_hay_egreso then v_fila.egreso_id else null end,
         'compra',
         case when v_fila.precio_unitario > 0 then v_fila.precio_unitario else v_precio_hoy end);
    end if;
  end if;

  -- ── Precio de costo ───────────────────────────────────────────────────────
  -- Manda la compra más nueva del producto (por fecha de la boleta): cargar
  -- hoy una boleta vieja no pisa el precio de una más reciente.
  if tg_op in ('INSERT', 'UPDATE') then
    if v_fila.precio_unitario > 0 and v_cambio_precio then
      select ci.id into v_ultimo
        from public.compra_items ci
        join public.egresos e on e.id = ci.egreso_id
       where ci.stock_id = v_stock_id
       order by e.fecha desc, ci.created_at desc, ci.id desc
       limit 1;
      if v_ultimo = v_fila.id then
        update public.stock
           set precio_unitario = v_fila.precio_unitario
         where id = v_stock_id
           and precio_unitario is distinct from v_fila.precio_unitario;
      end if;
    end if;
  else
    -- Baja. Las compras posteriores que habían anotado ESTE precio como "el de
    -- antes" pasan a apuntar al anterior a este: la cadena queda como si esta
    -- compra nunca hubiera existido.
    update public.compra_items ci
       set precio_anterior = v_fila.precio_anterior
     where ci.stock_id = v_stock_id
       and ci.id <> v_fila.id
       and ci.created_at >= v_fila.created_at
       and ci.precio_anterior is not distinct from v_fila.precio_unitario;
    -- Si el precio de hoy es el que había puesto esta compra, vuelve al de la
    -- compra más nueva que quede (o al que tenía antes de cualquier compra).
    select s.precio_unitario into v_precio_hoy from public.stock s where s.id = v_stock_id;
    if found and v_fila.precio_unitario > 0 and v_precio_hoy = v_fila.precio_unitario then
      select ci.precio_unitario into v_precio_prev
        from public.compra_items ci
        join public.egresos e on e.id = ci.egreso_id
       where ci.stock_id = v_stock_id and ci.precio_unitario > 0
       order by e.fecha desc, ci.created_at desc, ci.id desc
       limit 1;
      v_precio_prev := coalesce(v_precio_prev, v_fila.precio_anterior);
      if v_precio_prev is not null and v_precio_prev is distinct from v_precio_hoy then
        update public.stock set precio_unitario = v_precio_prev where id = v_stock_id;
      end if;
    end if;
  end if;

  return null;
end $$;

revoke all on function public.compra_items_sync_stock() from public, anon, authenticated;

drop trigger if exists trg_compra_items_sync_stock on public.compra_items;
create trigger trg_compra_items_sync_stock
  after insert or update or delete on public.compra_items
  for each row execute function public.compra_items_sync_stock();

-- ── 3) Guardar los productos de un pago ─────────────────────────────────────
-- p_items = [{ "stock_id": uuid, "cantidad": n, "precio_unitario": n }, …]
-- Deja la boleta con EXACTAMENTE esos productos: agrega los nuevos, corrige
-- los que cambiaron y saca los que ya no están (lista vacía = sin productos).
-- Los que no cambiaron no se tocan, así el historial del stock no se ensucia.
create or replace function public.compra_guardar_items(
  p_egreso_id uuid,
  p_items jsonb,
  p_permitir_diferencia boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_egreso  public.egresos%rowtype;
  v_it      record;
  v_ids     uuid[] := '{}';
  v_actual  public.compra_items%rowtype;
  v_total   numeric := 0;
  v_n       integer := 0;
  v_nombre  text;
begin
  if not (public.tiene_permiso('pagos', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para cargar los productos de un pago.';
  end if;

  select * into v_egreso from public.egresos where id = p_egreso_id for update;
  if not found then
    raise exception 'No encontré ese pago.';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'La lista de productos está mal formada.';
  end if;

  if v_egreso.categoria = 'sueldos' and jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then
    raise exception 'Un pago de sueldos no lleva productos.';
  end if;

  -- Validar todo antes de tocar nada.
  for v_it in
    select nullif(x.value ->> 'stock_id', '')::uuid               as stock_id,
           round(nullif(x.value ->> 'cantidad', '')::numeric, 2)  as cantidad,
           round(coalesce(nullif(x.value ->> 'precio_unitario', '')::numeric, 0), 4) as precio
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
  loop
    if v_it.stock_id is null then
      raise exception 'Hay un renglón sin producto.';
    end if;
    select s.nombre into v_nombre from public.stock s where s.id = v_it.stock_id;
    if not found then
      raise exception 'Uno de los productos ya no existe en Inventario.';
    end if;
    if v_it.cantidad is null or v_it.cantidad <= 0 then
      raise exception 'Falta la cantidad de %.', v_nombre;
    end if;
    if v_it.precio < 0 then
      raise exception 'El precio de % no puede ser negativo.', v_nombre;
    end if;
    if v_it.stock_id = any (v_ids) then
      raise exception '% está dos veces en la boleta: juntá las cantidades en un solo renglón.', v_nombre;
    end if;
    v_ids   := v_ids || v_it.stock_id;
    v_total := v_total + round(v_it.cantidad * v_it.precio, 2);
    v_n     := v_n + 1;
  end loop;

  -- Renglones de productos que ya no existen en Inventario: no se pueden
  -- editar, se conservan y siguen contando para el total.
  v_total := v_total + coalesce((
    select sum(ci.subtotal) from public.compra_items ci
     where ci.egreso_id = p_egreso_id and ci.stock_id is null), 0);

  if v_n > 0 and not coalesce(p_permitir_diferencia, false)
     and abs(v_total - v_egreso.monto) > 1 then
    raise exception 'Los productos suman $% y el pago es de $%. Corregí las cantidades o los precios, o marcá que la diferencia son impuestos, envío o descuentos.',
      replace(to_char(round(v_total), 'FM999,999,999,990'), ',', '.'),
      replace(to_char(round(v_egreso.monto), 'FM999,999,999,990'), ',', '.');
  end if;

  delete from public.compra_items ci
   where ci.egreso_id = p_egreso_id
     and ci.stock_id is not null
     and not (ci.stock_id = any (v_ids));

  for v_it in
    select nullif(x.value ->> 'stock_id', '')::uuid               as stock_id,
           round(nullif(x.value ->> 'cantidad', '')::numeric, 2)  as cantidad,
           round(coalesce(nullif(x.value ->> 'precio_unitario', '')::numeric, 0), 4) as precio
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
  loop
    select * into v_actual from public.compra_items ci
     where ci.egreso_id = p_egreso_id and ci.stock_id = v_it.stock_id;
    if not found then
      insert into public.compra_items (egreso_id, stock_id, nombre, cantidad, precio_unitario)
      values (p_egreso_id, v_it.stock_id, '', v_it.cantidad, v_it.precio);
    elsif v_actual.cantidad <> v_it.cantidad or v_actual.precio_unitario <> v_it.precio then
      update public.compra_items
         set cantidad = v_it.cantidad, precio_unitario = v_it.precio
       where id = v_actual.id;
    end if;
  end loop;

  return jsonb_build_object(
    'egreso_id', p_egreso_id,
    'items', (select count(*) from public.compra_items ci where ci.egreso_id = p_egreso_id),
    'total_items', v_total,
    'diferencia', v_egreso.monto - v_total
  );
end $$;

revoke all on function public.compra_guardar_items(uuid, jsonb, boolean) from public, anon;
grant execute on function public.compra_guardar_items(uuid, jsonb, boolean) to authenticated, service_role;

-- Pago + productos, todo o nada. p_pago lleva los mismos datos que
-- registrar_pago(): categoria, descripcion, monto, medio_pago, estado, fecha,
-- proveedor_id, empleado_id, subtipo, periodo, vencimiento, comprobante,
-- notas, origen y cuenta_id. Se llama a registrar_pago() tal cual está (con o
-- sin el parámetro de cuenta, según lo que tenga la base).
create or replace function public.registrar_compra(
  p_pago jsonb,
  p_items jsonb,
  p_permitir_diferencia boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res    jsonb;
  v_compra jsonb;
begin
  if not (public.tiene_permiso('pagos', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para registrar pagos.';
  end if;

  if to_regprocedure('public.registrar_pago(text,text,numeric,text,text,date,uuid,uuid,text,text,date,text,text,text,uuid)') is not null then
    execute 'select public.registrar_pago($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)'
      into v_res
      using p_pago ->> 'categoria',
            p_pago ->> 'descripcion',
            nullif(p_pago ->> 'monto', '')::numeric,
            coalesce(nullif(p_pago ->> 'medio_pago', ''), 'efectivo'),
            coalesce(nullif(p_pago ->> 'estado', ''), 'pagado'),
            coalesce(nullif(p_pago ->> 'fecha', '')::date, current_date),
            nullif(p_pago ->> 'proveedor_id', '')::uuid,
            nullif(p_pago ->> 'empleado_id', '')::uuid,
            nullif(p_pago ->> 'subtipo', ''),
            nullif(p_pago ->> 'periodo', ''),
            nullif(p_pago ->> 'vencimiento', '')::date,
            nullif(p_pago ->> 'comprobante', ''),
            nullif(p_pago ->> 'notas', ''),
            coalesce(nullif(p_pago ->> 'origen', ''), 'auto'),
            nullif(p_pago ->> 'cuenta_id', '')::uuid;
  else
    execute 'select public.registrar_pago($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)'
      into v_res
      using p_pago ->> 'categoria',
            p_pago ->> 'descripcion',
            nullif(p_pago ->> 'monto', '')::numeric,
            coalesce(nullif(p_pago ->> 'medio_pago', ''), 'efectivo'),
            coalesce(nullif(p_pago ->> 'estado', ''), 'pagado'),
            coalesce(nullif(p_pago ->> 'fecha', '')::date, current_date),
            nullif(p_pago ->> 'proveedor_id', '')::uuid,
            nullif(p_pago ->> 'empleado_id', '')::uuid,
            nullif(p_pago ->> 'subtipo', ''),
            nullif(p_pago ->> 'periodo', ''),
            nullif(p_pago ->> 'vencimiento', '')::date,
            nullif(p_pago ->> 'comprobante', ''),
            nullif(p_pago ->> 'notas', ''),
            coalesce(nullif(p_pago ->> 'origen', ''), 'auto');
  end if;

  v_compra := public.compra_guardar_items((v_res ->> 'egreso_id')::uuid, p_items, p_permitir_diferencia);
  return v_res || jsonb_build_object('compra', v_compra);
end $$;

revoke all on function public.registrar_compra(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.registrar_compra(jsonb, jsonb, boolean) to authenticated, service_role;

create or replace function public.editar_compra(
  p_egreso_id uuid,
  p_pago jsonb,
  p_items jsonb,
  p_motivo text default null,
  p_permitir_diferencia boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res    jsonb;
  v_compra jsonb;
begin
  if not (public.tiene_permiso('pagos', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para editar pagos.';
  end if;

  if to_regprocedure('public.editar_pago(uuid,text,text,numeric,text,text,date,uuid,uuid,text,text,date,text,text,text,text,uuid)') is not null then
    execute 'select public.editar_pago($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)'
      into v_res
      using p_egreso_id,
            p_pago ->> 'categoria',
            p_pago ->> 'descripcion',
            nullif(p_pago ->> 'monto', '')::numeric,
            coalesce(nullif(p_pago ->> 'medio_pago', ''), 'efectivo'),
            coalesce(nullif(p_pago ->> 'estado', ''), 'pagado'),
            nullif(p_pago ->> 'fecha', '')::date,
            nullif(p_pago ->> 'proveedor_id', '')::uuid,
            nullif(p_pago ->> 'empleado_id', '')::uuid,
            nullif(p_pago ->> 'subtipo', ''),
            nullif(p_pago ->> 'periodo', ''),
            nullif(p_pago ->> 'vencimiento', '')::date,
            nullif(p_pago ->> 'comprobante', ''),
            nullif(p_pago ->> 'notas', ''),
            coalesce(nullif(p_pago ->> 'origen', ''), 'auto'),
            nullif(trim(coalesce(p_motivo, '')), ''),
            nullif(p_pago ->> 'cuenta_id', '')::uuid;
  else
    execute 'select public.editar_pago($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)'
      into v_res
      using p_egreso_id,
            p_pago ->> 'categoria',
            p_pago ->> 'descripcion',
            nullif(p_pago ->> 'monto', '')::numeric,
            coalesce(nullif(p_pago ->> 'medio_pago', ''), 'efectivo'),
            coalesce(nullif(p_pago ->> 'estado', ''), 'pagado'),
            nullif(p_pago ->> 'fecha', '')::date,
            nullif(p_pago ->> 'proveedor_id', '')::uuid,
            nullif(p_pago ->> 'empleado_id', '')::uuid,
            nullif(p_pago ->> 'subtipo', ''),
            nullif(p_pago ->> 'periodo', ''),
            nullif(p_pago ->> 'vencimiento', '')::date,
            nullif(p_pago ->> 'comprobante', ''),
            nullif(p_pago ->> 'notas', ''),
            coalesce(nullif(p_pago ->> 'origen', ''), 'auto'),
            nullif(trim(coalesce(p_motivo, '')), '');
  end if;

  v_compra := public.compra_guardar_items(p_egreso_id, p_items, p_permitir_diferencia);
  return v_res || jsonb_build_object('compra', v_compra);
end $$;

revoke all on function public.editar_compra(uuid, jsonb, jsonb, text, boolean) from public, anon;
grant execute on function public.editar_compra(uuid, jsonb, jsonb, text, boolean) to authenticated, service_role;

-- ── 4) Los productos para armar una boleta ──────────────────────────────────
-- Devuelve la materia prima de Inventario. `habitual` = ya se le compró a ese
-- proveedor, o el producto lo tiene anotado como su proveedor en Inventario.
-- No hay nada que cargar de antemano: la lista se arma sola con las boletas.
create or replace function public.compra_productos(p_proveedor_id uuid default null)
returns table (
  stock_id        uuid,
  nombre          text,
  unidad          text,
  categoria       text,
  precio_actual   numeric,
  habitual        boolean,
  ultimo_precio   numeric,
  ultima_cantidad numeric,
  ultima_compra   date,
  veces           integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with permiso as (
    select (public.tiene_permiso('pagos', 'ver') or public.tiene_permiso('pagos', 'editar')
            or public.puede_tabla('stock', 'ver') or public.puede_tabla('proveedores', 'ver')
            or public.is_finanzas_user()) as ok
  ),
  prov as (
    select lower(trim(p.razon_social)) as nombre
      from public.proveedores p where p.id = p_proveedor_id
  ),
  compras as (
    select ci.stock_id,
           count(*)::integer as veces,
           (array_agg(ci.precio_unitario order by e.fecha desc, ci.created_at desc))[1] as ultimo_precio,
           (array_agg(ci.cantidad        order by e.fecha desc, ci.created_at desc))[1] as ultima_cantidad,
           max(e.fecha) as ultima_compra
      from public.compra_items ci
      join public.egresos e on e.id = ci.egreso_id
     where p_proveedor_id is not null
       and e.proveedor_id = p_proveedor_id
       and ci.stock_id is not null
     group by ci.stock_id
  )
  select s.id, s.nombre, s.unidad, s.categoria, coalesce(s.precio_unitario, 0),
         (c.stock_id is not null)
           or exists (select 1 from prov where prov.nombre <> '' and prov.nombre = lower(trim(coalesce(s.proveedor, '')))),
         c.ultimo_precio, c.ultima_cantidad, c.ultima_compra, coalesce(c.veces, 0)
    from public.stock s
    cross join permiso
    left join compras c on c.stock_id = s.id
   where permiso.ok
     and coalesce(s.tipo_stock, 'materia_prima') = 'materia_prima'
   order by s.nombre
$$;

revoke all on function public.compra_productos(uuid) from public, anon;
grant execute on function public.compra_productos(uuid) to authenticated, service_role;

-- ── 5) Reporte de faltantes ─────────────────────────────────────────────────
-- Por producto y período (fechas de Argentina, las dos inclusive). El sistema
-- lleva la cuenta de lo que DEBERÍA haber (compras − ventas − merma); cada
-- conteo deja anotada la diferencia entre eso y lo que se contó. Acá se suma
-- todo, valuado al costo del momento del movimiento.
-- Se agrega en la base a propósito: los movimientos de un mes son miles y
-- traerlos al navegador se corta en las 1000 filas de la API.
create or replace function public.stock_faltantes(p_desde date, p_hasta date)
returns table (
  stock_id          uuid,
  nombre            text,
  unidad            text,
  categoria         text,
  tipo_stock        text,
  precio_unitario   numeric,
  stock_inicial     numeric,
  comprado          numeric,
  otras_entradas    numeric,
  vendido           numeric,
  otras_salidas     numeric,
  merma             numeric,
  conteos           integer,
  faltante          numeric,
  sobrante          numeric,
  valor_faltante    numeric,
  valor_sobrante    numeric,
  valor_merma       numeric,
  stock_final       numeric,
  ultimo_conteo     timestamptz,
  detalle           jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with permiso as (
    select (public.puede_tabla('stock', 'ver') or public.tiene_permiso('finanzas', 'ver')
            or public.is_finanzas_user()) as ok
  ),
  rango as (
    select (p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires') as ini,
           ((p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires') as fin
  ),
  mov as (
    select m.id, m.stock_id, m.tipo, m.notas, m.created_at, m.pedido_id, m.origen,
           m.stock_antes, m.stock_despues, m.usuario_nombre,
           (m.stock_despues - m.stock_antes) as delta,
           coalesce(nullif(m.costo_unitario, 0), s.precio_unitario, 0) as costo
      from public.stock_movimientos m
      join public.stock s on s.id = m.stock_id
      cross join rango r
      cross join permiso p
     where p.ok
       and p_desde is not null and p_hasta is not null
       and m.created_at >= r.ini and m.created_at < r.fin
  ),
  agg as (
    select m.stock_id,
      coalesce(sum(m.delta) filter (where m.origen = 'compra'), 0) as comprado,
      coalesce(sum(m.delta) filter (where m.tipo = 'entrada' and m.origen is null and m.pedido_id is null), 0) as otras_entradas,
      coalesce(-sum(m.delta) filter (where m.pedido_id is not null and m.tipo in ('entrada', 'salida')), 0) as vendido,
      coalesce(-sum(m.delta) filter (where m.tipo = 'salida' and m.origen is null and m.pedido_id is null), 0) as otras_salidas,
      coalesce(-sum(m.delta) filter (where m.tipo = 'merma'), 0) as merma,
      (count(*) filter (where m.tipo = 'ajuste'))::integer as conteos,
      coalesce(-sum(m.delta) filter (where m.tipo = 'ajuste' and m.delta < 0), 0) as faltante,
      coalesce(sum(m.delta) filter (where m.tipo = 'ajuste' and m.delta > 0), 0) as sobrante,
      coalesce(-sum(m.delta * m.costo) filter (where m.tipo = 'ajuste' and m.delta < 0), 0) as valor_faltante,
      coalesce(sum(m.delta * m.costo) filter (where m.tipo = 'ajuste' and m.delta > 0), 0) as valor_sobrante,
      coalesce(-sum(m.delta * m.costo) filter (where m.tipo = 'merma'), 0) as valor_merma,
      sum(m.delta) as variacion,
      max(m.created_at) filter (where m.tipo = 'ajuste') as ultimo_conteo,
      coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'tipo', m.tipo, 'fecha', m.created_at,
          'antes', m.stock_antes, 'despues', m.stock_despues, 'diferencia', m.delta,
          'valor', round(m.delta * m.costo, 2), 'nota', m.notas, 'quien', m.usuario_nombre)
          order by m.created_at desc, m.id desc)
        filter (where m.tipo in ('ajuste', 'merma')), '[]'::jsonb) as detalle
    from mov m
    group by m.stock_id
  ),
  -- Lo que se movió DESPUÉS del período. "Quedó" = el stock de hoy menos eso;
  -- "había" = quedó menos lo que varió en el período. Así la fila siempre
  -- cierra (había + entró − salió − merma ± conteos = quedó) y no depende del
  -- orden de movimientos que comparten la misma hora.
  posterior as (
    select m.stock_id, sum(m.stock_despues - m.stock_antes) as variacion
      from public.stock_movimientos m
      cross join rango r
     where m.created_at >= r.fin
       and m.stock_id in (select a.stock_id from agg a)
     group by m.stock_id
  )
  select s.id, s.nombre, s.unidad, s.categoria,
         coalesce(s.tipo_stock, 'materia_prima'),
         coalesce(s.precio_unitario, 0),
         s.stock_actual - coalesce(p.variacion, 0) - a.variacion,
         a.comprado, a.otras_entradas, a.vendido, a.otras_salidas, a.merma,
         a.conteos, a.faltante, a.sobrante,
         round(a.valor_faltante, 2), round(a.valor_sobrante, 2), round(a.valor_merma, 2),
         s.stock_actual - coalesce(p.variacion, 0),
         a.ultimo_conteo, a.detalle
    from agg a
    join public.stock s on s.id = a.stock_id
    left join posterior p on p.stock_id = a.stock_id
   order by a.valor_faltante desc, a.faltante desc, s.nombre
$$;

revoke all on function public.stock_faltantes(date, date) from public, anon;
grant execute on function public.stock_faltantes(date, date) to authenticated, service_role;

-- ── Verificación ────────────────────────────────────────────────────────────
-- Tiene que devolver: 5 | t | 6 | 3
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'stock_movimientos'
      and column_name in ('usuario_id', 'usuario_nombre', 'egreso_id', 'origen', 'costo_unitario')) as columnas_nuevas,
  to_regclass('public.compra_items') is not null as tabla_compras,
  (select count(distinct proname) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('registrar_compra', 'editar_compra', 'compra_guardar_items',
                      'compra_productos', 'stock_faltantes', 'nombre_usuario_actual')) as funciones,
  (select count(*) from pg_trigger
    where not tgisinternal
      and tgname in ('trg_stock_movimientos_completar', 'trg_compra_items_antes', 'trg_compra_items_sync_stock')) as triggers;
