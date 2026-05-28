# arca-comprobantes

Edge Function que recibe un payload de facturación desde el dashboard, autentica
contra WSAA de ARCA (firma CMS con `node-forge`), pide el CAE a WSFE y guarda
el comprobante en Supabase.

## Variables / Secretos requeridos

| Nombre | Origen | Notas |
|---|---|---|
| `SUPABASE_URL` | inyectado | Automático en Edge Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | inyectado | Automático en Edge Functions |
| `ARCA_CUIT` | `supabase secrets set` | CUIT sin guiones (ej. `20XXXXXXXXX`) |
| `ARCA_CERT` | `supabase secrets set` | PEM del .crt — multi-línea |
| `ARCA_KEY` | `supabase secrets set` | PEM de la .key — multi-línea, sin passphrase |
| `ARCA_AMBIENTE` | `supabase secrets set` | `homologacion` o `produccion` |

## Despliegue

```bash
supabase functions deploy arca-comprobantes
```

## Test rápido (homologación)

```bash
curl -X POST https://<proyecto>.supabase.co/functions/v1/arca-comprobantes \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d @sample-payload.json
```

## Logs

Cada llamada a WSAA / WSFE queda en `public.arca_request_log` (ver migración
`20260527000000_facturacion_extendida.sql`).
