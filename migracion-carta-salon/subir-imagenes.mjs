/**
 * Descarga las imágenes de la CARTA SALÓN (Cloudinary del sitio viejo)
 * y las sube al bucket "menu-images/carta/<slug>.jpg" de tu Supabase.
 *
 * Las rutas coinciden exactamente con las imagen_url del archivo
 * carta-salon.sql, así que el SQL y las imágenes quedan sincronizados.
 *
 * Uso:
 *   1) npm i  (en la raíz del proyecto, ya tenés @supabase/supabase-js)
 *   2) Conseguí la SERVICE ROLE key: Supabase → Project Settings → API → service_role
 *   3) Ejecutá (PowerShell):
 *        $env:SUPABASE_URL="https://sepyieuxsmxhzobtmzxb.supabase.co"
 *        $env:SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"
 *        node migracion-carta-salon/subir-imagenes.mjs
 *
 *   (en Mac/Linux usá:  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node ...)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sepyieuxsmxhzobtmzxb.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_KEY) {
  console.error('\n❌ Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  console.error('   Conseguila en Supabase → Project Settings → API → service_role key\n')
  process.exit(1)
}

const BUCKET = 'menu-images'
const PREFIX = 'carta'
const CONCURRENCY = 5

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

const productos = JSON.parse(readFileSync(join(__dirname, 'productos.json'), 'utf8'))
const conImagen = productos.filter(p => p.imagen_origen)

console.log(`\n📦 ${productos.length} productos · ${conImagen.length} con imagen para subir\n`)

let ok = 0, fail = 0, skip = productos.length - conImagen.length
const errores = []

async function subir(p) {
  // El destino siempre es .jpg (coincide con carta-salon.sql), aunque el
  // origen sea .png; se sube con content-type image/jpeg igual que en delivery.
  const destino = `${PREFIX}/${p.slug}.jpg`
  try {
    const res = await fetch(p.imagen_origen)
    if (!res.ok) throw new Error(`descarga HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(destino, buf, { contentType: 'image/jpeg', upsert: true })

    if (error) throw error
    ok++
    console.log(`  ✓ ${p.slug}.jpg`)
  } catch (e) {
    fail++
    errores.push(`${p.slug}: ${e.message}`)
    console.log(`  ✗ ${p.slug}.jpg  → ${e.message}`)
  }
}

// Procesar en lotes de CONCURRENCY
for (let i = 0; i < conImagen.length; i += CONCURRENCY) {
  await Promise.all(conImagen.slice(i, i + CONCURRENCY).map(subir))
}

console.log(`\n──────────────────────────────`)
console.log(`✓ Subidas: ${ok}   ✗ Fallidas: ${fail}   ⊘ Sin imagen: ${skip}`)
if (errores.length) {
  console.log('\nErrores:')
  errores.forEach(e => console.log('  - ' + e))
}
console.log('')
