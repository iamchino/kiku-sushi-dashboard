-- ============================================================
-- 06 · LIMPIEZA + ORDEN  (corre todo junto, una sola vez)
--  A) Elimina duplicados de la carta (mismo nombre en tipo='carta'),
--     conservando la fila mas completa (con imagen / con badges / id menor).
--     No borra filas con pedidos asociados (preserva historial).
--  B) Reordena los 135 items segun el orden oficial del sitio:
--     ...Tempura > Causas > Carpaccios > CEVICHES > Tiraditos...
-- ============================================================
begin;

-- A) DEDUP -----------------------------------------------------
with ranked as (
  select id, nombre,
         row_number() over (
           partition by lower(btrim(nombre))
           order by (imagen_url is not null) desc,
                    (picante > 0 or vegano or vegetariano or sin_tacc) desc,
                    id asc
         ) as rn
  from public.menu_items
  where tipo = 'carta'
)
delete from public.menu_items
 where id in (select id from ranked where rn > 1)
   and id not in (select menu_item_id from public.pedido_items where menu_item_id is not null);

-- B) ORDEN -----------------------------------------------------
update public.menu_items set orden=0 where tipo='carta' and nombre='Kiku Otoñal';
update public.menu_items set orden=1 where tipo='carta' and nombre='Kiku 12 pzas';
update public.menu_items set orden=2 where tipo='carta' and nombre='Kiku 15 pzas';
update public.menu_items set orden=3 where tipo='carta' and nombre='Fusión 12 pzas';
update public.menu_items set orden=4 where tipo='carta' and nombre='Fusión 15 pzas';
update public.menu_items set orden=5 where tipo='carta' and nombre='Nikkei 12 pzas';
update public.menu_items set orden=6 where tipo='carta' and nombre='Nikkei 15 pzas';
update public.menu_items set orden=7 where tipo='carta' and nombre='Exotic 12 pzas';
update public.menu_items set orden=8 where tipo='carta' and nombre='Exotic 15 pzas';
update public.menu_items set orden=9 where tipo='carta' and nombre='Veggie 15 pzas';
update public.menu_items set orden=10 where tipo='carta' and nombre='Gyozas de langostinos';
update public.menu_items set orden=11 where tipo='carta' and nombre='Gyozas de ternera';
update public.menu_items set orden=12 where tipo='carta' and nombre='Gyozas tako';
update public.menu_items set orden=13 where tipo='carta' and nombre='Gyozas chiken teriyaki';
update public.menu_items set orden=14 where tipo='carta' and nombre='Gyozas veggie';
update public.menu_items set orden=15 where tipo='carta' and nombre='Gyozas acevichadas';
update public.menu_items set orden=16 where tipo='carta' and nombre='Gyozas de cerdo';
update public.menu_items set orden=17 where tipo='carta' and nombre='Harumakis de carne';
update public.menu_items set orden=18 where tipo='carta' and nombre='Harumakis veggie';
update public.menu_items set orden=19 where tipo='carta' and nombre='Harumakis tonkatsu';
update public.menu_items set orden=20 where tipo='carta' and nombre='2 Langostinos furai';
update public.menu_items set orden=21 where tipo='carta' and nombre='4 Langostinos furai';
update public.menu_items set orden=22 where tipo='carta' and nombre='6 Langostinos furai';
update public.menu_items set orden=23 where tipo='carta' and nombre='2 Maki furai';
update public.menu_items set orden=24 where tipo='carta' and nombre='4 Maki furai';
update public.menu_items set orden=25 where tipo='carta' and nombre='Dupla furai';
update public.menu_items set orden=26 where tipo='carta' and nombre='Oniguiri furai';
update public.menu_items set orden=27 where tipo='carta' and nombre='Vieiras furai';
update public.menu_items set orden=28 where tipo='carta' and nombre='Korokke de pulpo';
update public.menu_items set orden=29 where tipo='carta' and nombre='Korokke de salmón';
update public.menu_items set orden=30 where tipo='carta' and nombre='Korokke de shitake';
update public.menu_items set orden=31 where tipo='carta' and nombre='Tempura Pacifico (2 personas)';
update public.menu_items set orden=32 where tipo='carta' and nombre='Tempura Veggie';
update public.menu_items set orden=33 where tipo='carta' and nombre='Causa Limeña de Salmón';
update public.menu_items set orden=34 where tipo='carta' and nombre='Causa Limeña de Langostinos';
update public.menu_items set orden=35 where tipo='carta' and nombre='Causa Limeña de Centolla';
update public.menu_items set orden=36 where tipo='carta' and nombre='Causa Limeña Veggie';
update public.menu_items set orden=37 where tipo='carta' and nombre='Carpaccio de Salmón y Atún Rojo';
update public.menu_items set orden=38 where tipo='carta' and nombre='Carpaccio de Langostinos Blancos';
update public.menu_items set orden=39 where tipo='carta' and nombre='Ceviche de pesca blanca';
update public.menu_items set orden=40 where tipo='carta' and nombre='Ceviche mixto';
update public.menu_items set orden=41 where tipo='carta' and nombre='Ceviche Frito';
update public.menu_items set orden=42 where tipo='carta' and nombre='Tiradito nipón';
update public.menu_items set orden=43 where tipo='carta' and nombre='Tiradito maracuyá';
update public.menu_items set orden=44 where tipo='carta' and nombre='Tiradito confitados';
update public.menu_items set orden=45 where tipo='carta' and nombre='Tiradito de pejerrey';
update public.menu_items set orden=46 where tipo='carta' and nombre='Papas a la huancaína y pulpo';
update public.menu_items set orden=47 where tipo='carta' and nombre='Ensalada sunomono de salmón';
update public.menu_items set orden=48 where tipo='carta' and nombre='Ensalada sunomono tofu';
update public.menu_items set orden=49 where tipo='carta' and nombre='Ensalada de centolla';
update public.menu_items set orden=50 where tipo='carta' and nombre='Ensalada de gyozas veggie';
update public.menu_items set orden=51 where tipo='carta' and nombre='Ensalada de gyozas de cerdo';
update public.menu_items set orden=52 where tipo='carta' and nombre='Ensalada de gyozas de ternera';
update public.menu_items set orden=53 where tipo='carta' and nombre='Tataki de Atún Rojo';
update public.menu_items set orden=54 where tipo='carta' and nombre='8 Tamago roll';
update public.menu_items set orden=55 where tipo='carta' and nombre='8 Tamago palta roll';
update public.menu_items set orden=56 where tipo='carta' and nombre='8 Tamago ebi furai roll';
update public.menu_items set orden=57 where tipo='carta' and nombre='9 Huanca Roll';
update public.menu_items set orden=58 where tipo='carta' and nombre='9 maguro roll';
update public.menu_items set orden=59 where tipo='carta' and nombre='9 Momo ebi roll';
update public.menu_items set orden=60 where tipo='carta' and nombre='4 Maki ceviche roll';
update public.menu_items set orden=61 where tipo='carta' and nombre='12 Moriawase de sashimis';
update public.menu_items set orden=62 where tipo='carta' and nombre='8 Moriawase de sashimis';
update public.menu_items set orden=63 where tipo='carta' and nombre='12 Moriawase de niguiris';
update public.menu_items set orden=64 where tipo='carta' and nombre='8 Moriawase de niguiris';
update public.menu_items set orden=65 where tipo='carta' and nombre='6 Niguiri de salmón';
update public.menu_items set orden=66 where tipo='carta' and nombre='Trucha A La Plancha';
update public.menu_items set orden=67 where tipo='carta' and nombre='Pesca blanca a la plancha y setas';
update public.menu_items set orden=68 where tipo='carta' and nombre='Pulpo con Salsa Brava';
update public.menu_items set orden=69 where tipo='carta' and nombre='Yakimeshi Cerdo';
update public.menu_items set orden=70 where tipo='carta' and nombre='Yakimeshi de Langostinos';
update public.menu_items set orden=71 where tipo='carta' and nombre='Yakimeshi Veggie';
update public.menu_items set orden=72 where tipo='carta' and nombre='Yakisoba de Cerdo';
update public.menu_items set orden=73 where tipo='carta' and nombre='Yakisoba de Langostinos';
update public.menu_items set orden=74 where tipo='carta' and nombre='Yakisoba Veggie';
update public.menu_items set orden=75 where tipo='carta' and nombre='Salteado de Lomo';
update public.menu_items set orden=76 where tipo='carta' and nombre='Salteado de Pollo';
update public.menu_items set orden=77 where tipo='carta' and nombre='Salteado Veggie';
update public.menu_items set orden=78 where tipo='carta' and nombre='Tonkatsu';
update public.menu_items set orden=79 where tipo='carta' and nombre='Yakitori de Langostinos y hongos';
update public.menu_items set orden=80 where tipo='carta' and nombre='Yakitori Veggie';
update public.menu_items set orden=81 where tipo='carta' and nombre='Arroz shari';
update public.menu_items set orden=82 where tipo='carta' and nombre='Arroz gohan';
update public.menu_items set orden=83 where tipo='carta' and nombre='Copa Dulce';
update public.menu_items set orden=84 where tipo='carta' and nombre='Taiyaki';
update public.menu_items set orden=85 where tipo='carta' and nombre='Taiyaki Cream';
update public.menu_items set orden=86 where tipo='carta' and nombre='Aisu';
update public.menu_items set orden=87 where tipo='carta' and nombre='Agua c/gas';
update public.menu_items set orden=88 where tipo='carta' and nombre='Agua s/gas';
update public.menu_items set orden=89 where tipo='carta' and nombre='Agua saborizada';
update public.menu_items set orden=90 where tipo='carta' and nombre='Jarra de Limonada';
update public.menu_items set orden=91 where tipo='carta' and nombre='Coca cola lata';
update public.menu_items set orden=92 where tipo='carta' and nombre='Coca cola zero lata';
update public.menu_items set orden=93 where tipo='carta' and nombre='Sprite lata';
update public.menu_items set orden=94 where tipo='carta' and nombre='Vaso de limonada';
update public.menu_items set orden=95 where tipo='carta' and nombre='Cynar Pomelo';
update public.menu_items set orden=96 where tipo='carta' and nombre='Cynar Soda';
update public.menu_items set orden=97 where tipo='carta' and nombre='Aperol Spritz';
update public.menu_items set orden=98 where tipo='carta' and nombre='Soju Tonic';
update public.menu_items set orden=99 where tipo='carta' and nombre='Gin La Salvaje Tónica';
update public.menu_items set orden=100 where tipo='carta' and nombre='Gin Dry Yugen Tónica';
update public.menu_items set orden=101 where tipo='carta' and nombre='Somek';
update public.menu_items set orden=102 where tipo='carta' and nombre='Cerveza Heineken 330ml';
update public.menu_items set orden=103 where tipo='carta' and nombre='Cerveza Corona 330ml';
update public.menu_items set orden=104 where tipo='carta' and nombre='Cerveza Sapporo 330ml';
update public.menu_items set orden=105 where tipo='carta' and nombre='Cerveza Tsingtao 330ml';
update public.menu_items set orden=106 where tipo='carta' and nombre='Cerveza Orion Lata';
update public.menu_items set orden=107 where tipo='carta' and nombre='Las Perdices Torrontés Dulce Natural';
update public.menu_items set orden=108 where tipo='carta' and nombre='Chac Chac Malbec Rosé';
update public.menu_items set orden=109 where tipo='carta' and nombre='Las Perdices Reserva Malbec';
update public.menu_items set orden=110 where tipo='carta' and nombre='Las Perdices Reserva Sauvignon Blanc';
update public.menu_items set orden=111 where tipo='carta' and nombre='Las Perdices Reserva Pinot Noir';
update public.menu_items set orden=112 where tipo='carta' and nombre='Riesling de Viña Las Perdices';
update public.menu_items set orden=113 where tipo='carta' and nombre='Albariño de Viña Las Perdices';
update public.menu_items set orden=114 where tipo='carta' and nombre='Las Perdices Extra Brut Método Tradicional';
update public.menu_items set orden=115 where tipo='carta' and nombre='Salentein Reserva Chardonnay';
update public.menu_items set orden=116 where tipo='carta' and nombre='Salentein Reserva Sauvignon Blanc';
update public.menu_items set orden=117 where tipo='carta' and nombre='Salentein Reserva Malbec';
update public.menu_items set orden=118 where tipo='carta' and nombre='Salentein Brut Nature';
update public.menu_items set orden=119 where tipo='carta' and nombre='Salentein Brut Rosé';
update public.menu_items set orden=120 where tipo='carta' and nombre='Salentein Extra Brut';
update public.menu_items set orden=121 where tipo='carta' and nombre='Salentein Blanc de Blancs';
update public.menu_items set orden=122 where tipo='carta' and nombre='Salentein Doux';
update public.menu_items set orden=123 where tipo='carta' and nombre='Escorihuela Gascón Chardonnay';
update public.menu_items set orden=124 where tipo='carta' and nombre='Escorihuela Gascón Sauvignon Blanc';
update public.menu_items set orden=125 where tipo='carta' and nombre='Escorihuela Gascón Malbec';
update public.menu_items set orden=126 where tipo='carta' and nombre='Luigi Bosca Chardonnay';
update public.menu_items set orden=127 where tipo='carta' and nombre='Luigi Bosca Sauvignon Blanc';
update public.menu_items set orden=128 where tipo='carta' and nombre='Luigi Bosca Rosé';
update public.menu_items set orden=129 where tipo='carta' and nombre='DV Catena Chardonnay';
update public.menu_items set orden=130 where tipo='carta' and nombre='Rutini Wines Sauvignon Blanc';
update public.menu_items set orden=131 where tipo='carta' and nombre='Rutini Malbec';
update public.menu_items set orden=132 where tipo='carta' and nombre='Rutini Encuentro Brut Nature Pinot Noir';
update public.menu_items set orden=133 where tipo='carta' and nombre='Copa Vino Blanco';
update public.menu_items set orden=134 where tipo='carta' and nombre='Copa Vino Malbec';

commit;