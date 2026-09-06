-- ============================================================================
-- Fase 4 (parte 3) — Los helpers de rol también obedecen la matriz
--
--   La Fase 4 hizo que las POLICIES consulten puede_tabla(), pero las FUNCIONES
--   RPC quedaron con la lista de roles hardcodeada:
--
--       if not public.is_operational_user() then raise exception 'No autorizado'
--
--   y esa función es `current_app_role() in ('admin','cocina','mozo')`. Efecto:
--   darle Pedidos a un rol nuevo (finanzas, o cualquiera creado desde la UI)
--   mostraba la pantalla, dejaba leer las tablas, y al tocar "crear" la RPC lo
--   rechazaba. La matriz mandaba sobre los datos pero no sobre las acciones.
--
--   Arreglo: en vez de reescribir el cuerpo de cada RPC (crear_pedido_con_items,
--   avanzar_estado_pedido, registrar_movimiento_stock, descontar_stock_pedido…),
--   se toca UN helper. Todas las RPCs que ya lo llaman pasan a obedecer la
--   matriz sin tocarles una línea, y sin riesgo de que al reescribir un cuerpo
--   se pierda lógica que se haya editado a mano en la base.
--
--   Es aditivo: los tres roles de siempre siguen pasando exactamente igual.
--   Lo único que cambia es que ahora TAMBIÉN pasa quien tenga el permiso.
-- ============================================================================

-- ─── Operativa: pedidos, cocina, stock, producción, recetas ─────────────────
create or replace function public.is_operational_user()
returns boolean language sql stable set search_path = '' as $$
  select
    public.current_app_role() in ('admin', 'cocina', 'mozo')
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cocina@kikusushi.com'
    -- Fase 4 parte 3: la matriz también habilita.
    or public.puede_tabla('pedidos', 'editar')
    or public.puede_tabla('stock', 'editar')
$$;

comment on function public.is_operational_user() is
  'Admin, cocina y mozo, MÁS cualquier rol al que la matriz de permisos le dé '
  'edición sobre pedidos o stock. Caja/arqueo sigue aparte (is_admin).';

-- ─── Cobro: registrar pagos, cerrar mesa cobrando ───────────────────────────
create or replace function public.puede_cobrar()
returns boolean language sql stable set search_path = '' as $$
  select public.current_app_role() in ('admin', 'mozo')
     or public.puede_tabla('pagos', 'editar')
$$;

comment on function public.puede_cobrar() is
  'Admin y mozo, MÁS cualquier rol con edición sobre pagos según la matriz '
  '(lo dan las secciones Mesas o Caja).';

grant execute on function public.is_operational_user() to authenticated;
grant execute on function public.puede_cobrar() to authenticated;

-- ─── Diagnóstico: qué sigue siendo solo-admin ───────────────────────────────
-- No cambia nada: lista las funciones que todavía exigen is_admin() y que por
-- lo tanto NO se pueden abrir desde la pantalla de Permisos. Mirá los NOTICE
-- en la salida para saber exactamente qué queda afuera en TU base (que puede
-- diferir de las migraciones si alguna función se editó a mano).
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select p.proname
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prosrc like '%is_admin()%'
      and p.proname not in ('is_admin')
    order by p.proname
  loop
    raise notice 'Sigue exigiendo is_admin(): public.%', r.proname;
    n := n + 1;
  end loop;

  if n = 0 then
    raise notice 'No quedan funciones que exijan is_admin().';
  else
    raise notice '% funciones solo-admin. Si un rol las necesita, hay que abrirlas una por una.', n;
  end if;
end $$;
