# POC — Lector de Facturas con IA (Fase 0)

Objetivo: validar que **Qwen2-VL 7B** (modelo de visión open source) puede leer
las facturas reales de KIKU SUSHI con accuracy suficiente para automatizar la
actualización de precios de materia prima.

## Pre-requisitos (10 min)

1. **Node 18+** — chequear con `node --version`
2. **Cuenta en Replicate** (gratuita) → https://replicate.com/signup
3. **Cargar $5 USD** de crédito → https://replicate.com/account/billing
   (alcanza para ~500 facturas. Las 6 del POC cuestan ~$0.05)
4. **Generar API token** → https://replicate.com/account/api-tokens

## Pasos para correr el POC

### 1) Pegar las fotos

Copiá las 6 facturas que mandaste (o las que quieras) a:
```
poc/facturas/
├── 01_logistica_la_serenisima.jpg
├── 02_vera_noelia_pescaderia.jpg
├── 03_presupuesto_bolsas.jpg
├── 04_entrepreneur_panko.jpg
├── 05_flomar_vieyras.jpg
└── 06_distribuidora_tokyo.jpg
```

> Importante: los nombres deben coincidir con los del `ground-truth.json` para
> que el `--compare` funcione. Si renombrás, editá `ground-truth.json` también.

### 2) Probar con una factura

```bash
cd poc
REPLICATE_API_TOKEN=r8_TUTOKENACA node extract-invoice.mjs facturas/05_flomar_vieyras.jpg
```

Te tira un JSON con la extracción y la latencia.

### 3) Correr las 6 con comparación contra ground-truth

```bash
REPLICATE_API_TOKEN=r8_TUTOKENACA node extract-invoice.mjs --all --compare
```

Por cada factura vas a ver:

```
📊 Comparación vs ground-truth:
  Items esperados: 4
  Items extraídos: 4
  Recall (encontró ítems esperados): 1.00
  Precios correctos: 1.00
  Total coincide: ✅
```

## Cómo interpretar los resultados

| Métrica | Bueno | Regular | Malo |
|---|---|---|---|
| **Recall items** | ≥0.95 | 0.85-0.95 | <0.85 |
| **Precios correctos** | ≥0.95 | 0.85-0.95 | <0.85 |
| **Total coincide** | siempre ✅ excepto en doc #2 (a propósito) | a veces ❌ | siempre ❌ |

**Criterio de aprobación del POC:** promedio ≥ 0.85 en recall e precios. Si pasa,
arrancamos Fase 1. Si no, evaluamos:
- Cambiar a Pixtral 12B (~3x más caro pero mejor con docs complejos)
- Agregar OCR (PaddleOCR) como pre-procesamiento
- Pre-procesar imágenes (rotar, mejorar contraste)

## Estructura del POC

```
poc/
├── README.md              ← este archivo
├── system-prompt.md       ← prompt que se le manda al modelo (editable)
├── ground-truth.json      ← extracción manual de las 6 facturas (baseline)
├── extract-invoice.mjs    ← script Node que llama a Replicate
└── facturas/              ← acá pegás las fotos
```

## Tweaks que podemos hacer si los resultados no son ideales

1. **Editar `system-prompt.md`**: agregar ejemplos few-shot, ajustar el esquema.
2. **Cambiar modelo en `extract-invoice.mjs`**: la constante `MODEL` arriba del
   archivo. Alternativas en Replicate:
   - `lucataco/qwen2-vl-7b-instruct` (default, recomendado)
   - `cuuupid/pixtral-12b` (Mistral, más pesado, mejor en docs raros)
   - `mickeybeurskens/florence-2-large-ft` (sólo OCR pero muy preciso)
3. **Subir `max_new_tokens`** si trunca facturas largas.

## Próximos pasos (después del POC)

Si los resultados son OK:
- **Fase 1:** schema en Supabase + Edge Function `procesar-factura`
- **Fase 2:** UI de carga en el dashboard
- **Fase 3:** UI de revisión side-by-side (imagen + items extraídos)
- **Fase 4:** alertas de cambio de precio, auto-aprobación, history

## Costos esperados (Replicate)

| Modelo | $ por factura | 80 facturas/mes |
|---|---|---|
| Qwen2-VL 7B | ~$0.008 | **~$0.65/mes** |
| Pixtral 12B | ~$0.025 | ~$2/mes |
| Llama 3.2 Vision 90B | ~$0.04 | ~$3.20/mes |

Self-hosting solo se justifica a >500 facturas/mes.
