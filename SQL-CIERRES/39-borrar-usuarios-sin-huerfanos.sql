-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Eliminar un usuario no puede fallar por "Database error"
-- ════════════════════════════════════════════════════════════════════════════
--
-- Síntoma: Personal → Usuarios → Eliminar → "Database error deleting user".
-- Causa: alguna tabla de public referencia auth.users SIN regla ON DELETE
-- (hoy: produccion_listas.creado_por). Si el usuario creó una lista de
-- producción, Postgres no deja borrarlo y Supabase devuelve ese error genérico.
--
-- Regla: borrar un login nunca borra datos del negocio. Toda referencia a
-- auth.users que no tenga regla pasa a ON DELETE SET NULL (la columna queda
-- vacía: la fila sobrevive sin dueño). Las que ya tienen CASCADE (device
-- tokens, suscripciones push) o SET NULL (empleados, mozos, fichajes) no se
-- tocan. Se recorre el catálogo para cubrir también tablas futuras o
-- creadas a mano.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  r record;
begin
  for r in
    select c.conname,
           n.nspname  as esquema,
           t.relname  as tabla,
           a.attname  as columna,
           a.attnotnull
      from pg_constraint c
      join pg_class t      on t.oid = c.conrelid
      join pg_namespace n  on n.oid = t.relnamespace
      join pg_attribute a  on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'auth.users'::regclass
       and n.nspname = 'public'
       and c.confdeltype in ('a', 'r')          -- NO ACTION / RESTRICT
       and array_length(c.conkey, 1) = 1
  loop
    if r.attnotnull then
      -- Una columna NOT NULL no puede quedar vacía: se deja en CASCADE solo si
      -- es claramente "del usuario" (no es el caso hoy). Se avisa y se sigue.
      raise notice 'FK % en %.% es NOT NULL: no se cambia (revisar a mano).', r.conname, r.tabla, r.columna;
      continue;
    end if;
    execute format('alter table %I.%I drop constraint %I', r.esquema, r.tabla, r.conname);
    execute format(
      'alter table %I.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      r.esquema, r.tabla, r.conname, r.columna
    );
    raise notice 'FK % en %.%: ahora ON DELETE SET NULL', r.conname, r.tabla, r.columna;
  end loop;
end $$;

-- Verificación (debería no devolver filas con 'a' ni 'r'):
--   select t.relname, c.conname, c.confdeltype
--     from pg_constraint c join pg_class t on t.oid = c.conrelid
--    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass;
