-- ============================================================================
-- Menús de mediodía gestionables desde el dashboard
--
--   Los menús que la web ofrece al reservar un turno de mediodía (MENÚ 1,
--   MENÚ 2, etc.) dejan de estar fijos en el código: viven en
--   reservas_config.menus_mediodia (jsonb) y se editan desde
--   Configuración → Reservas — agregar, cambiar precio, desactivar, borrar.
--
--   Estructura de cada menú:
--     { "id": "menu1", "nombre": "MENÚ 1 · SUSHI", "precio": 38000,
--       "detalle": ["línea 1", "línea 2"], "activo": true }
--
--   La opción "carta habitual" no vive acá: es fija en el form (es el
--   "sin menú"). La web cae a sus valores de respaldo si esto viene vacío.
-- ============================================================================

alter table public.reservas_config
  add column if not exists menus_mediodia jsonb not null default '[]'::jsonb;

comment on column public.reservas_config.menus_mediodia is
  'Menús ofrecidos al reservar mediodía: [{id, nombre, precio, detalle[], activo}]. '
  'Editable desde Configuración → Reservas. La web agrega sola la opción carta habitual.';

-- Seed inicial (solo si está vacío: no pisa lo que ya se haya editado).
update public.reservas_config
   set menus_mediodia = '[
     {"id":"menu1","nombre":"MENÚ 1 · SUSHI","precio":38000,"activo":true,
      "detalle":["Entrada: 2 u. de gyozas, korokkes o langostinos furai",
                 "Principal: 12 piezas de sushi clásicos o fusión",
                 "Bebida: gaseosa o agua"]},
     {"id":"menu2","nombre":"MENÚ 2 · COCINA JAPO","precio":30000,"activo":true,
      "detalle":["Entrada: 2 u. de gyozas, korokkes o langostinos furai",
                 "Principal a elección: ramen chasu · yakimeshi de langostinos o cerdo · tonkatsu",
                 "Bebida: gaseosa o agua"]}
   ]'::jsonb,
       updated_at = now()
 where id = 1 and (menus_mediodia is null or menus_mediodia = '[]'::jsonb);

notify pgrst, 'reload schema';
