-- ============================================================
-- 04 · DELIVERY · Badges picante / vegano / vegetariano / sin TACC
-- Reutiliza los datos OFICIALES del salón para los ítems que
-- coinciden e infiere los veggie propios del delivery.
-- (sin_tacc se aplicó conservador: solo donde hay dato oficial.)
-- ============================================================
begin;

update public.menu_items set picante=0, vegano=false, vegetariano=false, sin_tacc=true where tipo='delivery' and nombre='Kiku 12 pzas';
update public.menu_items set picante=0, vegano=false, vegetariano=false, sin_tacc=true where tipo='delivery' and nombre='Kiku 15 pzas';
update public.menu_items set picante=2, vegano=false, vegetariano=false, sin_tacc=false where tipo='delivery' and nombre='Nikkei 12 pzas';
update public.menu_items set picante=2, vegano=false, vegetariano=false, sin_tacc=false where tipo='delivery' and nombre='Nikkei 15 pzas';
update public.menu_items set picante=0, vegano=false, vegetariano=true, sin_tacc=false where tipo='delivery' and nombre='Veggie 15 pzas';
update public.menu_items set picante=0, vegano=true, vegetariano=true, sin_tacc=false where tipo='delivery' and nombre='Gyozas veggie';
update public.menu_items set picante=1, vegano=false, vegetariano=false, sin_tacc=false where tipo='delivery' and nombre='Gyozas acevichadas';
update public.menu_items set picante=0, vegano=true, vegetariano=true, sin_tacc=false where tipo='delivery' and nombre='Harumakis veggie';
update public.menu_items set picante=1, vegano=false, vegetariano=false, sin_tacc=false where tipo='delivery' and nombre='2 Maki furai';
update public.menu_items set picante=1, vegano=false, vegetariano=false, sin_tacc=false where tipo='delivery' and nombre='4 Maki furai';
update public.menu_items set picante=2, vegano=false, vegetariano=false, sin_tacc=false where tipo='delivery' and nombre='Oniguiri furai';
update public.menu_items set picante=1, vegano=false, vegetariano=false, sin_tacc=true where tipo='delivery' and nombre='Ceviche de pesca blanca';
update public.menu_items set picante=0, vegano=false, vegetariano=true, sin_tacc=false where tipo='delivery' and nombre='8 Tamago palta roll';
update public.menu_items set picante=0, vegano=true, vegetariano=true, sin_tacc=false where tipo='delivery' and nombre='9 Maki vegan roll';
update public.menu_items set picante=0, vegano=false, vegetariano=true, sin_tacc=false where tipo='delivery' and nombre='9 Bajiru Roll';
update public.menu_items set picante=0, vegano=false, vegetariano=true, sin_tacc=false where tipo='delivery' and nombre='Korokke de shitake';

commit;
