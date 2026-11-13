// Exporta el reporte de faltantes que está en pantalla a un .xlsx. La
// librería xlsx se carga recién acá (import dinámico), como en el cash flow.
import { matrizFaltantes } from './compras'

export async function exportarFaltantesExcel(filas, { desde, hasta, negocio = 'Kiku Sushi' } = {}) {
  const XLSX = await import('xlsx')
  const matriz = matrizFaltantes(filas, { desde, hasta, negocio })
  const ws = XLSX.utils.aoa_to_sheet(matriz)
  ws['!cols'] = [{ wch: 34 }, { wch: 8 }, ...Array.from({ length: 14 }, () => ({ wch: 16 }))]

  // Pesos sin decimales en los totales de arriba y en las columnas de plata.
  const filaTitulos = matriz.findIndex(f => f[0] === 'Producto')
  const columnasPlata = new Set([11, 12, 13, 14])
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = 0; R <= range.e.r; R++) {
    for (let C = 1; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
      if (!cell || typeof cell.v !== 'number') continue
      if (R < filaTitulos || columnasPlata.has(C)) cell.z = '"$"#,##0'
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Faltantes')
  const slug = (negocio || 'stock').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  XLSX.writeFile(wb, `${slug}_faltantes_${desde}_${hasta}.xlsx`)
}
