-- ============================================================
-- Migración: las horas se pagan por MINUTOS EXACTOS (se va el redondeo)
--
-- Antes las horas se redondeaban a bloques de 30 min. Se saca: lo fichado es
-- lo que se paga, minuto por minuto.
--   5h47 → 5h47   ·   5h10 → 5h10   ·   6h08 → 6h08
--
-- Qué cambia:
--   · vista_jornadas_dia.minutos  → suma de minutos reales del día, sin redondear
--   · liquidacion_horas()         → suma esos minutos exactos
--   · generar_liquidacion_dia()   → toma el total exacto del día
--   · redondear_bloque_30()       → deja de usarse y se elimina
--
-- Solo cambia el CÁLCULO: no toca datos. Las liquidaciones YA PAGADAS
-- conservan los minutos y el monto con los que se pagaron.
--
-- Es idempotente y funciona corras o no las migraciones anteriores: redefine
-- las tres cosas por completo.
-- ============================================================

-- ── 1) vista_jornadas: cada tramo con sus minutos REALES ────────────────────
-- Mismas columnas, mismo orden y mismos tipos que antes (no rompe nada que ya
-- la consulte). `salida is null` sigue significando jornada abierta.
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
  'Jornadas derivadas del log de fichajes. minutos = minutos reales del tramo, sin redondeo; salida null = jornada abierta.';

grant select on public.vista_jornadas to authenticated;

-- ── 2) vista_jornadas_dia: total del día, exacto ────────────────────────────
-- La fecha se calcula en hora de Argentina: un turno que entra 18:00 y sale
-- 00:08 cuenta entero en el día en que EMPEZÓ.
create or replace view public.vista_jornadas_dia
with (security_invoker = on) as
select
  j.empleado_id,
  (j.entrada at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
  sum(j.minutos_reales)::int                                      as minutos_reales,
  sum(j.minutos_reales)::int                                      as minutos
from public.vista_jornadas j
where j.salida is not null
group by 1, 2;

comment on view public.vista_jornadas_dia is
  'Horas por empleado y día operativo (AR), en minutos exactos: lo fichado es lo que se paga. Es la base de la liquidación.';

grant select on public.vista_jornadas_dia to authenticated;

-- ── 3) liquidacion_horas: suma los minutos exactos de cada día ──────────────
-- Misma firma que antes.
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

grant execute on function public.liquidacion_horas(date, date) to authenticated;

-- ── 4) generar_liquidacion_dia: el jornal usa el total exacto del día ───────
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

-- ── 5) Se va el helper del redondeo ─────────────────────────────────────────
-- Ya ninguna vista ni función lo usa (se redefinieron arriba). Si nunca se
-- creó, este drop no hace nada.
drop function if exists public.redondear_bloque_30(numeric);

notify pgrst, 'reload schema';
