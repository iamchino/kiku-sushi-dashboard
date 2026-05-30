# Migración carta Delivery → sistema Kiku Sushi

Importa los **116 productos** de la carta delivery del sitio viejo
(`kikusushi.ar/carta/carta-delivery-...`) a la tabla `menu_items` (tipo `delivery`).

## Archivos

| Archivo | Qué hace |
|---|---|
| `carta-delivery.sql` | Inserta los 116 productos en `menu_items`. Las `imagen_url` apuntan a `menu-images/delivery/<slug>.jpg`. |
| `subir-imagenes.mjs` | Descarga cada imagen de Cloudinary y la sube a ese mismo bucket/ruta. |
| `productos.json` | Catálogo parseado (fuente de ambos archivos). |

## Pasos

### 1. Subir las imágenes a tu Supabase

Necesitás la **service_role key**: Supabase → *Project Settings* → *API* → `service_role`.

En PowerShell, desde la raíz del proyecto:

```powershell
$env:SUPABASE_URL="https://sepyieuxsmxhzobtmzxb.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"
node migracion-carta-delivery/subir-imagenes.mjs
```

Sube 92 imágenes (los 2 especiales y las 22 bebidas no tienen foto en el sitio).
El bucket `menu-images` debe existir y ser público (ya lo usás en la app).

### 2. Cargar los productos

Abrí Supabase → **SQL Editor** → *New query*, pegá el contenido de
`carta-delivery.sql` y dale **Run**.

> El SQL ya reemplaza la carta delivery anterior de forma segura: los
> productos viejos que tienen pedidos asociados se **ocultan** (para no
> romper el historial de órdenes) y el resto se borra, antes de cargar
> la carta nueva. Si solo querés **agregar** sin tocar lo existente,
> borrá las dos sentencias `update`/`delete` del comienzo del archivo.

### 3. Verificar

Entrá al dashboard → **Menú & Carta** → pestaña *Delivery / Pedidos*.
Deberían aparecer los 116 productos agrupados por categoría con sus fotos.

## Notas

- Los precios están en formato numérico (ej. `$ 12.100` → `12100`).
- Productos con tamaños (5/9 piezas, 2/6 geishas) se cargaron **separados**, 1:1 con el sitio.
- El orden respeta el de la página original.
- Si una imagen falla al subir, podés re-correr el script: usa `upsert`, no duplica.
