import { useState } from 'react'
import { fmtPlata, fmtPlataCorta, labelMes } from '../../../lib/cashflow'

// Flujo neto por mes: columnas hacia arriba (sobra plata) o hacia abajo
// (falta). El dato es de polaridad, así que el signo se lee primero por la
// POSICIÓN respecto de la línea de cero y por el signo de la etiqueta; el
// verde / rojo (los mismos de "Entró" y "Salió" del Resumen) solo lo refuerza.
// Los meses en curso y futuros van más claros: son una proyección.
//
// La tabla de abajo es la vista en números de este gráfico; el detalle de cada
// columna también aparece al pasar el mouse o con el teclado (Tab).

const ALTO = 132          // alto del área de barras, px
const ANCHO_BARRA = 24    // tope de grosor

export default function CashflowGrafico({ columnas }) {
  const [activo, setActivo] = useState(null)

  const maxPos = Math.max(0, ...columnas.map(c => c.flujo))
  const maxNeg = Math.max(0, ...columnas.map(c => -c.flujo))
  const rango = maxPos + maxNeg
  if (!(rango > 0)) {
    return (
      <p className="py-8 text-center text-xs" style={{ color: 'var(--text-xmuted)' }}>
        Todavía no hay movimientos ni estimados en estos meses.
      </p>
    )
  }
  // Se reserva lugar para la etiqueta de valor arriba y abajo de las barras.
  const MARGEN = 18
  const util = ALTO - MARGEN * 2
  const ceroY = MARGEN + (maxPos / rango) * util
  const col = activo !== null ? columnas[activo] : null

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="relative" style={{ minWidth: columnas.length * 58 }}>
          <div className="relative flex" style={{ height: ALTO }}>
            {/* línea de cero */}
            <div className="pointer-events-none absolute left-0 right-0" style={{ top: ceroY, height: 1, background: 'var(--border)' }} />
            {columnas.map((c, i) => {
              const alto = (Math.abs(c.flujo) / rango) * util
              const positivo = c.flujo >= 0
              const proyectado = c.tipo !== 'pasado'
              const color = positivo ? 'var(--ok)' : 'var(--bad)'
              return (
                <div
                  key={c.mes}
                  role="img"
                  tabIndex={0}
                  aria-label={`${labelMes(c.mes, { largo: true })}: flujo neto ${fmtPlata(c.flujo)}${proyectado ? ' (proyectado)' : ''}. Ingresos ${fmtPlata(c.ingresos.valor)}, egresos ${fmtPlata(c.totalEgresos)}.`}
                  onMouseEnter={() => setActivo(i)}
                  onMouseLeave={() => setActivo(null)}
                  onFocus={() => setActivo(i)}
                  onBlur={() => setActivo(null)}
                  className="relative flex-1 outline-none"
                  style={{ background: activo === i ? 'var(--bg-hover)' : 'transparent', borderRadius: 6 }}
                >
                  {c.flujo !== 0 && (
                    <div
                      className="absolute left-1/2"
                      style={{
                        width: `min(${ANCHO_BARRA}px, 55%)`,
                        transform: 'translateX(-50%)',
                        top: positivo ? ceroY - alto : ceroY + 1,
                        height: Math.max(alto, 2),
                        background: color,
                        opacity: proyectado ? 0.5 : 1,
                        borderRadius: positivo ? '4px 4px 0 0' : '0 0 4px 4px',
                      }}
                    />
                  )}
                  <span
                    className="absolute left-0 right-0 text-center text-[10px] font-semibold"
                    style={{
                      top: positivo ? Math.max(0, ceroY - alto - 15) : Math.min(ALTO - 13, ceroY + alto + 3),
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {c.flujo === 0 ? '$0' : fmtPlataCorta(c.flujo)}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-1 flex">
            {columnas.map(c => (
              <span key={c.mes} className="flex-1 text-center text-[10px]"
                style={{ color: c.tipo === 'curso' ? 'var(--accent-lift)' : 'var(--text-muted)', fontWeight: c.tipo === 'curso' ? 700 : 400 }}>
                {labelMes(c.mes)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Lectura del mes señalado (o la leyenda, si no hay ninguno). */}
      <div className="mt-3 flex min-h-[20px] flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-muted)' }} aria-live="polite">
        {col ? (
          <>
            <span className="font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{labelMes(col.mes, { largo: true })}</span>
            <span>Ingresos <strong style={{ color: 'var(--text-primary)' }}>{fmtPlata(col.ingresos.valor)}</strong></span>
            <span>Egresos <strong style={{ color: 'var(--text-primary)' }}>{fmtPlata(col.totalEgresos)}</strong></span>
            <span>Flujo neto <strong style={{ color: 'var(--text-primary)' }}>{fmtPlata(col.flujo)}</strong></span>
            {col.saldoFinal !== null && <span>Saldo final <strong style={{ color: 'var(--text-primary)' }}>{fmtPlata(col.saldoFinal)}</strong></span>}
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--ok)' }} /> Sobra (ingresos &gt; egresos)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--bad)' }} /> Falta
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--text-muted)', opacity: 0.5 }} /> Más claro = proyectado
            </span>
          </>
        )}
      </div>
    </div>
  )
}
