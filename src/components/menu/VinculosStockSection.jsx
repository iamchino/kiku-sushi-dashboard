import { useMemo } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import Buscador from '../ui/Buscador'
import { useOpcionesVinculo } from '../../hooks/useVinculosStock'
import { consumosDeVinculos } from '../../lib/stockNiveles'

// Sección "Stock que descuenta" del producto de la carta.
//
// Cada fila: qué baja (receta final, producción intermedia o ítem de
// inventario), cuánto, y para qué variante. Guarda en
// menu_item_stock_vinculos; el descuento real lo hace la base al cobrar.
//
// `vinculos` (estado del modal): [{ id?, destino: 'receta:<id>'|'stock:<id>',
//   cantidad: '2', varianteIdx: null | índice en `variantes` }]
export default function VinculosStockSection({ vinculos, onChange, variantes, open }) {
  const { recetas, stockItems, grupos, loading, error } = useOpcionesVinculo(open)
  const tieneVariantes = variantes.length > 0

  const agregar = () => onChange([...vinculos, { destino: '', cantidad: '1', varianteIdx: null }])
  const actualizar = (idx, campo, valor) =>
    onChange(vinculos.map((v, i) => i === idx ? { ...v, [campo]: valor } : v))
  const sacar = (idx) => onChange(vinculos.filter((_, i) => i !== idx))

  // Vista previa por variante (o del producto si no tiene): qué baja al vender 1.
  const preview = useMemo(() => {
    if (recetas.length === 0 && stockItems.length === 0) return []
    const filas = vinculos
      .filter(v => v.destino && parseFloat(v.cantidad) > 0)
      .map(v => {
        const [tipo, id] = v.destino.split(':')
        return {
          receta_id: tipo === 'receta' ? id : null,
          stock_id: tipo === 'stock' ? id : null,
          cantidad: parseFloat(v.cantidad),
          variante_id: v.varianteIdx === null || v.varianteIdx === undefined ? null : `idx:${v.varianteIdx}`,
        }
      })
    if (filas.length === 0) return []
    const casos = tieneVariantes
      ? variantes.map((vr, i) => ({ label: vr.nombre || `Variante ${i + 1}`, variante: { id: `idx:${i}`, piezas: vr.piezas } }))
      : [{ label: null, variante: null }]
    return casos.map(c => ({
      label: c.label,
      consumos: consumosDeVinculos(filas, c.variante, 1, recetas, stockItems),
    }))
  }, [vinculos, variantes, tieneVariantes, recetas, stockItems])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Stock que descuenta
        </label>
        <button
          type="button" onClick={agregar}
          className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-all"
          style={{ color: 'var(--accent-lift)', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}
        >
          <Plus size={11} /> Agregar
        </button>
      </div>

      {error && (
        <p className="text-[11px] px-1" style={{ color: '#F2708C' }}>
          No pude cargar recetas e inventario: {error}
        </p>
      )}

      {vinculos.length === 0 ? (
        <p className="text-[10px] px-1" style={{ color: 'var(--text-xmuted)' }}>
          Nada vinculado: al cobrar este producto no baja stock. Vinculá una receta
          (final o producción intermedia) o un ítem del inventario (una lata, por ejemplo).
        </p>
      ) : (
        <div className="space-y-2">
          {vinculos.map((v, idx) => (
            <div key={idx} className="rounded-lg p-2 space-y-1.5" style={{ border: '1px solid var(--border)' }}>
              {loading && grupos.every(g => g.opciones.length === 0) ? (
                <div className="flex items-center gap-2 text-xs px-2 py-2" style={{ color: 'var(--text-muted)' }}>
                  <Loader2 size={12} className="animate-spin" /> Cargando recetas e inventario…
                </div>
              ) : (
                <Buscador
                  value={v.destino}
                  onChange={val => actualizar(idx, 'destino', val)}
                  grupos={grupos}
                  placeholder="Elegí receta, producción intermedia o ítem de inventario…"
                  allowEmpty={false}
                />
              )}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium uppercase flex-shrink-0" style={{ color: 'var(--text-xmuted)' }}>Baja</span>
                <input
                  type="number" min="0.001" step="any"
                  value={v.cantidad}
                  onChange={e => actualizar(idx, 'cantidad', e.target.value)}
                  className="input-modal text-xs text-center"
                  style={{ width: 64 }}
                  placeholder="1"
                />
                {tieneVariantes ? (
                  <>
                    <span className="text-[10px] font-medium uppercase flex-shrink-0" style={{ color: 'var(--text-xmuted)' }}>en</span>
                    <select
                      value={v.varianteIdx === null || v.varianteIdx === undefined ? '' : String(v.varianteIdx)}
                      onChange={e => actualizar(idx, 'varianteIdx', e.target.value === '' ? null : Number(e.target.value))}
                      className="input-modal text-xs flex-1 min-w-0"
                    >
                      <option value="" style={{ background: 'var(--bg-input)' }}>Todas las variantes (× piezas)</option>
                      {variantes.map((vr, i) => (
                        <option key={i} value={String(i)} style={{ background: 'var(--bg-input)' }}>
                          {vr.nombre || `Variante ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span className="text-[10px] flex-1" style={{ color: 'var(--text-xmuted)' }}>por unidad vendida</span>
                )}
                <button
                  type="button" onClick={() => sacar(idx)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                  style={{ color: 'var(--text-xmuted)' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#F2708C'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}

          <p className="text-[10px] px-1" style={{ color: 'var(--text-xmuted)' }}>
            💡 "Baja" = cuánto descuenta cada unidad vendida: porciones de la receta o unidades del ítem.
            {tieneVariantes && (
              <> Con <b>Todas las variantes</b> ese número se multiplica por las piezas de cada variante. Eligiendo
              una variante puntual, baja además eso al vender esa variante (ej. "x2" → 2, "x4" → 4, "x6" → 6 de la
              misma receta, sin armar tres recetas).</>
            )}
          </p>

          {preview.length > 0 && (
            <div className="rounded-lg px-3 py-2 space-y-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-medium uppercase" style={{ color: 'var(--text-xmuted)' }}>
                Al vender 1 baja
              </p>
              {preview.map((p, i) => (
                <p key={i} className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {p.label && <span className="font-semibold">{p.label}: </span>}
                  {p.consumos.length === 0
                    ? <span style={{ color: 'var(--text-xmuted)' }}>nada (la receta no tiene ingredientes con stock)</span>
                    : p.consumos.map(c => `${fmt(c.cantidad)} ${c.unidad || ''} ${c.nombre}`.replace(/\s+/g, ' ').trim()).join(' · ')}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function fmt(n) {
  const v = Math.round((parseFloat(n) || 0) * 1000) / 1000
  return v.toLocaleString('es-AR', { maximumFractionDigits: 3 })
}
