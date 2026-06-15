-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Especiales: acción del botón (reservar / pedir / link)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta ahora el botón de cada especial siempre llevaba al form de reservas
-- (?experiencia=...). Algunos especiales no son para reservar sino para PEDIR
-- (deli / take away), ligados a un producto de la carta de delivery; y otros
-- pueden necesitar un link arbitrario (WhatsApp, promo, etc.).
--
-- Agregamos, de forma aditiva e idempotente:
--   cta_tipo        'reservar' | 'pedir' | 'link'   (default 'reservar')
--   cta_producto_id uuid → menu_items(id)           (para 'pedir')
--   cta_url         text                            (para 'link')
--   cta_label       text                            (texto opcional del botón)
--
-- Los especiales existentes quedan en 'reservar' → cero cambios de comportamiento.
-- Pegar tal cual en Supabase Studio → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.especiales
  add column if not exists cta_tipo        text,
  add column if not exists cta_producto_id uuid,
  add column if not exists cta_url         text,
  add column if not exists cta_label       text;

-- Default + backfill para filas existentes
update public.especiales set cta_tipo = 'reservar' where cta_tipo is null;
alter table public.especiales alter column cta_tipo set default 'reservar';
alter table public.especiales alter column cta_tipo set not null;

-- Valores permitidos
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'especiales_cta_tipo_check'
  ) then
    alter table public.especiales
      add constraint especiales_cta_tipo_check
      check (cta_tipo in ('reservar', 'pedir', 'link'));
  end if;
end;
$$;

-- FK al producto de delivery/take (si se borra el producto, queda en null)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'especiales_cta_producto_fk'
  ) then
    alter table public.especiales
      add constraint especiales_cta_producto_fk
      foreign key (cta_producto_id) references public.menu_items(id) on delete set null;
  end if;
end;
$$;

comment on column public.especiales.cta_tipo is
  'Acción del botón del especial: reservar (form), pedir (deli/take), link (URL libre).';
comment on column public.especiales.cta_producto_id is
  'Producto de menu_items (tipo=delivery) al que apunta el botón cuando cta_tipo = pedir.';
comment on column public.especiales.cta_url is
  'URL destino cuando cta_tipo = link.';
comment on column public.especiales.cta_label is
  'Texto opcional del botón. Si está vacío se usa el default según cta_tipo.';

notify pgrst, 'reload schema';
