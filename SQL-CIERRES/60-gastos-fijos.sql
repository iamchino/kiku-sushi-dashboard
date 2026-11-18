-- ════════════════════════════════════════════════════════════════════════════
-- 60 — Gastos fijos: se cargan una vez y el pendiente de cada mes se crea solo.
-- Idempotente. = migración 20261118000000.
--
-- Pedido de administración (18/11): el alquiler, los autónomos, el F931 y
-- otros gastos que se repiten había que cargarlos uno por uno todos los meses.
-- Ahora cada gasto fijo se carga UNA vez (descripción, categoría, proveedor,
-- monto y día del mes en que vence) y el sistema crea el pendiente de cada
-- mes. Lo crea `generar_gastos_fijos()`, que el dashboard llama al abrir
-- Pagos o Finanzas: no hace falta ningún proceso programado. Es idempotente:
-- cada gasto fijo crea UN pendiente por mes, aunque la llamen mil veces o
-- dos personas a la vez, y un pendiente que se borra no vuelve a aparecer.
--
--   A) gastos_fijos             la lista (solo lectura por la API).
--   B) gastos_fijos_meses       qué mes ya se creó de cada uno, y con qué pago.
--   C) egresos.gasto_fijo_id    el pago de cada mes sabe de qué gasto fijo viene.
--   D) gasto_fijo_guardar / _activar / _borrar / _desde_pago   (alta y cambios)
--   E) generar_gastos_fijos()   crea los pendientes del mes que falten.
--   F) El monto de referencia se actualiza solo con lo último que se pagó.
--
-- No modifica ningún pago existente. Sin este SQL el dashboard nuevo funciona
-- igual que antes: la casilla "Se repite todos los meses" y el botón "Gastos
-- fijos" no aparecen. Conviene correrlo de día, antes del servicio: agrega una
-- columna a la tabla de pagos y eso la toma un instante.
--
-- Opcional (si pg_cron está activo en Supabase): para que se creen aunque nadie
-- abra el dashboard ese día, programar una vez
--   select cron.schedule('gastos-fijos', '7 6 * * *', 'select public.generar_gastos_fijos()');
-- ════════════════════════════════════════════════════════════════════════════

-- ══ A) LA LISTA DE GASTOS FIJOS ═════════════════════════════════════════════
create table if not exists public.gastos_fijos (
  id               uuid primary key default gen_random_uuid(),
  descripcion      text not null,
  categoria        text not null,
  proveedor_id     uuid references public.proveedores(id) on delete set null,
  monto            numeric(12,2) not null,
  medio_pago       text not null default 'transferencia',
  dia_vencimiento  smallint not null,
  desde            text not null,
  activo           boolean not null default true,
  notas            text,
  usuario_id       uuid default auth.uid(),
  usuario_nombre   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint gastos_fijos_descripcion_check check (char_length(btrim(descripcion)) between 1 and 120),
  -- Las de egresos menos sueldos (los sueldos se pagan desde la liquidación).
  constraint gastos_fijos_categoria_check check (categoria in (
    'mercaderia', 'proveedores', 'alquiler', 'servicios', 'impuestos',
    'mantenimiento', 'marketing', 'comisiones', 'otros')),
  -- Las de egresos menos canje (un pendiente no puede ser canje).
  constraint gastos_fijos_medio_check check (medio_pago in (
    'efectivo', 'transferencia', 'tarjeta_credito', 'tarjeta_debito', 'cheque', 'otro')),
  constraint gastos_fijos_monto_check check (monto > 0 and monto < 10000000000),
  constraint gastos_fijos_dia_check check (dia_vencimiento between 1 and 31),
  constraint gastos_fijos_desde_check check (desde ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint gastos_fijos_notas_check check (notas is null or char_length(notas) <= 300)
);

comment on table public.gastos_fijos is
  'Gastos que se repiten todos los meses (alquiler, autónomos, F931…). generar_gastos_fijos() crea el pendiente de cada mes en egresos. Solo lectura por la API: se escribe con gasto_fijo_guardar / _activar / _borrar / _desde_pago.';
comment on column public.gastos_fijos.monto is
  'Monto con el que se crea el pendiente de cada mes. Se actualiza solo con lo último que se pagó (trigger trg_egresos_gasto_fijo_monto).';
comment on column public.gastos_fijos.dia_vencimiento is
  'Día del mes en que vence. Si el mes es más corto (31 en noviembre, 30 en febrero), vence el último día.';
comment on column public.gastos_fijos.desde is
  'Primer mes (YYYY-MM) que crea el sistema. Los anteriores no se crean.';

-- ══ B) QUÉ MES YA SE CREÓ ═══════════════════════════════════════════════════
-- Un renglón por gasto fijo y mes. Es lo que hace que cada mes se cree una
-- sola vez: si alguien borra el pendiente de ese mes, el renglón queda y no
-- se vuelve a crear.
create table if not exists public.gastos_fijos_meses (
  gasto_fijo_id  uuid not null references public.gastos_fijos(id) on delete cascade,
  periodo        text not null,
  egreso_id      uuid,
  origen         text not null default 'automatico',
  created_at     timestamptz not null default now(),
  primary key (gasto_fijo_id, periodo),
  constraint gastos_fijos_meses_origen_check check (origen in ('automatico', 'pago'))
);

comment on table public.gastos_fijos_meses is
  'Meses ya creados de cada gasto fijo. origen = automatico (lo creó generar_gastos_fijos) o pago (el pago con el que se armó el gasto fijo).';

create index if not exists gastos_fijos_meses_egreso_idx
  on public.gastos_fijos_meses (egreso_id) where egreso_id is not null;

-- ══ C) EL PAGO SABE DE QUÉ GASTO FIJO VIENE ═════════════════════════════════
-- Sin clave foránea a propósito: borrar un gasto fijo no toca los pagos que
-- ya creó (si la tuviera, el "set null" quedaría como una edición más en el
-- historial de cada pago).
alter table public.egresos add column if not exists gasto_fijo_id uuid;
comment on column public.egresos.gasto_fijo_id is
  'Gasto fijo que creó este pago (o del que forma parte). Null = pago suelto.';
create index if not exists egresos_gasto_fijo_idx
  on public.egresos (gasto_fijo_id) where gasto_fijo_id is not null;

-- Lo ven quienes ven Pagos o Finanzas.
insert into public.recurso_tablas (recurso_id, tabla, escribe) values
  ('pagos', 'gastos_fijos', false),
  ('finanzas', 'gastos_fijos', false),
  ('pagos', 'gastos_fijos_meses', false),
  ('finanzas', 'gastos_fijos_meses', false)
on conflict do nothing;

alter table public.gastos_fijos enable row level security;
alter table public.gastos_fijos_meses enable row level security;

drop policy if exists "gastos_fijos lectura" on public.gastos_fijos;
create policy "gastos_fijos lectura" on public.gastos_fijos for select to authenticated
  using ((select public.puede_tabla('gastos_fijos', 'ver')));

drop policy if exists "gastos_fijos_meses lectura" on public.gastos_fijos_meses;
create policy "gastos_fijos_meses lectura" on public.gastos_fijos_meses for select to authenticated
  using ((select public.puede_tabla('gastos_fijos_meses', 'ver')));

revoke all on public.gastos_fijos, public.gastos_fijos_meses from anon, public;
revoke all on public.gastos_fijos, public.gastos_fijos_meses from authenticated;
grant select on public.gastos_fijos, public.gastos_fijos_meses to authenticated;
grant all on public.gastos_fijos, public.gastos_fijos_meses to service_role;

-- ══ D) ALTA Y CAMBIOS ═══════════════════════════════════════════════════════

-- El vencimiento de un mes: el día pedido, o el último del mes si no existe.
create or replace function public.gasto_fijo_vencimiento(p_periodo text, p_dia integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(
    split_part(p_periodo, '-', 1)::int,
    split_part(p_periodo, '-', 2)::int,
    least(
      greatest(p_dia, 1),
      extract(day from (to_date(p_periodo || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day'))::int
    )
  )
$$;

-- "noviembre 2026", para la descripción del pago de cada mes.
create or replace function public.gasto_fijo_mes_texto(p_periodo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
                'septiembre', 'octubre', 'noviembre', 'diciembre'])[split_part(p_periodo, '-', 2)::int]
         || ' ' || split_part(p_periodo, '-', 1)
$$;

-- Quién: el nombre del empleado vinculado al usuario o, si no tiene, lo que
-- va antes de la arroba de su mail (igual que los saldos de las cuentas).
create or replace function public.gasto_fijo_quien()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_email  text;
begin
  select nullif(btrim(e.nombre || ' ' || coalesce(e.apellido, '')), '')
    into v_nombre
    from public.empleados e
   where e.user_id = auth.uid()
   order by e.activo desc, e.created_at
   limit 1;
  if v_nombre is null then
    begin
      v_email := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
    exception when others then
      v_email := null;
    end;
    v_nombre := nullif(split_part(coalesce(v_email, ''), '@', 1), '');
  end if;
  return v_nombre;
end
$$;

-- Validaciones compartidas por el alta y la corrección.
create or replace function public.gasto_fijo_validar(
  p_descripcion text, p_categoria text, p_monto numeric, p_dia integer, p_medio_pago text, p_notas text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if coalesce(btrim(p_descripcion), '') = '' then
    raise exception 'Falta la descripción del gasto fijo.';
  end if;
  if char_length(btrim(p_descripcion)) > 120 then
    raise exception 'La descripción es muy larga (máximo 120 letras).';
  end if;
  if p_categoria = 'sueldos' then
    raise exception 'Los sueldos no van como gasto fijo: se pagan desde Personal → Liquidación.';
  end if;
  if p_categoria is null or p_categoria not in ('mercaderia', 'proveedores', 'alquiler', 'servicios', 'impuestos',
                                                'mantenimiento', 'marketing', 'comisiones', 'otros') then
    raise exception 'Categoría inválida: %', coalesce(p_categoria, '(vacía)');
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.';
  end if;
  if p_monto >= 10000000000 then
    raise exception 'Ese monto es demasiado grande: revisá los ceros.';
  end if;
  if p_dia is null or p_dia < 1 or p_dia > 31 then
    raise exception 'El día de vencimiento tiene que estar entre 1 y 31.';
  end if;
  if p_medio_pago = 'canje' then
    raise exception 'Un gasto fijo no se puede pagar con canje: el canje se elige al pagarlo.';
  end if;
  if p_medio_pago is null or p_medio_pago not in ('efectivo', 'transferencia', 'tarjeta_credito', 'tarjeta_debito', 'cheque', 'otro') then
    raise exception 'Medio de pago inválido: %', coalesce(p_medio_pago, '(vacío)');
  end if;
  if p_notas is not null and char_length(p_notas) > 300 then
    raise exception 'Las notas son muy largas (máximo 300 letras).';
  end if;
end
$$;

-- Alta (p_id null) o corrección. Un cambio vale para los meses que vienen:
-- los pendientes ya creados se corrigen en Pagos, uno por uno.
create or replace function public.gasto_fijo_guardar(
  p_id            uuid,
  p_descripcion   text,
  p_categoria     text,
  p_monto         numeric,
  p_dia           integer,
  p_medio_pago    text default 'transferencia',
  p_proveedor_id  uuid default null,
  p_notas         text default null,
  p_desde         text default null
)
returns public.gastos_fijos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual text := to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM');
  v_notas  text := nullif(btrim(coalesce(p_notas, '')), '');
  v_desde  text;
  v_fila   public.gastos_fijos;
begin
  if not (public.tiene_permiso('pagos', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para cargar gastos fijos.';
  end if;
  perform public.gasto_fijo_validar(p_descripcion, p_categoria, p_monto, p_dia, coalesce(p_medio_pago, 'transferencia'), v_notas);
  if p_proveedor_id is not null and not exists (select 1 from public.proveedores pr where pr.id = p_proveedor_id) then
    raise exception 'No se encontró ese proveedor.';
  end if;
  if p_desde is not null and p_desde !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'El primer mes tiene que ser un mes (AAAA-MM).';
  end if;

  if p_id is null then
    v_desde := coalesce(p_desde, v_actual);
    if v_desde < v_actual then
      raise exception 'El primer mes no puede ser anterior al mes actual.';
    end if;
    insert into public.gastos_fijos (
      descripcion, categoria, proveedor_id, monto, medio_pago, dia_vencimiento, desde, notas,
      usuario_id, usuario_nombre
    ) values (
      btrim(p_descripcion), p_categoria, p_proveedor_id, round(p_monto, 2),
      coalesce(p_medio_pago, 'transferencia'), p_dia, v_desde, v_notas,
      auth.uid(), public.gasto_fijo_quien()
    )
    returning * into v_fila;
    return v_fila;
  end if;

  select * into v_fila from public.gastos_fijos where id = p_id for update;
  if not found then
    raise exception 'No se encontró ese gasto fijo.';
  end if;
  -- El primer mes solo se puede mover hacia adelante, o dejar como está.
  v_desde := coalesce(p_desde, v_fila.desde);
  if v_desde <> v_fila.desde and v_desde < v_actual then
    raise exception 'El primer mes no puede ser anterior al mes actual.';
  end if;
  update public.gastos_fijos set
    descripcion     = btrim(p_descripcion),
    categoria       = p_categoria,
    proveedor_id    = p_proveedor_id,
    monto           = round(p_monto, 2),
    medio_pago      = coalesce(p_medio_pago, 'transferencia'),
    dia_vencimiento = p_dia,
    desde           = v_desde,
    notas           = v_notas,
    updated_at      = now()
  where id = p_id
  returning * into v_fila;
  return v_fila;
end
$$;

-- Pausar (deja de crear los meses que vienen) o reanudar. Al reanudar no se
-- crean los meses que estuvo pausado: arranca en el mes actual.
create or replace function public.gasto_fijo_activar(p_id uuid, p_activo boolean)
returns public.gastos_fijos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual text := to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM');
  v_fila   public.gastos_fijos;
begin
  if not (public.tiene_permiso('pagos', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para cambiar gastos fijos.';
  end if;
  update public.gastos_fijos set
    activo     = coalesce(p_activo, activo),
    desde      = case when coalesce(p_activo, activo) and not activo then greatest(desde, v_actual) else desde end,
    updated_at = now()
  where id = p_id
  returning * into v_fila;
  if not found then
    raise exception 'No se encontró ese gasto fijo.';
  end if;
  return v_fila;
end
$$;

-- Borrar un gasto fijo cargado por error. Los pagos que ya creó quedan como
-- están (pagados o pendientes): se anulan desde Pagos si hace falta.
create or replace function public.gasto_fijo_borrar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.tiene_permiso('pagos', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para borrar gastos fijos.';
  end if;
  delete from public.gastos_fijos where id = p_id;
  if not found then
    raise exception 'No se encontró ese gasto fijo.';
  end if;
end
$$;

-- Armar un gasto fijo a partir de un pago recién cargado ("Se repite todos
-- los meses" en Registrar pago). Ese pago queda como el de su mes, así que
-- el sistema arranca a crear desde el mes siguiente.
create or replace function public.gasto_fijo_desde_pago(
  p_egreso_id    uuid,
  p_dia          integer default null,
  p_descripcion  text default null
)
returns public.gastos_fijos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eg       public.egresos;
  v_base     date;
  v_periodo  text;
  v_desc     text;
  v_dia      integer;
  v_fila     public.gastos_fijos;
begin
  if not (public.tiene_permiso('pagos', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para cargar gastos fijos.';
  end if;
  select * into v_eg from public.egresos where id = p_egreso_id for update;
  if not found then
    raise exception 'No se encontró ese pago.';
  end if;
  if v_eg.gasto_fijo_id is not null then
    raise exception 'Este pago ya es parte de un gasto fijo.';
  end if;
  if v_eg.medio_pago = 'canje' then
    raise exception 'Un pago con canje no se puede repetir todos los meses.';
  end if;

  -- El mes del pago: el de su vencimiento si está pendiente, si no el de su fecha.
  v_base    := coalesce(case when v_eg.estado = 'pendiente' then v_eg.vencimiento end, v_eg.fecha);
  v_periodo := to_char(v_base, 'YYYY-MM');
  v_dia     := coalesce(p_dia, extract(day from v_base)::int);
  v_desc    := coalesce(nullif(btrim(coalesce(p_descripcion, '')), ''), v_eg.descripcion);

  perform public.gasto_fijo_validar(v_desc, v_eg.categoria, v_eg.monto, v_dia, v_eg.medio_pago, v_eg.notas);

  insert into public.gastos_fijos (
    descripcion, categoria, proveedor_id, monto, medio_pago, dia_vencimiento, desde, notas,
    usuario_id, usuario_nombre
  ) values (
    btrim(v_desc), v_eg.categoria, v_eg.proveedor_id, v_eg.monto, v_eg.medio_pago, v_dia, v_periodo,
    nullif(btrim(coalesce(v_eg.notas, '')), ''), auth.uid(), public.gasto_fijo_quien()
  )
  returning * into v_fila;

  insert into public.gastos_fijos_meses (gasto_fijo_id, periodo, egreso_id, origen)
  values (v_fila.id, v_periodo, v_eg.id, 'pago');

  -- Queda en el historial del pago, con el motivo.
  perform set_config('app.motivo_edicion', 'Se guardó como gasto fijo', true);
  update public.egresos
     set gasto_fijo_id = v_fila.id, recurrente = true, periodo = v_periodo
   where id = v_eg.id;
  perform set_config('app.motivo_edicion', '', true);

  return v_fila;
end
$$;

-- ══ E) CREAR LOS PENDIENTES DEL MES ═════════════════════════════════════════
-- Para cada gasto fijo activo, crea el pendiente de cada mes que falte desde
-- su primer mes hasta el actual (como mucho 12 meses para atrás). El día 1 de
-- cada mes aparecen los de ese mes. Idempotente y seguro con varias personas
-- a la vez (un candado serializa las llamadas).
--
-- La puede llamar cualquiera que vea Pagos o Finanzas: solo crea lo que ya
-- corresponde. Sin JWT (pg_cron o el SQL Editor de Supabase) también corre:
-- la función solo se puede ejecutar como authenticated o service_role, y un
-- authenticated siempre tiene usuario.
create or replace function public.generar_gastos_fijos()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy      date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_actual   text := to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM');
  v_g        public.gastos_fijos;
  v_mes      date;
  v_periodo  text;
  v_filas    integer;
  v_egreso   uuid;
  v_detalle  jsonb := '[]'::jsonb;
  v_venc     date;
begin
  if auth.uid() is not null
     and not (public.tiene_permiso('pagos', 'ver') or public.tiene_permiso('finanzas', 'ver') or public.is_finanzas_user()) then
    return jsonb_build_object('creados', 0, 'detalle', '[]'::jsonb, 'permiso', false);
  end if;

  perform pg_advisory_xact_lock(hashtext('public.generar_gastos_fijos'));

  for v_g in
    select * from public.gastos_fijos g
     where g.activo and g.desde <= v_actual
     order by g.dia_vencimiento, g.created_at
  loop
    for v_mes in
      select m::date
        from generate_series(
               greatest(to_date(v_g.desde || '-01', 'YYYY-MM-DD'),
                        (date_trunc('month', v_hoy) - interval '11 months')::date),
               date_trunc('month', v_hoy)::date,
               interval '1 month') m
    loop
      v_periodo := to_char(v_mes, 'YYYY-MM');
      insert into public.gastos_fijos_meses (gasto_fijo_id, periodo, origen)
      values (v_g.id, v_periodo, 'automatico')
      on conflict do nothing;
      get diagnostics v_filas = row_count;
      continue when v_filas = 0;

      v_venc := public.gasto_fijo_vencimiento(v_periodo, v_g.dia_vencimiento);
      insert into public.egresos (
        fecha, categoria, descripcion, monto, medio_pago, estado, vencimiento, periodo,
        recurrente, proveedor_id, notas, usuario_id, gasto_fijo_id
      ) values (
        case when v_periodo = v_actual then v_hoy else v_mes end,
        v_g.categoria,
        v_g.descripcion || ' · ' || public.gasto_fijo_mes_texto(v_periodo),
        v_g.monto, v_g.medio_pago, 'pendiente', v_venc, v_periodo,
        true, v_g.proveedor_id, v_g.notas, v_g.usuario_id, v_g.id
      )
      returning id into v_egreso;

      update public.gastos_fijos_meses set egreso_id = v_egreso
       where gasto_fijo_id = v_g.id and periodo = v_periodo;

      v_detalle := v_detalle || jsonb_build_object(
        'egreso_id', v_egreso, 'gasto_fijo_id', v_g.id, 'descripcion', v_g.descripcion,
        'periodo', v_periodo, 'vencimiento', v_venc, 'monto', v_g.monto);
    end loop;
  end loop;

  return jsonb_build_object('creados', jsonb_array_length(v_detalle), 'detalle', v_detalle, 'permiso', true);
end
$$;

-- ══ F) EL MONTO SE ACTUALIZA CON LO ÚLTIMO QUE SE PAGÓ ══════════════════════
-- Cuando se paga el mes más nuevo de un gasto fijo, su monto pasa a ser el de
-- los meses que vienen (el alquiler aumentó, el F931 cambió). Un mes viejo
-- pagado tarde no pisa a uno más nuevo. El canje no cuenta: no es plata.
create or replace function public.egresos_gasto_fijo_monto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_periodo text;
begin
  if NEW.gasto_fijo_id is null or NEW.estado <> 'pagado' or NEW.medio_pago = 'canje' or NEW.monto <= 0 then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.estado = 'pagado' and OLD.monto = NEW.monto then
    return NEW;
  end if;
  select m.periodo into v_periodo from public.gastos_fijos_meses m where m.egreso_id = NEW.id limit 1;
  v_periodo := coalesce(v_periodo, NEW.periodo, to_char(coalesce(NEW.vencimiento, NEW.fecha), 'YYYY-MM'));
  if exists (
    select 1
      from public.gastos_fijos_meses m
      join public.egresos e on e.id = m.egreso_id
     where m.gasto_fijo_id = NEW.gasto_fijo_id
       and m.periodo > v_periodo
       and e.estado = 'pagado'
       and e.medio_pago <> 'canje'
  ) then
    return NEW;
  end if;
  update public.gastos_fijos
     set monto = NEW.monto, updated_at = now()
   where id = NEW.gasto_fijo_id
     and monto is distinct from NEW.monto
     and NEW.monto < 10000000000;
  return NEW;
end
$$;

drop trigger if exists trg_egresos_gasto_fijo_monto on public.egresos;
create trigger trg_egresos_gasto_fijo_monto
  after insert or update of estado, monto on public.egresos
  for each row execute function public.egresos_gasto_fijo_monto();

-- ══ Permisos de las funciones ═══════════════════════════════════════════════
revoke all on function public.gasto_fijo_vencimiento(text, integer) from public, anon;
revoke all on function public.gasto_fijo_mes_texto(text) from public, anon;
revoke all on function public.gasto_fijo_quien() from public, anon, authenticated;
revoke all on function public.gasto_fijo_validar(text, text, numeric, integer, text, text) from public, anon;
revoke all on function public.gasto_fijo_guardar(uuid, text, text, numeric, integer, text, uuid, text, text) from public, anon;
revoke all on function public.gasto_fijo_activar(uuid, boolean) from public, anon;
revoke all on function public.gasto_fijo_borrar(uuid) from public, anon;
revoke all on function public.gasto_fijo_desde_pago(uuid, integer, text) from public, anon;
revoke all on function public.generar_gastos_fijos() from public, anon;
revoke all on function public.egresos_gasto_fijo_monto() from public, anon, authenticated;

grant execute on function public.gasto_fijo_vencimiento(text, integer) to authenticated, service_role;
grant execute on function public.gasto_fijo_mes_texto(text) to authenticated, service_role;
grant execute on function public.gasto_fijo_quien() to service_role;
grant execute on function public.gasto_fijo_validar(text, text, numeric, integer, text, text) to authenticated, service_role;
grant execute on function public.gasto_fijo_guardar(uuid, text, text, numeric, integer, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.gasto_fijo_activar(uuid, boolean) to authenticated, service_role;
grant execute on function public.gasto_fijo_borrar(uuid) to authenticated, service_role;
grant execute on function public.gasto_fijo_desde_pago(uuid, integer, text) to authenticated, service_role;
grant execute on function public.generar_gastos_fijos() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
-- Tiene que devolver: t | t | t | t | 6
select to_regclass('public.gastos_fijos') is not null as tabla_gastos_fijos,
       to_regclass('public.gastos_fijos_meses') is not null as tabla_meses,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'egresos' and column_name = 'gasto_fijo_id') as columna_en_pagos,
       exists (select 1 from pg_trigger where tgname = 'trg_egresos_gasto_fijo_monto' and not tgisinternal) as monto_automatico,
       (select count(*) from pg_proc
         where pronamespace = 'public'::regnamespace
           and proname in ('gasto_fijo_guardar', 'gasto_fijo_activar', 'gasto_fijo_borrar',
                           'gasto_fijo_desde_pago', 'generar_gastos_fijos', 'gasto_fijo_vencimiento')) as funciones;
