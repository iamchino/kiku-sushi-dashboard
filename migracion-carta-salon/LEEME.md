# Migración Carta Salón → sistema Kiku Sushi

Importa los **95 productos** de la *Carta Salón* del sitio viejo
(`kikusushi.ar/carta/menu-principal-...`) a la tabla `menu_items` (tipo `carta`).

Mismo patrón que la migración de delivery, pero apuntando a `tipo = 'carta'`
y al bucket `menu-images/carta/<slug>.jpg`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `build-carta.mjs` | Fuente de verdad: contiene el catálogo transcrito. Genera `productos.json` y `carta-salon.sql`. Solo hace falta re-correrlo si editás precios/descripciones. |
| `productos.json` | Catálogo parseado (95 productos · 57 con imagen). |
| `carta-salon.sql` | Inserta los 95 productos en `menu_items` (tipo `carta`) con reemplazo seguro. |
| `subir-imagenes.mjs` | Descarga cada imagen de Cloudinary y la sube a `menu-images/carta/<slug>.jpg`. |

## Lo que tenés que hacer vos

### 1. Subir las imágenes a tu Supabase

Necesitás la **service_role key**: Supabase → *Project Settings* → *API* → `service_role`.

En PowerShell, desde la raíz del proyecto (`kiku-sushi-dashboard`):

```powershell
$env:SUPABASE_URL="https://sepyieuxsmxhzobtmzxb.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"
node migracion-carta-salon/subir-imagenes.mjs
```

Sube **57 imágenes**. El resto de productos (bebidas, vinos sin foto, etc.) no
tienen imagen en el sitio viejo, así que se omiten.
El bucket `menu-images` ya existe y es público (lo usás en la app), no hay que crearlo.

### 2. Cargar los productos

Abrí Supabase → **SQL Editor** → *New query*, pegá el contenido de
`carta-salon.sql` y dale **Run**.

> El SQL reemplaza la carta salón anterior de forma segura: los productos
> viejos de `tipo = 'carta'` que tengan pedidos asociados se **ocultan**
> (para no romper el historial), y el resto se borra antes de cargar la carta
> nueva. Si solo querés **agregar** sin tocar lo existente, borrá las dos
> sentencias `update`/`delete` del comienzo del archivo.

### 3. Verificar

- **Dashboard** → *Menú & Carta* → pestaña **Carta Salón**: deberían aparecer
  los 95 productos agrupados por categoría, con foto los que la tienen.
- **Web v2** → `/carta`: la página ya lee de Supabase (`tipo = 'carta'`), así
  que verás la carta nueva en vivo. Ya quedó enlazada desde el navbar v2 ("Carta").

## Notas

- **No hace falta ninguna migración de esquema en Supabase.** La tabla
  `menu_items` y el `tipo = 'carta'` ya existen y la app ya los consume; solo
  cargás datos + imágenes.
- Precios en formato numérico (ej. `$ 31.900` → `31900`).
- Combinados y rebozados con tamaños (12/15 pzas, 2/4/6 furai) van **separados**, 1:1 con el sitio.
- Vinos agrupados por bodega tal como están en la carta del salón.
- Categorías vacías del sitio (Tonkatsu, Yakitoris, Acompañamientos) se omiten.
- Si una imagen falla, re-corré el script: usa `upsert`, no duplica.
