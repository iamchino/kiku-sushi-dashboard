// Headers CORS compartidos para todas las Edge Functions del proyecto.
//
// Hardening (01/11/2026): el origen permitido ya no es '*'. Se lee de la
// variable ALLOWED_ORIGINS (lista separada por comas, p. ej.
// "https://kiku-sushi-dashboard.vercel.app,http://localhost:5173"). Si el
// Origin de la request está en la lista se devuelve ese Origin (con
// Vary: Origin); si no está, se devuelve el primero de la lista y el
// navegador bloquea la respuesta. Sin la variable configurada se mantiene
// '*' y se avisa por log, para que el deploy no corte el dashboard.
//
// CORS no es el control de acceso (eso lo hace el JWT en cada función): es
// higiene para que una página ajena no pueda usar la sesión del usuario
// desde su navegador.
const ORIGENES = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (ORIGENES.length === 0) {
  console.warn('[cors] ALLOWED_ORIGINS no configurado: se responde Access-Control-Allow-Origin: *')
}

export function origenPermitido(req?: Request): string {
  if (ORIGENES.length === 0 || ORIGENES.includes('*')) return '*'
  const origin = req?.headers.get('origin') ?? ''
  return ORIGENES.includes(origin) ? origin : ORIGENES[0]
}

export function corsHeadersFor(req?: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origenPermitido(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

// Compatibilidad: las funciones viejas importan `corsHeaders` como objeto.
// Sin request a mano devuelve el primer origen permitido (o '*').
export const corsHeaders = corsHeadersFor()

/** Reescribe los headers CORS de una respuesta según el Origin de la request. */
export function conCors(resp: Response, req: Request): Response {
  const headers = new Headers(resp.headers)
  for (const [k, v] of Object.entries(corsHeadersFor(req))) headers.set(k, v)
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers })
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(message: string, status = 400, extra?: Record<string, unknown>): Response {
  return jsonResponse({ ok: false, error: message, ...extra }, status)
}
