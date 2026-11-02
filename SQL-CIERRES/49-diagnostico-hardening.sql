-- ════════════════════════════════════════════════════════════════════════════
-- 49 — DIAGNÓSTICO DE HARDENING (solo lectura). Correr ANTES del 50 y el 51.
-- Cada bloque dice qué tiene que dar para seguir.
-- ════════════════════════════════════════════════════════════════════════════

-- A) Secreto del push: si sigue el placeholder, cualquiera puede disparar
--    notificaciones. Tiene que dar "OK".
select case when valor like 'CAMBIAR%' or length(valor) < 24 then 'CAMBIAR: placeholder o muy corto'
            else 'OK' end as push_web_secret
  from private.config where clave = 'push_web_secret';

-- B) Qué puede ejecutar anon hoy (esperado: crear_pedido_web, crear_reserva,
--    crear_lista_espera, slots_disponibles y nada más).
select p.proname as funcion_ejecutable_por_anon
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and has_function_privilege('anon', p.oid, 'execute')
 order by 1;

-- C) Tablas donde anon tiene algún privilegio (esperado: solo las 10 de la
--    capa 1, y solo SELECT).
select table_name, string_agg(privilege_type, ',') as privilegios
  from information_schema.role_table_grants
 where grantee = 'anon' and table_schema = 'public'
 group by table_name order by 1;

-- D) Policies amplias "cualquier logueado" (las que borra el 51). Para cada
--    tabla, qué roles conservan acceso por la MATRIZ de permisos cuando se
--    borren. Si una tabla que el local usa queda sin ningún rol con
--    "editar", agregar el recurso en Permisos ANTES de correr el 51.
with amplias as (
  select tablename
    from pg_policies
   where schemaname = 'public'
     and (qual ilike '%auth.role()%' or with_check ilike '%auth.role()%')
)
select a.tablename,
       coalesce(string_agg(distinct rp.rol_id || case when rp.editar and rt.escribe then ' (editar)' else ' (ver)' end, ', '), '— NINGUNO —') as roles_por_matriz
  from amplias a
  left join public.recurso_tablas rt on rt.tabla = a.tablename
  left join public.rol_permisos rp on rp.recurso_id = rt.recurso_id and rp.ver
 group by a.tablename
 order by 1;

-- E) Tablas legacy que el dashboard ya no usa (las cierra el 51 a admin/finanzas).
--    Si alguna tiene filas recientes, alguien las sigue usando: avisar.
select 'comprobantes_afip' t, count(*) filas, max(created_at) ultima from public.comprobantes_afip
union all select 'turnos_caja', count(*), max(apertura_at) from public.turnos_caja
union all select 'mermas', count(*), max(created_at) from public.mermas
union all select 'productos', count(*), null from public.productos
union all select 'ingredientes', count(*), null from public.ingredientes
union all select 'escandallo', count(*), null from public.escandallo;

-- F) Usuarios sin rol (entrarían con permisos de fallback en el front).
--    Esperado: 0 filas.
select u.id, u.email, u.created_at, u.last_sign_in_at
  from auth.users u
 where coalesce(u.raw_app_meta_data ->> 'role', '') = ''
 order by u.created_at;

-- G) Funciones SECURITY DEFINER ejecutables por cualquier logueado que NO
--    tienen guarda propia (revisar la lista: las de uso interno no deberían
--    estar). kiku_upsert_cliente_marketing la cierra el 50.
select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and has_function_privilege('authenticated', p.oid, 'execute')
   and p.proname in ('kiku_upsert_cliente_marketing', 'push_web_post', 'cola_impresion_limpiar',
                     'descontar_stock_pedido', 'revertir_stock_pedido', 'explotar_receta')
 order by 1;

-- H) Volumen de datos personales (para la política de retención del 52).
select 'lista_espera' tabla, count(*) filas, min(created_at) desde from public.lista_espera
union all select 'notificaciones', count(*), min(created_at) from public.notificaciones
union all select 'reservas', count(*), min(created_at) from public.reservas
union all select 'clientes', count(*), min(created_at) from public.clientes
union all select 'fichajes con gps', count(*) filter (where lat is not null), min(ts) from public.fichajes
union all select 'device_tokens', count(*), min(created_at) from public.device_tokens
union all select 'web_push_subs', count(*), min(created_at) from public.web_push_subs
union all select 'arca_request_log', count(*), min(created_at) from public.arca_request_log;
