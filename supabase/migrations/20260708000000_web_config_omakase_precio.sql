-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Precio del Omakase editable desde el dashboard
-- ════════════════════════════════════════════════════════════════════════════
--
-- Suma la columna `omakase_precio` a la config de la web pública (web_config,
-- fila única id=1). Es el precio por persona del Omakase que muestra la web
-- (página /omakase, showcase del home y selector de reserva).
--
-- La web lo lee con la clave anon (lectura pública ya habilitada en web_config).
-- Solo admin lo edita, desde el dashboard en /menu → tab "Omakase".
-- ════════════════════════════════════════════════════════════════════════════

alter table public.web_config
  add column if not exists omakase_precio integer not null default 70000;

comment on column public.web_config.omakase_precio is
  'Precio por persona del Omakase (en pesos, sin separadores). Ej: 70000. Editable desde /menu → tab Omakase.';

-- Aseguramos que la fila única quede en el precio vigente.
update public.web_config set omakase_precio = 70000 where id = 1;

notify pgrst, 'reload schema';
