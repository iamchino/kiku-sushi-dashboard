import { Fragment, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, FileSpreadsheet, Loader2, PackageSearch, Search, X } from 'lucide-react'
import {
  PERIODOS_FALTANTES, cantidadTxt, filtrarFaltantes, plata, rangoPeriodo, resumenFaltantes, tieneDiferencia,
} from '../../lib/compras'
import { cargarFaltantes } from '../../lib/comprasApi'
import { exportarFaltantesExcel } from '../../lib/faltantesExcel'
import { TIPOS_STOCK } from '../../lib/stockNiveles'

// Reporte de faltantes (SQL 56). El sistema lleva la cuenta de lo que debería
// haber de cada producto: lo que se compró, menos lo que se vendió y la merma
// anotada. Cada conteo deja registrada la diferencia entre esa cuenta y lo que
// había de verdad. Acá se suma todo por producto y período, en pesos.
// Los números los calcula la base (stock_faltantes): son miles de movimientos.

const fechaHora = (ts) => new Date(ts).toLocaleString('es-AR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).replace(',', '')

const TIPO_DETALLE = {
  ajuste: 'Conteo',
  merma: 'Merma anotada',
}

function Kpi({ label, value, detalle, color }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-xl font-bold tabular-nums leading-tight" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
      {detalle && <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>{detalle}</p>}
    </div>
  )
}

function Detalle({ fila }) {
  if (fila.detalle.length === 0) {
    return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>En este período no se contó ni se anotó merma de este producto.</p>
  }
  return (
    <div className="space-y-1">
      {fila.detalle.map(d => {
        const dif = Number(d.diferencia) || 0
        return (
          <div key={d.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
            <span className="w-24 flex-shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>{fechaHora(d.fecha)}</span>
            <span className="w-28 flex-shrink-0 font-medium" style={{ color: 'var(--text-secondary)' }}>{TIPO_DETALLE[d.tipo] || d.tipo}</span>
            <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {d.tipo === 'ajuste'
                ? <>debía haber {cantidadTxt(d.antes, fila.unidad)}, se contó {cantidadTxt(d.despues, fila.unidad)}</>
                : <>se dieron de baja {cantidadTxt(-dif, fila.unidad)}</>}
            </span>
            <span className="font-semibold tabular-nums" style={{ color: dif < 0 ? 'var(--bad)' : 'var(--ok)' }}>
              {dif > 0 ? '+' : ''}{cantidadTxt(dif, fila.unidad)}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {d.quien ? `por ${d.quien}` : 'sin usuario registrado'}
            </span>
            {d.nota && d.tipo !== 'ajuste' && <span className="italic" style={{ color: 'var(--text-xmuted)' }}>“{d.nota}”</span>}
          </div>
        )
      })}
    </div>
  )
}

export default function FaltantesModal({ open, onClose }) {
  const [periodo, setPeriodo] = useState('mes')
  const [desde, setDesde] = useState(() => rangoPeriodo('mes').desde)
  const [hasta, setHasta] = useState(() => rangoPeriodo('mes').hasta)
  const [estado, setEstado] = useState({ cargando: false, disponible: true, filas: [], error: null })
  const [soloDiferencias, setSoloDiferencias] = useState(true)
  const [tipo, setTipo] = useState('todos')
  const [texto, setTexto] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [exportando, setExportando] = useState(false)

  const elegirPeriodo = (id) => {
    setPeriodo(id)
    if (id !== 'custom') {
      const r = rangoPeriodo(id)
      setDesde(r.desde); setHasta(r.hasta)
    }
  }

  useEffect(() => {
    if (!open || !desde || !hasta || desde > hasta) return undefined
    let vivo = true
    setEstado(e => ({ ...e, cargando: true, error: null }))
    cargarFaltantes(desde, hasta)
      .then(res => { if (vivo) setEstado({ cargando: false, disponible: res.disponible, filas: res.filas, error: null }) })
      .catch(err => { if (vivo) setEstado({ cargando: false, disponible: true, filas: [], error: err.message }) })
    return () => { vivo = false }
  }, [open, desde, hasta])

  const resumen = useMemo(() => resumenFaltantes(estado.filas), [estado.filas])
  const visibles = useMemo(
    () => filtrarFaltantes(estado.filas, { soloDiferencias, tipo, texto }),
    [estado.filas, soloDiferencias, tipo, texto],
  )
  const conDiferencia = estado.filas.filter(tieneDiferencia).length

  const exportar = async () => {
    setExportando(true)
    try { await exportarFaltantesExcel(visibles, { desde, hasta }) } finally { setExportando(false) }
  }

  if (!open) return null

  const chip = (activo) => activo
    ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
    : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
  const control = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }
  const th = 'px-3 py-2 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      role="dialog" aria-modal="true" aria-label="Faltantes de stock">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--bg-app)', border: '1px solid var(--border-card)' }}>
        <div className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)' }}>
              <PackageSearch size={16} style={{ color: 'var(--accent-lift)' }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Faltantes de stock</h2>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Lo que debería haber (compras − ventas − merma anotada) contra lo que se contó.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5" style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2">
            {PERIODOS_FALTANTES.map(p => (
              <button key={p.id} type="button" onClick={() => elegirPeriodo(p.id)}
                className="rounded-lg px-3 py-2 text-xs font-semibold" style={chip(periodo === p.id)}>
                {p.label}
              </button>
            ))}
            {periodo === 'custom' && (
              <>
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)} aria-label="Desde"
                  className="rounded-lg px-3 py-2 text-xs outline-none" style={control} />
                <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} aria-label="Hasta"
                  className="rounded-lg px-3 py-2 text-xs outline-none" style={control} />
              </>
            )}
            <button type="button" onClick={exportar} disabled={exportando || visibles.length === 0}
              className="ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Exportar Excel
            </button>
          </div>

          {!estado.disponible ? (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
              style={{ background: 'rgba(232,162,63,0.10)', border: '1px solid rgba(232,162,63,0.30)', color: 'var(--warn)' }}>
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
              <span>Para ver este reporte falta correr el SQL 56 en Supabase. El resto de Inventario funciona igual.</span>
            </div>
          ) : estado.error ? (
            <div className="rounded-xl px-4 py-3 text-sm"
              style={{ background: 'rgba(227,77,107,0.08)', border: '1px solid rgba(227,77,107,0.15)', color: 'var(--bad)' }}>
              {estado.error}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Faltó en los conteos" value={plata(resumen.faltante)} color={resumen.faltante > 0 ? 'var(--bad)' : undefined}
                  detalle={`${resumen.productosConFaltante} producto${resumen.productosConFaltante === 1 ? '' : 's'}`} />
                <Kpi label="Sobró en los conteos" value={plata(resumen.sobrante)} detalle="Había más de lo que decía el sistema" />
                <Kpi label="Merma anotada" value={plata(resumen.merma)} detalle="Lo que se declaró como pérdida" />
                <Kpi label="Productos contados" value={resumen.productosContados}
                  detalle={`de ${estado.filas.length} con movimiento`} />
              </div>

              {!estado.cargando && estado.filas.length > 0 && resumen.productosContados === 0 && (
                <p className="rounded-lg px-3 py-2 text-xs" style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                  En este período no hubo conteos con diferencia. Sin contar no se puede saber si falta algo: el conteo se hace con el botón “Contar” de Inventario.
                </p>
              )}
              {resumen.sinPrecio > 0 && (
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {resumen.sinPrecio === 1 ? 'Hay 1 producto' : `Hay ${resumen.sinPrecio} productos`} con diferencia pero sin precio de costo cargado: figuran en unidades y no suman pesos.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={soloDiferencias} onChange={e => setSoloDiferencias(e.target.checked)} />
                  Solo los que tuvieron faltante, sobrante o merma ({conDiferencia})
                </label>
                <select value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo de producto"
                  className="rounded-lg px-3 py-2 text-xs outline-none" style={control}>
                  <option value="todos">Todos los tipos</option>
                  {TIPOS_STOCK.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <div className="relative ml-auto">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xmuted)' }} />
                  <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto"
                    className="w-44 rounded-lg py-2 pl-8 pr-3 text-xs outline-none" style={control} />
                </div>
              </div>

              {estado.cargando ? (
                <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
              ) : visibles.length === 0 ? (
                <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  {estado.filas.length === 0
                    ? 'No hubo movimientos de stock en este período.'
                    : 'Ningún producto tuvo faltante, sobrante ni merma en este período.'}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
                  {/* En el celular la tabla scrollea de costado adentro de su caja. */}
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-xmuted)' }}>
                        <th className={`${th} w-8`}><span className="sr-only">Detalle</span></th>
                        <th className={`${th} text-left`}>Producto</th>
                        <th className={`${th} text-right`}>Había</th>
                        <th className={`${th} text-right`}>Entró</th>
                        <th className={`${th} text-right`}>Salió</th>
                        <th className={`${th} text-right`}>Merma</th>
                        <th className={`${th} text-right`}>Faltó / sobró</th>
                        <th className={`${th} text-right`}>En pesos</th>
                        <th className={`${th} text-right`}>Quedó</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map(f => {
                        const expandida = abierta === f.stock_id
                        const u = f.unidad
                        return (
                          <Fragment key={f.stock_id}>
                            <tr style={{ borderBottom: '1px solid var(--border)' }} data-faltante={f.nombre}>
                              <td className="py-2 pl-3 pr-1">
                                <button type="button" onClick={() => setAbierta(expandida ? null : f.stock_id)}
                                  aria-label={`${expandida ? 'Ocultar' : 'Ver'} el detalle de ${f.nombre}`} aria-expanded={expandida}
                                  className="flex h-6 w-6 items-center justify-center rounded" style={{ color: 'var(--text-xmuted)' }}>
                                  {expandida ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <span className="block font-medium" style={{ color: 'var(--text-primary)' }}>{f.nombre}</span>
                                {f.conteos > 0 && (
                                  <span className="block text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
                                    {f.conteos === 1 ? '1 conteo con diferencia' : `${f.conteos} conteos con diferencia`}
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{cantidadTxt(f.stock_inicial, u)}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}
                                title={`Comprado ${cantidadTxt(f.comprado, u)} · otras entradas ${cantidadTxt(f.otras_entradas, u)}`}>
                                {f.entro ? `+${cantidadTxt(f.entro)}` : '—'}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}
                                title={`Vendido ${cantidadTxt(f.vendido, u)} · otras salidas ${cantidadTxt(f.otras_salidas, u)}`}>
                                {f.salio ? `−${cantidadTxt(f.salio)}` : '—'}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                                {f.merma ? `−${cantidadTxt(f.merma)}` : '—'}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                                {f.faltante > 0 && <span style={{ color: 'var(--bad)' }}>faltó {cantidadTxt(f.faltante, u)}</span>}
                                {f.faltante > 0 && f.sobrante > 0 && <span style={{ color: 'var(--text-xmuted)' }}> · </span>}
                                {f.sobrante > 0 && <span style={{ color: 'var(--ok)' }}>sobró {cantidadTxt(f.sobrante, u)}</span>}
                                {f.faltante === 0 && f.sobrante === 0 && <span style={{ color: 'var(--text-xmuted)' }}>—</span>}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                                {f.valor_faltante > 0
                                  ? <span className="font-semibold" style={{ color: 'var(--bad)' }}>−{plata(f.valor_faltante)}</span>
                                  : f.valor_sobrante > 0
                                    ? <span style={{ color: 'var(--ok)' }}>+{plata(f.valor_sobrante)}</span>
                                    : f.sin_precio
                                      ? <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>sin precio</span>
                                      : <span style={{ color: 'var(--text-xmuted)' }}>—</span>}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{cantidadTxt(f.stock_final, u)}</td>
                            </tr>
                            {expandida && (
                              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <td colSpan={9} className="px-5 py-3" style={{ background: 'var(--bg-input)' }}>
                                  <Detalle fila={f} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
