-- ============================================================
-- Migración: Liquidación DIARIA (jornal) además de la semanal
--
--   * liquidaciones.tipo → 'semana' (default, filas existentes) | 'dia'
--       - tipo 'dia': semana_inicio = semana_fin = el día pagado
--   * unique nuevo: (empleado_id, tipo, semana_inicio)
--   * liquidacion_horas() → ahora EXCLUYE los días que ya tienen
--     liquidación diaria (así el cierre semanal nunca duplica un jornal)
--   * generar_liquidacion_dia(empleado, fecha) → jornal de un día
--       - rechaza días ya cubiertos por una liquidación semanal
--   * generar_liquidacion_semanal() → recreada con el nuevo on conflict
--
-- Add-only sobre datos. Reemplaza funciones existentes.
-- ============================================================

-- ── 1) tipo de liquidación ────────────────────────────────────────────────────
alter table public.liquidaciones
  add column if not exists tipo text not null default 'semana'
    check (tipo in ('semana', 'dia'));

comment on column public.liquidaciones.tipo is
  'semana = cierre martes→lunes · dia = jornal suelto (semana_inicio = semana_fin = día)';

-- unique viejo (empleado_id, semana_inicio) → nuevo con tipo, para que un
-- día y una semana que empiezan la misma fecha no colisionen.
alter table public.liquidaciones
  drop constraint if exists liquidaciones_empleado_id_semana_inicio_key;

create unique index if not exists liquidaciones_emp_tipo_inicio_uidx
  on public.liquidaciones (empleado_id, tipo, semana_inicio);

-- ── 2) liquidacion_horas: excluye días ya pagados por jornal ─────────────────
-- Misma firma (no rompe llamadas existentes). Las horas de un día cubierto por
-- una liquidación 'dia' (pendiente o pagada) no se cuentan en el rango.
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
    coalesce(sum(j.minutos), 0)::int                                   as minutos,
    round(coalesce(sum(j.minutos), 0) / 60.0, 2)                       as horas,
    case when e.tipo_sueldo = 'hora' then e.sueldo_base else 0 end     as valor_hora,
    case when e.tipo_sueldo = 'hora'
         then round(coalesce(sum(j.minutos), 0) / 60.0 * e.sueldo_base, 2)
         else 0 end                                                    as total
  from public.empleados e
  left join public.vista_jornadas j
    on  j.empleado_id = e.id
    and j.salida is not null
    and (j.entrada at time zone 'America/Argentina/Buenos_Aires')::date
        between p_desde and p_hasta
    -- días ya liquidados como jornal: fuera del cálculo
    and not exists (
      select 1 from public.liquidaciones ld
      where ld.tipo = 'dia'
        and ld.empleado_id = e.id
        and ld.semana_inicio =
            (j.entrada at time zone 'America/Argentina/Buenos_Aires')::date
    )
  where e.activo
  group by e.id, e.nombre, e.apellido, e.tipo_sueldo, e.sueldo_base
  order by 2;
$$;

-- ── 3) generar_liquidacion_dia(empleado, fecha): jornal de un día ────────────
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

  select coalesce(sum(j.minutos), 0)::int into v_min
  from public.vista_jornadas j
  where j.empleado_id = p_empleado_id
    and j.salida is not null
    and (j.entrada at time zone 'America/Argentina/Buenos_Aires')::date = p_fecha;

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

-- ── 4) generar_liquidacion_semanal: nuevo on conflict (con tipo) ─────────────
-- Misma lógica; usa liquidacion_horas (que ya excluye jornales) y escribe
-- explícitamente tipo='semana'.
create or replace function public.generar_liquidacion_semanal(p_fecha date)
returns setof public.liquidaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio date;
  v_fin    date;
begin
  if not public.is_finanzas_user() then
    raise exception 'Solo el usuario de Finanzas puede generar liquidaciones.';
  end if;

  -- normalizar al martes de esa semana (date_trunc('week') da lunes ISO)
  v_inicio := (date_trunc('week', (p_fecha - 1)::timestamp))::date + 1;
  v_fin    := v_inicio + 6;   -- lunes siguiente

  return query
  insert into public.liquidaciones as l
    (empleado_id, tipo, semana_inicio, semana_fin, minutos, horas, valor_hora, total, estado)
  select
    lh.empleado_id, 'semana', v_inicio, v_fin, lh.minutos, lh.horas, lh.valor_hora, lh.total, 'pendiente'
  from public.liquidacion_horas(v_inicio, v_fin) lh
  where lh.tipo_sueldo = 'hora' and lh.minutos > 0
  on conflict (empleado_id, tipo, semana_inicio) do update
    set minutos    = excluded.minutos,
        horas      = excluded.horas,
        valor_hora = excluded.valor_hora,
        total      = excluded.total,
        semana_fin = excluded.semana_fin
    where l.estado <> 'pagado'
  returning l.*;
end;
$$;

grant execute on function public.generar_liquidacion_semanal(date) to authenticated;

notify pgrst, 'reload schema';
