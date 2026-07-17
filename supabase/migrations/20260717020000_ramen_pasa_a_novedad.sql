-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — La sección "Ramen" pasa a ser "Novedad" (genérica)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Cambio de concepto, no de funcionalidad. La sección se había modelado como
-- si el ramen fuera permanente, pero en realidad el contenedor es "el plato
-- nuevo del momento": hoy es ramen, en tres semanas puede ser otra cosa.
-- Renombrarla ahora evita terminar con una columna `ramen_titulo` que dice
-- "Gyozas de cordero".
--
-- El contenido siempre fue editable (título, descripción, fotos, precio), así
-- que no hace falta tocar datos: solo se renombra el contenedor.
--
--   ramen_activo        → novedad_activo
--   ramen_overline      → novedad_overline
--   ramen_titulo        → novedad_titulo
--   ramen_titulo_accent → novedad_titulo_accent
--   ramen_descripcion   → novedad_descripcion
--   ramen_precio        → novedad_precio
--   ramen_imagenes      → novedad_imagenes
--
-- En el dashboard el tab se llama "Nuevo". Acá usamos "novedad" porque es el
-- sustantivo del concepto y se lee mejor en SQL.
--
-- IMPORTANTE — orden de las migraciones:
-- Esta va DESPUÉS de 20260717010000_web_config_ramen_hasta_5_fotos.sql, que
-- todavía referencia los nombres viejos. Si usás `supabase db push` corren en
-- orden solas. Si las corrés a mano, respetá el orden por nombre de archivo.
--
-- Es idempotente: si ya se aplicó, no hace nada y no falla.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  -- ── Renombrar las columnas, solo si todavía tienen el nombre viejo ────────
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'web_config'
      and column_name = 'ramen_activo'
  ) then
    alter table public.web_config rename column ramen_activo        to novedad_activo;
    alter table public.web_config rename column ramen_overline      to novedad_overline;
    alter table public.web_config rename column ramen_titulo        to novedad_titulo;
    alter table public.web_config rename column ramen_titulo_accent to novedad_titulo_accent;
    alter table public.web_config rename column ramen_descripcion   to novedad_descripcion;
    alter table public.web_config rename column ramen_precio        to novedad_precio;
    alter table public.web_config rename column ramen_imagenes      to novedad_imagenes;
  end if;
end $$;

-- ── Constraints ──────────────────────────────────────────────────────────────
-- Postgres reescribe solo las referencias a las columnas dentro de los CHECK,
-- pero el nombre del constraint queda con "ramen". Los recreamos para que el
-- día que uno falle, el mensaje de error nombre algo que exista.
alter table public.web_config drop constraint if exists web_config_ramen_precio_no_negativo;
alter table public.web_config drop constraint if exists web_config_ramen_imagenes_shape;
alter table public.web_config drop constraint if exists web_config_ramen_activo_requiere_contenido;

alter table public.web_config drop constraint if exists web_config_novedad_precio_no_negativo;
alter table public.web_config
  add constraint web_config_novedad_precio_no_negativo
  check (novedad_precio >= 0);

-- Array de hasta 5 fotos (la web las muestra en carrusel).
alter table public.web_config drop constraint if exists web_config_novedad_imagenes_shape;
alter table public.web_config
  add constraint web_config_novedad_imagenes_shape
  check (
    jsonb_typeof(novedad_imagenes) = 'array'
    and jsonb_array_length(novedad_imagenes) <= 5
  );

-- No se puede publicar una sección vacía: si está activa, exigimos
-- descripción y al menos 2 fotos.
alter table public.web_config drop constraint if exists web_config_novedad_activo_requiere_contenido;
alter table public.web_config
  add constraint web_config_novedad_activo_requiere_contenido
  check (
    novedad_activo = false
    or (
      length(btrim(novedad_descripcion)) > 0
      and jsonb_array_length(novedad_imagenes) >= 2
    )
  );

-- ── Comentarios ──────────────────────────────────────────────────────────────
comment on column public.web_config.novedad_activo is
  'Si la sección Novedad se muestra en el home (justo después del hero). Editable desde /menu → tab "Nuevo".';
comment on column public.web_config.novedad_overline is
  'Texto japonés decorativo sobre el título de la sección. Ej: ラーメン';
comment on column public.web_config.novedad_titulo is
  'Primera palabra del título (peso liviano). Ej: "Ramen"';
comment on column public.web_config.novedad_titulo_accent is
  'Segunda palabra del título, se renderiza con gradiente champagne/violeta. Ej: "de Kiku"';
comment on column public.web_config.novedad_descripcion is
  'Párrafo descriptivo de la sección.';
comment on column public.web_config.novedad_precio is
  'Precio en pesos, sin separadores. Ej: 18000. Si es 0, la web no muestra precio.';
comment on column public.web_config.novedad_imagenes is
  'Array jsonb de imágenes: [{ "url": "...", "alt": "..." }]. Entre 2 y 5 — la web las muestra en carrusel. Se suben al bucket menu-images bajo el prefijo novedad/.';

notify pgrst, 'reload schema';
