-- ============================================================
-- 03 · Badges sobre los items YA cargados (los 95 previos).
-- Solo setea picante/vegano/vegetariano/sin_tacc segun el sitio.
-- Requiere 01_alter_menu_items_badges.sql.
-- ============================================================
begin;

update public.menu_items set picante=0, vegano=false, vegetariano=false, sin_tacc=true where tipo='carta' and nombre='Kiku 12 pzas';
update public.menu_items set picante=0, vegano=false, vegetariano=false, sin_tacc=true where tipo='carta' and nombre='Kiku 15 pzas';
update public.menu_items set picante=2, vegano=false, vegetariano=false, sin_tacc=false where tipo='carta' and nombre='Nikkei 12 pzas';
update public.menu_items set picante=2, vegano=false, vegetariano=false, sin_tacc=false where tipo='carta' and nombre='Nikkei 15 pzas';
update public.menu_items set picante=0, vegano=false, vegetariano=true, sin_tacc=false where tipo='carta' and nombre='Veggie 15 pzas';
update public.menu_items set picante=0, vegano=true, vegetariano=true, sin_tacc=false where tipo='carta' and nombre='Gyozas veggie';
update public.menu_items set picante=1, vegano=false, vegetariano=false, sin_tacc=false where tipo='carta' and nombre='Gyozas acevichadas';
update public.menu_items set picante=1, vegano=false, vegetariano=false, sin_tacc=false where tipo='carta' and nombre='2 Maki furai';
update public.menu_items set picante=1, vegano=false, vegetariano=false, sin_tacc=false where tipo='carta' and nombre='4 Maki furai';
update public.menu_items set picante=2, vegano=false, vegetariano=false, sin_tacc=false where tipo='carta' and nombre='Oniguiri furai';
update public.menu_items set picante=1, vegano=false, vegetariano=false, sin_tacc=false where tipo='carta' and nombre='Vieiras furai';
update public.menu_items set picante=1, vegano=false, vegetariano=false, sin_tacc=false where tipo='carta' and nombre='Tempura Pacifico (2 personas)';
update public.menu_items set picante=1, vegano=true, vegetariano=true, sin_tacc=false where tipo='carta' and nombre='Tempura Veggie';
update public.menu_items set picante=1, vegano=false, vegetariano=false, sin_tacc=true where tipo='carta' and nombre='Tiradito confitados';
update public.menu_items set picante=0, vegano=false, vegetariano=true, sin_tacc=false where tipo='carta' and nombre='8 Tamago palta roll';
update public.menu_items set picante=1, vegano=false, vegetariano=false, sin_tacc=false where tipo='carta' and nombre='Yakimeshi de Langostinos';
update public.menu_items set picante=0, vegano=false, vegetariano=true, sin_tacc=false where tipo='carta' and nombre='Yakimeshi Veggie';
update public.menu_items set picante=1, vegano=false, vegetariano=false, sin_tacc=false where tipo='carta' and nombre='Yakisoba de Langostinos';
update public.menu_items set picante=0, vegano=true, vegetariano=true, sin_tacc=false where tipo='carta' and nombre='Yakisoba Veggie';
update public.menu_items set picante=0, vegano=false, vegetariano=false, sin_tacc=true where tipo='carta' and nombre='Salteado Veggie';

commit;