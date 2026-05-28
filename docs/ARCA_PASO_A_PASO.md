# ARCA paso a paso — Kiku Sushi

Guía corta y concreta. Datos del PDF del contador ya cargados.

```
Razón social:    KIKU SUSHI S.A.S.
CUIT:            30-71943175-1   →  30719431751
Domicilio:       Callao Bis 139, Rosario, Santa Fe (CP 2000)
IIBB:            0215652537
Inicio act.:     01/05/2026
Punto de venta:  00002  (RECE para aplicativo y web services)
Webservice:      WSFEv1
Condición IVA:   Responsable Inscripto
```

> El plan es: **arrancar en homologación** (testing) para ver que todo funciona, después pasar a producción con el cert real del contador. Va a tomar **2 días aprox**: uno para tener todo en homo andando, el segundo cuando vuelva el contador con el .crt de prod.

---

## DÍA 1 — Homologación (vos solo, sin contador)

### Paso 1. Generar la clave privada y los dos CSR (uno homo, uno prod)

Abrí **Git Bash** o **WSL** en Windows (donde tengas `openssl` disponible).
Creá una carpeta segura **fuera del repo** (ejemplo: `C:\Kiku\Certificados`).

```bash
cd /c/Kiku/Certificados   # o donde quieras

# 1.1) Clave privada única (te sirve para homo y prod)
openssl genrsa -out kikusushi.key 2048

# 1.2) CSR para HOMOLOGACIÓN
openssl req -new -key kikusushi.key \
  -subj "/C=AR/O=KIKU SUSHI S.A.S./CN=kikusushi-homo/serialNumber=CUIT 30719431751" \
  -out kikusushi-homo.csr

# 1.3) CSR para PRODUCCIÓN (el que le pasás al contador)
openssl req -new -key kikusushi.key \
  -subj "/C=AR/O=KIKU SUSHI S.A.S./CN=kikusushi-prod/serialNumber=CUIT 30719431751" \
  -out kikusushi-prod.csr
```

Al terminar tenés 3 archivos en `C:\Kiku\Certificados`:

```
kikusushi.key         ← clave privada (NUNCA la compartas. Backup, sí; mandarla, no)
kikusushi-homo.csr    ← la subís vos a homologación
kikusushi-prod.csr    ← se la mandás al contador
```

### Paso 2. Subir el CSR de HOMOLOGACIÓN

1. Entrá a https://wsass-homo.afip.gov.ar/ con tu Clave Fiscal.
2. Click en **"Crear Certificado de Testing"**.
3. Pegá el contenido completo de `kikusushi-homo.csr` (incluyendo las líneas `-----BEGIN CERTIFICATE REQUEST-----` y `-----END CERTIFICATE REQUEST-----`).
4. Click en Generar. Te devuelve un texto que empieza con `-----BEGIN CERTIFICATE-----`. Copialo y guardalo como `kikusushi-homo.crt` en la misma carpeta.
5. Volvé al menú principal del portal homo. Click en **"Administrar Certificados / Crear Autorización de Servicio Web"**.
6. Elegí el certificado recién creado. En "Servicio" poné `wsfe`. Representado: tu propio CUIT (30719431751). Confirmá.

Quedaste habilitado para usar WSFE de homologación.

### Paso 3. Mandarle al contador el CSR de producción

Mail al contador con el archivo adjunto `kikusushi-prod.csr` y este texto:

```
Hola, te paso el CSR para generar el certificado digital de producción
para el servicio wsfev1. Pasos en el portal de ARCA:

1. Mis Servicios → "Administración de Certificados Digitales"
2. Agregar Alias: KIKU-SUSHI-PROD
3. Subir el CSR adjunto (kikusushi-prod.csr)
4. Descargar el .crt que devuelve
5. En "Administrador de Relaciones de Clave Fiscal" autorizar el cert
   al servicio "wsfe" (Facturación Electrónica) representando al
   CUIT 30-71943175-1
6. Mandarme el .crt por mail

CUIT: 30-71943175-1
Punto de venta: 00002 (ya está dado de alta tipo RECE).

Gracias!
```

Mientras esperás el cert de prod, podés seguir con los pasos 4 al 7 (todo en homo).

### Paso 4. Aplicar las migraciones SQL en Supabase

Abrí el **SQL Editor** de tu proyecto Supabase y ejecutá en orden las 2 migraciones nuevas que ya están en el repo:

1. `supabase/migrations/20260527000000_facturacion_extendida.sql`
2. `supabase/migrations/20260527010000_kiku_datos_fiscales.sql` ← ya trae tus datos reales

> Si usás `supabase db push` desde la CLI, hace ambas de una.

Verificá:

```sql
select cuit, punto_venta, ambiente, permite_factura_a, domicilio
from public.facturacion_config;
```

Tiene que decir `30719431751 | 2 | homologacion | true | Callao Bis 139, …`.

### Paso 5. Cargar los secretos en Supabase (HOMOLOGACIÓN)

Desde Git Bash, parado en la raíz del repo:

```bash
# Loguearte (sola vez)
supabase login

# Linkear el proyecto (sola vez)
supabase link --project-ref sepyieuxsmxhzobtmzxb

# Setear los 4 secrets
supabase secrets set ARCA_CUIT=30719431751
supabase secrets set ARCA_AMBIENTE=homologacion
supabase secrets set ARCA_CERT="$(cat /c/Kiku/Certificados/kikusushi-homo.crt)"
supabase secrets set ARCA_KEY="$(cat /c/Kiku/Certificados/kikusushi.key)"

# Verificar
supabase secrets list
```

Tenés que ver `ARCA_CUIT`, `ARCA_AMBIENTE`, `ARCA_CERT`, `ARCA_KEY` listados.

### Paso 6. Deploy de la Edge Function

```bash
supabase functions deploy arca-comprobantes
```

Esperá hasta que diga "Deployed Function arca-comprobantes". Demora 20–40 segundos.

### Paso 7. Setear la URL en el front y reiniciar

En tu archivo `.env` (raíz del repo) agregá esta línea:

```env
VITE_ARCA_API_URL=https://sepyieuxsmxhzobtmzxb.supabase.co/functions/v1
```

> El project-ref `sepyieuxsmxhzobtmzxb` lo saqué del `.env` actual. Si lo cambiaste, ajustalo.

Reiniciá el dev server (`Ctrl+C` y `npm run dev` de nuevo) o re-deployá Vercel.

### Paso 8. Probar en la app

1. Loguearte en el dashboard.
2. Ir a **Caja**.
3. El pill **"ARCA WSFE"** tiene que estar verde con "PV 2".
4. Crear un pedido salón con ítems del menú, total $1.000.
5. Click **"Facturar + ticket"** → se abre el modal.
6. Dejá "Factura B" y confirmá.
7. Si todo OK: aparece el banner verde, el pedido pasa a "facturado" con número `B 00002-00000001`, y se imprime el ticket.

### Paso 9. Verificar en ARCA homo

Entrá a https://serviciosweb.afip.gob.ar/ (con clave fiscal) → "Comprobantes en Línea" → "Comprobantes Emitidos". En modo homologación, el comprobante con número 1 del PV 2 tiene que aparecer.

---

## DÍA 2 — Producción (cuando vuelva el contador con el .crt)

### Paso 10. Guardar el .crt de producción

Guardalo en la misma carpeta segura, con nombre claro:

```
C:\Kiku\Certificados\kikusushi-prod.crt
```

### Paso 11. Cambiar los secrets a producción

```bash
supabase secrets set ARCA_AMBIENTE=produccion
supabase secrets set ARCA_CERT="$(cat /c/Kiku/Certificados/kikusushi-prod.crt)"
# La key se queda igual (usás la misma para homo y prod)

# Limpiar el cache de token homo
# (desde SQL Editor de Supabase ejecutar:  delete from public.arca_tokens; )
```

### Paso 12. Cambiar el ambiente en `facturacion_config`

SQL Editor de Supabase:

```sql
update public.facturacion_config
set ambiente = 'produccion'
where id = (select id from public.facturacion_config order by created_at limit 1);
```

### Paso 13. Re-deploy de la Edge Function

```bash
supabase functions deploy arca-comprobantes
```

### Paso 14. Smoke test en producción

Mismo flujo del Paso 8 pero con un pedido **real** chico ($100–$500). Si sale OK, **ese comprobante es real** y queda asentado en AFIP. Verificalo en "Comprobantes en Línea" (modo producción esta vez).

### Paso 15. Listo

A partir de ahí, todos los comprobantes que emitan desde Caja:
- Quedan registrados en tu Supabase (`comprobantes_fiscales`)
- Aparecen automáticamente en el **Libro IVA Digital** de ARCA
- Aparecen en "Comprobantes en Línea"
- No hace falta subir reportes 8010/8011 (eso era del controlador fiscal viejo)

---

## Si algo no anda — Mini troubleshooting

| Lo que ves | Qué probar |
|---|---|
| Pill "ARCA WSFE" rojo | Refrescar Caja. Si sigue, revisar que `VITE_ARCA_API_URL` esté en `.env` y haber reiniciado el dev server |
| Error `cms.bad` | Cert/key no coinciden. Revisar que el `.crt` y la `.key` sean del mismo par |
| Error `cms.sign.notfound` | Falta autorizar el cert al servicio `wsfe` en el portal ARCA |
| Error 401 al postear | La sesión del usuario expiró. Cerrá sesión y volvé a entrar |
| Error 10016 "no correlativo" | Ejecutar en SQL Editor: `delete from public.arca_tokens;` y reintentar |
| Otro código de error de ARCA | Ejecutar en SQL Editor: `select * from public.arca_request_log order by created_at desc limit 5;` y pasarme el resultado |

---

## Lo que vas a poder hacer cuando termine

- **Factura B**: 1 click, sale impresa, con bloque de Transparencia Fiscal (Ley 27.743) e IVA Contenido.
- **Factura A**: modal pide CUIT del receptor + razón social, se valida CUIT con dígito verificador, y sale con desglose Neto+IVA+Total.
- **Nota de Crédito**: botón rojo sobre cualquier factura ya emitida, anula total o parcial, queda asociada al original.
- **Reimprimir ticket**: botón azul cuando el pedido ya está facturado.
- **Audit log**: cada llamada a WSAA / WSFE queda en `arca_request_log` con request, response y tiempos.
