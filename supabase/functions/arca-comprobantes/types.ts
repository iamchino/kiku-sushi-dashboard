// Tipos compartidos entre la Edge Function y el front.
// El payload que envía el front coincide con el output de buildFiscalRequest()
// en src/lib/fiscal.js.

export type Ambiente = 'homologacion' | 'produccion'

export interface ReceptorPayload {
  condicion_iva: string
  condicion_iva_id?: number
  doc_tipo: number
  doc_nro: string
  nombre: string
  domicilio?: string
}

export interface ImportesPayload {
  importeNeto: number
  importeIva: number
  importeTotal: number
}

export interface ItemPayload {
  nombre: string
  cantidad: number
  precio_unitario: number
  total: number
  notas?: string | null
}

export interface CbteAsociadoPayload {
  tipo_cbte: number
  punto_venta: number
  numero: number
  cuit_emisor?: string
  fecha?: string
}

export interface FiscalRequestPayload {
  pedido_id: string
  punto_venta: number
  tipo_cbte: number          // 1 A, 6 B, 11 C, 3 NC-A, 8 NC-B, 13 NC-C, etc.
  letra: 'A' | 'B' | 'C'
  concepto: number           // 1 productos, 2 servicios, 3 ambos
  fecha_emision: string      // YYYY-MM-DD
  receptor: ReceptorPayload
  moneda: string             // 'PES'
  cotizacion: number
  descuento_porcentaje?: number
  subtotal?: number
  descuento_importe?: number
  importes: ImportesPayload
  items: ItemPayload[]
  cbtes_asociados?: CbteAsociadoPayload[]
  fecha_vto_pago?: string
  fecha_servicio_desde?: string
  fecha_servicio_hasta?: string
  alicuota_iva_id?: number   // 5 = 21%, 4 = 10.5%, etc. Default 5.
}

export interface WsaaCredentials {
  token: string
  sign: string
  generationTime: string
  expirationTime: string
}

export interface CaeResult {
  cae: string
  cae_vto: string            // YYYY-MM-DD
  numero: number
  resultado: 'A' | 'R' | 'P' // Aceptado / Rechazado / Parcial
  observaciones?: Array<{ Code: number; Msg: string }>
  errores?: Array<{ Code: number; Msg: string }>
  fecha_proceso?: string
  raw?: unknown
}
