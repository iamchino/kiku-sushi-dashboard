# Carta Salón — 40 ítems nuevos + badges (picante / veggie / sin TACC)

Complemento de la migración previa (`carta-salon.sql`, 95 ítems). Acá se **agregan
los 40 ítems que faltaban** y se incorporan los **badges** del sitio viejo que antes
no se habían capturado. **No se toca ni se repite nada de lo ya cargado.**

Fuente: `https://kiku-sushi.vercel.app/carta/menu-principal-1767897736776`
(leída en vivo; los badges salen de los `aria-label` de cada ícono).

## Qué hay acá

| Archivo | Qué hace |
|---|---|
| `nuevos-items.json` | Los 40 ítems nuevos (categoría, precio, descripción, imagen, badges). |
| `badges-carta.json` | Mapa nombre → badge de los **45 ítems** con etiqueta (nuevos + existentes). |
| `01_alter_menu_items_badges.sql` | Agrega columnas `picante, vegano, vegetariano, sin_tacc` a `menu_items`. |
| `02_insert_nuevos.sql` | Alta de los 40 nuevos (add-only, idempotente, no duplica). |
| `03_update_badges_existentes.sql` | Setea los badges sobre los 20 ítems ya cargados que los tienen. |
| `04_orden_carta.sql` | Reordena los **135 ítems** según el orden oficial del sitio. |
| `subir-imagenes-nuevos.mjs` | Sube las 34 imágenes nuevas a `menu-images/carta/<slug>.jpg`. |

## Resumen del análisis

- **40 ítems nuevos** (ninguno duplica los 95 previos). **34 con foto**, 6 sin foto
  (Pulpo con Salsa Brava, Agua saborizada, Cerveza Orion, Escorihuela Gascón Chardonnay
  y Malbec, Rutini Encuentro Brut Nature).
- Categorías que antes faltaban enteras: **Ceviches, Causas Limeñas, Carpaccios,
  Ensaladas, Ensaladas de Gyozas, Tatakis, Sashimis (Moriawase), Pescados, Tonkatsu,
  Yakitoris, Acompañamientos**.
- **Badges leídos para 45 ítems** de toda la carta (25 caen sobre los nuevos, 20 sobre
  los existentes).

### Leyenda de badges
- **Picante:** `1` = 🌶 Leve · `2` = 🌶🌶 Medio · `3` = 🌶🌶🌶 Muy Picante · `0` = no pica
- **Vegano** (el ícono "veggie" verde) · **Vegetariano** · **Sin TACC** (apto celíacos)

### Ítems nuevos (detalle)

**Harumakis**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Harumakis veggie | $11.500 | sí | Vegano, Vegetariano |
| Harumakis tonkatsu | $11.500 | sí | 🌶 Leve |

**Ceviches**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Ceviche de pesca blanca | $19.500 | sí | 🌶 Leve, Sin TACC |
| Ceviche mixto | $19.000 | sí | 🌶🌶 Medio, Sin TACC |
| Ceviche Frito | $16.000 | sí | — |

**Causas Limeñas**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Causa Limeña de Salmón | $22.000 | sí | 🌶 Leve, Sin TACC |
| Causa Limeña de Langostinos | $21.500 | sí | 🌶 Leve, Sin TACC |
| Causa Limeña de Centolla | $26.000 | sí | 🌶 Leve, Sin TACC |
| Causa Limeña Veggie | $13.000 | sí | Vegetariano, Sin TACC |

**Carpaccios**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Carpaccio de Salmón y Atún Rojo | $22.000 | sí | Sin TACC |
| Carpaccio de Langostinos Blancos | $22.000 | sí | Sin TACC |

**Tiraditos**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Tiradito de pejerrey | $23.000 | sí | — |
| Papas a la huancaína y pulpo | $22.000 | sí | — |

**Ensaladas**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Ensalada sunomono de salmón | $18.000 | sí | Sin TACC |
| Ensalada sunomono tofu | $16.000 | sí | Vegano, Vegetariano, Sin TACC |
| Ensalada de centolla | $18.000 | sí | 🌶 Leve |

**Ensaladas de Gyozas**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Ensalada de gyozas veggie | $14.000 | sí | Vegano, Vegetariano |
| Ensalada de gyozas de cerdo | $15.000 | sí | 🌶 Leve |
| Ensalada de gyozas de ternera | $16.000 | sí | 🌶 Leve |

**Tatakis**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Tataki de Atún Rojo | $18.000 | sí | 🌶 Leve, Sin TACC |

**Rolls de Sushi**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| 9 maguro roll | $20.000 | sí | 🌶🌶🌶 Muy Picante |
| 9 Momo ebi roll | $18.000 | sí | — |
| 4 Maki ceviche roll | $18.000 | sí | 🌶🌶 Medio |

**Sashimis**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| 12 Moriawase de sashimis | $32.600 | sí | Sin TACC |
| 8 Moriawase de sashimis | $22.000 | sí | — |

**Niguiris**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| 12 Moriawase de niguiris | $32.600 | sí | Sin TACC |
| 8 Moriawase de niguiris | $22.000 | sí | — |

**Pescados**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Trucha A La Plancha | $25.000 | sí | 🌶 Leve, Sin TACC |
| Pesca blanca a la plancha y setas | $23.000 | sí | — |
| Pulpo con Salsa Brava | $33.000 | — | — |

**Tonkatsu**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Tonkatsu | $22.000 | sí | — |

**Yakitoris**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Yakitori de Langostinos y hongos | $17.000 | sí | — |
| Yakitori Veggie | $15.500 | sí | 🌶 Leve, Vegano, Vegetariano |

**Acompañamientos**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Arroz shari | $8.000 | sí | Vegano, Vegetariano, Sin TACC |
| Arroz gohan | $8.000 | sí | Vegano, Vegetariano, Sin TACC |

**Bebidas sin alcohol**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Agua saborizada | $3.700 | — | — |

**Cervezas**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Cerveza Orion Lata | $8.500 | — | — |

**Vinos · Escorihuela Gascón**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Escorihuela Gascón Chardonnay | $27.000 | — | — |
| Escorihuela Gascón Malbec | $28.000 | — | — |

**Vinos · Rutini Wines**

| Ítem | Precio | Foto | Badges |
|---|--:|:--:|---|
| Rutini Encuentro Brut Nature Pinot Noir | $55.000 | — | — |

> **Ojo (inconsistencia del sitio):** las versiones de **8 piezas** de los Moriawase
> (sashimi y niguiri) **no** traen el badge *Sin TACC* que sí tienen las de 12 piezas.
> Lo dejé tal cual está en el sitio; si querés que las de 8 también lleven *Sin TACC*,
> avisame y lo ajusto.

---

## Cómo migrar a Supabase (paso a paso)

El modelo actual de `menu_items` tiene un solo campo de texto `etiqueta` (tipo
"Popular"/"Premium"), que **no alcanza** para estos badges: un ítem puede ser a la vez
picante, vegano y sin TACC. Por eso se agregan **columnas dedicadas**.

### 1. Agregar las columnas (una sola vez)
Supabase → **SQL Editor** → pegá y corré `01_alter_menu_items_badges.sql`.
Agrega `picante` (0–3), `vegano`, `vegetariano`, `sin_tacc`. Es seguro de re-correr.

### 2. Subir las imágenes nuevas
Necesitás la **service_role key** (Supabase → Project Settings → API → service_role).
Desde la raíz del proyecto (`kiku-sushi-dashboard`), en PowerShell:

```powershell
$env:SUPABASE_URL="https://sepyieuxsmxhzobtmzxb.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"
node migracion-carta-salon/subir-imagenes-nuevos.mjs
```
Sube 34 imágenes al bucket `menu-images/carta/` (los 6 sin foto quedan con
`imagen_url` NULL). Usa `upsert`, no duplica.

### 3. Cargar los 40 ítems nuevos
SQL Editor → pegá y corré `02_insert_nuevos.sql`. Es **add-only**: inserta cada ítem
solo si no existe ya en `tipo='carta'`, así que no rompe ni repite lo anterior.

### 4. Poner los badges a los 95 que ya estaban
SQL Editor → `03_update_badges_existentes.sql` (20 updates por nombre). Con esto la
carta entera queda etiquetada, no solo los nuevos.

### 5. Mostrar los badges en la app (cambios de código)
Hoy `src/data/cartaSalon.ts` (web v2) trae solo `etiqueta`. Para que se vean los íconos:
- En el `select(...)` agregá `picante, vegano, vegetariano, sin_tacc`.
- Sumá esos campos a la interfaz `CartaItem` y mapealos en `groupToSections`.
- En `Carta.tsx` renderizá los iconitos según esos campos.
- El **dashboard** (Menú & Carta) necesita los mismos 4 controles para poder editarlos.

> Si querés, en otro paso te dejo estos cambios de `cartaSalon.ts` / `Carta.tsx` y el
> form del dashboard ya escritos.

### 6. Ordenar toda la carta
SQL Editor → `04_orden_carta.sql`. Setea `orden` 0..134 en los 135 ítems (por nombre)
para que la página siga el flujo oficial:

> **Kiku Otoñal → Combinados → Entradas → Principales de sushi → Principales de cocina
> → Postres → Be