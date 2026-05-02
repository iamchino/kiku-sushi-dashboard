/**
 * Normaliza un string para búsqueda: quita acentos/diacríticos y pasa a minúsculas.
 * "Atún" → "atun", "Sésamo" → "sesamo"
 */
export function normalizeSearch(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}
