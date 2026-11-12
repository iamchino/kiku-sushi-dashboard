import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs'
import { execFileSync } from 'node:child_process'
export const BASE = 'http://127.0.0.1:4180'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
export const USERS = {
  admin:    { id: '00000000-0000-0000-0000-0000000000a1', email: 'admin@kiku.test', role: 'admin' },
  finanzas: { id: '00000000-0000-0000-0000-0000000000f1', email: 'finanzas@kiku.test', role: 'finanzas' },
  mozo:     { id: '00000000-0000-0000-0000-0000000000b1', email: 'mozo@kiku.test', role: 'mozo' },
  // Rol creado desde Permisos (seed-cashflow.sql): ve Finanzas, no edita.
  administracion: { id: '00000000-0000-0000-0000-0000000000d1', email: 'administracion@kiku.test', role: 'administracion' },
}
export function sesion(u) {
  const exp = Math.floor(Date.now() / 1000) + 86400
  const payload = { sub: u.id, role: 'authenticated', aud: 'authenticated', exp, aal: 'aal2', amr: [{ method: 'totp', timestamp: exp - 86400 }], app_metadata: { role: u.role }, email: u.email }
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`
  return { access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp,
    user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: payload.app_metadata, user_metadata: {}, factors: [], created_at: '2026-01-01T00:00:00Z' } }
}
export async function abrir(rol, { viewport = { width: 1360, height: 900 }, tema = 'dark' } = {}) {
  const browser = await chromium.launch()
  // Con el permiso de notificaciones dado no aparece el cartel naranja de "bloqueadas".
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, permissions: ['notifications'] })
  const s = sesion(USERS[rol])
  await ctx.addInitScript(([ses, t]) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify(ses))
    localStorage.setItem('kiku-theme', t); localStorage.setItem('kiku-dashboard-theme', t)
    window.print = () => { window.__prints = (window.__prints || 0) + 1 }
  }, [s, tema])
  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', e => errores.push('PAGEERROR ' + e.message))
  page.on('console', m => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION|Failed to load resource/.test(m.text())) errores.push('CONSOLE ' + m.text().slice(0, 300)) })
  return { browser, ctx, page, errores }
}
export function sql(q, db = 'kkui') {
  return execFileSync('psql', ['-h', '/var/tmp/pgtest', '-p', '5499', '-U', 'postgres', '-d', db, '-At', '-c', q], { encoding: 'utf8' }).trim()
}
let fallas = 0
export function check(nombre, cond, extra = '') {
  if (cond) console.log(`  ✓ ${nombre}`)
  else { fallas++; console.log(`  ✗ ${nombre} ${extra}`) }
}
export function resumen() { console.log(fallas ? `\n✗ ${fallas} fallas` : '\n✓ todo OK'); return fallas }
