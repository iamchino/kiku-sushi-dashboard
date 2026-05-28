# Setup de facturación electrónica ARCA (ex-AFIP)

Guía completa para dejar al dashboard emitiendo Factura B / A y Notas de Crédito contra ARCA WSFE, primero en **homologación** y luego pasando a **producción**.

> ARCA es el nombre nuevo de AFIP (cambio de marca 2024). Los endpoints técnicos siguen usando `afip.gov.ar`; sólo el portal y el QR del comprobante usan `arca.gob.ar`.

---

## 1. Resumen del flujo

```
┌─────────────┐   POST /comprobantes    ┌──────────────────────────┐
│   Dashboard │ ─────────────────────▶ │ Supabase Edge Function   │
│  (Caja)     │   (JWT del usuario)    │  arca-comprobantes       │
└─────────────┘                        └──────────┬───────────────┘
                                                  │ 1) WSAA  (firma CMS con .key + .crt)
                                                  │ 2) WSFE  FECAESolicitar
                                                  ▼
                                         ┌──────────────────┐
                                         │   ARCA / AFIP    │
                                         │   WSAA + WSFE    │
                                         └──────────────────┘
```

El cert + key **nunca llegan al navegador**. Quedan en Supabase Secrets, leídos sólo por la Edge Function.

---

## 2. Pre-requisitos

- CUIT habilitado con Clave Fiscal nivel 3 o superior.
- Estar inscripto en IVA (Responsable Inscripto) o Monotributo según corresponda.
- `openssl` instalado (viene en Git Bash en Windows, o WSL).

---

## 3. Generar el certificado de **homologación**

> En homologación se usan certificados generados desde el portal de testing: `https://wsass-homo.afip.gov.ar/` (sí, doble "s"). En producción se usa el portal real de AFIP.

### 3.1 Crear key privada y CSR (Certificate Signing Request)

Desde una terminal, en una carpeta segura **fuera del repo**:

```bash
# 1) Clave privada (2048 bits, sin passphrase para que la Edge Function la pueda leer)
openssl genrsa -out kikusushi.key 2048

# 2) CSR — reemplazar CUIT y razón social
openssl req -new -key kikusushi.key \
  -subj "/C=AR/O=KIKU SUSHI/CN=kikusushi/serialNumber=CUIT 20XXXXXXXXX" \
  -out kikusushi.csr
```

Importante:
- `CN` = alias del certificado (algo corto sin espacios, ej. `kikusushi`).
- `serialNumber` = `CUIT ` + tu CUIT sin guiones.
- **No** uses passphrase: la Edge Function necesita la key en claro.

### 3.2 Subir el CSR a ARCA (homologación)

1. Ir a https://wsass-homo.afip.gov.ar/ e ingresar con Clave Fiscal.
2. **Crear Certificado de Testing** → pegar el contenido de `kikusushi.csr`.
3. Descargar el `.crt` que devuelve. Guardar como `kikusushi.crt`.

### 3.3 Autorizar el certificado al servicio WSFE

Misma sesión en wsass-homo:
1. **Crear Autorización de Servicio Web** → seleccionar el certificado recién creado.
2. Servicio: `wsfe` (Facturación Electrónica).
3. Representado: tu CUIT.
4. Confirmar.

A partir de ahora ese cert puede pedir tokens contra WSAA-homo para llamar a WSFE-homo.

---

## 4. Cargar los secretos en Supabase

Desde la raíz del repo, con la [Supabase CLI](https://supabase.com/docs/guides/cli) ya logueada y linkeada al proyecto:

```bash
# Volcar el contenido de los archivos a secretos (Linux/macOS/WSL)
supabase secrets set ARCA_CUIT=20XXXXXXXXX
supabase secrets set ARCA_AMBIENTE=homologacion
supabase secrets set ARCA_CERT="$(cat /ruta/segura/kikusushi.crt)"
supabase secrets set ARCA_KEY="$(cat /ruta/segura/kikusushi.key)"
```

En **PowerShell** (Windows) usar `Get-Content -Raw`:

```powershell
supabase secrets set ARCA_CERT="$(Get-Content -Raw C:\ruta\segura\kikusushi.crt)"
supabase secrets set ARCA_KEY="$(Get-Content -Raw C:\ruta\segura\kikusushi.key)"
```

Verificar:

```bash
supabase secrets list
```

Tienen que aparecer `ARCA_CUIT`, `ARCA_AMBIENTE`, `ARCA_CERT`, `ARCA_KEY`.

---

## 5. Configurar el punto de venta y datos fiscales

En el SQL Editor de Supabase, completar el registro de `facturacion_config`:

```sql
update public.facturacion_config
set
  razon_social = 'KIKU SUSHI SRL',         -- como figura en ARCA
  nombre_fantasia = 'Kiku Sushi',
  cuit = '20XXXXXXXXX',
  condicion_iva = 'Responsable Inscripto',
  domicilio = 'Calle 123, Ciudad',
  ingresos_brutos = 'XXX-XXXXXX-X',
  inicio_actividades = '2024-01-01',
  punto_venta = 1,                          -- el habilitado en ARCA para WSFE
  ambiente = 'homologacion',
  alicuota_iva = 21
where id = (select id from public.facturacion_config order by created_at limit 1);
```

> El **punto de venta** tiene que estar dado de alta en ARCA como tipo "Web Services". En homologación se usa típicamente el 1.

---

## 6. Desplegar la Edge Function

```bash
supabase functions deploy arca-comprobantes --no-verify-jwt=false
```

Y en el `.env` del front:

```env
VITE_ARCA_API_URL=https://<tu-proyecto>.supabase.co/functions/v1
```

El hook `useFacturacion` arma automáticamente `VITE_ARCA_API_URL + /arca-comprobantes`.

---

## 7. Probar una Factura B en homologación

1. Abrir el dashboard → Caja.
2. El pill "ARCA WSFE" tiene que estar en verde con el número de punto de venta.
3. Crear un pedido cualquiera, total bajo (ej. $1000).
4. Click en **Facturar + ticket**.
5. Si todo va bien, devuelve CAE + número y queda guardado en `comprobantes_fiscales`.

### CUITs de prueba para Factura A (homologación)

ARCA exige que el receptor de una Factura A exista en su padrón. Para testing podés usar el CUIT del propio comercio como receptor, o cualquier CUIT real existente. Documentación: https://www.afip.gob.ar/ws/

---

## 8. Pasar a producción

1. Generar **nuevo** certificado desde el portal real (no wsass-homo) con la misma clave o una nueva.
2. Autorizar al servicio `wsfe` en producción.
3. Pedir alta del **punto de venta de producción** (tipo Web Services).
4. Actualizar secretos:
   ```bash
   supabase secrets set ARCA_AMBIENTE=produccion
   supabase secrets set ARCA_CERT="$(cat /ruta/prod/kikusushi-prod.crt)"
   supabase secrets set ARCA_KEY="$(cat /ruta/prod/kikusushi-prod.key)"
   ```
5. Actualizar `facturacion_config.ambiente = 'produccion'` y `punto_venta`.
6. Redeploy: `supabase functions deploy arca-comprobantes`.

> **No mezclar**: el cert de homo no funciona en prod y viceversa. Si te equivocás de ambiente, WSAA devuelve `cms.bad`.

---

## 9. Troubleshooting

| Error | Causa | Solución |
|---|---|---|
| `cms.bad` en WSAA | Cert/key no coinciden o ambiente mezclado | Verificar `ARCA_AMBIENTE` y que el cert sea del portal correcto. |
| `cms.sign.notfound` | Falta autorización al servicio wsfe | Volver al portal y autorizar el cert al servicio `wsfe`. |
| `10015 Fecha del comprobante invalida` | Fecha fuera de rango (más de 10 días pasados/futuros) | Usar `current_date` o ±5 días. |
| `10016 CbteHasta` | Numero no correlativo | Llamar a `FECompUltimoAutorizado` y usar siguiente. La function ya lo hace. |
| `Token y/o Sign vencidos` | Token caché viejo | Borrar caché o reiniciar function. Tokens duran 12hs. |

---

## Referencias

- Manual del Desarrollador WSFE v1: https://www.afip.gob.ar/fe/documentos/manual_desarrollador_COMPG_v4_0.pdf
- Especificación WSAA: https://www.afip.gob.ar/ws/WSAA/WSAA.ObtenerCertificado.pdf
- Portal de testing: https://wsass-homo.afip.gov.ar/
- QR de comprobante: https://www.afip.gob.ar/fe/qr/especificaciones.asp
