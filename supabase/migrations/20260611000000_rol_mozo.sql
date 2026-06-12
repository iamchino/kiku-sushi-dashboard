-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Rol "mozo"
-- ════════════════════════════════════════════════════════════════════════════
--
-- El mozo es personal de salón. Puede:
--   • Gestionar mesas: abrir, cargar items, cerrar.
--   • Cobrar: registrar pagos y vincularlos al turno de caja abierto.
--   • Ver y modificar stock (registrar_movimiento_stock).
--   • Ver platos en preparación / listos y marcarlos como entregados.
--
-- NO puede: abrir/cerrar turnos de caja, ver arqueo, analíticas, clientes,
-- ni configuración (eso lo bloquea también el frontend).
--
-- Seguro de correr más de una vez (idempotente). Pegar tal cual en
-- Supabase Studio → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Helpers de rol ───────────────────────────────────────────────────────

create or replace function public.is_mozo()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'mozo'
$$;

-- Operativos: admin + cocina + mozo. Esta función ya la usan las policies de
-- pedidos, pedido_items, stock, stock_movimientos, menu_items, recetas,
-- producción, y las RPCs crear_pedido_con_items / registrar_movimiento_stock /
-- avanzar_estado_pedido. Al agregar 'mozo' acá, hereda todo eso.
create or replace function public.is_operational_user()
returns boolean
language sql
stable
as $$
  select
    public.current_app_role() in ('admin', 'cocina', 'mozo')
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cocina@kikusushi.com'
$$;

-- Quiénes pueden cobrar (pagos / cierre de mesa con cobro).
create or replace function public.puede_cobrar()
returns boolean
language sql
stable
as $$
  select public.current_app_role() in ('admin', 'mozo')
$$;

grant execute on function public.is_mozo() to authenticated;
grant execute on function public.is_operational_user() to authenticated;
grant execute on function public.puede_cobrar() to authenticated;

comment on function public.is_operational_user() is
  'Admin, cocina y mozo gestionan tablas operativas. Caja/arqueo, clientes y analíticas quedan fuera.';

-- ─── 2. Policies para cobro ──────────────────────────────────────────────────
-- Las policies se evalúan con OR, así que agregar una policy de mozo no
-- afecta las de admin existentes.

do $$
begin
  -- pagos: el mozo registra el cobro de la mesa (insert/upsert + select).
  if to_regclass('public.pagos') is not null then
    drop policy if exists "mozo cobra pagos" on public.pagos;
    create policy "mozo cobra pagos"
      on public.pagos
      for all
      to authenticated
      using (public.is_mozo())
      with check (public.is_mozo());
  end if;

  -- caja_turnos: el mozo solo necesita LEER el turno abierto para vincular
  -- el pago (registrarPago busca el turno con estado = 'abierto').
  if to_regclass('public.caja_turnos') is not null then
    drop policy if exists "mozo lee turnos de caja" on public.caja_turnos;
    create policy "mozo lee turnos de caja"
      on public.caja_turnos
      for select
      to authenticated
      using (public.is_mozo());
  end if;

  -- comprobantes_fiscales: solo lectura (la UI de mesas chequea si el
  -- pedido ya está facturado). Emitir facturas sigue siendo de admin.
  if to_regclass('public.comprobantes_fiscales') is not null then
    drop policy if exists "mozo lee comprobantes" on public.comprobantes_fiscales;
    create policy "mozo lee comprobantes"
      on public.comprobantes_fiscales
      for select
      to authenticated
      using (public.is_mozo());
  end if;
end;
$$;

-- ─── 3. Policies de salón (mesas / salones) ──────────────────────────────────
-- Estas tablas se crearon fuera del repo; protegemos con policies explícitas
-- para mozo por si las existentes solo contemplan admin.

do $$
begin
  if to_regclass('public.mesas') is not null then
    execute 'alter table public.mesas enable row level security';
    drop policy if exists "mozo gestiona mesas" on public.mesas;
    create policy "mozo gestiona mesas"
      on public.mesas
      for all
      to authenticated
      using (public.is_mozo())
      with check (public.is_mozo());
  end if;

  if to_regclass('public.salones') is not null then
    execute 'alter table public.salones enable row level security';
    drop policy if exists "mozo lee salones" on public.salones;
    create policy "mozo lee salones"
      on public.salones
      for select
      to authenticated
      using (public.is_mozo());
  end if;
end;
$$;

-- ─── 4. Marca de "servido" para la vista Platos del mozo ────────────────────
-- En pedidos de mesa, "entregado" significa mesa cerrada (lo hace cerrar_mesa
-- al cobrar). Para que el mozo pueda marcar que llevó los platos a la mesa
-- SIN cerrar el pedido, usamos un timestamp aparte.

alter table public.pedidos
  add column if not exists servido_at timestamptz;

comment on column public.pedidos.servido_at is
  'Momento en que el mozo sirvió los platos en la mesa. No cambia el estado del pedido.';

-- ─── 5. Diagnóstico: RPCs de mesa creadas fuera del repo ────────────────────
-- abrir_mesa / agregar_items_pedido / enviar_a_cocina / cerrar_mesa viven en
-- la base pero no están en las migraciones del repo. Si alguna exige
-- is_admin() internamente, el mozo va a recibir "No autorizado".
-- Este bloque solo AVISA; no cambia nada.

do $$
declare
  r record;
begin
  for r in
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('abrir_mesa', 'agregar_items_pedido', 'enviar_a_cocina', 'cerrar_mesa')
      and p.prosrc ilike '%is_admin%'
      and p.prosrc not ilike '%is_operational_user%'
  loop
    raise warning 'ATENCION: la funcion public.% exige is_admin(). El mozo no va a poder usarla. Editala para usar public.is_operational_user() o public.puede_cobrar().', r.proname;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
