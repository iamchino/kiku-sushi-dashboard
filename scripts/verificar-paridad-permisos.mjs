// ────────────────────────────────────────────────────────────────────────────
// Verifica que la matriz sembrada en 20260803010000_permisos_seed.sql
// coincida EXACTAMENTE con lo que hoy decide src/context/role.js.
//
// La fase 1 no debe cambiar el comportamiento de ningún rol. Este script es
// la prueba de eso: parsea el seed y lo compara, recurso por recurso y rol por
// rol, contra canAccessRoute() y el guard de /finanzas y /personal.
//
// Uso:  node scripts/verificar-paridad-permisos.mjs
// Sale con código 1 si encuentra cualquier diferencia.
// ────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { canAccessRoute } from '../src/context/role.js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const crudo = readFileSync(join(raiz, 'supabase/migrations/20260803010000_permisos_seed.sql'), 'utf8')

// Sacamos los comentarios ANTES de parsear. Si no, una fila comentada
// (`-- ('mozo', 'mesas'),`) se cuenta como otorgada y el script da el visto
// bueno mientras el permiso en realidad no existe.
const seed = crudo
  .split('\n')
  .map(l => l.replace(/--.*$/, ''))
  .join('\n')

function cortar(desde, hasta) {
  const i = seed.indexOf(desde)
  if (i === -1) throw new Error(`No encontré "${desde}" en el seed. ¿Cambió la estructura?`)
  const j = hasta ? seed.indexOf(hasta, i) : seed.length
  if (hasta && j === -1) throw new Error(`No encontré "${hasta}" en el seed.`)
  return seed.slice(i, j)
}

// ── Parseo del seed ─────────────────────────────────────────────────────────
// recursos: ('id', 'Nombre', 'desc', '/ruta' | null, 'Grupo', bool, N)
// Los ids admiten dígitos, igual que el CHECK de la tabla: con [a-z_] un
// recurso como 'arca_v2' quedaba invisible para la comparación.
const ID = '[a-z][a-z0-9_]*'
const bloqueRecursos = cortar('insert into public.recursos', 'insert into public.rol_permisos')
const recursos = new Map()
for (const m of bloqueRecursos.matchAll(
  new RegExp(`^\\s*\\('(${ID})',\\s*'[^']*',\\s*'[^']*',\\s*(?:'([^']*)'|null),`, 'gm')
)) {
  recursos.set(m[1], m[2] ?? null)   // id -> ruta (null si no tiene pantalla)
}
if (recursos.size === 0) throw new Error('No pude parsear ningún recurso del seed.')

// matriz: ('rol', 'recurso')
const bloqueMatriz = cortar('insert into public.rol_permisos')
const concedidos = new Set()
for (const m of bloqueMatriz.matchAll(new RegExp(`\\('(${ID})',\\s*'(${ID})'\\)`, 'g'))) {
  concedidos.add(`${m[1]}|${m[2]}`)
}
if (concedidos.size === 0) throw new Error('No pude parsear ninguna fila de la matriz.')

// El seed inserta `ver` y `editar` con literales. Si alguien los cambia, este
// script dejaría de reflejar la realidad, así que lo verificamos.
if (!/select\s+r\.rol_id,\s*r\.recurso_id,\s*true,\s*true/.test(bloqueMatriz)) {
  throw new Error(
    'La matriz ya no inserta (ver=true, editar=true) de forma literal. ' +
    'Actualizá este script para comparar los valores fila por fila.'
  )
}

// ── La regla vigente en el front ────────────────────────────────────────────
// canAccessRoute() más el guard de App.jsx, que exige acceso a Finanzas para
// /finanzas y /personal (por eso admin NO los tiene).
const FINANZAS_OK = new Set(['finanzas'])   // por rol; el email es aparte

// Recursos sin pantalla propia: no hay ruta contra la cual comparar, así que
// su regla se declara explícitamente acá. Se listan uno por uno a propósito —
// antes cualquier recurso con ruta null se asumía "solo finanzas", y agregar
// un segundo recurso sin ruta pasaba la verificación sin que nada lo respaldara.
const SIN_RUTA = {
  permisos: rol => rol === 'finanzas',   // vive dentro de Personal
}

function accesoHoy(rol, recurso, ruta) {
  if (ruta === null) {
    const regla = SIN_RUTA[recurso]
    if (!regla) {
      throw new Error(
        `El recurso "${recurso}" no tiene ruta y no está declarado en SIN_RUTA. ` +
        `Agregá su regla al script para que se pueda verificar.`
      )
    }
    return regla(rol)
  }
  if (!canAccessRoute(rol, ruta)) return false
  if (ruta === '/finanzas' || ruta === '/personal') return FINANZAS_OK.has(rol)
  return true
}

// ── Comparación ─────────────────────────────────────────────────────────────
const ROLES = ['admin', 'cocina', 'mozo', 'empleado', 'finanzas']
const fallas = []
let comparaciones = 0

for (const rol of ROLES) {
  for (const [recurso, ruta] of recursos) {
    const enSeed = concedidos.has(`${rol}|${recurso}`)
    const enFront = accesoHoy(rol, recurso, ruta)
    comparaciones++
    if (enSeed !== enFront) {
      fallas.push(
        `  ${rol.padEnd(9)} · ${recurso.padEnd(15)} (${ruta ?? '—'})  ` +
        `seed=${enSeed ? 'SÍ' : 'no'}  role.js=${enFront ? 'SÍ' : 'no'}`
      )
    }
  }
}

// Nadie debería quedar sin poder administrar permisos.
const admins = [...concedidos].filter(k => k.endsWith('|permisos'))
if (admins.length === 0) fallas.push('  Ningún rol tiene el recurso "permisos".')

// Todo recurso del seed tiene que existir en el catálogo.
for (const clave of concedidos) {
  const [rol, recurso] = clave.split('|')
  if (!recursos.has(recurso)) fallas.push(`  ${rol} referencia el recurso inexistente "${recurso}".`)
  if (!ROLES.includes(rol)) fallas.push(`  Rol desconocido en el seed: "${rol}".`)
}

console.log(`Recursos: ${recursos.size} · Roles: ${ROLES.length} · Comparaciones: ${comparaciones}`)
if (fallas.length) {
  console.error(`\n✗ ${fallas.length} diferencia(s) entre el seed y role.js:\n${fallas.join('\n')}\n`)
  process.exit(1)
}
console.log('✓ El seed reproduce exactamente el comportamiento actual de role.js.')
