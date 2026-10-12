-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Días de pedidos online (delivery / take away) separados de los
-- días en que abre el salón
-- ════════════════════════════════════════════════════════════════════════════
--
-- El lunes abre el salón (reservas) pero NO se toman pedidos de delivery ni
-- take away. Hasta ahora la web usaba reservas_dias.noche para las dos cosas.
-- Nueva columna reservas_dias.pedidos: qué días se toman pedidos online.
-- Se edita en Configuración → Reservas (columna "Pedidos").
--
-- Seed: pedidos = noche en todos los días menos el lunes.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.reservas_dias
  add column if not exists pedidos boolean not null default false;

comment on column public.reservas_dias.pedidos is
  'Se toman pedidos online (delivery y take away) ese día. Independiente de mediodia/noche (reservas). Editable desde Configuración → Reservas.';

-- Primera vez: copia el horario de noche, salvo el lunes.
do $$
begin
  if not exists (select 1 from public.reservas_dias where pedidos) then
    update public.reservas_dias set pedidos = noche and dow <> 1;
  end if;
end $$;

notify pgrst, 'reload schema';
