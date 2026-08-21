-- ============================================================
-- Migración: el rol finanzas puede BORRAR fichajes (y el resto de Personal)
--
-- Síntoma: desde el usuario de finanzas, el botón de borrar una marca de
-- fichaje "andaba" (el diálogo se cerraba) pero la marca seguía ahí.
--
-- Por qué era silencioso: cuando RLS bloquea un DELETE, Postgres NO tira
-- error — simplemente no borra ninguna fila. Supabase devuelve éxito y la
-- pantalla se quedaba callada. Eso ya se arregló en el front (ahora avisa
-- si no se borró nada). Acá se arregla el permiso de fondo.
--
-- El DELETE sobre `fichajes` lo habilita la policy "permisos escritura",
-- que exige puede_tabla('fichajes','editar'); eso pide dos cosas:
--   · recurso_tablas: el recurso 'personal' mapea la tabla con escribe=true
--   · rol_permisos:   el rol tiene editar=true sobre 'personal'
-- Si a la instalación le falta cualquiera de las dos, no borra.
--
-- Esto reafirma ambas. Es idempotente: correrlo de nuevo no cambia nada.
-- ============================================================

-- ── 1) El recurso Personal escribe sobre sus tablas ─────────────────────────
insert into public.recurso_tablas (recurso_id, tabla, escribe)
values
  ('personal', 'fichajes',        true),
  ('personal', 'empleados',       true),
  ('personal', 'liquidaciones',   true),
  ('personal', 'puntos_fichaje',  true)
on conflict (recurso_id, tabla) do update
  set escribe = true;

-- ── 2) El rol finanzas edita Personal ───────────────────────────────────────
insert into public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at)
values ('finanzas', 'personal', true, true, now())
on conflict (rol_id, recurso_id) do update
  set ver = true, editar = true, updated_at = now();

-- El admin también, por las dudas.
insert into public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at)
values ('admin', 'personal', true, true, now())
on conflict (rol_id, recurso_id) do update
  set ver = true, editar = true, updated_at = now();

notify pgrst, 'reload schema';
