-- ════════════════════════════════════════════════════════════════════════════
-- 54 — Cuentas corrientes (canjes y consumos a cuenta). Idempotente.
-- = migración 20261112000000. Correr ANTES de subir el dashboard (si se sube
-- antes no se rompe nada: el medio "Cuenta corriente" recién aparece con esto).
-- ════════════════════════════════════════════════════════════════════════════
--
-- El local hace canjes: una revista, un proveedor o un influencer "pagan" con
-- publicidad o servicios y a cambio consumen hasta un monto acordado. Hasta
-- ahora eso se llevaba en un cuaderno y la mesa se cerraba con 100 % de
-- descuento, así que la venta quedaba en $0 y nadie sabía cuánto saldo le
-- quedaba a cada uno.
--
-- Qué hace:
--   1) `cuentas_corrientes`: nombre, monto acordado, vigencia opcional, notas
--      del acuerdo y datos fiscales (para Factura A).
--   2) `cuenta_corriente_movimientos`: cada consumo (fecha, detalle, número de
--      operación, monto). Saldo = acordado − suma de movimientos. Monto
--      positivo = consumo; negativo = devolución / corrección a favor.
--   3) Nuevo medio de pago `cuenta_corriente` en `pagos`, con
--      `pagos.cuenta_corriente_id`. Dos triggers mantienen todo atado:
--        · BEFORE: valida cuenta activa y saldo suficiente (si no alcanza, la
--          caja cobra la diferencia con otro medio usando el pago dividido).
--        · AFTER: crea / actualiza el movimiento de la cuenta. Si el pago se
--          borra (re-cobro, cambio de medio), el movimiento se va con él
--          (FK on delete cascade) y el saldo vuelve solo.
--      El pedido conserva su valor real: ya no hace falta el descuento 100 %.
--   4) El arqueo NO cambia: `cuenta_corriente` no es plata, así que no entra
--      en efectivo / transferencia / tarjetas. La vista `pagos_arqueo` suma
--      dos columnas al final para poder mostrarlo aparte.
--   5) Recurso `cuentas_corrientes` (Dinero → Cuentas corrientes) para admin y
--      finanzas. La caja y los mozos NO ven la sección: para cobrar usan
--      `cuentas_corrientes_para_cobro()`, que solo devuelve nombre, saldo y
--      datos fiscales de las cuentas activas.
--
-- Idempotente: se puede correr más de una vez.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Cuentas ──────────────────────────────────────────────────────────────
create table if not exists public.cuentas_corrientes (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  monto_acordado  numeric(12,2) not null default 0,
  vigencia_desde  date,
  vigencia_hasta  date,
  notas           text,
  razon_social    text,
  cuit            text,
  condicion_iva   integer,
  domicilio       text,
  activa          boolean not null default true,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint cuentas_corrientes_nombre_check
    check (length(btrim(nombre)) between 1 and 80),
  constraint cuentas_corrientes_monto_check
    check (monto_acordado >= 0),
  constraint cuentas_corrientes_vigencia_check
    check (vigencia_desde is null or vigencia_hasta is null or vigencia_hasta >= vigencia_desde),
  constraint cuentas_corrientes_cuit_check
    check (cuit is null or cuit ~ '^[0-9]{11}$'),
  constraint cuentas_corrientes_condicion_iva_check
    check (condicion_iva is null or condicion_iva between 1 and 16)
);

comment on table public.cuentas_corrientes is
  'Cuentas corrientes de canje: un tercero (revista, proveedor, influencer) consume hasta un monto acordado. Saldo = monto_acordado − suma de cuenta_corriente_movimientos.monto.';
comment on column public.cuentas_corrientes.monto_acordado is 'Total que puede consumir según el acuerdo. Si se renueva, se edita acá.';
comment on column public.cuentas_corrientes.vigencia_hasta is 'Opcional. Pasada esta fecha la cuenta figura vencida y la caja no la ofrece al cobrar (el admin puede extenderla).';
comment on column public.cuentas_corrientes.condicion_iva is 'Código ARCA de la condición frente al IVA del titular (1 = Responsable Inscripto, 6 = Monotributo). Con CUIT y razón social permite Factura A al cobrar.';
comment on column public.cuentas_corrientes.activa is 'false = no se ofrece al cobrar; el historial se conserva.';

create unique index if not exists cuentas_corrientes_nombre_unico
  on public.cuentas_corrientes (lower(btrim(nombre)));

-- ── 2) Movimientos ──────────────────────────────────────────────────────────
create table if not exists public.cuenta_corriente_movimientos (
  id                uuid primary key default gen_random_uuid(),
  cuenta_id         uuid not null references public.cuentas_corrientes(id) on delete restrict,
  fecha             date not null default ((now() at time zone 'America/Argentina/Buenos_Aires')::date),
  detalle           text,
  numero_operacion  text,
  monto             numeric(12,2) not null,
  pedido_id         uuid references public.pedidos(id) on delete set null,
  pago_id           uuid references public.pagos(id) on delete cascade,
  usuario_id        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint cuenta_corriente_movimientos_monto_check check (monto <> 0),
  constraint cuenta_corriente_movimientos_pago_unico unique (pago_id)
);

comment on table public.cuenta_corriente_movimientos is
  'Consumos de una cuenta corriente. monto > 0 = consumo (baja el saldo); monto < 0 = devolución o corrección a favor. Los que tienen pago_id los crea el trigger de pagos al cobrar una mesa o un pedido y no se editan a mano.';
comment on column public.cuenta_corriente_movimientos.pago_id is
  'Pago que originó el movimiento (cobro con medio cuenta_corriente). Null = cargado a mano desde Dinero → Cuentas corrientes.';

create index if not exists cuenta_corriente_movimientos_cuenta_idx
  on public.cuenta_corriente_movimientos (cuenta_id, fecha desc, created_at desc);
create index if not exists cuenta_corriente_movimientos_pedido_idx
  on public.cuenta_corriente_movimientos (pedido_id) where pedido_id is not null;

-- updated_at automático.
create or replace function public.cuentas_corrientes_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke all on function public.cuentas_corrientes_touch() from public, anon, authenticated;

drop trigger if exists trg_cuentas_corrientes_touch on public.cuentas_corrientes;
create trigger trg_cuentas_corrientes_touch
  before update on public.cuentas_corrientes
  for each row execute function public.cuentas_corrientes_touch();

drop trigger if exists trg_cuenta_corriente_movimientos_touch on public.cuenta_corriente_movimientos;
create trigger trg_cuenta_corriente_movimientos_touch
  before update on public.cuenta_corriente_movimientos
  for each row execute function public.cuentas_corrientes_touch();

-- ── 3) El recurso (Dinero → Cuentas corrientes) ─────────────────────────────
-- Sensible: muestra acuerdos comerciales y datos fiscales de terceros.
insert into public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) values
  ('cuentas_corrientes', 'Cuentas corrientes',
   'Canjes y consumos a cuenta: monto acordado, consumos y saldo de cada cuenta. Cobrar con cuenta corriente no necesita este permiso.',
   '/cuentas-corrientes', 'Dinero', true, 225)
on conflict (id) do update
  set nombre = excluded.nombre, descripcion = excluded.descripcion, ruta = excluded.ruta,
      grupo = excluded.grupo, sensible = excluded.sensible, orden = excluded.orden;

insert into public.rol_permisos (rol_id, recurso_id, ver, editar)
select r.rol, 'cuentas_corrientes', true, true
from (values ('admin'), ('finanzas')) as r(rol)
where exists (select 1 from public.roles where id = r.rol)
on conflict (rol_id, recurso_id) do nothing;

insert into public.recurso_tablas (recurso_id, tabla, escribe) values
  ('cuentas_corrientes', 'cuentas_corrientes', true),
  ('cuentas_corrientes', 'cuenta_corriente_movimientos', true)
on conflict (recurso_id, tabla) do update set escribe = excluded.escribe;

-- ── 4) RLS ──────────────────────────────────────────────────────────────────
alter table public.cuentas_corrientes enable row level security;
alter table public.cuenta_corriente_movimientos enable row level security;

drop policy if exists "cuentas_corrientes lectura" on public.cuentas_corrientes;
create policy "cuentas_corrientes lectura"
  on public.cuentas_corrientes for select to authenticated
  using ((select public.tiene_permiso('cuentas_corrientes', 'ver')));

drop policy if exists "cuentas_corrientes escritura" on public.cuentas_corrientes;
create policy "cuentas_corrientes escritura"
  on public.cuentas_corrientes for all to authenticated
  using ((select public.tiene_permiso('cuentas_corrientes', 'editar')))
  with check ((select public.tiene_permiso('cuentas_corrientes', 'editar')));

drop policy if exists "cc_movimientos lectura" on public.cuenta_corriente_movimientos;
create policy "cc_movimientos lectura"
  on public.cuenta_corriente_movimientos for select to authenticated
  using ((select public.tiene_permiso('cuentas_corrientes', 'ver')));

-- A mano solo se tocan los movimientos manuales (pago_id null). Los que
-- vienen de un cobro los maneja el trigger de pagos: se corrigen re-cobrando
-- el pedido desde Caja, así cuenta y caja nunca dicen cosas distintas.
drop policy if exists "cc_movimientos alta manual" on public.cuenta_corriente_movimientos;
create policy "cc_movimientos alta manual"
  on public.cuenta_corriente_movimientos for insert to authenticated
  with check ((select public.tiene_permiso('cuentas_corrientes', 'editar')) and pago_id is null);

drop policy if exists "cc_movimientos edicion manual" on public.cuenta_corriente_movimientos;
create policy "cc_movimientos edicion manual"
  on public.cuenta_corriente_movimientos for update to authenticated
  using ((select public.tiene_permiso('cuentas_corrientes', 'editar')) and pago_id is null)
  with check ((select public.tiene_permiso('cuentas_corrientes', 'editar')) and pago_id is null);

drop policy if exists "cc_movimientos baja manual" on public.cuenta_corriente_movimientos;
create policy "cc_movimientos baja manual"
  on public.cuenta_corriente_movimientos for delete to authenticated
  using ((select public.tiene_permiso('cuentas_corrientes', 'editar')) and pago_id is null);

revoke all on public.cuentas_corrientes from anon, public;
revoke all on public.cuenta_corriente_movimientos from anon, public;
grant select, insert, update, delete on public.cuentas_corrientes to authenticated;
grant select, insert, update, delete on public.cuenta_corriente_movimientos to authenticated;
grant all on public.cuentas_corrientes to service_role;
grant all on public.cuenta_corriente_movimientos to service_role;

-- ── 5) Saldos (vista, respeta el RLS de las tablas) ─────────────────────────
create or replace view public.cuentas_corrientes_saldos
with (security_invoker = on) as
select
  c.id,
  c.nombre,
  c.monto_acordado,
  c.vigencia_desde,
  c.vigencia_hasta,
  c.notas,
  c.razon_social,
  c.cuit,
  c.condicion_iva,
  c.domicilio,
  c.activa,
  c.created_at,
  c.updated_at,
  coalesce(m.consumido, 0)::numeric(12,2)                      as consumido,
  (c.monto_acordado - coalesce(m.consumido, 0))::numeric(12,2) as saldo,
  coalesce(m.movimientos, 0)::integer                          as movimientos,
  m.ultimo_movimiento
from public.cuentas_corrientes c
left join (
  select cuenta_id,
         sum(monto)  as consumido,
         count(*)    as movimientos,
         max(fecha)  as ultimo_movimiento
    from public.cuenta_corriente_movimientos
   group by cuenta_id
) m on m.cuenta_id = c.id;

revoke all on public.cuentas_corrientes_saldos from anon, public;
grant select on public.cuentas_corrientes_saldos to authenticated, service_role;

-- ── 6) pagos: medio 'cuenta_corriente' + a qué cuenta va ────────────────────
alter table public.pagos
  add column if not exists cuenta_corriente_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pagos_cuenta_corriente_id_fkey' and conrelid = 'public.pagos'::regclass
  ) then
    alter table public.pagos
      add constraint pagos_cuenta_corriente_id_fkey
      foreign key (cuenta_corriente_id) references public.cuentas_corrientes(id)
      on delete restrict;
  end if;
end $$;

comment on column public.pagos.cuenta_corriente_id is
  'Cuenta corriente a la que se cargó el cobro. Obligatoria con medio_pago = cuenta_corriente y null con cualquier otro medio.';

create index if not exists pagos_cuenta_corriente_idx
  on public.pagos (cuenta_corriente_id) where cuenta_corriente_id is not null;

alter table public.pagos drop constraint if exists pagos_medio_pago_check;
alter table public.pagos add constraint pagos_medio_pago_check
  check (medio_pago = any (array['efectivo', 'transferencia', 'tarjeta_credito', 'tarjeta_debito', 'cuenta_corriente']));

alter table public.pagos drop constraint if exists pagos_cuenta_corriente_check;
alter table public.pagos add constraint pagos_cuenta_corriente_check
  check ((medio_pago = 'cuenta_corriente') = (cuenta_corriente_id is not null));

-- BEFORE: valida la cuenta y el saldo. Bloquea la fila de la cuenta para que
-- dos cajas cobrando a la vez no se pisen el saldo.
create or replace function public.pagos_cuenta_corriente_validar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta    public.cuentas_corrientes%rowtype;
  v_consumido numeric;
  v_saldo     numeric;
begin
  if new.medio_pago is distinct from 'cuenta_corriente' then
    -- Cualquier otro medio no lleva cuenta (p. ej. al cambiar el medio).
    new.cuenta_corriente_id := null;
    return new;
  end if;

  if new.cuenta_corriente_id is null then
    raise exception 'Falta elegir la cuenta corriente del cobro.' using errcode = '23514';
  end if;

  -- Cambios que no tocan cuenta ni suben el monto (p. ej. reasignar el pago a
  -- otro turno de caja) no se revalidan: una cuenta desactivada después no
  -- tiene que trabar la corrección de un arqueo viejo.
  if tg_op = 'UPDATE'
     and old.medio_pago = 'cuenta_corriente'
     and old.cuenta_corriente_id = new.cuenta_corriente_id
     and new.monto <= old.monto then
    return new;
  end if;

  select * into v_cuenta
    from public.cuentas_corrientes
   where id = new.cuenta_corriente_id
     for update;

  if not found then
    raise exception 'La cuenta corriente elegida no existe.' using errcode = '23503';
  end if;
  if not v_cuenta.activa then
    raise exception 'La cuenta corriente "%" está inactiva.', v_cuenta.nombre using errcode = 'P0001';
  end if;

  select coalesce(sum(m.monto), 0) into v_consumido
    from public.cuenta_corriente_movimientos m
   where m.cuenta_id = v_cuenta.id
     and (tg_op = 'INSERT' or m.pago_id is distinct from new.id);

  v_saldo := v_cuenta.monto_acordado - v_consumido;

  if new.monto > v_saldo + 0.01 then
    raise exception 'Saldo insuficiente en la cuenta corriente "%": quedan $ % y se quiso cargar $ %.',
      v_cuenta.nombre,
      replace(to_char(round(greatest(v_saldo, 0)), 'FM999,999,999,990'), ',', '.'),
      replace(to_char(round(new.monto), 'FM999,999,999,990'), ',', '.')
      using errcode = 'P0001',
            hint = 'Cobrá la diferencia con otro medio usando el pago dividido.';
  end if;

  return new;
end $$;

-- AFTER: el movimiento de la cuenta sigue al pago.
create or replace function public.pagos_cuenta_corriente_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero  integer;
  v_mesa    text;
  v_canal   text;
  v_detalle text;
  v_fecha   date;
begin
  if new.medio_pago is distinct from 'cuenta_corriente' or coalesce(new.monto, 0) = 0 then
    -- Dejó de ser un cobro a cuenta: el movimiento ya no corresponde.
    if tg_op = 'UPDATE' then
      delete from public.cuenta_corriente_movimientos where pago_id = new.id;
    end if;
    return null;
  end if;

  select p.numero, nullif(btrim(p.mesa), ''), p.canal
    into v_numero, v_mesa, v_canal
    from public.pedidos p
   where p.id = new.pedido_id;

  v_detalle := concat_ws(' · ',
    case
      when v_mesa is not null then 'Mesa ' || v_mesa
      when v_canal = 'takeaway' then 'Take away'
      when v_canal is not null then initcap(v_canal)
    end,
    case when v_numero is not null then 'Orden #' || v_numero end
  );

  -- La fecha es la del turno de caja (un cobro a las 00:30 es de la noche
  -- anterior); sin turno, la fecha de Argentina.
  select t.business_date into v_fecha
    from public.caja_turnos t
   where t.id = new.caja_turno_id;
  v_fecha := coalesce(v_fecha, (coalesce(new.created_at, now()) at time zone 'America/Argentina/Buenos_Aires')::date);

  insert into public.cuenta_corriente_movimientos
    (cuenta_id, fecha, detalle, numero_operacion, monto, pedido_id, pago_id, usuario_id)
  values
    (new.cuenta_corriente_id, v_fecha, nullif(v_detalle, ''),
     nullif(btrim(coalesce(new.numero_operacion, '')), ''),
     new.monto, new.pedido_id, new.id, coalesce(new.usuario_id, auth.uid()))
  on conflict on constraint cuenta_corriente_movimientos_pago_unico do update
    set cuenta_id        = excluded.cuenta_id,
        monto            = excluded.monto,
        numero_operacion = excluded.numero_operacion,
        detalle          = excluded.detalle,
        pedido_id        = excluded.pedido_id;

  return null;
end $$;

revoke all on function public.pagos_cuenta_corriente_validar() from public, anon, authenticated;
revoke all on function public.pagos_cuenta_corriente_sync() from public, anon, authenticated;

drop trigger if exists trg_pagos_cuenta_corriente_validar on public.pagos;
create trigger trg_pagos_cuenta_corriente_validar
  before insert or update of medio_pago, cuenta_corriente_id, monto on public.pagos
  for each row execute function public.pagos_cuenta_corriente_validar();

drop trigger if exists trg_pagos_cuenta_corriente_sync on public.pagos;
create trigger trg_pagos_cuenta_corriente_sync
  after insert or update of medio_pago, cuenta_corriente_id, monto, numero_operacion on public.pagos
  for each row execute function public.pagos_cuenta_corriente_sync();

-- ── 7) Lo que necesita la caja para cobrar ──────────────────────────────────
-- La caja y los mozos no tienen (ni necesitan) la sección: solo el nombre, el
-- saldo y los datos fiscales de las cuentas activas, para elegirla al cobrar y
-- ofrecer la Factura A. Sin permiso de cobro devuelve vacío.
drop function if exists public.cuentas_corrientes_para_cobro();
create function public.cuentas_corrientes_para_cobro()
returns table (
  id              uuid,
  nombre          text,
  monto_acordado  numeric,
  consumido       numeric,
  saldo           numeric,
  vigencia_hasta  date,
  vencida         boolean,
  razon_social    text,
  cuit            text,
  condicion_iva   integer,
  domicilio       text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
         c.nombre,
         c.monto_acordado,
         coalesce(m.consumido, 0),
         c.monto_acordado - coalesce(m.consumido, 0),
         c.vigencia_hasta,
         (c.vigencia_hasta is not null
          and c.vigencia_hasta < (now() at time zone 'America/Argentina/Buenos_Aires')::date),
         c.razon_social,
         c.cuit,
         c.condicion_iva,
         c.domicilio
    from public.cuentas_corrientes c
    left join lateral (
      select sum(mv.monto) as consumido
        from public.cuenta_corriente_movimientos mv
       where mv.cuenta_id = c.id
    ) m on true
   where c.activa
     and (public.puede_tabla('pagos', 'editar')
          or public.tiene_permiso('cuentas_corrientes', 'ver'))
   order by lower(c.nombre)
$$;

comment on function public.cuentas_corrientes_para_cobro() is
  'Cuentas corrientes activas con su saldo, para el selector de cobro de mesas y pedidos. Solo para quien puede registrar pagos o ver la sección.';

revoke all on function public.cuentas_corrientes_para_cobro() from public, anon;
grant execute on function public.cuentas_corrientes_para_cobro() to authenticated, service_role;

-- ── 8) Vista del arqueo: dos columnas nuevas al final ───────────────────────
-- (create or replace exige conservar el orden de las existentes y volver a
-- declarar security_invoker: sin el with, Postgres lo resetea.)
create or replace view public.pagos_arqueo
with (security_invoker = on) as
select
  p.id,
  p.medio_pago,
  p.numero_operacion,
  p.monto,
  p.notas,
  p.created_at,
  p.usuario_id,
  ped.id as pedido_id,
  ped.mesa as pedido_mesa,
  ped.canal as pedido_canal,
  ped.total as pedido_total,
  c.id as comprobante_id,
  c.letra as comprobante_letra,
  c.tipo_cbte as comprobante_tipo,
  c.punto_venta as comprobante_pv,
  c.numero as comprobante_numero,
  c.cae as comprobante_cae,
  c.importe_total as comprobante_importe,
  p.caja_turno_id,
  p.cuenta_corriente_id,
  cc.nombre as cuenta_corriente_nombre
from public.pagos p
join public.pedidos ped on ped.id = p.pedido_id
left join public.comprobantes_fiscales c on c.id = p.comprobante_id
left join public.cuentas_corrientes cc on cc.id = p.cuenta_corriente_id;

revoke all on public.pagos_arqueo from anon, public;
grant select on public.pagos_arqueo to authenticated, service_role;

notify pgrst, 'reload schema';

-- Verificación: tiene que listar el recurso con admin y finanzas, el medio
-- nuevo en el check de pagos y 0 cuentas cargadas (la primera vez).
select
  (select string_agg(rol_id, ', ' order by rol_id) from public.rol_permisos where recurso_id = 'cuentas_corrientes') as roles_con_la_seccion,
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'pagos_medio_pago_check') like '%cuenta_corriente%' as medio_habilitado,
  (select count(*) from public.cuentas_corrientes) as cuentas_cargadas,
  has_function_privilege('anon', 'public.cuentas_corrientes_para_cobro()', 'execute') as anon_puede_ejecutar_debe_ser_false;
