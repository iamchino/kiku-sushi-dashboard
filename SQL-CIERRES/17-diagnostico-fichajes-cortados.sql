-- ════════════════════════════════════════════════════════════════════════════
-- 17 · DIAGNÓSTICO (solo lectura): fichajes mal armados de los últimos 45 días
-- ════════════════════════════════════════════════════════════════════════════
-- Busca el patrón de la "salida fantasma":
--   18:05 entrada · 20:18 salida (fantasma) · 00:18 ENTRADA (era la salida real)
-- y otras marcas sospechosas. No modifica nada.
--
-- motivo:
--   ENTRADA DE MADRUGADA → entrada entre 00:00 y 06:59: casi siempre es una
--                          salida que quedó registrada como entrada.
--   TURNO CORTO          → entrada→salida de menos de 3 h.
--   SIN SALIDA           → entrada seguida de otra entrada (turno abierto).
-- ════════════════════════════════════════════════════════════════════════════
with marcas as (
  select f.id, f.empleado_id, f.tipo, f.ts, f.origen, f.nota,
         lag(f.tipo)  over w as tipo_ant,
         lag(f.ts)    over w as ts_ant,
         lead(f.tipo) over w as tipo_sig,
         lead(f.ts)   over w as ts_sig
    from public.fichajes f
   where f.ts >= now() - interval '46 days'
  window w as (partition by f.empleado_id order by f.ts, f.created_at)
),
sospechosas as (
  select m.*,
         case
           when m.tipo = 'entrada'
                and extract(hour from m.ts at time zone 'America/Argentina/Buenos_Aires') < 7
             then 'ENTRADA DE MADRUGADA'
           when m.tipo = 'entrada' and m.tipo_sig = 'salida' and m.ts_sig - m.ts < interval '3 hours'
             then 'TURNO CORTO'
           when m.tipo = 'entrada' and m.tipo_sig = 'entrada'
             then 'SIN SALIDA'
         end as motivo
    from marcas m
   where m.ts >= now() - interval '45 days'
)
select trim(concat_ws(' ', e.nombre, e.apellido))                                   as empleado,
       s.motivo,
       to_char(s.ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') as marca,
       s.tipo,
       s.origen,
       to_char(s.ts_ant at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || ' ' || s.tipo_ant as marca_anterior,
       to_char(s.ts_sig at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || ' ' || s.tipo_sig as marca_siguiente,
       s.nota,
       s.id as fichaje_id
  from sospechosas s
  join public.empleados e on e.id = s.empleado_id
 where s.motivo is not null
 order by empleado, s.ts;
