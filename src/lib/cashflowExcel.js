// Exporta el cash flow que está en pantalla a un .xlsx con el mismo orden de
// filas. La librería xlsx se carga recién acá (import dinámico).
import { matrizParaExcel } from './cashflow'

export async function exportarCashflowExcel(modelo, { negocio = 'Kiku Sushi' } = {}) {
  const XLSX = await import('xlsx')
  const matriz = matrizParaExcel(modelo, { negocio })
  const ws = XLSX.utils.aoa_to_sheet(matriz)
  const nCols = modelo.columnas.length + 2
  ws['!cols'] = [{ wch: 44 }, ...Array.from({ length: nCols - 1 }, () => ({ wch: 16 }))]

  // Formato: pesos sin decimales (negativos en rojo) y porcentajes.
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = 0; R <= range.e.r; R++) {
    const titulo = String(matriz[R]?.[0] || '')
    const esPct = /como % de ingresos/.test(titulo)
    for (let C = 1; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
      if (!cell || typeof cell.v !== 'number') continue
      cell.z = esPct ? '0.0"%"' : '"$"#,##0;[Red]-"$"#,##0'
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Cash flow')
  const desde = modelo.columnas[0]?.mes?.slice(0, 7) || ''
  const hasta = modelo.columnas[modelo.columnas.length - 1]?.mes?.slice(0, 7) || ''
  const slug = (negocio || 'cashflow').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  XLSX.writeFile(wb, `${slug}_cashflow_${desde}_${hasta}.xlsx`)
}
