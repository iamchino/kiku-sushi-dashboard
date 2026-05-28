// WSFE: Web Service de Facturación Electrónica.
// Implementa los métodos mínimos necesarios:
//   - FECompUltimoAutorizado (para conocer el próximo número)
//   - FECAESolicitar          (para solicitar el CAE)
//
// Documentación: https://www.afip.gob.ar/fe/documentos/manual_desarrollador_COMPG_v4_0.pdf

import type {
  Ambiente,
  CaeResult,
  FiscalRequestPayload,
  WsaaCredentials,
} from './types.ts'
import {
  arcaDateToIso,
  dateToArcaFormat,
  extractAllTags,
  extractTag,
  formatNumber,
  xmlEscape,
} from './xml.ts'

const WSFE_URLS: Record<Ambiente, string> = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
}

const WSFE_NS = 'http://ar.gov.afip.dif.FEV1/'

// Mapeo de condición IVA del receptor a Id de ARCA (RG 5616/2024)
const CONDICION_IVA_RECEPTOR_ID: Record<string, number> = {
  'responsable inscripto': 1,
  'iva sujeto exento': 4,
  'consumidor final': 5,
  'monotributo': 6,
  'responsable monotributo': 6,
  'sujeto no categorizado': 7,
  'proveedor del exterior': 8,
  'cliente del exterior': 9,
  'iva liberado': 10,
  'monotributista social': 13,
  'iva no alcanzado': 15,
  'monotributo trabajador independiente promovido': 16,
}

function resolveCondicionIvaReceptorId(condicion: string | undefined, explicitId?: number): number {
  if (explicitId && Number.isFinite(explicitId)) return explicitId
  const key = String(condicion || '').toLowerCase().trim()
  return CONDICION_IVA_RECEPTOR_ID[key] || 5 // default consumidor final
}

function alicuotaIdFromRate(rate: number): number {
  const r = Number(rate)
  if (Math.abs(r - 21) < 0.01) return 5
  if (Math.abs(r - 10.5) < 0.01) return 4
  if (Math.abs(r - 27) < 0.01) return 6
  if (Math.abs(r - 5) < 0.01) return 8
  if (Math.abs(r - 2.5) < 0.01) return 9
  if (Math.abs(r - 0) < 0.01) return 3
  return 5
}

function buildAuthXml(creds: WsaaCredentials, cuit: string): string {
  // Cada elemento del Auth debe ir con el prefijo del namespace WSFE (ar:),
  // si no ARCA responde "Campo Auth no fue ingresado o esta mal formado".
  return `<ar:Auth>
    <ar:Token>${xmlEscape(creds.token)}</ar:Token>
    <ar:Sign>${xmlEscape(creds.sign)}</ar:Sign>
    <ar:Cuit>${xmlEscape(cuit)}</ar:Cuit>
  </ar:Auth>`
}

function wrapSoap(bodyInner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${WSFE_NS}">
  <soapenv:Header/>
  <soapenv:Body>${bodyInner}</soapenv:Body>
</soapenv:Envelope>`
}

async function callSoap(url: string, soapAction: string, body: string): Promise<{ status: number; text: string; durationMs: number }> {
  const started = performance.now()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': soapAction,
    },
    body,
  })
  const text = await response.text()
  return { status: response.status, text, durationMs: Math.round(performance.now() - started) }
}

// ─────────────────────────────────────────────────────────────────────────────
// FECompUltimoAutorizado
// ─────────────────────────────────────────────────────────────────────────────

export interface UltimoAutorizadoResult {
  numero: number
  ptoVta: number
  cbteTipo: number
}

export async function feCompUltimoAutorizado(params: {
  ambiente: Ambiente
  creds: WsaaCredentials
  cuit: string
  puntoVenta: number
  tipoCbte: number
}): Promise<{ result: UltimoAutorizadoResult; rawRequest: string; rawResponse: string; durationMs: number }> {
  const soapBody = wrapSoap(`
    <ar:FECompUltimoAutorizado>
      ${buildAuthXml(params.creds, params.cuit)}
      <ar:PtoVta>${params.puntoVenta}</ar:PtoVta>
      <ar:CbteTipo>${params.tipoCbte}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  `)

  const url = WSFE_URLS[params.ambiente]
  const { status, text, durationMs } = await callSoap(
    url,
    `${WSFE_NS}FECompUltimoAutorizado`,
    soapBody,
  )

  if (status !== 200) {
    throw new Error(`WSFE FECompUltimoAutorizado HTTP ${status}: ${text.slice(0, 500)}`)
  }

  // Detectar errores
  const errors = extractAllTags(text, 'Err').map(e => ({
    code: extractTag(e, 'Code'),
    msg: extractTag(e, 'Msg'),
  }))
  if (errors.length) {
    throw new Error(`WSFE FECompUltimoAutorizado error: ${errors.map(e => `[${e.code}] ${e.msg}`).join('; ')}`)
  }

  const cbteNro = Number(extractTag(text, 'CbteNro') ?? 0)
  const ptoVta = Number(extractTag(text, 'PtoVta') ?? params.puntoVenta)
  const cbteTipo = Number(extractTag(text, 'CbteTipo') ?? params.tipoCbte)

  return {
    result: { numero: cbteNro, ptoVta, cbteTipo },
    rawRequest: soapBody,
    rawResponse: text,
    durationMs,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FECAESolicitar
// ─────────────────────────────────────────────────────────────────────────────

export async function feCaeSolicitar(params: {
  ambiente: Ambiente
  creds: WsaaCredentials
  cuit: string
  payload: FiscalRequestPayload
  numero: number
  alicuotaRate: number
}): Promise<{ result: CaeResult; rawRequest: string; rawResponse: string; durationMs: number }> {
  const { payload } = params
  const tipoCbte = payload.tipo_cbte
  const ptoVta = payload.punto_venta
  const cbteFch = dateToArcaFormat(payload.fecha_emision)
  const alicuotaId = payload.alicuota_iva_id ?? alicuotaIdFromRate(params.alicuotaRate)
  const condIvaReceptorId = resolveCondicionIvaReceptorId(
    payload.receptor.condicion_iva,
    payload.receptor.condicion_iva_id,
  )

  const impTotal = formatNumber(payload.importes.importeTotal)
  const impNeto = formatNumber(payload.importes.importeNeto)
  const impIva = formatNumber(payload.importes.importeIva)

  // Conceptos 2 (servicios) y 3 (productos+servicios) requieren fechas de servicio
  const concepto = payload.concepto || 1
  let fechaServicioXml = ''
  if (concepto === 2 || concepto === 3) {
    const desde = payload.fecha_servicio_desde || payload.fecha_emision
    const hasta = payload.fecha_servicio_hasta || payload.fecha_emision
    const vto = payload.fecha_vto_pago || payload.fecha_emision
    fechaServicioXml = `
        <ar:FchServDesde>${dateToArcaFormat(desde)}</ar:FchServDesde>
        <ar:FchServHasta>${dateToArcaFormat(hasta)}</ar:FchServHasta>
        <ar:FchVtoPago>${dateToArcaFormat(vto)}</ar:FchVtoPago>`
  }

  // Comprobantes asociados (Nota de Crédito / Débito)
  let cbtesAsocXml = ''
  if (payload.cbtes_asociados && payload.cbtes_asociados.length > 0) {
    cbtesAsocXml = `
        <ar:CbtesAsoc>${payload.cbtes_asociados
          .map(
            asoc => `
          <ar:CbteAsoc>
            <ar:Tipo>${asoc.tipo_cbte}</ar:Tipo>
            <ar:PtoVta>${asoc.punto_venta}</ar:PtoVta>
            <ar:Nro>${asoc.numero}</ar:Nro>
            ${asoc.cuit_emisor ? `<ar:Cuit>${xmlEscape(asoc.cuit_emisor)}</ar:Cuit>` : ''}
            ${asoc.fecha ? `<ar:CbteFch>${dateToArcaFormat(asoc.fecha)}</ar:CbteFch>` : ''}
          </ar:CbteAsoc>`,
          )
          .join('')}
        </ar:CbtesAsoc>`
  }

  // Para Factura B a consumidor final con neto+IVA discriminados internamente
  const ivaArrayXml = Number(payload.importes.importeIva) > 0
    ? `
        <ar:Iva>
          <ar:AlicIva>
            <ar:Id>${alicuotaId}</ar:Id>
            <ar:BaseImp>${impNeto}</ar:BaseImp>
            <ar:Importe>${impIva}</ar:Importe>
          </ar:AlicIva>
        </ar:Iva>`
    : ''

  const detRequest = `
      <ar:FECAEDetRequest>
        <ar:Concepto>${concepto}</ar:Concepto>
        <ar:DocTipo>${payload.receptor.doc_tipo}</ar:DocTipo>
        <ar:DocNro>${xmlEscape(payload.receptor.doc_nro || '0')}</ar:DocNro>
        <ar:CbteDesde>${params.numero}</ar:CbteDesde>
        <ar:CbteHasta>${params.numero}</ar:CbteHasta>
        <ar:CbteFch>${cbteFch}</ar:CbteFch>
        <ar:ImpTotal>${impTotal}</ar:ImpTotal>
        <ar:ImpTotConc>0</ar:ImpTotConc>
        <ar:ImpNeto>${impNeto}</ar:ImpNeto>
        <ar:ImpOpEx>0</ar:ImpOpEx>
        <ar:ImpTrib>0</ar:ImpTrib>
        <ar:ImpIVA>${impIva}</ar:ImpIVA>
        ${fechaServicioXml}
        <ar:MonId>${payload.moneda || 'PES'}</ar:MonId>
        <ar:MonCotiz>${formatNumber(payload.cotizacion || 1, 6)}</ar:MonCotiz>
        <ar:CondicionIVAReceptorId>${condIvaReceptorId}</ar:CondicionIVAReceptorId>
        ${cbtesAsocXml}
        ${ivaArrayXml}
      </ar:FECAEDetRequest>`

  const soapBody = wrapSoap(`
    <ar:FECAESolicitar>
      ${buildAuthXml(params.creds, params.cuit)}
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${ptoVta}</ar:PtoVta>
          <ar:CbteTipo>${tipoCbte}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>${detRequest}</ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  `)

  const url = WSFE_URLS[params.ambiente]
  const { status, text, durationMs } = await callSoap(url, `${WSFE_NS}FECAESolicitar`, soapBody)

  if (status !== 200) {
    throw new Error(`WSFE FECAESolicitar HTTP ${status}: ${text.slice(0, 800)}`)
  }

  // Errores a nivel cabecera
  const errores = extractAllTags(text, 'Err').map(e => ({
    Code: Number(extractTag(e, 'Code') ?? 0),
    Msg: extractTag(e, 'Msg') || '',
  }))
  const observaciones = extractAllTags(text, 'Obs').map(o => ({
    Code: Number(extractTag(o, 'Code') ?? 0),
    Msg: extractTag(o, 'Msg') || '',
  }))

  // Detectar fault SOAP
  const faultString = extractTag(text, 'faultstring')
  if (faultString) {
    return {
      result: {
        cae: '',
        cae_vto: '',
        numero: params.numero,
        resultado: 'R',
        errores: [...errores, { Code: -1, Msg: faultString }],
        observaciones,
        raw: text,
      },
      rawRequest: soapBody,
      rawResponse: text,
      durationMs,
    }
  }

  const cabResultado = extractTag(text, 'Resultado') // primer Resultado = FeCabResp
  const detResp = extractTag(text, 'FECAEDetResponse') || ''
  const cae = extractTag(detResp, 'CAE') || ''
  const caeVtoArca = extractTag(detResp, 'CAEFchVto') || ''
  const cbteDesde = Number(extractTag(detResp, 'CbteDesde') ?? params.numero)
  const fechaProceso = extractTag(text, 'FchProceso') || ''

  const resultado = (cabResultado === 'A' || cabResultado === 'R' || cabResultado === 'P')
    ? (cabResultado as 'A' | 'R' | 'P')
    : 'R'

  if (resultado !== 'A' || !cae) {
    return {
      result: {
        cae,
        cae_vto: arcaDateToIso(caeVtoArca) || '',
        numero: cbteDesde,
        resultado,
        observaciones,
        errores: errores.length ? errores : [{ Code: -1, Msg: 'ARCA no devolvió CAE.' }],
        fecha_proceso: fechaProceso,
        raw: text,
      },
      rawRequest: soapBody,
      rawResponse: text,
      durationMs,
    }
  }

  return {
    result: {
      cae,
      cae_vto: arcaDateToIso(caeVtoArca) || '',
      numero: cbteDesde,
      resultado: 'A',
      observaciones,
      errores,
      fecha_proceso: fechaProceso,
      raw: text,
    },
    rawRequest: soapBody,
    rawResponse: text,
    durationMs,
  }
}
