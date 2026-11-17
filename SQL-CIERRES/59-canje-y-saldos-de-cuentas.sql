-- ════════════════════════════════════════════════════════════════════════════
-- 59 — Pagar con canje + saldo de las cuentas del negocio. Idempotente.
-- = migración 20261117000000. Dos cosas que pidió administración:
--
--   A) Medio de pago "Canje" para los pagos (egresos): una factura que se
--      cancela sin plata (se cambió por una cata, por consumo en el local…).
--      Queda PAGADA, pero no cuenta como plata que salió: ni en Finanzas, ni
--      en el cash flow, ni en los Totales de Caja. Es el espejo de "Cuenta
--      corriente" del lado de los cobros.
--   B) Saldo de cada cuenta del negocio (Banco Galicia, Mercado Pago…),
--      cargado a mano por administración cuando mira el home banking. El
--      sistema NO se conecta al banco: guarda el saldo informado y su fecha.
--      Con eso Finanzas arma el recuadro "Disponible hoy".
--
-- No modifica ningún pago existente. Sin este SQL el dashboard nuevo funciona
-- igual que antes: "Canje" no se puede guardar (lo avisa) y el recuadro
-- "Disponible hoy" muestra solo la caja y la caja fuerte.
-- Conviene correrlo de día, antes del servicio: cambia una regla de la tabla
-- de pagos y eso la toma un instante.
-- ════════════════════════════════════════════════════════════════════════════

-- ══ A) PAGAR CON CANJE ══════════════════════════════════════════════════════

-- ── A1) "canje" como medio de pago de un egreso ─────────────────────────────
alter table public.egresos drop constraint if exists egresos_medio_pago_check;
alter table public.egresos add constraint egresos_medio_pago_check
  check (medio_pago = any (array['efectivo', 'transferencia', 'tarjeta_credito', 'tarjeta_debito',
                                 'cheque', 'otro', 'canje']));

-- ── A2) Reglas del canje ────────────────────────────────────────────────────
-- Un pago con canje ya está cancelado (no puede quedar pendiente) y no sale de
-- ninguna caja ni cuenta. registrar_pago() y editar_pago() ya dejan el origen
-- en blanco para todo lo que no es efectivo ni transferencia; este trigger es
-- la red para cualquier otro camino (una edición directa, un dashboard viejo).
create or replace function public.egresos_canje_validar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.medio_pago = 'canje' then
    if new.estado is distinct from 'pagado' then
      raise exception 'Un pago con canje no puede quedar pendiente: el canje es la forma en que se canceló. Dejalo pendiente con otro medio de pago, o marcalo como pagado.';
    end if;
    if new.pagado_desde is not null then
      raise exception 'Un pago con canje no sale de ninguna caja ni cuenta.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_egresos_canje_validar on public.egresos;
create trigger trg_egresos_canje_validar
  before insert or update on public.egresos
  for each row execute function public.egresos_canje_validar();

-- ── A3) El cash flow no cuenta los canjes ───────────────────────────────────
-- Misma función del SQL 55 con un cambio: los egresos pagados con canje no
-- entran (no salió plata). Los cobros a cuenta corriente ya estaban afuera.
create or replace function public.cashflow_mensual(p_desde date, p_hasta date)
returns table (mes date, concepto text, pagado numeric, pendiente numeric, cantidad integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with lim as (
    select date_trunc('month', p_desde)::date as desde,
           (date_trunc('month', p_hasta) + interval '1 month')::date as hasta_excl,
           date_trunc('month', (now() at time zone 'America/Argentina/Buenos_Aires'))::date as mes_actual
     -- Solo para quien ve Finanzas: un mozo puede leer `pagos` para cobrar,
     -- pero no tiene por qué llevarse los totales del mes en una llamada.
     where public.puede_tabla('cashflow_estimados', 'ver')
  ),
  cobros as (
    select date_trunc('month', (p.created_at at time zone 'America/Argentina/Buenos_Aires'))::date as mes,
           'ingresos'::text as concepto,
           sum(p.monto) as pagado, 0::numeric as pendiente, count(*)::integer as cantidad
      from public.pagos p, lim
     where p.medio_pago <> 'cuenta_corriente'
       and p.created_at >= (lim.desde::timestamp at time zone 'America/Argentina/Buenos_Aires')
       and p.created_at <  (lim.hasta_excl::timestamp at time zone 'America/Argentina/Buenos_Aires')
     group by 1
  ),
  pagados as (
    select date_trunc('month', e.fecha)::date as mes, e.categoria as concepto,
           sum(e.monto) as pagado, 0::numeric as pendiente, count(*)::integer as cantidad
      from public.egresos e, lim
     where e.estado = 'pagado'
       and e.medio_pago <> 'canje'
       and e.fecha >= lim.desde and e.fecha < lim.hasta_excl
     group by 1, 2
  ),
  pendientes as (
    select case when e.vencimiento is null then null
                else greatest(date_trunc('month', e.vencimiento)::date, lim.mes_actual) end as mes,
           e.categoria as concepto,
           0::numeric as pagado, sum(e.monto) as pendiente, count(*)::integer as cantidad
      from public.egresos e, lim
     where e.estado = 'pendiente'
     group by 1, 2
  ),
  todo as (
    select * from cobros
    union all select * from pagados
    union all
    select pe.* from pendientes pe, lim
     where pe.mes is null or (pe.mes >= lim.desde and pe.mes < lim.hasta_excl)
  )
  select t.mes, t.concepto, sum(t.pagado), sum(t.pendiente), sum(t.cantidad)::integer
    from todo t
   group by t.mes, t.concepto
   order by t.mes nulls last, t.concepto
$$;

comment on function public.cashflow_mensual(date, date) is
  'Cash flow real por mes: ingresos (cobros, sin cuenta corriente) y egresos por categoría (sin los pagados con canje), pagado y pendiente. Lo vencido impago cae en el mes en curso; lo pendiente sin vencimiento vuelve con mes NULL.';

revoke all on function public.cashflow_mensual(date, date) from public, anon;
grant execute on function public.cashflow_mensual(date, date) to authenticated, service_role;

-- ══ B) SALDO DE LAS CUENTAS DEL NEGOCIO ═════════════════════════════════════

-- ── B1) La tabla: un renglón cada vez que se informa un saldo ───────────────
-- No se pisa: queda el historial (quién lo cargó y cuándo). El saldo vigente
-- de una cuenta es el de fecha más nueva (y, a igual fecha, el último cargado).
create table if not exists public.cuentas_negocio_saldos (
  id              uuid primary key default gen_random_uuid(),
  cuenta_id       uuid not null references public.cuentas_negocio(id) on delete cascade,
  fecha           date not null,
  saldo           numeric(14,2) not null,
  nota            text,
  usuario_id      uuid default auth.uid(),
  usuario_nombre  text,
  created_at      timestamptz not null default now(),
  constraint cuentas_negocio_saldos_nota_check check (nota is null or char_length(nota) <= 200)
);

comment on table public.cuentas_negocio_saldos is
  'Saldo de una cuenta del negocio informado a mano (lo que dice el home banking ese día). El dashboard no se conecta a ningún banco. Solo lectura por la API: se escribe con cuenta_negocio_informar_saldo().';
comment on column public.cuentas_negocio_saldos.fecha is 'Día al que corresponde el saldo (no cuándo se cargó).';
comment on column public.cuentas_negocio_saldos.saldo is 'Puede ser negativo (descubierto).';

create index if not exists cuentas_negocio_saldos_vigente_idx
  on public.cuentas_negocio_saldos (cuenta_id, fecha desc, created_at desc);

-- Lo ve quien ve Finanzas.
insert into public.recurso_tablas (recurso_id, tabla, escribe) values
  ('finanzas', 'cuentas_negocio_saldos', false)
on conflict do nothing;

alter table public.cuentas_negocio_saldos enable row level security;

drop policy if exists "cuentas_negocio_saldos lectura" on public.cuentas_negocio_saldos;
create policy "cuentas_negocio_saldos lectura" on public.cuentas_negocio_saldos for select to authenticated
  using ((select public.puede_tabla('cuentas_negocio_saldos', 'ver')));

revoke all on public.cuentas_negocio_saldos from anon, public;
revoke all on public.cuentas_negocio_saldos from authenticated;
grant select on public.cuentas_negocio_saldos to authenticated;
grant all on public.cuentas_negocio_saldos to service_role;

-- ── B2) Informar el saldo de una cuenta ─────────────────────────────────────
create or replace function public.cuenta_negocio_informar_saldo(
  p_cuenta_id uuid,
  p_saldo     numeric,
  p_fecha     date default null,
  p_nota      text default null
)
returns public.cuentas_negocio_saldos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_fecha  date := coalesce(p_fecha, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_nota   text := nullif(btrim(coalesce(p_nota, '')), '');
  v_nombre text;
  v_email  text;
  v_fila   public.cuentas_negocio_saldos;
begin
  if not (public.tiene_permiso('finanzas', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para cargar el saldo de las cuentas.';
  end if;
  if p_cuenta_id is null or not exists (select 1 from public.cuentas_negocio c where c.id = p_cuenta_id) then
    raise exception 'No se encontró esa cuenta del negocio.';
  end if;
  if p_saldo is null then
    raise exception 'Falta el saldo.';
  end if;
  if abs(p_saldo) >= 1000000000000 then
    raise exception 'Ese saldo es demasiado grande: revisá los ceros.';
  end if;
  if v_fecha > v_hoy then
    raise exception 'La fecha del saldo no puede ser futura.';
  end if;
  if v_nota is not null and char_length(v_nota) > 200 then
    raise exception 'La nota es muy larga (máximo 200 letras).';
  end if;

  -- Quién: el nombre del empleado vinculado al usuario o, si no tiene, lo que
  -- va antes de la arroba de su mail.
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

  insert into public.cuentas_negocio_saldos (cuenta_id, fecha, saldo, nota, usuario_id, usuario_nombre)
  values (p_cuenta_id, v_fecha, round(p_saldo, 2), v_nota, auth.uid(), v_nombre)
  returning * into v_fila;
  return v_fila;
end
$$;

comment on function public.cuenta_negocio_informar_saldo(uuid, numeric, date, text) is
  'Guarda el saldo de una cuenta del negocio tal como figura en el banco ese día. No pisa los anteriores: queda el historial.';

revoke all on function public.cuenta_negocio_informar_saldo(uuid, numeric, date, text) from public, anon;
grant execute on function public.cuenta_negocio_informar_saldo(uuid, numeric, date, text) to authenticated, service_role;

-- ── B3) El saldo vigente de cada cuenta ─────────────────────────────────────
-- Una fila por cuenta activa (o desactivada que tenga saldo cargado), con su
-- último saldo informado y lo que se pagó por transferencia desde esa cuenta
-- DESPUÉS de ese saldo: sirve para saber si el número quedó viejo. No es un
-- saldo calculado: el sistema no ve lo que entra al banco.
-- SECURITY INVOKER: respeta el RLS de quien consulta; a quien no ve Finanzas
-- le devuelve vacío.
drop function if exists public.cuentas_negocio_saldos_vigentes();
create function public.cuentas_negocio_saldos_vigentes()
returns table (
  cuenta_id uuid, nombre text, tipo text, activa boolean, orden integer,
  saldo numeric, fecha date, nota text, usuario_nombre text, cargado_at timestamptz,
  pagado_despues numeric, pagos_despues integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with permitido as (
    select 1 where public.puede_tabla('cuentas_negocio_saldos', 'ver')
  ),
  ultimo as (
    select distinct on (s.cuenta_id) s.*
      from public.cuentas_negocio_saldos s
     order by s.cuenta_id, s.fecha desc, s.created_at desc
  )
  select c.id, c.nombre, c.tipo, c.activa, c.orden,
         u.saldo, u.fecha, u.nota, u.usuario_nombre, u.created_at,
         coalesce(d.total, 0), coalesce(d.cantidad, 0)::integer
    from public.cuentas_negocio c
    cross join permitido
    left join ultimo u on u.cuenta_id = c.id
    left join lateral (
      select sum(e.monto) as total, count(*) as cantidad
        from public.egresos e
       where u.cuenta_id is not null
         and e.cuenta_id = c.id
         and e.estado = 'pagado'
         and e.pagado_desde = 'banco'
         and (e.fecha > u.fecha or (e.fecha = u.fecha and e.created_at > u.created_at))
    ) d on true
   where c.activa or u.cuenta_id is not null
   order by c.orden, c.created_at
$$;

comment on function public.cuentas_negocio_saldos_vigentes() is
  'Último saldo informado de cada cuenta del negocio + lo pagado por transferencia desde esa cuenta después de ese saldo. Para el recuadro "Disponible hoy" de Finanzas.';

revoke all on function public.cuentas_negocio_saldos_vigentes() from public, anon;
grant execute on function public.cuentas_negocio_saldos_vigentes() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
-- Tiene que devolver: t | t | t | 2
select (select pg_get_constraintdef(oid) from pg_constraint where conname = 'egresos_medio_pago_check') like '%canje%' as canje_habilitado,
       exists (select 1 from pg_trigger where tgname = 'trg_egresos_canje_validar' and not tgisinternal) as regla_del_canje,
       to_regclass('public.cuentas_negocio_saldos') is not null as tabla_de_saldos,
       (select count(*) from pg_proc
         where pronamespace = 'public'::regnamespace
           and proname in ('cuenta_negocio_informar_saldo', 'cuentas_negocio_saldos_vigentes')) as funciones;
