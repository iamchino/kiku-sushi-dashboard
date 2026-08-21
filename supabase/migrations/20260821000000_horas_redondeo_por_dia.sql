-- ============================================================
-- Migración: el redondeo de horas pasa a ser POR DÍA y HACIA ARRIBA
--
-- Antes: cada jornada (par entrada→salida) se redondeaba sola al bloque de
-- 30 min más cercano. Eso rompía el total del día cuando el empleado fichaba
-- más de una vez: 1h10 + 4h37 = 5h47 reales → 1h00 + 4h30 = 5h30 pagadas.
-- Además, al redondear "al más cercano", una jornada de 5h40 caía a 5h30.
--
-- Ahora:
--   · vista_jornadas.minutos      → minutos REALES de cada tramo (sin redondear)
--   · vista_jornadas_dia          → total del día por empleado, redondeado
--                                   HACIA ARRIBA al bloque de 30 min
--   · liquidacion_horas()         → suma los días ya redondeados
--   · generar_liquidacion_dia()   → toma el total del día ya redondeado
--
-- Ejemplos del redondeo nuevo (siempre para arriba, sobre el total del día):
--   5h47 → 6h00 · 5h40 → 6h00 · 5h35 → 6h00 · 5h10 → 5h30 · 5h00 → 5h00
--
-- Solo cambia el CÁLCULO: no toca datos. Las liquidaciones ya pagadas
-- conservan los minutos con los que se pagaron.
-- ============================================================

-- ── 1) Helper del redondeo: bloques de 30 min, siempre hacia arriba ──────────
create or replace function public.redondear_bloque_30(p_minutos numeric)
returns int
language sql
immutable
as $$
  select case
           when coalesce(p_minutos, 0) <= 0 then 0
           else (ceil(p_minutos / 30.0) * 30)::int
         end;
$$;

comment on function public.redondear_bloque_30(numeric) is
  'Redondea minutos al bloque de 30 SIEMPRE hacia arriba (47 → 60, 31 → 60, 30 → 30, 1 → 30, 0 → 0).';

grant execute on function public.redondear_bloque_30(numeric) to authenticated;

-- ── 2) vista_jornadas: cada tramo queda con sus minutos REALES ───────────────
-- Se mantienen las mismas columnas (nombre, tipo y orden) para no romper nada
-- que ya consulte la vista. `minutos` deja de venir redondeado: el redondeo
-- ahora vive en vista_jornadas_dia, que es donde tiene sentido aplicarlo.
create or replace view public.vista_jornadas
with (security_invoker = on) as
with ordenados as (
  select
    empleado_id,
    tipo,
    ts,
    lead(tipo) over (partition by empleado_id order by ts, created_at) as sig_tipo,
    lead(ts)   over (partition by empleado_id order by ts, created_at) as sig_ts
  from public.fichajes
)
select
  empleado_id,
  ts     as entrada,
  sig_ts as salida,
  round(extract(epoch from (sig_ts - ts)) / 60.0)::int as minutos_reales,
  round(extract(epoch from (sig_ts - ts)) / 60.0)::int as minutos
from ordenados
where tipo = 'entrada' and (sig_tipo is null or sig_tipo = 'salida');

comment on view public.vista_jornadas is
  'Jornadas derivadas del log de fichajes. minutos = minutos reales del tramo (el redondeo a bloques de 30 se aplica por día en vista_jornadas_dia); salida null = jornada abierta.';

grant select on public.vista_jornadas to authenticated;

-- ── 3) vista_jornadas_dia: total del día, redondeado hacia arriba ────────────
-- La fecha se calcula en hora de Argentina para que un turno que cruza la
-- medianoche caiga en el día operativo correcto.
create or replace view public.vista_jornadas_dia
with (security_invoker = on) as
select
  j.empleado_id,
  (j.entrada at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
  sum(j.minutos_reales)::int                              as minutos_reales,
  public.redondear_bloque_30(sum(j.minutos_reales))       as minutos
from public.vista_jornadas j
where j.salida is not null
group by 1, 2;

comment on view public.vista_jornadas_dia is
  'Horas por empleado y día operativo (AR). minutos_reales = lo fichado; minutos = redondeado al bloque de 30 SIEMPRE hacia arriba. Es la base de la liquidación.';

grant select on public.vista_jornadas_dia to authenticated;

-- ── 4) liquidacion_horas: suma los días YA redondeados ──────────────────────
-- Misma firma. El redondeo por día se hace antes de sumar la semana, así el
-- total semanal es la suma de lo que se ve en la tira Lun→Dom.
create or replace function public.liquidacion_horas(p_desde date, p_hasta date)
returns table (
  empleado_id uuid,
  nombre      text,
  tipo_sueldo text,
  minutos     int,
  horas       numeric,
  valor_hora  numeric,
  total       numeric
)
language sql
stable
as $$
  select
    e.id,
    trim(concat_ws(' ', e.nombre, e.apellido)),
    e.tipo_sueldo,
    coalesce(sum(d.minutos), 0)::int                                   as minutos,
    round(coalesce(sum(d.minutos), 0) / 60.0, 2)                       as horas,
    case when e.tipo_sueldo = 'hora' then e.sueldo_base else 0 end     as valor_hora,
    case when e.tipo_sueldo = 'hora'
         then round(coalesce(sum(d.minutos), 0) / 60.0 * e.sueldo_base, 2)
         else 0 end                                                    as total
  from public.empleados e
  left join public.vista_jornadas_dia d
    on  d.empleado_id = e.id
    and d.fecha between p_desde and p_hasta
    -- días ya liquidados como jornal: fuera del cálculo
    and not exists (
      select 1 from public.liquidaciones ld
      where ld.tipo = 'dia'
        and ld.empleado_id = e.id
        and ld.semana_inicio = d.fecha
    )
  where e.activo
  group by e.id, e.nombre, e.apellido, e.tipo_sueldo, e.sueldo_base
  order by 2;
$$;

-- ── 5) generar_liquidacion_dia: toma el total del día ya redondeado ─────────
create or replace function public.generar_liquidacion_dia(p_empleado_id uuid, p_fecha date)
returns setof public.liquidaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp public.empleados%rowtype;
  v_min int;
begin
  if not public.is_finanzas_user() then
    raise exception 'Solo el usuario de Finanzas puede generar liquidaciones.';
  end if;

  select * into v_emp from public.empleados where id = p_empleado_id;
  if not found then
    raise exception 'Empleado inexistente.';
  end if;
  if v_emp.tipo_sueldo <> 'hora' then
    raise exception 'El empleado no cobra por hora.';
  end if;

  -- si el día ya quedó dentro de un cierre semanal, no se puede pagar suelto
  if exists (
    select 1 from public.liquidaciones l
    where l.empleado_id = p_empleado_id
      and l.tipo = 'semana'
      and p_fecha between l.semana_inicio and l.semana_fin
  ) then
    raise exception 'Ese día ya está incluido en una liquidación semanal. Eliminá primero ese cierre si querés pagar el día suelto.';
  end if;

  select coalesce(d.minutos, 0)::int into v_min
  from public.vista_jornadas_dia d
  where d.empleado_id = p_empleado_id
    and d.fecha = p_fecha;

  v_min := coalesce(v_min, 0);

  if v_min <= 0 then
    raise exception 'Sin horas cerradas ese día (jornadas abiertas no cuentan).';
  end if;

  return query
  insert into public.liquidaciones as l
    (empleado_id, tipo, semana_inicio, semana_fin, minutos, horas, valor_hora, total, estado)
  values (
    p_empleado_id, 'dia', p_fecha, p_fecha, v_min,
    round(v_min / 60.0, 2), v_emp.sueldo_base,
    round(v_min / 60.0 * v_emp.sueldo_base, 2), 'pendiente'
  )
  on conflict (empleado_id, tipo, semana_inicio) do update
    set minutos    = excluded.minutos,
        horas      = excluded.horas,
        valor_hora = excluded.valor_hora,
        total      = excluded.total
    where l.estado <> 'pagado'
  returning l.*;
end;
$$;

grant execute on function public.generar_liquidacion_dia(uuid, date) to authenticated;

notify pgrst, 'reload schema';
