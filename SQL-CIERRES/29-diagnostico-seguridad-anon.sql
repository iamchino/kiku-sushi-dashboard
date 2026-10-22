-- 29 · Diagnostico de seguridad (SOLO LECTURA). Correr ANTES y DESPUES del 30.
-- Antes deberia dar ~107 funciones y ~65 tablas para anon; despues 4 y 10.

-- A) Funciones que puede ejecutar un anonimo
select count(*) as funciones_anon,
       string_agg(p.proname, ', ' order by p.proname) as cuales
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE');

-- B) Tablas/vistas sobre las que anon tiene algun permiso
select count(distinct table_name) as tablas_anon,
       string_agg(distinct table_name, ', ') as cuales
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public';

-- C) Policies que nombran a anon
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and 'anon' = any(roles)
order by tablename, policyname;

-- D) Vistas y si respetan los permisos del que consulta
select c.relname as vista,
       coalesce((select option_value from pg_options_to_table(c.reloptions)
                 where option_name = 'security_invoker'), 'off') as security_invoker
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
order by 1;

-- E) Que rol asume la base sin sesion (esperado despues: null)
select public.current_app_role() as rol_sin_sesion;
