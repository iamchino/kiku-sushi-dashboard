-- ============================================================
-- Migración: rol 'finanzas'
--
--   Hasta ahora el acceso a Finanzas se otorgaba SOLO por email
--   (ver 20260628010000_finanzas_acceso.sql). Eso obligaba a tocar
--   la BD cada vez que cambiaba la persona a cargo.
--
--   A partir de acá is_finanzas_user() acepta DOS vías equivalentes:
--     1) el email está en la lista blanca histórica, o
--     2) el usuario tiene app_metadata.role = 'finanzas'.
--
--   La vía 1 se mantiene intacta: nadie que hoy entre a Finanzas
--   pierde el acceso al aplicar esta migración.
--
--   Las políticas de empleados / egresos / puntos_fichaje / fichajes /
--   turnos / liquidaciones ya delegan en esta función, así que con
--   redefinirla alcanza para esas tablas.
--
--   PERO la página Finanzas también lee tres tablas que NO usan
--   is_finanzas_user() y que hasta hoy resolvían por rol 'admin':
--     · caja_turnos  → tab "Cajas diarias" y el resumen
--     · pagos        → tab "Resumen" (ingresos)
--     · proveedores  → tab "Proveedores" y el selector de Egresos
--   El usuario histórico no lo notaba porque además es admin. Un usuario
--   con rol 'finanzas' (que NO es admin) vería esos tabs vacíos, así que
--   más abajo les sumamos lectura vía is_finanzas_user().
--
-- SEGURIDAD — por qué app_metadata y no user_metadata:
--   user_metadata lo puede escribir el propio usuario con
--   supabase.auth.updateUser(). Si lo aceptáramos acá, cualquier
--   empleado logueado podría auto-asignarse el rol y leer los sueldos.
--   app_metadata solo se escribe con la service key, es decir desde la
--   Edge Function admin-usuarios, que a su vez exige ser de Finanzas.
-- ============================================================

create or replace function public.is_finanzas_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'finanzas@kikusushi.com.ar'
      -- agregá acá más emails si hace falta habilitar a alguien sin rol
    )
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'finanzas'
$$;

grant execute on function public.is_finanzas_user() to authenticated;

comment on function public.is_finanzas_user() is
  'True si el usuario está habilitado para Finanzas: por email en lista blanca '
  'o por app_metadata.role = ''finanzas''. Espeja canAccessFinanzas() en src/context/role.js.';

-- ── Tablas que la página Finanzas lee y que no pasaban por is_finanzas_user() ──
-- En los tres casos SUMAMOS acceso, no lo sacamos: las políticas previas de
-- admin/operativo siguen existiendo intactas y estas conviven en OR (Postgres
-- permite la fila si CUALQUIER policy permisiva la permite).

-- caja_turnos: lectura para el resumen y el tab "Cajas diarias".
-- Solo SELECT: abrir/cerrar caja sigue siendo cosa de admin.
drop policy if exists "caja_turnos finanzas read" on public.caja_turnos;
create policy "caja_turnos finanzas read"
  on public.caja_turnos
  for select
  to authenticated
  using (public.is_finanzas_user());

-- pagos: lectura de ingresos para el resumen.
drop policy if exists "pagos finanzas read" on public.pagos;
create policy "pagos finanzas read"
  on public.pagos
  for select
  to authenticated
  using (public.is_finanzas_user());

-- proveedores: lectura + alta/edición, porque Egresos carga facturas de
-- proveedor y el tab Proveedores es parte de Finanzas.
drop policy if exists "proveedores finanzas manage" on public.proveedores;
create policy "proveedores finanzas manage"
  on public.proveedores
  for all
  to authenticated
  using (public.is_finanzas_user())
  with check (public.is_finanzas_user());

notify pgrst, 'reload schema';
