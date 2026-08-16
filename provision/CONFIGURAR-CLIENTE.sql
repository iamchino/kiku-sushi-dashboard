-- ════════════════════════════════════════════════════════════════════════════
-- CONFIGURACIÓN POR CLIENTE — editar y correr DESPUÉS de esquema_base.sql
--
-- ⚠️ ANTES DE CORRER: reemplazar en todo el archivo
--      ADMIN@CLIENTE.COM   → email real del dueño/administrador del local
--      Nombre del Local    → nombre comercial
--      #2a1d3d             → color de acento (hex) si quieren otro
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Emails con acceso de emergencia ─────────────────────────────────────
-- El esquema trae estos dos funciones con el email de Kiku embebido (la
-- instancia original). Acá se redefinen con el email del cliente: es quien
-- SIEMPRE puede administrar permisos y acceder a Finanzas/Personal aunque la
-- matriz de permisos quede mal configurada (anti-lockout).

create or replace function public.is_finanzas_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'ADMIN@CLIENTE.COM'
    )
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'finanzas'
$$;

create or replace function public.es_admin_permisos_de_emergencia()
returns boolean
language sql
stable
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'ADMIN@CLIENTE.COM'
  )
$$;

-- ─── 2. Marca del sistema (white-label) ─────────────────────────────────────
update public.web_config
   set negocio_nombre    = 'Nombre del Local',
       negocio_subtitulo = 'Sistema de gestión',
       negocio_color     = '#2a1d3d';

-- ─── 3. Limpieza de datos de la instancia origen ────────────────────────────
-- esquema_base.sql es SOLO esquema (sin datos de Kiku), así que normalmente
-- no hay nada que limpiar. Este bloque verifica que no haya quedado nada:
select 'usuarios auth' as tabla, count(*) from auth.users
union all select 'pedidos', count(*) from public.pedidos
union all select 'empleados', count(*) from public.empleados
union all select 'menu_items', count(*) from public.menu_items;
-- Todas las cuentas deben dar 0 (salvo auth.users si ya creaste el admin).

-- ─── 4. Realtime ────────────────────────────────────────────────────────────
-- La publicación supabase_realtime no viaja en el dump: se agregan acá las
-- tablas que el dashboard escucha en vivo. Tolerante: si alguna ya está o no
-- existe, sigue.
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'reservas', 'pedidos', 'pedido_items', 'notificaciones',
    'comprobantes_fiscales', 'stock', 'produccion_listas', 'produccion_tareas',
    'pagos', 'caja_turnos', 'caja_movimientos', 'caja_turnos_auditoria',
    'mesas', 'lista_espera'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', v_tabla);
    exception
      when duplicate_object then null;
      when undefined_table  then null;
    end;
  end loop;
end $$;

-- ─── 5. Verificación final ──────────────────────────────────────────────────
select
  (select count(*) from public.roles)    as roles,
  (select count(*) from public.recursos) as recursos,
  (select count(*) from public.rol_permisos) as permisos,
  (select negocio_nombre from public.web_config limit 1) as marca;
-- Esperado: 5 roles, ~26 recursos, matriz poblada, y la marca del cliente.
