-- ════════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO (solo lectura) — ¿De dónde salió el usuario "raro" (virus/sistema)?
-- Pegar entero en el SQL Editor de Supabase y mandar captura de los 3 resultados.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Todos los logins: cuándo se crearon, con qué rol, quién los creó y cuándo entraron por última vez.
select
  u.id,
  u.email,
  u.raw_app_meta_data ->> 'role'                        as rol,
  u.raw_app_meta_data ->> 'provider'                    as proveedor,
  u.created_at,
  u.last_sign_in_at,
  u.confirmed_at is not null                            as confirmado,
  (select count(*) from auth.identities i where i.user_id = u.id) as identidades,
  -- Si lo creó un admin desde el dashboard, acá aparece el email del admin;
  -- si se registró solo (signup), aparece vacío.
  (select e.payload ->> 'actor_username'
     from auth.audit_log_entries e
    where e.payload ->> 'action' in ('user_signedup', 'user_invited')
      and (e.payload -> 'traits' ->> 'user_email' = u.email or e.payload ->> 'actor_username' = u.email)
    order by e.created_at asc limit 1)                  as creado_por
from auth.users u
order by u.created_at desc;

-- 2) Qué hizo ese usuario (reemplazar el email). Ingresos, desde qué IP, cuándo.
select e.created_at, e.payload ->> 'action' as accion, e.ip_address, e.payload ->> 'actor_username' as actor
  from auth.audit_log_entries e
 where e.payload ->> 'actor_username' ilike '%virus%'
    or e.payload -> 'traits' ->> 'user_email' ilike '%virus%'
    or e.payload ->> 'actor_username' ilike '%sistema%'
    or e.payload -> 'traits' ->> 'user_email' ilike '%sistema%'
 order by e.created_at desc
 limit 50;

-- 3) Logins SIN rol en app_metadata (entrarían como 'cocina' por defecto):
--    tendría que dar 0 filas. Si aparece alguno que no reconocés, borrarlo.
select u.email, u.created_at, u.last_sign_in_at
  from auth.users u
 where coalesce(u.raw_app_meta_data ->> 'role', '') = ''
 order by u.created_at desc;

-- 4) Datos del negocio que apuntan a ese usuario (si "Eliminar" seguía fallando era por esto).
--    Reemplazar el email.
with x as (select id from auth.users where email ilike '%virus%' or email ilike '%sistema%')
select 'produccion_listas' as tabla, count(*) from public.produccion_listas where creado_por in (select id from x)
union all select 'empleados',  count(*) from public.empleados  where user_id in (select id from x)
union all select 'mozos',      count(*) from public.mozos      where user_id in (select id from x)
union all select 'fichajes',   count(*) from public.fichajes   where user_id in (select id from x);
