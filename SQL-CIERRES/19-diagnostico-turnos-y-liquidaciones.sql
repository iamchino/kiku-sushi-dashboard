-- ════════════════════════════════════════════════════════════════════════════
-- 19 · DIAGNÓSTICO (solo lectura): turnos mal armados y si ya se liquidaron
-- ════════════════════════════════════════════════════════════════════════════
-- Muestra los turnos TAL COMO LOS CALCULA EL SISTEMA (misma regla que
-- vista_jornadas: cada entrada se empareja con la marca siguiente si es una
-- salida) y marca los que no pueden ser reales. No modifica nada.
--
-- problema:
--   TURNO LARGO (+14 h)  → se está pagando de más: casi siempre es una salida
--                          y una entrada invertidas o una salida olvidada.
--   DOBLE ESCANEO        → entrada y salida con menos de 30 min: escaneó dos
--                          veces al llegar y la salida real no quedó.
--   ENTRADA DE MADRUGADA → entrada entre 00:00 y 04:59: suele ser la salida
--                          real registrada como entrada.
--   SIN SALIDA           → entrada seguida de otra entrada: no suma horas.
-- liquidacion: estado del cierre de esa semana (o jornal de ese día).
-- ════════════════════════════════════════════════════════════════════════════
with ordenadas as (
  select f.empleado_id, f.tipo, f.ts,
         lead(f.tipo) over w as sig_tipo,
         lead(f.ts)   over w as sig_ts
    from public.fichajes f
  window w as (partition by f.empleado_id order by f.ts, f.created_at)
),
turnos as (
  select o.empleado_id,
         o.ts                                                   as entrada,
         case when o.sig_tipo = 'salida' then o.sig_ts end       as salida,
         case when o.sig_tipo = 'salida'
              then round(extract(epoch from (o.sig_ts - o.ts)) / 60)::int end as minutos,
         (o.ts at time zone 'America/Argentina/Buenos_Aires')::date as dia
    from ordenadas o
   where o.tipo = 'entrada'
     and o.ts >= now() - interval '60 days'
),
marcados as (
  select t.*,
         case
           when t.minutos > 14 * 60                  then 'TURNO LARGO (+14 h)'
           when t.minutos < 30                       then 'DOBLE ESCANEO'
           when extract(hour from t.entrada at time zone 'America/Argentina/Buenos_Aires') < 5
                                                     then 'ENTRADA DE MADRUGADA'
           when t.salida is null
                and t.entrada < now() - interval '16 hours' then 'SIN SALIDA'
         end as problema
    from turnos t
)
select trim(concat_ws(' ', e.nombre, e.apellido))                                        as empleado,
       m.problema,
       to_char(m.entrada at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') as entrada,
       coalesce(to_char(m.salida at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), '—') as salida,
       case when m.minutos is null then '—'
            else (m.minutos / 60) || ' h ' || lpad((m.minutos % 60)::text, 2, '0') || ' m' end as horas_que_cuenta,
       coalesce(
         (select 'jornal ' || l.estado from public.liquidaciones l
           where l.empleado_id = m.empleado_id and l.tipo = 'dia' and l.semana_inicio = m.dia
           limit 1),
         (select 'semana ' || l.estado from public.liquidaciones l
           where l.empleado_id = m.empleado_id and coalesce(l.tipo, 'semana') = 'semana'
             and m.dia between l.semana_inicio and l.semana_fin
           limit 1),
         'sin liquidar')                                                                   as liquidacion
  from marcados m
  join public.empleados e on e.id = m.empleado_id
 where m.problema is not null
 order by empleado, m.entrada;
