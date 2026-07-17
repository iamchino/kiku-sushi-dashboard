-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Sección Ramen de la web pública, editable desde el dashboard
-- ════════════════════════════════════════════════════════════════════════════
--
-- Suma la sección "Ramen" a la config de la web pública (web_config, fila única
-- id=1). Es la sección que va inmediatamente después del hero en el home.
--
-- Nace apagada (ramen_activo = false) y con los textos vacíos: la idea es cargar
-- fotos, copy y precio con calma desde el dashboard y recién ahí prenderla. Si
-- está apagada, la web directamente no renderiza la sección.
--
--   • ramen_activo      : si la sección se muestra o no en el home
--   • ramen_overline     : texto japonés decorativo sobre el título (ej. ラーメン)
--   • ramen_titulo       : primera palabra del título, peso liviano (ej. "Ramen")
--   • ramen_titulo_accent: segunda palabra, con gradiente (ej. "de Kiku")
--   • ramen_descripcion  : párrafo descriptivo
--   • ramen_precio       : precio en pesos, sin separadores (0 = no mostrar)
--   • ramen_imagenes     : jsonb, array de { url, alt }. Entre 2 y 3.
--
-- La web lo lee con la clave anon (lectura pública ya habilitada en web_config).
-- Solo admin lo edita, desde el dashboard en /menu → tab "Ramen".
-- ════════════════════════════════════════════════════════════════════════════

alter table public.web_config
  add column if not exists ramen_activo        boolean not null default false,
  add column if not exists ramen_overline      text    not null default 'ラーメン',
  add column if not exists ramen_titulo        text    not null default 'Ramen',
  add column if not exists ramen_titulo_accent text    not null default '',
  add column if not exists ramen_descripcion   text    not null default '',
  add column if not exists ramen_precio        integer not null default 0,
  add column if not exists ramen_imagenes      jsonb   not null default '[]'::jsonb;

comment on column public.web_config.ramen_activo is
  'Si la sección Ramen se muestra en el home (justo después del hero). Editable desde /menu → tab Ramen.';
comment on column public.web_config.ramen_overline is
  'Texto japonés decorativo sobre el título de la sección Ramen. Ej: ラーメン';
comment on column public.web_config.ramen_titulo is
  'Primera palabra del título de la sección Ramen (peso liviano). Ej: "Ramen"';
comment on column public.web_config.ramen_titulo_accent is
  'Segunda palabra del título, se renderiza con gradiente champagne/violeta. Ej: "de Kiku"';
comment on column public.web_config.ramen_descripcion is
  'Párrafo descriptivo de la sección Ramen.';
comment on column public.web_config.ramen_precio is
  'Precio del ramen en pesos, sin separadores. Ej: 18000. Si es 0, la web no muestra precio.';
comment on column public.web_config.ramen_imagenes is
  'Array jsonb de imágenes: [{ "url": "...", "alt": "..." }]. Entre 2 y 3. Se suben al bucket menu-images bajo el prefijo ramen/.';

-- ── Guardas de integridad ────────────────────────────────────────────────────
-- Precio nunca negativo.
alter table public.web_config
  drop constraint if exists web_config_ramen_precio_no_negativo;
alter table public.web_config
  add constraint web_config_ramen_precio_no_negativo
  check (ramen_precio >= 0);

-- ramen_imagenes tiene que ser un array (no un objeto ni un escalar) y como
-- máximo 3: la sección está diseñada para 2 o 3 fotos, más rompe el layout.
alter table public.web_config
  drop constraint if exists web_config_ramen_imagenes_shape;
alter table public.web_config
  add constraint web_config_ramen_imagenes_shape
  check (
    jsonb_typeof(ramen_imagenes) = 'array'
    and jsonb_array_length(ramen_imagenes) <= 3
  );

-- Nada de prender la sección sin contenido cargado: si ramen_activo = true,
-- exigimos descripción y al menos 2 imágenes. Esto evita que un click
-- distraído publique una sección vacía en producción.
alter table public.web_config
  drop constraint if exists web_config_ramen_activo_requiere_contenido;
alter table public.web_config
  add constraint web_config_ramen_activo_requiere_contenido
  check (
    ramen_activo = false
    or (
      length(btrim(ramen_descripcion)) > 0
      and jsonb_array_length(ramen_imagenes) >= 2
    )
  );

notify pgrst, 'reload schema';
