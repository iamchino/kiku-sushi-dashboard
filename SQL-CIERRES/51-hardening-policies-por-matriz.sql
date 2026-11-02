-- ════════════════════════════════════════════════════════════════════════════
-- 51 — HARDENING capa 3b: las policies "cualquier logueado" pasan a la matriz
-- Correr SOLO si el bloque D del diagnóstico 49 muestra que cada tabla en uso
-- conserva roles con "editar" por la matriz. De día, antes del servicio.
-- Reversible: el bloque final deja el SQL para volver atrás.
--
-- Hoy 13 tablas tienen policies `auth.role() = 'authenticated'` FOR ALL que
-- se suman (OR) a las de la matriz: la pantalla de Permisos no tiene efecto
-- ahí y cualquier login, aun sin rol, lee y escribe (clientes incluida).
--   · Con matriz (puede_tabla): produccion_listas, stock_movimientos, stock,
--     produccion_tareas, clientes, receta_ingredientes, recetas → se borra la
--     policy amplia y queda solo la matriz.
--   · Legacy sin uso en el dashboard (comprobantes_afip, escandallo,
--     ingredientes, mermas, productos, turnos_caja) → quedan solo para
--     admin/finanzas, hasta decidir si se borran.
-- ════════════════════════════════════════════════════════════════════════════

-- Respaldo de las policies que se van (para el rollback de abajo).
create table if not exists private.policies_respaldo (
  borrada_at timestamptz default now(), tablename text, policyname text,
  cmd text, roles text, qual text, with_check text
);
insert into private.policies_respaldo (tablename, policyname, cmd, roles, qual, with_check)
select tablename, policyname, cmd, roles::text, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and (qual ilike '%auth.role()%' or with_check ilike '%auth.role()%')
   and tablename in ('produccion_listas','stock_movimientos','stock','produccion_tareas','clientes',
                     'receta_ingredientes','recetas','comprobantes_afip','escandallo','ingredientes',
                     'mermas','productos','turnos_caja');

-- ── Tablas con matriz: fuera la policy amplia ────────────────────────────────
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
     where schemaname = 'public'
       and (qual ilike '%auth.role()%' or with_check ilike '%auth.role()%')
       and tablename in ('produccion_listas','stock_movimientos','stock','produccion_tareas','clientes',
                         'receta_ingredientes','recetas')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'borrada %.%', r.tablename, r.policyname;
  end loop;
end $$;

-- Lecturas `using (true)` de stock/producción: también por matriz.
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
     where schemaname = 'public' and cmd = 'SELECT' and qual = 'true'
       and tablename in ('stock','stock_movimientos','produccion_listas','produccion_tareas')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'borrada lectura abierta %.%', r.tablename, r.policyname;
  end loop;
end $$;

-- ── Tablas legacy: solo admin / finanzas ─────────────────────────────────────
do $$
declare t text; r record;
begin
  foreach t in array array['comprobantes_afip','escandallo','ingredientes','mermas','productos','turnos_caja']
  loop
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
    execute format('create policy "solo admin (legacy)" on public.%I for all to authenticated using (public.is_admin() or public.is_finanzas_user()) with check (public.is_admin() or public.is_finanzas_user())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Verificación: no debería quedar ninguna policy con auth.role() en esas tablas.
select tablename, policyname from pg_policies
 where schemaname = 'public' and (qual ilike '%auth.role()%' or with_check ilike '%auth.role()%')
 order by 1, 2;

-- ── ROLLBACK (solo si algo del local dejó de andar) ──────────────────────────
-- select format('create policy %I on public.%I for %s to %s using (%s)%s;',
--               policyname, tablename, case cmd when 'ALL' then 'all' else cmd end,
--               trim(both '{}' from roles), qual,
--               case when with_check is not null then ' with check (' || with_check || ')' else '' end)
--   from private.policies_respaldo order by borrada_at desc;
-- (copiar y ejecutar las sentencias que devuelve)
