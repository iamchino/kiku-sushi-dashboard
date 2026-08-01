// ────────────────────────────────────────────────────────────────────────────
// Verifica que la lógica de permisos de la fase 2 (permisosCore, alimentada
// por la matriz de la base) dé EXACTAMENTE el mismo resultado que las reglas
// hardcodeadas que reemplaza.
//
// Cubre:
//   · acceso a cada ruta, rol por rol, contra canAccessRoute() + el guard viejo
//   · la ruta por defecto de cada rol
//   · qué roles caen en la pantalla mínima de fichaje
//   · el bypass por email de la cuenta histórica de Finanzas (que tiene rol
//     admin: si esto se rompe, pierde Finanzas y Personal en producción)
//   · el catálogo del fallback sincronizado con el seed
//   · el modo fallback, que tiene que reproducir las reglas viejas
//
// Uso:  node scripts/verificar-permisos-front.mjs
// ────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { canAccessRoute, canAccessFinanzas } from '../src/context/role.js'
import { construirPermisos, rutaPermitida, rutaPorDefecto, soloFichaje, puedeVer } from '../src/context/permisosCore.js'
import { CATALOGO_FALLBACK, permisosFallback, reglaLegacy } from '../src/context/permisosFallback.js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const seedCrudo = readFileSync(join(raiz, 'supabase/migrations/20260803010000_permisos_seed.sql'), 'utf8')
const seed = seedCrudo.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')

const ID = '[a-z][a-z0-9_]*'
const bloqueRecursos = seed.slice(seed.indexOf('insert into public.recursos'), seed.indexOf('insert into public.rol_permisos'))
const bloqueMatriz   = seed.slice(seed.indexOf('insert into public.rol_permisos'))

// Catálogo tal como queda en la base.
const recursosSeed = []
for (const m of bloqueRecursos.matchAll(
  new RegExp(`^\\s*\\('(${ID})',\\s*'([^']*)',\\s*'[^']*',\\s*(?:'([^']*)'|null),\\s*'([^']*)',\\s*(true|false),\\s*(\\d+)\\)`, 'gm')
)) {
  recursosSeed.push({ id: m[1], nombre: m[2], ruta: m[3] ?? null, grupo: m[4], sensible: m[5] === 'true', orden: Number(m[6]) })
}

const matriz = new Map()   // rol -> [{recurso_id, ver, editar}]
for (const m of bloqueMatriz.matchAll(new RegExp(`\\('(${ID})',\\s*'(${ID})'\\)`, 'g'))) {
  if (!matriz.has(m[1])) matriz.set(m[1], [])
  matriz.get(m[1]).push({ recurso_id: m[2], ver: true, editar: true })
}

const ROLES = ['admin', 'cocina', 'mozo', 'empleado', 'finanzas']
const usuario = (rol, email = `alguien@kikusushi.com`) => ({ email, app_metadata: { role: rol } })
const HISTORICO = { email: 'finanzas@kikusushi.com.ar', app_metadata: { role: 'admin' } }

let ok = 0
const fallas = []
const chequear = (nombre, real, esperado) => {
  if (JSON.stringify(real) === JSON.stringify(esperado)) ok++
  else fallas.push(`  ${nombre}\n      obtuve:   ${JSON.stringify(real)}\n      esperaba: ${JSON.stringify(esperado)}`)
}

const permisosDe = (rol, user) => construirPermisos({
  recursos: recursosSeed,
  filas: matriz.get(rol) ?? [],
  rol,
  accesoFinanzasPorEmail: canAccessFinanzas(user),
})

// ── 1. Acceso a cada ruta ───────────────────────────────────────────────────
for (const rol of ROLES) {
  const p = permisosDe(rol, usuario(rol))
  for (const r of recursosSeed) {
    if (!r.ruta) continue
    const esperado = canAccessRoute(rol, r.ruta) &&
      (r.ruta === '/finanzas' || r.ruta === '/personal' ? rol === 'finanzas' : true)
    chequear(`ruta ${r.ruta} para ${rol}`, rutaPermitida(p, r.ruta), esperado)
  }
}

// ── 2. Rutas por defecto: tienen que ser las mismas de siempre ──────────────
const DEFAULTS = { admin: '/', cocina: '/operaciones', mozo: '/mesas', empleado: '/fichar', finanzas: '/finanzas' }
for (const rol of ROLES) {
  chequear(`ruta por defecto de ${rol}`, rutaPorDefecto(permisosDe(rol, usuario(rol))), DEFAULTS[rol])
}

// ── 3. Pantalla mínima de fichaje: hoy solo el rol empleado ────────────────
for (const rol of ROLES) {
  chequear(`soloFichaje(${rol})`, soloFichaje(permisosDe(rol, usuario(rol))), rol === 'empleado')
}

// ── 4. Bypass por email de la cuenta histórica de Finanzas ─────────────────
// Tiene rol `admin`. Sin el bypass perdería Finanzas y Personal al pasar el
// menú a la matriz — sería una regresión directa en producción.
const pHistorico = permisosDe('admin', HISTORICO)
chequear('histórico ve finanzas', puedeVer(pHistorico, 'finanzas'), true)
chequear('histórico ve personal', puedeVer(pHistorico, 'personal'), true)
chequear('histórico ve permisos', puedeVer(pHistorico, 'permisos'), true)
chequear('histórico conserva caja (es admin)', puedeVer(pHistorico, 'caja'), true)

const pAdminComun = permisosDe('admin', usuario('admin'))
chequear('admin común NO ve finanzas', puedeVer(pAdminComun, 'finanzas'), false)
chequear('admin común NO ve personal', puedeVer(pAdminComun, 'personal'), false)

// ── 5. Catálogo del fallback sincronizado con el seed ──────────────────────
const clave = r => `${r.id}|${r.ruta}|${r.orden}|${r.grupo}`
chequear('catálogo del fallback == seed',
  CATALOGO_FALLBACK.map(clave).sort(),
  recursosSeed.map(clave).sort())

// ── 6. El modo fallback reproduce las reglas viejas ────────────────────────
for (const rol of ROLES) {
  const p = permisosFallback(rol, usuario(rol))
  for (const r of CATALOGO_FALLBACK) {
    chequear(`fallback ${rol} · ${r.id}`, puedeVer(p, r.id), reglaLegacy(rol, r, usuario(rol)))
  }
  chequear(`fallback: ruta por defecto de ${rol}`, rutaPorDefecto(p), DEFAULTS[rol])
}
chequear('fallback: histórico ve finanzas', puedeVer(permisosFallback('admin', HISTORICO), 'finanzas'), true)

// ── 7. Rutas sin recurso: se dejan pasar (las resuelve el router) ──────────
const pAdmin = permisosDe('admin', usuario('admin'))
chequear('/dashboard pasa (solo redirige)', rutaPermitida(pAdmin, '/dashboard'), true)
chequear('ruta inventada pasa al catch-all', rutaPermitida(pAdmin, '/no-existe'), true)

// ── 8. Toda ruta del router tiene su recurso ───────────────────────────────
// rutaPermitida() deja pasar las rutas que no mapean a ningún recurso (hace
// falta para /dashboard, que solo redirige). El riesgo es que agregar una
// pantalla nueva en App.jsx sin declarar su recurso la abra a todos los roles
// en silencio. Acá se detecta.
const SIN_RECURSO_ESPERADO = new Set(['/dashboard', '*'])
const appJsx = readFileSync(join(raiz, 'src/App.jsx'), 'utf8')
const rutasRouter = [...appJsx.matchAll(/<Route\s+path="([^"]+)"/g)].map(m => m[1])
const rutasCatalogo = new Set(recursosSeed.map(r => r.ruta).filter(Boolean))
const huerfanas = [...new Set(rutasRouter)]
  .filter(r => !SIN_RECURSO_ESPERADO.has(r) && !rutasCatalogo.has(r))
chequear('ninguna ruta del router quedó sin recurso', huerfanas, [])

// ── 9. Un rol nuevo sin permisos no rompe nada ─────────────────────────────
const pVacio = construirPermisos({ recursos: recursosSeed, filas: [], rol: 'cajero' })
chequear('rol sin permisos: ruta por defecto segura', rutaPorDefecto(pVacio), '/fichar')
chequear('rol sin permisos: no entra a caja', rutaPermitida(pVacio, '/caja'), false)
chequear('rol sin permisos: no cae en pantalla de fichaje', soloFichaje(pVacio), false)

console.log(`Recursos: ${recursosSeed.length} · Roles: ${ROLES.length} · Chequeos: ${ok + fallas.length}`)
if (fallas.length) {
  console.error(`\n✗ ${fallas.length} falla(s):\n${fallas.join('\n')}\n`)
  process.exit(1)
}
console.log('✓ La lógica de la fase 2 reproduce exactamente el comportamiento anterior.')
