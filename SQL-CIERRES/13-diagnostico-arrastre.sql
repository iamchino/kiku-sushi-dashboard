-- SOLO LEE. Por que el fondo inicial sugerido dio cero.
--
-- No llama a apertura_sugerida(): el SQL Editor de Supabase corre como
-- 'postgres', sin JWT, y la RPC se niega ("No tenes permiso para ver la caja").
-- Aca se replica el MISMO calculo inline, asi que el numero es el que la RPC
-- le devolveria a un usuario con permiso.
with ultimo as (
  select t.*
  from public.caja_turnos t
  where t.estado = 'cerrado'
  order by t.cierre_at desc nulls last, t.created_at desc
  limit 1
),
cuentas as (
  select
    u.business_date,
    u.cierre_at,
    nullif(u.denominaciones_cierre #>> '{medios,efectivo,contado}',  '')::numeric as contado,
    nullif(u.denominaciones_cierre #>> '{medios,efectivo,esperado}', '')::numeric as esperado,
    coalesce((
      select sum(m.monto) from public.caja_fuerte_movimientos m
      where m.turno_id = u.id and m.tipo = 'deposito' and m.created_at > u.cierre_at
    ), 0) as depositado,
    (select count(*) from public.caja_fuerte_movimientos m
     where m.turno_id = u.id and m.tipo = 'deposito' and m.created_at > u.cierre_at) as n_dep,
    left(u.denominaciones_cierre::text, 400) as crudo
  from ultimo u
)
select 'existe apertura_sugerida()' as chequeo,
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname='apertura_sugerida') as valor
union all select 'ultimo cierre',
       coalesce((select business_date::text || '  cierre_at=' || coalesce(cierre_at::text,'NULL') from cuentas),
                'NO HAY NINGUN TURNO CERRADO')
union all select 'efectivo CONTADO en ese cierre',
       coalesce((select contado::text from cuentas), '(vacio)')
union all select 'efectivo esperado en ese cierre',
       coalesce((select esperado::text from cuentas), '(vacio)')
union all select 'depositos a caja fuerte post-cierre',
       coalesce((select depositado::text || '  (' || n_dep::text || ' mov.)' from cuentas), '-')
union all select '>>> ARRASTRE QUE DEBERIA SUGERIR',
       -- Ojo: greatest(0, null) da 0 en Postgres, asi que "sin dato" y "cero de
       -- verdad" se confundirian. Se distinguen a proposito.
       coalesce((select case
                          when coalesce(contado, esperado) is null
                            then 'SIN DATO de efectivo en el cierre (por eso no sugiere nada)'
                          else greatest(0, coalesce(contado, esperado) - depositado)::text
                        end from cuentas),
                'NO HAY CIERRE del cual arrastrar')
union all select 'turno abierto ahora',
       coalesce((select t.business_date::text || '  fondo inicial=' || t.apertura_monto::text
                 from public.caja_turnos t where t.estado='abierto'
                 order by t.apertura_at desc limit 1), 'no hay turno abierto')
union all select 'permiso caja.ver por rol',
       coalesce((select string_agg(rol_id || '=' || ver::text, ' · ' order by rol_id)
                 from public.rol_permisos where recurso_id = 'caja'), '(sin filas)')
union all select 'jsonb crudo del cierre',
       coalesce((select crudo from cuentas), '-');
