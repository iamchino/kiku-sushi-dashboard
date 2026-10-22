-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Sección "Mediodías" en la web + lunes a la noche abierto
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1) Mediodías: una sección propia en la web (página /mediodias, bloque en el
--    home y link en el header), al estilo de Kiku Libre, gestionada desde el
--    dashboard (Menú → tab "Mediodías"): textos, fotos del menú del mes y
--    visibilidad. Vive en web_config (fila única id=1), columnas mediodia_*,
--    con el mismo esquema que la sección "Nuevo" (novedad_*).
--
--    Las fotos van al bucket menu-images bajo el prefijo mediodia/.
--    Los menús (nombre, precio, detalle) y los días/horarios del mediodía
--    NO viven acá: ya se administran en Configuración → Reservas
--    (reservas_config.menus_mediodia, mediodia_slots y reservas_dias).
--    La web los lee de ahí, así hay una sola fuente.
--
-- 2) Lunes a la noche: el local abre los lunes. El día abierto se define en
--    reservas_dias (editable desde Configuración → Reservas) y a partir de
--    esta versión la web lo lee para TODO: reservas, pedidos online, el
--    horario del footer y de /pedir. Antes los días estaban fijos en el
--    código de la web ("Mar–Sáb").
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Mediodías en web_config ──────────────────────────────────────────────
alter table public.web_config
  add column if not exists mediodia_activo        boolean not null default false,
  add column if not exists mediodia_overline      text    not null default '昼のキク',
  add column if not exists mediodia_titulo        text    not null default 'Kiku',
  add column if not exists mediodia_titulo_accent text    not null default 'Mediodía',
  add column if not exists mediodia_subtitulo     text    not null default 'Nuevo menú de mediodía · Salón y Pick up',
  add column if not exists mediodia_descripcion   text    not null default 'Entrada, principal a elección y bebida, a precio fijo. Cocina japonesa o sushi, en el salón o para retirar.',
  add column if not exists mediodia_dias_texto    text    not null default 'Martes a viernes de 12 a 16 hs',
  add column if not exists mediodia_nota_salon    text    not null default 'Precio final, servicio de mesa incluido.',
  add column if not exists mediodia_nota_pickup   text    not null default 'Pedidos con retiro en el local.',
  add column if not exists mediodia_imagenes      jsonb   not null default '[]'::jsonb;

comment on column public.web_config.mediodia_activo is
  'Muestra u oculta la sección Mediodías en la web (página, bloque del home y link del header).';
comment on column public.web_config.mediodia_imagenes is
  'Fotos del menú de mediodía del mes: [{url, alt}]. Hasta 12. Se muestran en carrusel en el orden del array; la primera va de portada.';
comment on column public.web_config.mediodia_dias_texto is
  'Texto de días y horario tal como se muestra ("Martes a viernes de 12 a 16 hs").';

-- Array de hasta 12 fotos.
alter table public.web_config drop constraint if exists web_config_mediodia_imagenes_shape;
alter table public.web_config
  add constraint web_config_mediodia_imagenes_shape
  check (
    jsonb_typeof(mediodia_imagenes) = 'array'
    and jsonb_array_length(mediodia_imagenes) <= 12
  );

-- No se publica una sección vacía: activa exige al menos 1 foto y el texto de días.
alter table public.web_config drop constraint if exists web_config_mediodia_activo_requiere_contenido;
alter table public.web_config
  add constraint web_config_mediodia_activo_requiere_contenido
  check (
    mediodia_activo = false
    or (
      jsonb_array_length(mediodia_imagenes) >= 1
      and length(btrim(mediodia_dias_texto)) > 0
    )
  );

-- ── 2) Lunes a la noche ─────────────────────────────────────────────────────
-- Abre el turno noche del lunes (dow 1). Se puede volver a cerrar desde
-- Configuración → Reservas sin tocar SQL.
update public.reservas_dias set noche = true where dow = 1 and noche = false;

notify pgrst, 'reload schema';
