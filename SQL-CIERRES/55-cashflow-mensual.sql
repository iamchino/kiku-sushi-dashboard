-- ════════════════════════════════════════════════════════════════════════════
-- 55 — Cash flow mensual con estimados (Finanzas → Cash flow). Idempotente.
-- = migración 20261113000000. Sin este SQL la pestaña avisa que falta correrlo;
-- el resto de Finanzas sigue igual.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Administración llevaba el cash flow en un Excel aparte: ingresos y egresos
-- por mes, lo real de los meses pasados y lo que estima para los que vienen,
-- con saldo y alertas. El dashboard ya sabe lo real (cobros en `pagos`, pagos
-- en `egresos`) y lo comprometido (egresos pendientes con vencimiento); le
-- faltaba dónde guardar lo ESTIMADO y de qué saldo se parte.
--
-- Qué hace:
--   1) `cashflow_estimados`: un monto por mes y concepto ('ingresos' o un
--      grupo de gastos: mercaderia, personal, local_servicios…). Los grupos
--      los define el dashboard (src/lib/cashflow.js); acá solo se valida el
--      formato, así se pueden reagrupar sin tocar la base.
--   2) `cashflow_config`: saldo inicial, desde qué mes corre y el saldo mínimo
--      de seguridad (una sola fila).
--   3) `cashflow_mensual(desde, hasta)`: lo real y lo pendiente ya sumado por
--      mes y categoría. Se suma en la base a propósito: traer los cobros de
--      varios meses al navegador se corta en las 1000 filas de la API.
--   4) `cashflow_guardar_estimados(items)` y `cashflow_guardar_config(...)`.
--   5) Categoría de egreso nueva `comisiones` ("Comisiones y financieros":
--      comisiones de tarjetas y apps, gastos bancarios, intereses), para que
--      esa fila del cash flow tenga de dónde salir.
--
-- Permisos: los mismos de Finanzas (recurso `finanzas` en la matriz).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Estimados ────────────────────────────────────────────────────────────
create table if not exists public.cashflow_estimados (
  mes         date not null,
  concepto    text not null,
  monto       numeric(14,2) not null,
  updated_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  constraint cashflow_estimados_pkey primary key (mes, concepto),
  constraint cashflow_estimados_mes_check check (extract(day from mes) = 1),
  constraint cashflow_estimados_concepto_check check (concepto ~ '^[a-z][a-z0-9_]{1,40}$'),
  constraint cashflow_estimados_monto_check check (monto >= 0)
);

comment on table public.cashflow_estimados is
  'Montos estimados del cash flow: uno por mes (día 1) y concepto. concepto = ''ingresos'' o el id de un grupo de gastos del dashboard (src/lib/cashflow.js). Cuando el mes pasa, el cash flow muestra lo real y este valor queda como referencia.';

-- ── 2) Configuración (una sola fila) ────────────────────────────────────────
create table if not exists public.cashflow_config (
  id             smallint primary key default 1,
  saldo_inicial  numeric(14,2) not null default 0,
  saldo_desde    date,
  saldo_minimo   numeric(14,2) not null default 0,
  updated_by     uuid default auth.uid(),
  updated_at     timestamptz not null default now(),
  constraint cashflow_config_una_fila check (id = 1),
  constraint cashflow_config_desde_check check (saldo_desde is null or extract(day from saldo_desde) = 1),
  constraint cashflow_config_minimo_check check (saldo_minimo >= 0)
);

comment on table public.cashflow_config is
  'Parámetros del cash flow. saldo_inicial = plata disponible al EMPEZAR el mes saldo_desde (puede ser negativo); desde ahí el saldo final de cada mes se arrastra. saldo_minimo = colchón de seguridad: por debajo, el mes se marca en alerta.';

-- ── 3) RLS: el mismo permiso que Finanzas ───────────────────────────────────
insert into public.recurso_tablas (recurso_id, tabla, escribe)
select 'finanzas', t.tabla, true
  from (values ('cashflow_estimados'), ('cashflow_config')) as t(tabla)
 where exists (select 1 from public.recursos where id = 'finanzas')
on conflict (recurso_id, tabla) do update set escribe = excluded.escribe;

alter table public.cashflow_estimados enable row level security;
alter table public.cashflow_config enable row level security;

drop policy if exists "permisos lectura" on public.cashflow_estimados;
create policy "permisos lectura" on public.cashflow_estimados for select to authenticated
  using ((select public.puede_tabla('cashflow_estimados', 'ver')));
drop policy if exists "permisos escritura" on public.cashflow_estimados;
create policy "permisos escritura" on public.cashflow_estimados for all to authenticated
  using ((select public.puede_tabla('cashflow_estimados', 'editar')))
  with check ((select public.puede_tabla('cashflow_estimados', 'editar')));

drop policy if exists "permisos lectura" on public.cashflow_config;
create policy "permisos lectura" on public.cashflow_config for select to authenticated
  using ((select public.puede_tabla('cashflow_config', 'ver')));
drop policy if exists "permisos escritura" on public.cashflow_config;
create policy "permisos escritura" on public.cashflow_config for all to authenticated
  using ((select public.puede_tabla('cashflow_config', 'editar')))
  with check ((select public.puede_tabla('cashflow_config', 'editar')));

revoke all on public.cashflow_estimados from anon, public;
revoke all on public.cashflow_config from anon, public;
grant select, insert, update, delete on public.cashflow_estimados to authenticated;
grant select, insert, update, delete on public.cashflow_config to authenticated;
grant all on public.cashflow_estimados to service_role;
grant all on public.cashflow_config to service_role;

-- ── 4) Lo real y lo pendiente, ya sumado por mes ────────────────────────────
-- Una fila por mes y concepto:
--   concepto = 'ingresos'  → cobros (tabla pagos, sin los canjes a cuenta
--                            corriente, que no son plata), por mes de Argentina.
--   concepto = categoría   → egresos: `pagado` por mes de la fecha de pago;
--                            `pendiente` por mes de vencimiento. Lo vencido y
--                            todavía impago cae en el mes en curso (hay que
--                            pagarlo ahora). Lo pendiente sin fecha vuelve con
--                            mes NULL: no entra en ningún mes, se informa aparte.
-- SECURITY INVOKER: respeta el RLS de pagos y egresos de quien consulta, y
-- además devuelve vacío a quien no tiene Finanzas.
drop function if exists public.cashflow_mensual(date, date);
create function public.cashflow_mensual(p_desde date, p_hasta date)
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
  'Cash flow real por mes: ingresos (cobros) y egresos por categoría, pagado y pendiente. Lo vencido impago cae en el mes en curso; lo pendiente sin vencimiento vuelve con mes NULL.';

revoke all on function public.cashflow_mensual(date, date) from public, anon;
grant execute on function public.cashflow_mensual(date, date) to authenticated, service_role;

-- ── 5) Guardar estimados (varios a la vez) ──────────────────────────────────
-- p_items = [{ "mes": "2026-12-01", "concepto": "mercaderia", "monto": 5775000 }, …]
-- monto null (o ausente) = borrar ese estimado. Devuelve cuántos tocó.
-- SECURITY INVOKER: si el rol no puede editar Finanzas, el RLS lo rechaza.
drop function if exists public.cashflow_guardar_estimados(jsonb);
create function public.cashflow_guardar_estimados(p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item  jsonb;
  v_mes   date;
  v_conc  text;
  v_monto numeric;
  v_n     integer := 0;
  v_filas integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Faltan los estimados a guardar.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 400 then
    raise exception 'Son demasiados estimados juntos (máximo 400).' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_mes   := date_trunc('month', (v_item ->> 'mes')::date)::date;
    v_conc  := v_item ->> 'concepto';
    v_monto := nullif(v_item ->> 'monto', '')::numeric;

    if v_mes is null or v_conc is null then
      raise exception 'Cada estimado necesita mes y concepto.' using errcode = '22023';
    end if;

    if v_monto is null then
      delete from public.cashflow_estimados where mes = v_mes and concepto = v_conc;
    else
      insert into public.cashflow_estimados (mes, concepto, monto, updated_by, updated_at)
      values (v_mes, v_conc, v_monto, auth.uid(), now())
      on conflict (mes, concepto) do update
        set monto = excluded.monto, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
    end if;
    get diagnostics v_filas = row_count;
    v_n := v_n + v_filas;
  end loop;

  return v_n;
end $$;

revoke all on function public.cashflow_guardar_estimados(jsonb) from public, anon;
grant execute on function public.cashflow_guardar_estimados(jsonb) to authenticated, service_role;

-- ── 6) Guardar la configuración ─────────────────────────────────────────────
drop function if exists public.cashflow_guardar_config(numeric, date, numeric);
create function public.cashflow_guardar_config(p_saldo_inicial numeric, p_saldo_desde date, p_saldo_minimo numeric)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.cashflow_config (id, saldo_inicial, saldo_desde, saldo_minimo, updated_by, updated_at)
  values (1, coalesce(p_saldo_inicial, 0), date_trunc('month', p_saldo_desde)::date,
          greatest(coalesce(p_saldo_minimo, 0), 0), auth.uid(), now())
  on conflict (id) do update
    set saldo_inicial = excluded.saldo_inicial,
        saldo_desde   = excluded.saldo_desde,
        saldo_minimo  = excluded.saldo_minimo,
        updated_by    = excluded.updated_by,
        updated_at    = excluded.updated_at;
end $$;

revoke all on function public.cashflow_guardar_config(numeric, date, numeric) from public, anon;
grant execute on function public.cashflow_guardar_config(numeric, date, numeric) to authenticated, service_role;

-- ── 7) Categoría de egreso "Comisiones y financieros" ───────────────────────
alter table public.egresos drop constraint if exists egresos_categoria_check;
alter table public.egresos add constraint egresos_categoria_check
  check (categoria = any (array['mercaderia', 'sueldos', 'proveedores', 'alquiler', 'servicios',
                                'impuestos', 'mantenimiento', 'marketing', 'comisiones', 'otros']));

notify pgrst, 'reload schema';

-- Verificación: las dos tablas con RLS, anon sin acceso a la función y la
-- categoría nueva habilitada.
select
  (select count(*) from pg_class where relname in ('cashflow_estimados', 'cashflow_config') and relrowsecurity) as tablas_con_rls_deben_ser_2,
  has_function_privilege('anon', 'public.cashflow_mensual(date, date)', 'execute') as anon_puede_ejecutar_debe_ser_false,
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'egresos_categoria_check') like '%comisiones%' as categoria_comisiones;
