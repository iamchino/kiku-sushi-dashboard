// Supabase Edge Function: arca-comprobantes
// Recibe un payload de facturación desde la app de Caja, autentica el usuario,
// pide CAE a ARCA WSFE (via WSAA) y guarda el comprobante en Supabase.
//
// Endpoint: POST /functions/v1/arca-comprobantes
// Headers : Authorization: Bearer <jwt del usuario>
// Body    : FiscalRequestPayload (ver types.ts)

import { createClient } from 'npm:@supabase/supabase-js@^2.45.4'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { getWsaaCredentials, type ArcaLogEntry } from './wsaa.ts'
import { feCaeSolicitar, feCompUltimoAutorizado } from './wsfe.ts'
import type { Ambiente, FiscalRequestPayload } from './types.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ARCA_CUIT = Deno.env.get('ARCA_CUIT') ?? ''
const ARCA_CERT = Deno.env.get('ARCA_CERT') ?? ''
const ARCA_KEY = Deno.env.get('ARCA_KEY') ?? ''
const ARCA_AMBIENTE = (Deno.env.get('ARCA_AMBIENTE') as Ambiente) ?? 'homologacion'

function validateConfig(): string | null {
  if (!SUPABASE_URL) return 'Falta SUPABASE_URL en el entorno.'
  if (!SERVICE_ROLE_KEY) return 'Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.'
  if (!ARCA_CUIT) return 'Falta ARCA_CUIT en Supabase Secrets.'
  if (!ARCA_CERT) return 'Falta ARCA_CERT en Supabase Secrets.'
  if (!ARCA_KEY) return 'Falta ARCA_KEY en Supabase Secrets.'
  if (!['homologacion', 'produccion'].includes(ARCA_AMBIENTE)) {
    return `ARCA_AMBIENTE debe ser homologacion o produccion (actual: ${ARCA_AMBIENTE}).`
  }
  return null
}

function validatePayload(payload: unknown): payload is FiscalRequestPayload {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>
  if (!p.pedido_id || typeof p.pedido_id !== 'string') return false
  if (!p.tipo_cbte || typeof p.tipo_cbte !== 'number') return false
  if (!p.punto_venta || typeof p.punto_venta !== 'number') return false
  if (!p.fecha_emision || typeof p.fecha_emision !== 'string') return false
  if (!p.importes || typeof p.importes !== 'object') return false
  if (!Array.isArray(p.items)) return false
  return true
}

/** Reconstruye el QR Url del comprobante según especificación de ARCA. */
function buildQrUrl(args: {
  cuit: string
  ptoVta: number
  tipoCbte: number
  numero: number
  fecha: string
  importeTotal: number
  moneda: string
  cotizacion: number
  docTipo: number
  docNro: string
  cae: string
}): string {
  const payload = {
    ver: 1,
    fecha: args.fecha.slice(0, 10),
    cuit: Number(args.cuit.replace(/\D/g, '')),
    ptoVta: args.ptoVta,
    tipoCmp: args.tipoCbte,
    nroCmp: args.numero,
    importe: Number(args.importeTotal),
    moneda: args.moneda || 'PES',
    ctz: Number(args.cotizacion || 1),
    tipoDocRec: args.docTipo,
    nroDocRec: Number(String(args.docNro || '0').replace(/\D/g, '')),
    tipoCodAut: 'E',
    codAut: Number(args.cae),
  }
  const base64 = btoa(JSON.stringify(payload))
  return `https://www.arca.gob.ar/fe/qr/?p=${encodeURIComponent(base64)}`
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('Método no permitido. Usar POST.', 405)
  }

  const configError = validateConfig()
  if (configError) {
    return errorResponse(configError, 500)
  }

  // Validar JWT del usuario
  const authHeader = req.headers.get('Authorization') || ''
  const userJwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) {
    return errorResponse('Falta header Authorization: Bearer <jwt>.', 401)
  }

  // Cliente con service_role para escribir comprobantes y leer tokens
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Verificar el JWT y obtener el usuario
  const { data: userResult, error: userError } = await supabaseAdmin.auth.getUser(userJwt)
  if (userError || !userResult?.user) {
    return errorResponse('Sesión inválida o expirada.', 401)
  }

  // Parsear body
  let payload: FiscalRequestPayload
  try {
    const body = await req.json()
    if (!validatePayload(body)) {
      return errorResponse('Payload inválido.', 400, { received: body })
    }
    payload = body
  } catch (err) {
    return errorResponse(`Body JSON inválido: ${(err as Error).message}`, 400)
  }

  // Cargar facturacion_config (usamos service_role para evitar problemas de RLS)
  const { data: config, error: configErr } = await supabaseAdmin
    .from('facturacion_config')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (configErr) {
    return errorResponse(`No se pudo leer facturacion_config: ${configErr.message}`, 500)
  }
  if (!config) {
    return errorResponse('No hay registro en facturacion_config. Configurar CUIT y punto de venta.', 412)
  }

  if (String(config.cuit).replace(/\D/g, '') !== ARCA_CUIT.replace(/\D/g, '')) {
    return errorResponse(
      `El CUIT en facturacion_config (${config.cuit}) no coincide con ARCA_CUIT del secreto (${ARCA_CUIT}).`,
      412,
    )
  }

  if ((config.ambiente as Ambiente) !== ARCA_AMBIENTE) {
    return errorResponse(
      `Ambiente desincronizado: config=${config.ambiente} vs secreto=${ARCA_AMBIENTE}.`,
      412,
    )
  }

  // Helper de logging a arca_request_log
  const arcaLog = async (entry: ArcaLogEntry) => {
    try {
      await supabaseAdmin.from('arca_request_log').insert({
        servicio: entry.servicio,
        metodo: entry.metodo,
        request_payload: entry.request_payload,
        response_payload: entry.response_payload,
        http_status: entry.http_status,
        duracion_ms: entry.duracion_ms,
        error_code: entry.error_code,
        error_mensaje: entry.error_mensaje,
        ambiente: entry.ambiente,
        comprobante_id: entry.comprobante_id ?? null,
      })
    } catch (_e) {
      // Logging best-effort, no rompe el flujo
    }
  }

  // 1) Obtener credenciales WSAA (cacheadas)
  let creds
  try {
    creds = await getWsaaCredentials({
      supabase: supabaseAdmin,
      ambiente: ARCA_AMBIENTE,
      cuit: ARCA_CUIT,
      certPem: ARCA_CERT,
      keyPem: ARCA_KEY,
      logArca: arcaLog,
    })
  } catch (err) {
    return errorResponse(`WSAA falló: ${(err as Error).message}`, 502)
  }

  // 2) Pedir último número autorizado para (tipo_cbte, punto_venta)
  let proximoNumero: number
  try {
    const ult = await feCompUltimoAutorizado({
      ambiente: ARCA_AMBIENTE,
      creds,
      cuit: ARCA_CUIT,
      puntoVenta: payload.punto_venta,
      tipoCbte: payload.tipo_cbte,
    })
    await arcaLog({
      servicio: 'wsfe',
      metodo: 'FECompUltimoAutorizado',
      request_payload: { ptoVta: payload.punto_venta, tipoCbte: payload.tipo_cbte },
      response_payload: ult.result,
      duracion_ms: ult.durationMs,
      ambiente: ARCA_AMBIENTE,
    })
    proximoNumero = ult.result.numero + 1
  } catch (err) {
    return errorResponse(`WSFE FECompUltimoAutorizado falló: ${(err as Error).message}`, 502)
  }

  // 3) Solicitar CAE
  let cae
  try {
    cae = await feCaeSolicitar({
      ambiente: ARCA_AMBIENTE,
      creds,
      cuit: ARCA_CUIT,
      payload,
      numero: proximoNumero,
      alicuotaRate: Number(config.alicuota_iva || 21),
    })

    await arcaLog({
      servicio: 'wsfe',
      metodo: 'FECAESolicitar',
      request_payload: {
        pedido_id: payload.pedido_id,
        tipo_cbte: payload.tipo_cbte,
        punto_venta: payload.punto_venta,
        numero: proximoNumero,
        importes: payload.importes,
      },
      response_payload: cae.result,
      duracion_ms: cae.durationMs,
      ambiente: ARCA_AMBIENTE,
      error_mensaje: cae.result.resultado === 'A' ? null : (cae.result.errores?.[0]?.Msg ?? null),
    })
  } catch (err) {
    return errorResponse(`WSFE FECAESolicitar falló: ${(err as Error).message}`, 502)
  }

  // 4) Persistir comprobante (autorizado o rechazado, lo dejamos como histórico)
  if (cae.result.resultado !== 'A' || !cae.result.cae) {
    // Guardar como rechazado para tener traza
    await supabaseAdmin.from('comprobantes_fiscales').insert({
      pedido_id: payload.pedido_id,
      estado: 'rechazado',
      letra: payload.letra,
      tipo_cbte: payload.tipo_cbte,
      punto_venta: payload.punto_venta,
      numero: cae.result.numero,
      fecha_emision: payload.fecha_emision,
      concepto: payload.concepto,
      doc_tipo: payload.receptor.doc_tipo,
      doc_nro: payload.receptor.doc_nro,
      receptor_nombre: payload.receptor.nombre,
      receptor_condicion_iva: payload.receptor.condicion_iva,
      receptor_domicilio: payload.receptor.domicilio || null,
      importe_neto: payload.importes.importeNeto,
      importe_iva: payload.importes.importeIva,
      importe_total: payload.importes.importeTotal,
      moneda: payload.moneda || 'PES',
      cotizacion: payload.cotizacion || 1,
      arca_request: payload,
      arca_response: cae.result,
      error_mensaje:
        cae.result.errores?.map(e => `[${e.Code}] ${e.Msg}`).join('; ') || 'ARCA rechazó el comprobante.',
    })

    return errorResponse(
      cae.result.errores?.map(e => `[${e.Code}] ${e.Msg}`).join('; ') || 'ARCA rechazó el comprobante.',
      422,
      {
        observaciones: cae.result.observaciones,
        errores: cae.result.errores,
      },
    )
  }

  // 5) Comprobante autorizado: construir QR y guardar
  const qrUrl = buildQrUrl({
    cuit: ARCA_CUIT,
    ptoVta: payload.punto_venta,
    tipoCbte: payload.tipo_cbte,
    numero: cae.result.numero,
    fecha: payload.fecha_emision,
    importeTotal: payload.importes.importeTotal,
    moneda: payload.moneda || 'PES',
    cotizacion: payload.cotizacion || 1,
    docTipo: payload.receptor.doc_tipo,
    docNro: payload.receptor.doc_nro || '0',
    cae: cae.result.cae,
  })

  const comprobanteRow = {
    pedido_id: payload.pedido_id,
    estado: 'autorizado',
    letra: payload.letra,
    tipo_cbte: payload.tipo_cbte,
    punto_venta: payload.punto_venta,
    numero: cae.result.numero,
    fecha_emision: payload.fecha_emision,
    concepto: payload.concepto,
    doc_tipo: payload.receptor.doc_tipo,
    doc_nro: payload.receptor.doc_nro,
    receptor_nombre: payload.receptor.nombre,
    receptor_condicion_iva: payload.receptor.condicion_iva,
    receptor_domicilio: payload.receptor.domicilio || null,
    importe_neto: payload.importes.importeNeto,
    importe_iva: payload.importes.importeIva,
    importe_total: payload.importes.importeTotal,
    moneda: payload.moneda || 'PES',
    cotizacion: payload.cotizacion || 1,
    cae: cae.result.cae,
    cae_vto: cae.result.cae_vto || null,
    qr_url: qrUrl,
    cbte_asociado_id: null as string | null,
    arca_request: payload,
    arca_response: cae.result,
    error_mensaje: null as string | null,
  }

  // Si vino un cbte asociado y existe en la BD, linkear el primero
  if (payload.cbtes_asociados && payload.cbtes_asociados.length > 0) {
    const asoc = payload.cbtes_asociados[0]
    const { data: asociado } = await supabaseAdmin
      .from('comprobantes_fiscales')
      .select('id')
      .eq('tipo_cbte', asoc.tipo_cbte)
      .eq('punto_venta', asoc.punto_venta)
      .eq('numero', asoc.numero)
      .maybeSingle()

    if (asociado?.id) {
      comprobanteRow.cbte_asociado_id = asociado.id
    }
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('comprobantes_fiscales')
    .insert(comprobanteRow)
    .select()
    .single()

  if (insertErr) {
    return errorResponse(
      `CAE obtenido pero falló el insert: ${insertErr.message}`,
      500,
      { comprobante: comprobanteRow },
    )
  }

  return jsonResponse({
    ok: true,
    comprobante: inserted,
    observaciones: cae.result.observaciones || [],
  })
})
