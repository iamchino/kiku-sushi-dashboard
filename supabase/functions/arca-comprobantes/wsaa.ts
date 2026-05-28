// WSAA: Web Service de Autenticación y Autorización.
// 1) Arma loginTicketRequest XML
// 2) Lo firma con PKCS#7 / CMS usando cert + key de ARCA
// 3) Lo envía como SOAP loginCms y extrae Token + Sign
// 4) Cachea el resultado en la tabla arca_tokens hasta el expiration_time

import forge from 'npm:node-forge@^1.3.1'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2.45.4'
import type { Ambiente, WsaaCredentials } from './types.ts'
import { extractTag } from './xml.ts'

const WSAA_URLS: Record<Ambiente, string> = {
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
}

/** Formatea una fecha como ISO con offset -03:00 (Argentina). */
function isoArg(date: Date): string {
  // Tomamos la hora UTC y aplicamos -03:00 manualmente para no depender de TZ del runtime.
  const argMs = date.getTime() - 3 * 60 * 60 * 1000
  const d = new Date(argMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}-03:00`
  )
}

function buildLoginTicketRequest(servicio = 'wsfe'): string {
  const now = new Date()
  const exp = new Date(now.getTime() + 11 * 60 * 60 * 1000) // 11hs
  // uniqueId: epoch en segundos. Tiene que cambiar en cada login.
  const uniqueId = Math.floor(now.getTime() / 1000)

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<loginTicketRequest version="1.0">',
    '  <header>',
    `    <uniqueId>${uniqueId}</uniqueId>`,
    `    <generationTime>${isoArg(now)}</generationTime>`,
    `    <expirationTime>${isoArg(exp)}</expirationTime>`,
    '  </header>',
    `  <service>${servicio}</service>`,
    '</loginTicketRequest>',
  ].join('\n')
}

/** Firma el XML como PKCS#7 SignedData y devuelve base64 del DER. */
function signCms(xml: string, certPem: string, keyPem: string): string {
  let cert: forge.pki.Certificate
  let privateKey: forge.pki.PrivateKey
  try {
    cert = forge.pki.certificateFromPem(certPem)
  } catch (err) {
    throw new Error(`ARCA_CERT no es un certificado PEM válido: ${(err as Error).message}`)
  }
  try {
    privateKey = forge.pki.privateKeyFromPem(keyPem)
  } catch (err) {
    throw new Error(`ARCA_KEY no es una clave privada PEM válida: ${(err as Error).message}`)
  }

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(xml, 'utf8')
  p7.addCertificate(cert)
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      // messageDigest se calcula automáticamente
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  })
  p7.sign()

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  return forge.util.encode64(der)
}

function buildSoapEnvelope(base64Cms: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ',
    '  xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">',
    '  <soapenv:Header/>',
    '  <soapenv:Body>',
    '    <wsaa:loginCms>',
    `      <wsaa:in0>${base64Cms}</wsaa:in0>`,
    '    </wsaa:loginCms>',
    '  </soapenv:Body>',
    '</soapenv:Envelope>',
  ].join('\n')
}

interface WsaaCallResult {
  credentials: WsaaCredentials
  soapRequest: string
  soapResponse: string
  durationMs: number
}

async function callWsaa(ambiente: Ambiente, certPem: string, keyPem: string): Promise<WsaaCallResult> {
  const url = WSAA_URLS[ambiente]
  const loginTicket = buildLoginTicketRequest('wsfe')
  const base64Cms = signCms(loginTicket, certPem, keyPem)
  const soapBody = buildSoapEnvelope(base64Cms)

  const started = performance.now()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '""',
    },
    body: soapBody,
  })
  const responseText = await response.text()
  const durationMs = Math.round(performance.now() - started)

  if (!response.ok) {
    throw new Error(`WSAA respondió HTTP ${response.status}: ${responseText.slice(0, 500)}`)
  }

  // Detectar faults
  const faultString = extractTag(responseText, 'faultstring')
  if (faultString) {
    throw new Error(`WSAA fault: ${faultString}`)
  }

  // loginCmsReturn viene como string con XML escapeado (entidades &lt; &gt;)
  // extractTag ya decodifica entidades.
  const loginReturn = extractTag(responseText, 'loginCmsReturn')
  if (!loginReturn) {
    throw new Error(`WSAA no devolvió loginCmsReturn. Respuesta: ${responseText.slice(0, 500)}`)
  }

  const token = extractTag(loginReturn, 'token')
  const sign = extractTag(loginReturn, 'sign')
  const generationTime = extractTag(loginReturn, 'generationTime')
  const expirationTime = extractTag(loginReturn, 'expirationTime')

  if (!token || !sign || !expirationTime) {
    throw new Error(`WSAA respuesta incompleta (faltan token/sign/expiration). ${loginReturn.slice(0, 300)}`)
  }

  return {
    credentials: {
      token,
      sign,
      generationTime: generationTime || new Date().toISOString(),
      expirationTime,
    },
    soapRequest: soapBody,
    soapResponse: responseText,
    durationMs,
  }
}

interface GetCredentialsOptions {
  supabase: SupabaseClient
  ambiente: Ambiente
  cuit: string
  certPem: string
  keyPem: string
  servicio?: string
  logArca?: (entry: ArcaLogEntry) => Promise<void>
}

export interface ArcaLogEntry {
  servicio: 'wsaa' | 'wsfe'
  metodo: string
  request_payload: unknown
  response_payload: unknown
  http_status?: number
  duracion_ms?: number
  error_code?: string
  error_mensaje?: string
  ambiente: Ambiente
  comprobante_id?: string | null
}

/**
 * Devuelve credenciales WSAA frescas. Lee primero la caché en arca_tokens y,
 * si no hay o están vencidas, hace un login nuevo y persiste el resultado.
 */
export async function getWsaaCredentials(opts: GetCredentialsOptions): Promise<WsaaCredentials> {
  const servicio = opts.servicio || 'wsfe'

  // 1) Buscar token cacheado válido
  const nowIso = new Date().toISOString()
  const { data: cached } = await opts.supabase
    .from('arca_tokens')
    .select('token, sign, generation_time, expiration_time')
    .eq('servicio', servicio)
    .eq('ambiente', opts.ambiente)
    .eq('cuit', opts.cuit)
    .gt('expiration_time', nowIso)
    .maybeSingle()

  if (cached) {
    return {
      token: cached.token,
      sign: cached.sign,
      generationTime: cached.generation_time,
      expirationTime: cached.expiration_time,
    }
  }

  // 2) Login fresco
  const result = await callWsaa(opts.ambiente, opts.certPem, opts.keyPem)

  // 3) Persistir (upsert por servicio+ambiente+cuit)
  await opts.supabase
    .from('arca_tokens')
    .upsert(
      {
        servicio,
        ambiente: opts.ambiente,
        cuit: opts.cuit,
        token: result.credentials.token,
        sign: result.credentials.sign,
        generation_time: result.credentials.generationTime,
        expiration_time: result.credentials.expirationTime,
      },
      { onConflict: 'servicio,ambiente,cuit' },
    )

  // 4) Log opcional
  if (opts.logArca) {
    await opts.logArca({
      servicio: 'wsaa',
      metodo: 'loginCms',
      request_payload: { soap: result.soapRequest.slice(0, 4000) },
      response_payload: { soap: result.soapResponse.slice(0, 4000) },
      duracion_ms: result.durationMs,
      ambiente: opts.ambiente,
    })
  }

  return result.credentials
}
