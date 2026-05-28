// Helpers mínimos para armar y parsear los XMLs de WSAA y WSFE.
// SOAP de ARCA es lo suficientemente acotado como para usar regex + templates
// en lugar de una librería completa de XML.

export function xmlEscape(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Extrae el contenido textual del primer <tag>...</tag> encontrado (con o sin namespace). */
export function extractTag(xml: string, tagName: string): string | null {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9]+:)?${tagName}>`,
  )
  const match = xml.match(re)
  return match ? decodeXmlEntities(match[1].trim()) : null
}

/** Devuelve todos los matches de <tag>...</tag>. */
export function extractAllTags(xml: string, tagName: string): string[] {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9]+:)?${tagName}>`,
    'g',
  )
  const matches: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    matches.push(decodeXmlEntities(m[1].trim()))
  }
  return matches
}

export function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Convierte una fecha YYYY-MM-DD a YYYYMMDD que es el formato CbteFch de ARCA. */
export function dateToArcaFormat(isoDate: string): string {
  return isoDate.replace(/-/g, '').slice(0, 8)
}

/** Convierte YYYYMMDD de ARCA a YYYY-MM-DD ISO. */
export function arcaDateToIso(arcaDate: string | null | undefined): string | null {
  if (!arcaDate) return null
  const clean = String(arcaDate).slice(0, 8)
  if (clean.length !== 8) return null
  return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`
}

/** Convierte un número a string con punto como separador decimal y 2 dígitos. */
export function formatNumber(value: number, decimals = 2): string {
  return Number(value || 0).toFixed(decimals)
}
