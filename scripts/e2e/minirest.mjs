// Mini PostgREST + GoTrue de juguete, respaldado por el Postgres local.
// Cada request corre como `authenticated` con los claims del JWT que manda el
// navegador (sin verificar firma: es solo para tests), así que el RLS, los
// triggers y los checks son los reales.
//
//   node minirest.mjs <puerto> <db>
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const [,, PORT = '54321', DB = 'kk54'] = process.argv
const PSQL = ['-h', '/var/tmp/pgtest', '-p', '5499', '-U', 'postgres', '-d', DB, '-At', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-']
const log = []
export const requests = log

const q = (v) => {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}
const ident = (s) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) throw new Error(`identificador raro: ${s}`)
  return `"${s}"`
}

function claimsDe(req) {
  const auth = req.headers.authorization || ''
  const tok = auth.replace(/^Bearer\s+/i, '')
  try {
    const payload = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString())
    if (payload.sub) return payload
  } catch { /* anon */ }
  return null
}

function correr(sqlJson, claims) {
  const rol = claims ? 'authenticated' : 'anon'
  const pre = claims ? `
\\o /dev/null
select set_config('request.jwt.claim.sub', ${q(claims.sub)}, true),
       set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claims', ${q(JSON.stringify(claims))}, true);
\\o
` : ''
  const script = `begin;\n${pre}set local role ${rol};\n${sqlJson};\ncommit;\n`
  try {
    const out = execFileSync('psql', PSQL, { input: script, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    return { ok: true, out: out.trim() }
  } catch (e) {
    const err = String(e.stderr || e.message)
    const message = (err.match(/ERROR:\s+(.*)/) || [])[1] || err
    const hint = (err.match(/HINT:\s+(.*)/) || [])[1] || null
    const details = (err.match(/DETAIL:\s+(.*)/) || [])[1] || null
    let code = 'P0001'
    if (/row-level security/.test(message)) code = '42501'
    else if (/permission denied/.test(message)) code = '42501'
    else if (/violates check constraint/.test(message)) code = '23514'
    else if (/violates foreign key/.test(message)) code = '23503'
    else if (/duplicate key/.test(message)) code = '23505'
    else if (/does not exist/.test(message)) code = /column/.test(message) ? '42703' : /function/.test(message) ? '42883' : '42P01'
    return { ok: false, error: { code, message, details, hint } }
  }
}

function filtros(params) {
  const conds = []
  for (const [k, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue
    if (k === 'or' || k === 'and') continue        // no soportado: se ignora
    if (k.includes('.')) continue                  // filtros sobre embebidos
    let v = raw, neg = ''
    if (v.startsWith('not.')) { neg = 'not '; v = v.slice(4) }
    const i = v.indexOf('.')
    const op = v.slice(0, i), val = v.slice(i + 1)
    const col = ident(k)
    if (op === 'eq') conds.push(`${neg}(${col} = ${q(val)})`)
    else if (op === 'neq') conds.push(`${neg}(${col} <> ${q(val)})`)
    else if (op === 'gte') conds.push(`${neg}(${col} >= ${q(val)})`)
    else if (op === 'lte') conds.push(`${neg}(${col} <= ${q(val)})`)
    else if (op === 'gt') conds.push(`${neg}(${col} > ${q(val)})`)
    else if (op === 'lt') conds.push(`${neg}(${col} < ${q(val)})`)
    else if (op === 'is') conds.push(`${neg}(${col} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'})`)
    else if (op === 'in') {
      const items = val.replace(/^\(|\)$/g, '').split(',').filter(Boolean).map(s => q(s.replace(/^"|"$/g, '')))
      conds.push(items.length ? `${neg}(${col} in (${items.join(',')}))` : (neg ? 'true' : 'false'))
    }
    else if (op === 'ilike' || op === 'like') conds.push(`${neg}(${col}::text ${op} ${q(val.replace(/\*/g, '%'))})`)
    else throw new Error(`operador no soportado: ${k}=${raw}`)
  }
  return conds.length ? `where ${conds.join(' and ')}` : ''
}

function orden(params) {
  const o = params.get('order')
  if (!o) return ''
  const partes = o.split(',').filter(p => !p.includes('(')).map(p => {
    const [col, ...mods] = p.split('.')
    return `${ident(col)} ${mods.includes('desc') ? 'desc' : 'asc'}${mods.includes('nullsfirst') ? ' nulls first' : mods.includes('nullslast') ? ' nulls last' : ''}`
  })
  return partes.length ? `order by ${partes.join(', ')}` : ''
}

// Embebidos que el front pide (select=…,tabla(…)). Se arman a mano.
const EMBEBIDOS = {
  pedidos: (sel) => [
    /pedido_items\(/.test(sel) && `(select coalesce(json_agg(pi), '[]'::json) from public.pedido_items pi where pi.pedido_id = t.id) as pedido_items`,
    /comprobantes_fiscales\(/.test(sel) && `(select coalesce(json_agg(c), '[]'::json) from public.comprobantes_fiscales c where c.pedido_id = t.id) as comprobantes_fiscales`,
    /pagos\(/.test(sel) && `(select coalesce(json_agg(json_build_object('id', pg.id, 'medio_pago', pg.medio_pago, 'monto', pg.monto, 'numero_operacion', pg.numero_operacion, 'notas', pg.notas, 'created_at', pg.created_at)), '[]'::json) from public.pagos pg where pg.pedido_id = t.id) as pagos`,
  ].filter(Boolean),
  cuenta_corriente_movimientos: (sel) => [
    /cuenta:cuentas_corrientes\(/.test(sel) && `(select json_build_object('nombre', cc.nombre) from public.cuentas_corrientes cc where cc.id = t.cuenta_id) as cuenta`,
  ].filter(Boolean),
}

function manejarRest(req, url, bodyTxt) {
  const claims = claimsDe(req)
  const path = decodeURIComponent(url.pathname.split('/rest/v1/')[1] || '')
  const params = url.searchParams
  const prefer = req.headers.prefer || ''
  const accept = req.headers.accept || ''
  const body = bodyTxt ? JSON.parse(bodyTxt) : null

  if (path.startsWith('rpc/')) {
    const fn = ident(path.slice(4))
    const args = Object.entries(body || {}).map(([k, v]) => `${ident(k)} => ${q(v)}`).join(', ')
    const meta = correr(`select coalesce(bool_or(proretset), false)::text || '|' || coalesce(max(prorettype::regtype::text), '') from pg_proc where proname = ${q(path.slice(4))} and pronamespace = 'public'::regnamespace`, null)
    const [retset, rettype] = (meta.out || '|').split('|')
    if (!rettype) return { status: 404, json: { code: 'PGRST202', message: `Could not find the function public.${path.slice(4)} in the schema cache` } }
    const sql = retset === 'true'
      ? `select coalesce(json_agg(r), '[]'::json) from public.${fn}(${args}) r`
      : `select to_json(public.${fn}(${args}))`
    const r = correr(sql, claims)
    if (!r.ok) return { status: 400, json: r.error }
    return { status: 200, text: r.out === '' ? 'null' : r.out }
  }

  const tabla = ident(path)
  const existe = correr(`select to_regclass('public.${path}') is not null`, null)
  if (existe.out !== 't') return { status: 404, json: { code: 'PGRST205', message: `Could not find the table 'public.${path}' in the schema cache` } }

  let sql
  const quiereFilas = /return=representation/.test(prefer) || params.has('select')
  if (req.method === 'GET' || req.method === 'HEAD') {
    const extra = (EMBEBIDOS[path]?.(params.get('select') || '') || [])
    const lim = params.get('limit') ? `limit ${Number(params.get('limit'))}` : ''
    sql = `select coalesce(json_agg(x), '[]'::json) from (select t.*${extra.length ? ', ' + extra.join(', ') : ''} from public.${tabla} t ${filtros(params)} ${orden(params)} ${lim}) x`
  } else if (req.method === 'POST') {
    const filas = Array.isArray(body) ? body : [body]
    const cols = [...new Set(filas.flatMap(f => Object.keys(f)))]
    const values = filas.map(f => `(${cols.map(c => (c in f ? q(f[c]) : 'DEFAULT')).join(', ')})`).join(', ')
    sql = `with ins as (insert into public.${tabla} (${cols.map(ident).join(', ')}) values ${values} returning *) select coalesce(json_agg(ins), '[]'::json) from ins`
  } else if (req.method === 'PATCH') {
    const sets = Object.entries(body).map(([k, v]) => `${ident(k)} = ${q(v)}`).join(', ')
    sql = `with upd as (update public.${tabla} set ${sets} ${filtros(params)} returning *) select coalesce(json_agg(upd), '[]'::json) from upd`
  } else if (req.method === 'DELETE') {
    sql = `with del as (delete from public.${tabla} ${filtros(params)} returning *) select coalesce(json_agg(del), '[]'::json) from del`
  } else {
    return { status: 405, json: { message: 'método no soportado' } }
  }

  const r = correr(sql, claims)
  if (!r.ok) return { status: r.error.code === '42501' ? 403 : r.error.code === '23505' ? 409 : 400, json: r.error }
  const filas = JSON.parse(r.out || '[]')
  if (/vnd\.pgrst\.object/.test(accept)) {
    if (filas.length !== 1) return { status: 406, json: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${filas.length} rows` } }
    return { status: 200, json: filas[0] }
  }
  if (req.method !== 'GET' && !quiereFilas) return { status: req.method === 'POST' ? 201 : 204, text: '' }
  return { status: req.method === 'POST' ? 201 : 200, json: filas, count: filas.length }
}

http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS,HEAD',
    'Access-Control-Expose-Headers': 'Content-Range',
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return }
  let bodyTxt = ''
  req.on('data', c => { bodyTxt += c })
  req.on('end', () => {
    const url = new URL(req.url, 'http://x')
    try {
      if (url.pathname.startsWith('/auth/v1/')) {
        const claims = claimsDe(req)
        const user = claims
          ? { id: claims.sub, aud: 'authenticated', role: 'authenticated', email: claims.email, app_metadata: claims.app_metadata, user_metadata: {}, factors: [], created_at: '2026-01-01T00:00:00Z' }
          : {}
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(user)); return
      }
      // ARCA de juguete: autoriza todo y guarda el comprobante (como el backend nuevo).
      if (url.pathname.startsWith('/functions/v1/arca-comprobantes')) {
        const p = JSON.parse(bodyTxt)
        fs.appendFileSync('arca.log', bodyTxt + '\n')
        const script = `insert into public.comprobantes_fiscales
          (pedido_id, estado, letra, tipo_cbte, punto_venta, numero, fecha_emision, concepto, doc_tipo, doc_nro,
           receptor_nombre, receptor_condicion_iva, receptor_domicilio, importe_neto, importe_iva, importe_total, moneda, cotizacion, cae, cae_vto)
          values (${q(p.pedido_id)}, 'autorizado', ${q(p.letra)}, ${q(p.tipo_cbte)}, ${q(p.punto_venta)},
            (select coalesce(max(numero), 0) + 1 from public.comprobantes_fiscales where tipo_cbte = ${q(p.tipo_cbte)}),
            ${q(p.fecha_emision)}, ${q(p.concepto)}, ${q(p.receptor.doc_tipo)}, ${q(p.receptor.doc_nro)},
            ${q(p.receptor.nombre)}, ${q(p.receptor.condicion_iva)}, ${q(p.receptor.domicilio || null)},
            ${q(p.importes.importeNeto)}, ${q(p.importes.importeIva)}, ${q(p.importes.importeTotal)}, 'PES', 1, '76000000000001', current_date + 10)
          returning to_json(comprobantes_fiscales.*);`
        const out = execFileSync('psql', PSQL, { input: script, encoding: 'utf8' }).trim()
        console.log(`ARCA tipo_cbte=${p.tipo_cbte} doc=${p.receptor.doc_tipo}:${p.receptor.doc_nro} ${p.receptor.nombre} total=${p.importes.importeTotal}`)
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify({ comprobante: JSON.parse(out) })); return
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        const r = manejarRest(req, url, bodyTxt)
        if (req.method !== 'GET' || r.status >= 400) {
          console.log(`${req.method} ${url.pathname.replace('/rest/v1/', '')}${url.search ? '?' + decodeURIComponent(url.search.slice(1)).slice(0, 110) : ''} → ${r.status}${r.status >= 400 ? ' ' + JSON.stringify(r.json) : ''}${bodyTxt && req.method !== 'GET' ? '  BODY ' + bodyTxt.slice(0, 400) : ''}`)
        }
        const headers = { ...cors, 'Content-Type': 'application/json' }
        if (r.count !== undefined) headers['Content-Range'] = `0-${Math.max(0, r.count - 1)}/${r.count}`
        res.writeHead(r.status, headers)
        res.end(r.text !== undefined ? r.text : JSON.stringify(r.json))
        return
      }
      res.writeHead(404, cors); res.end('{}')
    } catch (e) {
      console.log('EMULADOR ERROR', req.method, req.url, e.message)
      res.writeHead(500, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: e.message }))
    }
  })
}).listen(Number(PORT), '127.0.0.1', () => console.log(`minirest en :${PORT} → db ${DB}`))
