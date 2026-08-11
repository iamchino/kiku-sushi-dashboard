-- ############################################################################
--  KIKU SUSHI — Kiku Libre y servicio de mesa editables
--
--  Pegalo en Supabase → SQL Editor y dale Run. Idempotente.
--  Después, con el deploy del front, aparece Menú → tab "Kiku Libre" en el
--  dashboard y la web lee los valores de la base.
-- ############################################################################

-- ============================================================================
-- Kiku Libre y servicio de mesa editables desde el dashboard
--
--   Hasta ahora el precio del Kiku Libre ($53.500), la seña ($20.000), la
--   multa anti-desperdicio ($1.000), el servicio de mesa ($3.500) y el texto
--   legal del vaso de agua estaban HARDCODEADOS en el código de la web: para
--   cambiar un precio había que tocar código y redeployar.
--
--   Pasan a web_config (fila única id=1), como el precio del Omakase. El
--   dashboard los edita en Menú → tab "Kiku Libre"; la web los lee con estos
--   mismos valores como fallback si algo falla.
--
--   Con esto quedan FIJOS Y CONSISTENTES en todos lados: una sola fuente para
--   el hero del Libre, el showcase del inicio, el form de reservas, la carta
--   online y el pie legal de especiales.
-- ============================================================================

alter table public.web_config
  add column if not exists libre_precio      integer not null default 53500
    check (libre_precio > 0),
  add column if not exists libre_sena        integer not null default 20000
    check (libre_sena >= 0),
  add column if not exists libre_multa_pieza integer not null default 1000
    check (libre_multa_pieza >= 0),
  add column if not exists libre_pago_nota   text    not null
    default 'Efectivo o transferencia · Otro medio de pago consultar',
  add column if not exists cubierto_precio   integer not null default 3500
    check (cubierto_precio >= 0),
  add column if not exists agua_texto        text    not null
    default 'Este establecimiento garantiza a cada comensal un vaso de agua potable de 375 ml sin cargo.';

comment on column public.web_config.libre_precio is
  'Kiku Libre: precio por persona. Se muestra en /sushi-libre, el showcase del inicio y el form de reservas.';
comment on column public.web_config.libre_sena is
  'Kiku Libre: seña por persona para reservar.';
comment on column public.web_config.libre_multa_pieza is
  'Kiku Libre: multa por pieza sin consumir (política anti-desperdicio).';
comment on column public.web_config.cubierto_precio is
  'Servicio de mesa / cubierto por persona. Solo a la carta de salón. Se muestra en la carta online, especiales y reservas.';
comment on column public.web_config.agua_texto is
  'Texto legal del vaso de agua sin cargo. Aparece al pie de la carta, especiales y el Libre.';

notify pgrst, 'reload schema';
