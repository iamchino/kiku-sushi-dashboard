import { useRef, useState } from 'react'
import { CalendarRange, ListChecks, Loader2 } from 'lucide-react'
import { CONCEPTO_INGRESOS, ESTADOS, GRUPOS, fmtPct, fmtPlata, labelMes } from '../../../lib/cashflow'
import { catLabel } from '../../../lib/finanzas'
import { parseCurrencyValue } from '../../../lib/orders'

// La planilla: conceptos en filas, meses en columnas, total al final.
//
// Tres maneras de ver un número, según de dónde sale:
//   · normal   → real (mes pasado) o pagos ya cargados en el sistema
//   · cursiva  → estimado por administración (se edita tocando la celda)
//   · "—"      → nada todavía
// La primera columna queda fija al desplazar; el Total también (salvo en
// celular, donde dos columnas fijas no dejan lugar para los meses).

const TIPO_LABEL = { pasado: 'Real', curso: 'En curso', futuro: 'Estimado' }

const stickyIzq = { position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-card)' }
const bordeFila = { borderTop: '1px solid var(--border)' }

function fondoColumna(tipo) {
  return tipo === 'curso' ? { background: 'var(--accent-soft)' } : null
}

function colorSigno(v) {
  if (v < 0) return 'var(--bad)'
  if (v > 0) return 'var(--ok)'
  return 'var(--text-muted)'
}

/** Texto de ayuda de una celda: de qué está hecho el número. */
function desglose(celda, tipo, esIngreso) {
  const partes = []
  if (celda.estimado !== null) partes.push(`Estimado ${fmtPlata(celda.estimado)}`)
  if (tipo === 'pasado') partes.push(`${esIngreso ? 'Cobrado' : 'Pagado'} ${fmtPlata(celda.real)}`)
  else {
    if (celda.real > 0 || tipo === 'curso') partes.push(`${esIngreso ? 'Cobrado' : 'Pagado'} hasta hoy ${fmtPlata(celda.real)}`)
    if (celda.pendiente > 0) partes.push(`A pagar ya cargado ${fmtPlata(celda.pendiente)}`)
  }
  return partes.join(' · ')
}

// Una línea por dato, así la columna no se ensancha.
function Subtexto({ celda, tipo, esIngreso }) {
  const lineas = []
  if (tipo === 'pasado') {
    if (celda.estimado !== null) lineas.push(`est. ${fmtPlata(celda.estimado)}`)
  } else if (esIngreso) {
    if (celda.real > 0) lineas.push(`cobrado ${fmtPlata(celda.real)}`)
  } else {
    if (celda.real > 0) lineas.push(`pagado ${fmtPlata(celda.real)}`)
    if (celda.pendiente > 0) lineas.push(`a pagar ${fmtPlata(celda.pendiente)}`)
  }
  return lineas.map(l => (
    <span key={l} className="block text-[10px] font-normal not-italic" style={{ color: 'var(--text-xmuted)' }}>{l}</span>
  ))
}

function Valor({ celda }) {
  if (celda.origen === 'vacio') return <span style={{ color: 'var(--text-xmuted)' }}>—</span>
  const estimado = celda.origen === 'estimado'
  return (
    <span className={estimado ? 'italic' : ''} style={{ color: estimado ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
      {fmtPlata(celda.valor)}
    </span>
  )
}

/**
 * Celda de una fila con datos (ingresos o un grupo de egresos).
 *   - mes en curso / futuro y con permiso → se edita el estimado al tocarla
 *   - si no, y hay pagos adentro → abre el detalle
 */
function CeldaDato({ celda, tipo, mes, concepto, label, editable, verDetalle, onGuardar, onDetalle }) {
  const esIngreso = concepto === CONCEPTO_INGRESOS
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const cancelado = useRef(false)

  const seEdita = editable && tipo !== 'pasado'
  const hayPagos = !esIngreso && (celda.real > 0 || celda.pendiente > 0)
  const ayuda = desglose(celda, tipo, esIngreso)

  const abrir = () => {
    cancelado.current = false
    setBorrador(celda.estimado === null ? '' : String(Math.round(celda.estimado)))
    setError(null)
    setEditando(true)
  }

  const confirmar = async () => {
    if (cancelado.current) { setEditando(false); return }
    const texto = String(borrador).trim()
    const nuevo = texto === '' ? null : Math.max(0, Math.round(parseCurrencyValue(texto)))
    if (nuevo === (celda.estimado === null ? null : Math.round(celda.estimado))) { setEditando(false); return }
    setGuardando(true)
    try {
      await onGuardar([{ mes, concepto, monto: nuevo }])
      setEditando(false)
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const tdStyle = { ...bordeFila, ...fondoColumna(tipo) }

  if (editando) {
    return (
      <td className="px-1.5 py-1 text-right align-middle" style={tdStyle}>
        <div className="relative">
          <input
            autoFocus
            inputMode="numeric"
            value={borrador}
            disabled={guardando}
            aria-label={`Estimado de ${label} para ${labelMes(mes, { largo: true })}`}
            onChange={e => setBorrador(e.target.value)}
            onFocus={e => e.target.select()}
            onBlur={confirmar}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') { cancelado.current = true; e.currentTarget.blur() }
            }}
            placeholder="vacío = sin estimar"
            className="w-full rounded-md px-2 py-1 text-right text-xs outline-none tabular-nums"
            style={{ background: 'var(--bg-input)', border: `1px solid ${error ? 'var(--bad)' : 'var(--accent)'}`, color: 'var(--text-primary)' }}
          />
          {guardando && <Loader2 size={11} className="absolute left-1.5 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--accent-lift)' }} />}
        </div>
        {error && <p className="mt-0.5 text-[10px]" style={{ color: 'var(--bad)' }}>{error}</p>}
      </td>
    )
  }

  const contenido = (
    <>
      <Valor celda={celda} />
      {verDetalle && <Subtexto celda={celda} tipo={tipo} esIngreso={esIngreso} />}
    </>
  )

  return (
    <td className="group/celda relative whitespace-nowrap px-0 py-0 text-right align-middle" style={tdStyle}>
      {seEdita ? (
        <button type="button" onClick={abrir} title={`${ayuda ? `${ayuda}. ` : ''}Tocá para ${celda.estimado === null ? 'estimar' : 'cambiar el estimado'}.`}
          aria-label={`${label}, ${labelMes(mes, { largo: true })}: ${celda.origen === 'vacio' ? 'sin datos' : fmtPlata(celda.valor)}. Editar estimado.`}
          className={`cf-editable w-full py-2 pr-3 text-right ${hayPagos && onDetalle ? 'pl-7' : 'pl-3'}`}>
          {contenido}
        </button>
      ) : hayPagos && onDetalle ? (
        <button type="button" onClick={() => onDetalle({ mes, concepto, celda })} title={`${ayuda}. Tocá para ver los pagos.`}
          className="cf-editable w-full px-3 py-2 text-right">
          {contenido}
        </button>
      ) : (
        <div className="px-3 py-2" title={ayuda || undefined}>{contenido}</div>
      )}
      {seEdita && hayPagos && onDetalle && (
        <button type="button" onClick={() => onDetalle({ mes, concepto, celda })}
          aria-label={`Ver los pagos de ${label} en ${labelMes(mes, { largo: true })}`} title="Ver los pagos de esta celda"
          className="absolute left-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded opacity-40 transition-opacity hover:opacity-100 focus:opacity-100 group-hover/celda:opacity-100"
          style={{ color: 'var(--accent-lift)' }}>
          <ListChecks size={12} />
        </button>
      )}
    </td>
  )
}

function FilaSeccion({ titulo, columnas }) {
  return (
    <tr>
      <th scope="rowgroup" className="px-3 pb-1.5 pt-4 text-left text-[10px] font-bold uppercase tracking-widest"
        style={{ ...stickyIzq, color: 'var(--text-muted)' }}>
        {titulo}
      </th>
      {columnas.map(c => <td key={c.mes} style={fondoColumna(c.tipo)} />)}
      <td className="cf-total" />
    </tr>
  )
}

/** Fila calculada (totales, flujo, saldo, indicadores): no se edita. */
function FilaCalculada({ label, columnas, pick, total, formato = fmtPlata, fuerte = false, color, ayuda, fondo = false }) {
  const base = fondo ? { background: 'var(--bg-input)' } : null
  return (
    <tr>
      <th scope="row" title={ayuda} className={`px-3 py-2 text-left text-xs ${fuerte ? 'font-bold' : 'font-medium'}`}
        style={{ ...stickyIzq, ...bordeFila, ...(fondo ? { background: 'var(--bg-input)' } : null), color: fuerte ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
        {label}
      </th>
      {columnas.map(c => {
        const v = pick(c)
        return (
          <td key={c.mes} className={`whitespace-nowrap px-3 py-2 text-right ${fuerte ? 'font-bold' : ''}`}
            style={{ ...bordeFila, ...base, ...fondoColumna(c.tipo), color: v === null ? 'var(--text-xmuted)' : (color ? color(v) : 'var(--text-primary)') }}>
            {v === null ? '—' : formato(v)}
          </td>
        )
      })}
      <td className={`cf-total whitespace-nowrap px-3 py-2 text-right ${fuerte ? 'font-bold' : 'font-semibold'} ${fondo ? 'cf-fondo' : ''}`}
        style={{ ...bordeFila, borderLeft: '1px solid var(--border)', color: total === null || total === undefined ? 'var(--text-xmuted)' : (color ? color(total) : 'var(--text-primary)') }}>
        {total === undefined ? '' : total === null ? '—' : formato(total)}
      </td>
    </tr>
  )
}

function Pildora({ estado }) {
  const e = ESTADOS[estado]
  if (!e.tono) return <span style={{ color: 'var(--text-xmuted)' }}>—</span>
  return (
    <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wide"
      style={{ background: `var(--${e.tono}-soft)`, color: `var(--${e.tono})` }}>
      {e.label}
    </span>
  )
}

export default function CashflowTabla({ modelo, editable, verDetalle, onGuardar, onEstimarFila, onDetalle }) {
  const { columnas, total, saldo } = modelo

  const filaDato = ({ concepto, label, ayuda, fuerte = false }) => (
    <tr key={concepto}>
      <th scope="row" className={`px-3 py-0 text-left text-xs ${fuerte ? 'font-bold' : 'font-medium'}`}
        style={{ ...stickyIzq, ...bordeFila, color: fuerte ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
        <span className="flex items-center justify-between gap-2 py-2">
          <span title={ayuda}>{label}</span>
          {editable && (
            <button type="button" onClick={() => onEstimarFila({ concepto, label })}
              aria-label={`Estimar varios meses de ${label}`} title="Estimar varios meses de una vez"
              className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-colors"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              <CalendarRange size={12} />
            </button>
          )}
        </span>
      </th>
      {columnas.map(c => (
        <CeldaDato key={c.mes}
          celda={concepto === CONCEPTO_INGRESOS ? c.ingresos : c.grupos[concepto]}
          tipo={c.tipo} mes={c.mes} concepto={concepto} label={label}
          editable={editable} verDetalle={verDetalle}
          onGuardar={onGuardar} onDetalle={onDetalle} />
      ))}
      <td className={`cf-total whitespace-nowrap px-3 py-2 text-right ${fuerte ? 'font-bold' : 'font-semibold'}`}
        style={{ ...bordeFila, borderLeft: '1px solid var(--border)', color: 'var(--text-primary)' }}>
        {fmtPlata(concepto === CONCEPTO_INGRESOS ? total.ingresos : total.grupos[concepto])}
      </td>
    </tr>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate text-xs tabular-nums" style={{ borderSpacing: 0, minWidth: 150 + columnas.length * 118 + 130 }}>
        <caption className="sr-only">Cash flow mensual: ingresos, egresos por grupo, flujo neto y saldo de cada mes</caption>
        <thead>
          <tr>
            <th scope="col" className="min-w-[150px] px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest sm:min-w-[220px]"
              style={{ ...stickyIzq, zIndex: 3, color: 'var(--text-muted)', borderBottom: '2px solid var(--border)' }}>
              Concepto
            </th>
            {columnas.map(c => (
              <th key={c.mes} scope="col" className="px-3 py-2.5 text-right" aria-current={c.tipo === 'curso' ? 'date' : undefined}
                style={{ minWidth: 118, borderBottom: '2px solid var(--border)', ...fondoColumna(c.tipo) }}>
                <span className="block text-xs font-bold" style={{ color: c.tipo === 'curso' ? 'var(--accent-lift)' : 'var(--text-primary)' }}>
                  {labelMes(c.mes)}
                </span>
                <span className="block text-[9px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-xmuted)' }}>
                  {TIPO_LABEL[c.tipo]}
                </span>
              </th>
            ))}
            <th scope="col" className="cf-total px-3 py-2.5 text-right text-xs font-bold"
              style={{ minWidth: 130, color: 'var(--text-primary)', borderBottom: '2px solid var(--border)', borderLeft: '1px solid var(--border)' }}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          <FilaSeccion titulo="Ingresos" columnas={columnas} />
          {filaDato({ concepto: CONCEPTO_INGRESOS, label: 'Total ingresos', fuerte: true, ayuda: 'Lo cobrado (efectivo, tarjetas y transferencias). Los canjes a cuenta corriente no cuentan.' })}

          <FilaSeccion titulo="Egresos" columnas={columnas} />
          {GRUPOS.map(g => filaDato({ concepto: g.id, label: g.label, ayuda: `Incluye: ${g.categorias.map(catLabel).join(', ')}` }))}
          <FilaCalculada label="Total egresos" columnas={columnas} pick={c => c.totalEgresos} total={total.totalEgresos} fuerte fondo />

          <tr><td colSpan={columnas.length + 2} className="h-3" /></tr>
          <FilaCalculada label="Flujo neto del mes" columnas={columnas} pick={c => c.flujo} total={total.flujo} fuerte color={colorSigno}
            ayuda="Ingresos menos egresos del mes." />
          <FilaCalculada label="Saldo final" columnas={columnas} pick={c => c.saldoFinal} total={total.saldoFinal} fuerte color={colorSigno}
            ayuda={saldo.configurado ? 'Saldo inicial más el flujo de cada mes, arrastrado.' : 'Cargá el saldo inicial en "Saldo y alertas" para ver esta fila.'} />
          <FilaCalculada label="Saldo mínimo de seguridad" columnas={columnas} pick={() => (saldo.minimo > 0 ? saldo.minimo : null)} />
          <tr>
            <th scope="row" className="px-3 py-2 text-left text-xs font-medium" style={{ ...stickyIzq, ...bordeFila, color: 'var(--text-secondary)' }}>Estado</th>
            {columnas.map(c => (
              <td key={c.mes} className="px-3 py-2 text-right" style={{ ...bordeFila, ...fondoColumna(c.tipo) }}><Pildora estado={c.estado} /></td>
            ))}
            <td className="cf-total" style={{ ...bordeFila, borderLeft: '1px solid var(--border)' }} />
          </tr>
          <FilaCalculada label="Flujo neto acumulado" columnas={columnas} pick={c => c.acumulado} total={total.flujo} color={colorSigno}
            ayuda="Suma del flujo neto desde el primer mes que se ve." />

          <FilaSeccion titulo="Indicadores" columnas={columnas} />
          <FilaCalculada label="Mercadería como % de ingresos" columnas={columnas} pick={c => c.indicadores.mercaderia} total={total.indicadores.mercaderia} formato={fmtPct} />
          <FilaCalculada label="Personal como % de ingresos" columnas={columnas} pick={c => c.indicadores.personal} total={total.indicadores.personal} formato={fmtPct} />
          <FilaCalculada label="Flujo neto como % de ingresos" columnas={columnas} pick={c => c.indicadores.flujo} total={total.indicadores.flujo} formato={fmtPct} color={colorSigno} />
          <FilaCalculada label="Pagos pendientes ya cargados" columnas={columnas} pick={c => (c.pendienteCargado > 0 ? c.pendienteCargado : null)}
            total={total.pendienteCargado > 0 ? total.pendienteCargado : null}
            ayuda="Lo que ya está cargado en Proyección de pagos con vencimiento en ese mes. Está incluido en los egresos de arriba." />
        </tbody>
      </table>
    </div>
  )
}
