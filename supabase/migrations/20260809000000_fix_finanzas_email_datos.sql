-- ============================================================================
-- Hotfix: la cuenta histórica de Finanzas perdió los DATOS de Personal
--
--   Síntoma: desde el usuario de Finanzas se ven las pantallas de Personal
--   pero no los fichajes/horas de los empleados (solo los propios), así que
--   no se puede liquidar sueldos.
--
--   Causa: esa cuenta tiene rol `admin` y entraba a los datos por la lista
--   blanca de email (is_finanzas_user). La fase 4 reemplazó las policies del
--   dominio de Finanzas por puede_tabla(), que solo mira el ROL — y admin no
--   tiene el recurso `personal`. El front sí respeta el email (por eso el
--   menú se veía), la base no. Clásico desfase entre las dos mitades.
--
--   Arreglo: puede_tabla() aprende el mismo bypass que el front — si el email
--   está whitelisteado, las tablas del dominio finanzas/personal/permisos se
--   habilitan igual que si tuviera esos recursos.
--
--   Si la fase 4 NO está aplicada, este script no hace nada (y no hace falta:
--   las policies viejas con is_finanzas_user siguen vigentes).
-- ============================================================================

do $do$
begin
  if to_regclass('public.recurso_tablas') is null then
    raise notice 'Fase 4 sin aplicar: nada que corregir acá.';
    return;
  end if;

  execute $fn$
create or replace function public.puede_tabla(p_tabla text, p_accion text default 'ver')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.recurso_tablas rt
    join public.rol_permisos rp on rp.recurso_id = rt.recurso_id
    where rt.tabla = p_tabla
      and rp.rol_id = public.current_app_role()
      and case p_accion
            when 'editar' then rp.editar and rt.escribe
            when 'ver'    then rp.ver
            else false          -- falla cerrado ante una acción desconocida
          end
  )
  -- Bypass por email para el DOMINIO de Finanzas, espejando al front
  -- (RECURSOS_FINANZAS en permisosCore.js): la cuenta histórica tiene rol
  -- admin y entra a Finanzas/Personal por lista blanca de email. Sin esto,
  -- el menú le muestra las pantallas y la base le niega los datos — veía
  -- solo sus propios fichajes y no podía liquidar sueldos.
  or (
    public.is_finanzas_user()
    and exists (
      select 1 from public.recurso_tablas rt2
      where rt2.tabla = p_tabla
        and rt2.recurso_id in ('finanzas', 'personal', 'permisos')
        and (p_accion = 'ver' or (p_accion = 'editar' and rt2.escribe))
    )
  )
$$;
  $fn$;

  raise notice 'puede_tabla() actualizado: el email de Finanzas recupera los datos de Personal.';
end $do$;

notify pgrst, 'reload schema';
