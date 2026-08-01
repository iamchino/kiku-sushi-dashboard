-- ############################################################################
--
--  KIKU SUSHI — Verificación del estado de permisos
--
--  Pegá esto en Supabase → SQL Editor y dale Run. Solo lee, no modifica nada.
--  Devuelve una fila por chequeo con OK / FALLA / AVISO.
--
--  Correlo DESPUÉS de aplicar SQL_EDITOR_PERMISOS.sql.
--  Si todo da OK, la base está lista.
--
-- ############################################################################

with chequeos as (

  -- ── Fase 0: seguridad de roles ────────────────────────────────────────────
  select 1 as orden, 'current_app_role() no lee user_metadata' as chequeo,
    case when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'current_app_role'
        and p.prosrc not like '%user_metadata%'
    ) then 'OK' else 'FALLA' end as resultado,
    'Si falla, cualquier usuario puede auto-asignarse admin desde el navegador' as detalle

  union all
  select 2, 'Ninguna policy lee user_metadata',
    case when (select count(*) from pg_policies
               where schemaname = 'public'
                 and (coalesce(qual,'') || coalesce(with_check,'')) like '%user_metadata%') = 0
         then 'OK' else 'FALLA' end,
    coalesce((select string_agg(distinct tablename, ', ') from pg_policies
              where schemaname = 'public'
                and (coalesce(qual,'') || coalesce(with_check,'')) like '%user_metadata%'),
             'ninguna')

  union all
  select 3, 'RLS habilitado en public.mozos',
    case when to_regclass('public.mozos') is null then 'AVISO'
         when (select relrowsecurity from pg_class where oid = 'public.mozos'::regclass) then 'OK'
         else 'FALLA' end,
    case when to_regclass('public.mozos') is null
         then 'La tabla no existe en esta base; se omitió a propósito'
         else 'Sin RLS, cualquiera con la anon key la lee y la escribe' end

  union all
  select 4, 'Usuarios con rol en app_metadata',
    case when (select count(*) from auth.users
               where deleted_at is null and nullif(raw_app_meta_data->>'role','') is null) = 0
         then 'OK' else 'AVISO' end,
    coalesce((select string_agg(coalesce(email, id::text), ', ') from auth.users
              where deleted_at is null and nullif(raw_app_meta_data->>'role','') is null),
             'todos tienen rol') || ' (sin rol quedan como cocina)'

  -- ── Rol finanzas ──────────────────────────────────────────────────────────
  union all
  select 5, 'is_finanzas_user() acepta email o rol',
    case when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_finanzas_user'
        and p.prosrc like '%app_metadata%' and p.prosrc like '%finanzas@kikusushi.com.ar%'
    ) then 'OK' else 'FALLA' end,
    'Si falla, el rol finanzas ve las pantallas pero sin datos'

  union all
  select 6, 'Policies de Finanzas sobre caja/pagos/proveedores',
    case when (select count(*) from pg_policies
               where schemaname = 'public' and policyname like '%finanzas%'
                 and tablename in ('caja_turnos','pagos','proveedores')) = 3
         then 'OK' else 'FALLA' end,
    'Sin esto, el rol finanzas ve Resumen, Cajas diarias y Proveedores vacíos'

  -- ── Fase 1: esquema de permisos ───────────────────────────────────────────
  union all
  select 7, 'Tablas de permisos creadas',
    case when to_regclass('public.roles')        is not null
          and to_regclass('public.recursos')     is not null
          and to_regclass('public.rol_permisos') is not null
         then 'OK' else 'FALLA' end,
    'roles, recursos y rol_permisos'

  union all
  select 8, 'Funciones de permisos creadas',
    case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public'
                 and p.proname in ('tiene_permiso','puede_administrar_permisos',
                                   'es_admin_permisos_de_emergencia')) = 3
         then 'OK' else 'FALLA' end,
    'tiene_permiso, puede_administrar_permisos, es_admin_permisos_de_emergencia'

  union all
  select 9, 'tiene_permiso() es SECURITY DEFINER',
    case when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'tiene_permiso' and p.prosecdef
    ) then 'OK' else 'FALLA' end,
    'Si no lo es, las policies de la fase 4 entran en recursión'

  union all
  select 10, 'Catálogo con 23 recursos',
    case when (select count(*) from public.recursos) = 23 then 'OK' else 'FALLA' end,
    'hay ' || (select count(*) from public.recursos)::text

  union all
  select 11, 'Los 5 roles de sistema',
    case when (select count(*) from public.roles where sistema) = 5 then 'OK' else 'FALLA' end,
    coalesce((select string_agg(id, ', ' order by orden) from public.roles), 'ninguno')

  union all
  select 12, 'Matriz sembrada con los valores esperados',
    case when (select count(*) from (
                 select rol_id, count(*) filter (where ver) as n
                 from public.rol_permisos group by rol_id
               ) t
               where (rol_id, n) in (('admin',20),('cocina',9),('empleado',2),
                                     ('finanzas',5),('mozo',6))) = 5
         then 'OK' else 'AVISO' end,
    coalesce((select string_agg(rol_id || '=' || n::text, ' · ' order by rol_id)
              from (select rol_id, count(*) filter (where ver) as n
                    from public.rol_permisos group by rol_id) t), 'vacía')
    || '  (esperado admin=20 cocina=9 empleado=2 finanzas=5 mozo=6; '
    || 'si ya editaste permisos desde la UI, es normal que difiera)'

  union all
  select 13, 'Hay al menos un rol que administra permisos',
    case when (select count(*) from public.rol_permisos
               where recurso_id = 'permisos' and editar) > 0
         then 'OK' else 'FALLA' end,
    coalesce((select string_agg(rol_id, ', ') from public.rol_permisos
              where recurso_id = 'permisos' and editar), 'NINGUNO')

  union all
  select 14, 'Guardas anti-lockout activas',
    case when (select count(*) from pg_trigger
               where tgname in ('trg_rol_permisos_admin_guard','trg_roles_no_borrar_sistema')
                 and not tgisinternal) = 2
         then 'OK' else 'FALLA' end,
    'Impiden dejar el sistema sin administrador de permisos'

  union all
  select 15, 'Permisos legibles por cualquier usuario logueado',
    case when (select count(*) from pg_policies
               where schemaname = 'public'
                 and tablename in ('recursos','rol_permisos')
                 and cmd = 'SELECT') = 2
         then 'OK' else 'FALLA' end,
    'El front necesita leerlos para armar el menú; si no, cae al fallback'
)

select
  case resultado when 'OK' then '✅' when 'AVISO' then '⚠️' else '❌' end as estado,
  chequeo,
  resultado,
  detalle
from chequeos
order by orden;
