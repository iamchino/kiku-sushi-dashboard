#!/usr/bin/env node
/**
 * POC — Extracción de facturas con Qwen2-VL 7B via Replicate.
 *
 * Uso:
 *   REPLICATE_API_TOKEN=r8_xxx node extract-invoice.mjs poc/facturas/01_logistica.jpg
 *   REPLICATE_API_TOKEN=r8_xxx node extract-invoice.mjs --all   (procesa todas las de poc/facturas/)
 *
 * Output:
 *   - Imprime el JSON extraído por consola
 *   - Si pasás --compare y existe ground-truth.json, calcula precision/recall
 *
 * Requisitos:
 *   - Node 18+ (fetch nativo)
 *   - Cuenta en https://replicate.com con $1-2 de crédito (es más que suficiente)
 *   - Token: https://replicate.com/account/api-tokens
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FACTURAS_DIR = path.join(__dirname, 'facturas')
const GROUND_TRUTH_PATH = path.join(__dirname, 'ground-truth.json')
const SYSTEM_PROMPT_PATH = path.join(__dirname, 'system-prompt.md')

const TOKEN = process.env.REPLICATE_API_TOKEN
if (!TOKEN) {
  console.error('Falta REPLICATE_API_TOKEN en env. Sacalo en https://replicate.com/account/api-tokens')
  process.exit(1)
}

// Qwen2-VL 7B — actualizá la versión si Replicate la deprecó
const MODEL = 'lucataco/qwen2-vl-7b-instruct:bf57361c75677e1d68e1c47e8dbbcfd2ab43f234c0915e773b8e3a40b48c8159'

const SYSTEM_PROMPT = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf8')

function imageToDataUrl(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
  const buf = fs.readFileSync(filePath)
  return `data:${mime};base64,${buf.toString('base64')}`
}

async function runReplicate(imagePath) {
  const dataUrl = imageToDataUrl(imagePath)

  // 1) Crear predicción
  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait', // espera sincrónicamente hasta 60s
    },
    body: JSON.stringify({
      version: MODEL.split(':')[1],
      input: {
        image: dataUrl,
        prompt: `${SYSTEM_PROMPT}\n\nAhora extraé esta factura y devolvé solo el JSON.`,
        max_new_tokens: 2048,
        temperature: 0.1,
      },
    }),
  })

  if (!createRes.ok) {
    throw new Error(`Replicate ${createRes.status}: ${await createRes.text()}`)
  }
  const prediction = await createRes.json()

  // Si Prefer:wait no completó, pollear
  let result = prediction
  while (result.status === 'starting' || result.status === 'processing') {
    await new Promise(r => setTimeout(r, 1500))
    const pollRes = await fetch(result.urls.get, {
      headers: { 'Authorization': `Token ${TOKEN}` },
    })
    result = await pollRes.json()
  }

  if (result.status !== 'succeeded') {
    throw new Error(`Predicción falló: ${result.status} — ${JSON.stringify(result.error)}`)
  }

  // Replicate devuelve `output` como string o array de strings
  const raw = Array.isArray(result.output) ? result.output.join('') : String(result.output)
  return raw
}

function tryParseJSON(raw) {
  // Limpiar wrappers comunes del modelo
  let s = raw.trim()
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  // Intentar agarrar el primer { ... } balanceado
  const first = s.indexOf('{')
  const last  = s.lastIndexOf('}')
  if (first !== -1 && last !== -1) s = s.slice(first, last + 1)
  try {
    return { ok: true, data: JSON.parse(s) }
  } catch (e) {
    return { ok: false, error: e.message, raw: s }
  }
}

function compareItems(predicted, expected) {
  // Match por descripcion (Levenshtein simple sería ideal, usamos substring por ahora)
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const predItems = predicted.items || []
  const expItems  = expected.items || []
  let matchedItems = 0
  let priceMatches = 0

  for (const exp of expItems) {
    const expDesc = norm(exp.descripcion)
    const pred = predItems.find(p => {
      const pd = norm(p.descripcion)
      return pd.includes(expDesc.slice(0, 8)) || expDesc.includes(pd.slice(0, 8))
    })
    if (pred) {
      matchedItems++
      const priceDiff = Math.abs((pred.precio_unitario || 0) - exp.precio_unitario) / exp.precio_unitario
      if (priceDiff < 0.01) priceMatches++
    }
  }

  const totalMatch = expected.total != null && Math.abs((predicted.total || 0) - expected.total) / expected.total < 0.01

  return {
    expectedItems: expItems.length,
    predictedItems: predItems.length,
    itemRecall: expItems.length ? (matchedItems / expItems.length).toFixed(2) : 'n/a',
    priceAccuracy: matchedItems ? (priceMatches / matchedItems).toFixed(2) : 'n/a',
    totalMatch,
  }
}

async function processOne(imagePath, opts = {}) {
  const filename = path.basename(imagePath)
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`📄 ${filename}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

  const t0 = Date.now()
  let raw
  try {
    raw = await runReplicate(imagePath)
  } catch (e) {
    console.error(`❌ Error llamando al modelo: ${e.message}`)
    return null
  }
  const latency = ((Date.now() - t0) / 1000).toFixed(1)

  const parsed = tryParseJSON(raw)
  if (!parsed.ok) {
    console.error(`❌ El modelo no devolvió JSON parseable. Error: ${parsed.error}`)
    console.error(`Raw output:\n${raw}`)
    return null
  }

  console.log(`✅ Extracción (${latency}s):`)
  console.log(JSON.stringify(parsed.data, null, 2))

  if (opts.compare) {
    const gt = JSON.parse(fs.readFileSync(GROUND_TRUTH_PATH, 'utf8'))
    const expected = gt.facturas.find(f => f.archivo === filename)
    if (expected) {
      const cmp = compareItems(parsed.data, expected)
      console.log(`\n📊 Comparación vs ground-truth:`)
      console.log(`  Items esperados: ${cmp.expectedItems}`)
      console.log(`  Items extraídos: ${cmp.predictedItems}`)
      console.log(`  Recall (encontró ítems esperados): ${cmp.itemRecall}`)
      console.log(`  Precios correctos: ${cmp.priceAccuracy}`)
      console.log(`  Total coincide: ${cmp.totalMatch ? '✅' : '❌'}`)
    } else {
      console.log(`\n⚠️  No hay ground-truth para ${filename} — omitido el compare.`)
    }
  }

  return parsed.data
}

// ── Main ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const compare = args.includes('--compare')
const all = args.includes('--all')

if (all) {
  const files = fs.readdirSync(FACTURAS_DIR)
    .filter(f => /\.(jpe?g|png)$/i.test(f))
    .sort()
  if (files.length === 0) {
    console.log(`No hay imágenes en ${FACTURAS_DIR}. Pegá tus facturas ahí y reintentá.`)
    process.exit(0)
  }
  console.log(`Procesando ${files.length} facturas…`)
  for (const f of files) {
    await processOne(path.join(FACTURAS_DIR, f), { compare })
  }
} else {
  const target = args.find(a => !a.startsWith('--'))
  if (!target) {
    console.log('Uso: node extract-invoice.mjs <imagen> [--compare]')
    console.log('     node extract-invoice.mjs --all [--compare]')
    process.exit(1)
  }
  await processOne(target, { compare })
}
