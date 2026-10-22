-- ════════════════════════════════════════════════════════════════════════════
-- 16 · menu_items.precio_num = último precio conocido (red de seguridad)
-- ════════════════════════════════════════════════════════════════════════════
-- Hasta ahora `precio_num` solo se llenaba en el backfill de mayo y en algunos
-- sincronismos: ni el alta/edición del dashboard ni el ajuste masivo lo
-- actualizaban, así que quedaba viejo.
--
-- Este trigger lo mantiene al día cada vez que `precio` tiene un valor
-- parseable. Si `precio` se vacía (a propósito o por un bug), `precio_num`
-- CONSERVA el último valor: así un precio borrado siempre se puede recuperar.
-- Productos con variantes o precios compuestos ("5p: … / 9p: …") no cambian.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.kiku_menu_items_precio_num()
returns trigger
language plpgsql
as $$
declare
  v_num numeric;
begin
  v_num := public.kiku_parse_precio_ar(new.precio);
  if v_num is not null and v_num > 0 then
    new.precio_num := v_num;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_menu_items_precio_num on public.menu_items;
create trigger trg_menu_items_precio_num
  before insert or update of precio
  on public.menu_items
  for each row
  execute function public.kiku_menu_items_precio_num();

comment on column public.menu_items.precio_num is
  'Último precio numérico conocido (lo mantiene trg_menu_items_precio_num). Si precio se vacía, conserva el valor anterior para poder recuperarlo. NULL en productos que nunca tuvieron un precio simple (p. ej. con variantes).';

-- Poner al día los que hoy tienen precio y precio_num desactualizado.
update public.menu_items
   set precio_num = public.kiku_parse_precio_ar(precio)
 where public.kiku_parse_precio_ar(precio) > 0
   and precio_num is distinct from public.kiku_parse_precio_ar(precio);

notify pgrst, 'reload schema';
