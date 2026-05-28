# Despliegue del flujo ARCA — paso a paso

Guía operativa para dejar funcionando la facturación electrónica end-to-end.
Asume que ya leíste `ARCA_SETUP.md` y tenés el certificado y la clave.

## 0. Pre-flight check

- [ ] CUIT con Clave Fiscal nivel 3+
- [ ] Certificado y clave generados en `wsass-homo.afip.gov.ar` (homologación)
- [ ] Certificado autorizado al servicio `wsfe`
- [ ] Punto de venta tipo "Web Services" dado de alta en ARCA
- [ ] Supabase CLI instalada y autenticada (`supabase login`)
- [ ] Proyecto linkeado (`supabase link --project-ref <ref>`)

## 1. Aplicar las migraciones

```bash
# Desde la raíz del repo
supabase db push
```

Si preferís ejecutar manual en el SQL Editor:

1. `supabase/migrations/20260523000000_facturacion_impresion.sql` (si no corrió antes)
2. `supabase/migrations/20260527000000_facturacion_extendida.sql`

Verificá en el SQL Editor que existan las tablas:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'facturacion_config',
    'comprobantes_fiscales',
    'tipos_comprobante',
    'arca_tokens',
    'arca_request_log'
  );
-- Tienen que aparecer las 5
```

## 2. Cargar los secretos de ARCA

```bash
# Linux / macOS / WSL
supabase secrets set ARCA_CUIT=20XXXXXXXXX
supabase secrets set ARCA_AMBIENTE=homologacion
supabase secrets set ARCA_CERT="$(cat /ruta/segura/kikusushi.crt)"
supabase secrets set ARCA_KEY="$(cat /ruta/segura/kikusushi.key)"
```

PowerShell:

```powershell
supabase secrets set ARCA_CUIT=20XXXXXXXXX
supabase secrets set ARCA_AMBIENTE=homologacion
supabase secrets set ARCA_CERT=(Get-Content -Raw C:\segura\kikusushi.crt)
supabase secrets set ARCA_KEY=(Get-Content -Raw C:\segura\kikusushi.key)
```

Verificar:

```bash
supabase secrets list
# Deben aparecer ARCA_CUIT, ARCA_AMBIENTE, ARCA_CERT, ARCA_KEY
```

## 3. Completar `facturacion_config`

Desde el SQL Editor de Supabase:

```sql
update public.facturacion_config
set
  razon_social = 'KIKU SUSHI SRL',
  nombre_fantasia = 'Kiku Sushi',
  cuit = '20XXXXXXXXX',
  condicion_iva = 'Responsable Inscripto',
  domicilio = 'Av. Siempreviva 123, CABA',
  ingresos_brutos = 'XXX-XXXXXX-X',
  inicio_actividades = '2024-01-01',
  punto_venta = 1,
  ambiente = 'homologacion',
  alicuota_iva = 21,
  permite_factura_a = true   -- activar si vas a emitir Factura A
where id = (select id from public.facturacion_config order by created_at limit 1);
```

## 4. Desplegar la Edge Function

```bash
supabase functions deploy arca-comprobantes
```

Salida esperada:

```
Deployed Function arca-comprobantes to project <ref>
You can inspect your deployment in the Dashboard: https://supabase.com/...
```

## 5. Configurar el frontend

En tu `.env` (local) y/o en las env vars de Vercel:

```env
VITE_ARCA_API_URL=https://<tu-proyecto>.supabase.co/functions/v1
```

Reiniciar el dev server o redeployear Vercel.

## 6. Smoke test desde la UI

1. Loguearse en el dashboard.
2. Ir a **Caja**.
3. El pill "ARCA WSFE" tiene que estar verde con el número de PV.
4. Crear un pedido salón cualquiera, con ítems del menú, total bajo ($100-$1000).
5. Click en **Facturar + ticket** → se abre el modal.
6. Dejar "Factura B" y confirmar.
7. Si todo va bien: el banner verde dice "Comprobante emitido y enviado a impresión", el pill del pedido cambia a `B 00001-00000001` y se manda el ticket a la impresora.

## 7. Verificar en la base de datos

```sql
-- El comprobante quedó autorizado
select id, letra, tipo_cbte, punto_venta, numero, cae, cae_vto, estado, created_at
from public.comprobantes_fiscales
order by created_at desc
limit 5;

-- Log de la llamada a ARCA
select servicio, metodo, http_status, duracion_ms, error_mensaje, created_at
from public.arca_request_log
order by created_at desc
limit 10;

-- Token WSAA cacheado
select servicio, ambiente, expiration_time
from public.arca_tokens;
```

## 8. Verificar en el portal de ARCA

Entrar a `https://serviciosjava2.afip.gob.ar/cgpf-internet/jsp/SecurePage?ce=consulta_comprobantes`
(o desde Mis Comprobantes Emitidos en homologación) y confirmar que el número de
comprobante aparece como autorizado.

## 9. Probar Factura A

1. En la pantalla de Caja, en el modal de facturar elegir **Factura A**.
2. Cargar **CUIT** del receptor (cualquier CUIT real válido en homologación), razón social y condición IVA.
3. Confirmar.
4. Verificar que el ticket sale como FACTURA A y queda autorizado.

## 10. Probar Nota de Crédito

1. Sobre un pedido ya facturado, click en **Nota Crédito**.
2. Aparece el modal con el total original.
3. Confirmar (total completo para anular).
4. Verificar que se emite la NC asociada al comprobante original:

```sql
select c.letra, c.tipo_cbte, c.numero, asoc.numero as asociado_numero
from public.comprobantes_fiscales c
left join public.comprobantes_fiscales asoc on asoc.id = c.cbte_asociado_id
where c.tipo_cbte in (3, 8, 13)
order by c.created_at desc
limit 5;
```

## 11. Pasar a producción

Cuando esté todo verificado:

1. Generar nuevo certificado desde el portal de **producción** de ARCA (no wsass-homo).
2. Autorizar el certificado al servicio `wsfe` en el portal real.
3. Dar de alta el punto de venta de producción tipo "Web Services".
4. Actualizar secretos:
   ```bash
   supabase secrets set ARCA_AMBIENTE=produccion
   supabase secrets set ARCA_CERT="$(cat /ruta/prod/kikusushi-prod.crt)"
   supabase secrets set ARCA_KEY="$(cat /ruta/prod/kikusushi-prod.key)"
   ```
5. Actualizar `facturacion_config`:
   ```sql
   update public.facturacion_config
   set ambiente = 'produccion',
       punto_venta = <PV_PROD>
   where id = (select id from public.facturacion_config order by created_at limit 1);
   ```
6. Redeploy: `supabase functions deploy arca-comprobantes`.
7. Limpiar caché de token:
   ```sql
   delete from public.arca_tokens;
   ```
8. Smoke test con un pedido real chico.

## Troubleshooting express

| Síntoma | Dónde mirar | Acción |
|---|---|---|
| Pill "ARCA WSFE" rojo | `facturacion_config` | Verificar cuit + punto_venta |
| `WSAA falló: cms.bad` | `arca_request_log` | Cert/key no coinciden con ambiente |
| `WSAA falló: cms.sign.notfound` | Portal ARCA | Autorizar cert al servicio wsfe |
| `[10015] Fecha inválida` | Edge Function logs | Reloj del navegador desincronizado |
| `[10016] Numero no correlativo` | `arca_request_log` | Limpiar `arca_tokens` y reintentar |
| 401 en POST a la function | `supabase auth.getSession()` | Sesión expirada, re-login del usuario |

Para logs en vivo:

```bash
supabase functions logs arca-comprobantes --tail
```
