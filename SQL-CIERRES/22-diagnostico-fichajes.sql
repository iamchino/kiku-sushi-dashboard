-- 22 · DIAGNOSTICO (solo lee, no cambia nada)
-- Parte B: fichajes raros desde el 1/8 (turnos de más de 14 h, de menos de
-- 30 min, o dos marcas iguales seguidas). Si no devuelve filas, está todo limpio.
with m as (
  select e.nombre || coalesce(' ' || e.apellido, '') as empleado,
         f.tipo, f.ts,
         lead(f.tipo) over w as tipo_sig,
         lead(f.ts)   over w as ts_sig
  from public.fichajes f
  join public.empleados e on e.id = f.empleado_id
  where f.ts >= '2026-08-01'
  window w as (partition by f.empleado_id order by f.ts)
)
select empleado,
       to_char(ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') as marca,
       tipo,
       to_char(ts_sig at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') as siguiente,
       tipo_sig,
       round(extract(epoch from ts_sig - ts) / 3600.0, 1) as horas,
       case
         when tipo = tipo_sig then 'dos ' || tipo || ' seguidas'
         when tipo = 'entrada' and ts_sig - ts > interval '14 hours' then 'turno de mas de 14 h'
         when tipo = 'entrada' and ts_sig - ts < interval '30 minutes' then 'turno de menos de 30 min'
       end as problema
from m
where tipo_sig is not null
  and (tipo = tipo_sig
       or (tipo = 'entrada' and (ts_sig - ts > interval '14 hours' or ts_sig - ts < interval '30 minutes')))
order by empleado, ts;
