# Carta Delivery — actualización (junio 2026)

Cambios pedidos por Manu sobre la carta **delivery** (`tipo='delivery'` en `menu_items`).
Todos los scripts son seguros de re-correr y van en este orden:

| Orden | Archivo | Qué hace |
|---|---|---|
| 1 | `01_faltantes_philadelphia_nikkei.sql` | Alta de **9 Philadelphia roll** ($22.200, foto del de 5) y pone la foto del **Nikkei 12 pzas** = la del Nikkei 15. |
| 2 | `02_rollos_veggie.sql` | Mueve **9 Bajiru Roll**, **8 Tamago palta roll** y **9 Maki vegan roll** (ya existían) a una categoría aparte **"Rolls Veggie"**. |
| 3 | `03_rebuild_bebidas.sql` | Reconstruye **bebidas** espejando el salón. |
| 4 | `04_badges_delivery.sql` | Pone los íconos **picante / vegano / vegetariano / sin TACC**. |
| 5 | `05_orden_delivery.sql` | Reordena **toda** la carta (0..129). Correr **al final** del delivery. |
| 6 | `06_rename_rollos_a_rolls.sql` | Renombra la categoría **"Rollos" → "Rolls"** en toda la tabla (delivery, salón, take away). |
| 7 | `07_cocina_gyoza_yaki.sql` | Alta de **Gyozas chiken teriyaki** + **Yakisobas (3)** + **Yakimeshis (3)** en delivery, con foto del bucket `carta/` y **precios de delivery/take away** que pasó Manu. |
| 8 | `08_orden_delivery_v2.sql` | **Reemplaza al 05.** Reordena toda la carta (0..138) ya con todos los nuevos ítems en su sección. |
| 9 | `09_harumakis_tonkatsu.sql` | Alta de **Harumakis tonkatsu** ($11.500) y **Tonkatsu** ($21.000) en delivery, con foto del bucket `carta/`. |

### 7 · Cocina que faltaba (junio 2026)
Se trajeron desde la carta salón, con su foto, pero con **precio de delivery**:

| Ítem | Precio delivery/llevar |
|---|--:|
| Gyozas chiken teriyaki | $13.900 |
| Yakisoba Veggie | $15.000 |
| Yakisoba de Cerdo | $16.500 |
| Yakisoba de Langostinos | $21.500 |
| Yakimeshi Veggie | $15.000 |
| Yakimeshi Cerdo | $16.500 |
| Yakimeshi de Langostinos | $21.500 |

Las fotos reusan las ya subidas en `menu-images/carta/<slug>.jpg`, así que **no hay que subir nada nuevo**. Si preferís copiarlas al bucket `delivery/`, avisá y dejo el script.

Cómo correr: Supabase → **SQL Editor** → pegar cada archivo en orden → **Run**.

## Detalle

### 1 · Productos que faltaban
- **9 Philadelphia roll** — $22.200, misma descripción y **misma foto** que el de 5 (`delivery/5-philadelphia-roll.jpg`). Add-only: si ya existe, no lo duplica.
- **Nikkei 12 pzas** — toma la foto del **Nikkei 15 pzas** (`delivery/nikkei-15-pzas.jpg`), que es la que sí existe en el bucket.

### 2 · Rolls Veggie (sección aparte)
Quedan en su propia categoría, en este orden: **9 Bajiru Roll → 8 Tamago palta roll → 9 Maki vegan roll**, ubicada justo después de "Rolls de Sushi" (lo fija el paso 5). No se re-crean, solo se reclasifican.

### 3 · Bebidas (espejo del salón)
- **Se sacan:** aguas c/gas y s/gas, jarra de limonada, todos los tragos y las copas de vino.
- **Sin alcohol:** Coca, Coca Zero, Sprite y Vaso de limonada.
- **Con alcohol:** Cervezas (Heineken, Corona, Sapporo, Tsingtao, Orion) + **todas las bodegas** del salón
  (Viña Las Perdices, Salentein, Escorihuela Gascón, Luigi Bosca, Catena Zapata, Rutini).
- **Viña Las Perdices** queda **con foto** (reusa las imágenes ya subidas del salón, bucket `carta/`); el resto en **modo lista** (sin foto), como en el salón.
- Reemplazo **seguro**: las bebidas viejas que tengan pedidos asociados se **ocultan** (no se borran, para no romper el historial); el resto se borra antes de insertar la lista nueva.

### 4 · Badges
- **Reutiliza los datos oficiales del salón** para los ítems que coinciden (Kiku, Nikkei, Gyozas veggie, Harumakis veggie, Ceviche, Maki/furai, etc.).
- **Infiere** los veggie propios del delivery: **9 Maki vegan roll** (vegano), **9 Bajiru Roll** y **Korokke de shitake** (vegetariano).
- **`sin_tacc` se aplicó conservador**: solo donde hay dato oficial del salón. Si querés marcar sin TACC en sashimis/niguiris/geishas u otros, avisame y los agrego (no los puse para no afirmar "apto celíaco" sin confirmación).

> Las columnas de badges (`picante, vegano, vegetariano, sin_tacc`) son las mismas del salón
> (`migracion-carta-salon/01_alter_menu_items_badges.sql`). El paso 1 las crea con `IF NOT EXISTS` por las dudas.

## Nota sobre el front
Esto cambia **datos**. Para que los iconitos se vean en la web/dashboard del delivery, el render tiene que leer
`picante, vegano, vegetariano, sin_tacc` (igual que se hizo en la carta salón). Si el delivery todavía no los muestra,
decime y dejo los cambios de código.
