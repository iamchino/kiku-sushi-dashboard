import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Calculator,
  CheckCircle2,
  Clock3,
  Link2,
  Loader2,
  LockKeyhole,
  PlusCircle,
  RefreshCw,
  WalletCards,
} from 'lucide-react'
import { TIPOS_MOVIMIENTO_CAJA, useCajaArqueo } from '../../hooks/useCajaArqueo'
import { formatMoney } from '../../lib/printing'

const DENOMINACIONES = [20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10]
const TOLERANCIA_CAJA = 1000

function localDateISO(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseAmount(value) {
  const cleaned = String(value ?? '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : 0
}

function timeLabel(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function tipoConfig(tipo) {
  return TIPOS_MOVIMIENTO_CAJA.find(item => item.id === tipo) || TIPOS_MOVIMIENTO_CAJA[0]
}

function movimientoColor(tipo) {
  const sign = tipoConfig(tipo).sign
  if (sign > 0) return '#34d399'
  if (sign < 0) return '#f87171'
  return '#fbbf24'
}

function diferenciaColor(value) {
  const abs = Math.abs(Number(value || 0))
  if (abs <= TOLERANCIA_CAJA) return '#34d399'
  if (abs <= TOLERANCIA_CAJA * 3) return '#fbbf24'
  return '#f87171'
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function inputStyle() {
  return {
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
  }
}

function Panel({ children, className = '' }) {
  return (
    <section
      className={`rounded-lg p-4 ${className}`}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}
    >
      {children}
    </section>
  )
}

function Metric({ label, value, detail, icon: Icon, color = 'var(--accent-lift)' }) {
  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight" style={{ color }}>{value}</p>
          {detail && <p className="mt-1 truncate text-xs" style={{ color: 'var(--text-muted)' }}>{detail}</p>}
        </div>
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)', color }}>
            <Icon size={17} />
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyTurnoForm({ onOpen, saving }) {
  const [form, setForm] = useState({
    caja_nombre: 'Caja principal',
    business_date: localDateISO(),
    apertura_monto: '',
    notas_apertura: '',
  })
  const [error, setError] = useState(null)

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    if (parseAmount(form.apertura_monto) < 0) {
      setError('El fondo inicial no puede ser negativo.')
      return
    }
    setError(null)
    await onOpen(form)
  }

  return (
    <Panel>
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_160px_160px_auto] lg:items-end">
        <Field label="Caja">
          <input
            value={form.caja_nombre}
            onChange={e => update('caja_nombre', e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle()}
          />
        </Field>
        <Field label="Fecha operativa">
          <input
            type="date"
            value={form.business_date}
            onChange={e => update('business_date', e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle()}
          />
        </Field>
        <Field label="Fondo inicial">
          <input
            inputMode="decimal"
            value={form.apertura_monto}
            onChange={e => update('apertura_monto', e.target.value)}
            placeholder="$0"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle()}
          />
        </Field>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <LockKeyhole size={15} />}
          Abrir turno
        </button>
        <div className="lg:col-span-4">
          <Field label="Nota apertura">
            <input
              value={form.notas_apertura}
              onChange={e => update('notas_apertura', e.target.value)}
              placeholder="Responsable, caja fisica, aclaraciones"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle()}
            />
          </Field>
          {error && <p className="mt-2 text-xs" style={{ color: '#f87171' }}>{error}</p>}
        </div>
      </form>
    </Panel>
  )
}

function MovimientoForm({ turno, onSubmit, saving }) {
  const [tipo, setTipo] = useState('ingreso')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoria, setCategoria] = useState('')
  const [error, setError] = useState(null)
  const selected = tipoConfig(tipo)

  const submit = async (e) => {
    e.preventDefault()
    if (tipo !== 'no_venta' && parseAmount(monto) <= 0) {
      setError('Ingresa un monto mayor a cero.')
      return
    }
    if (!descripcion.trim() && tipo !== 'no_venta') {
      setError('Agrega una descripcion corta.')
      return
    }
    setError(null)
    await onSubmit({
      turno_id: turno.id,
      tipo,
      monto,
      categoria: tipo === 'ajuste' ? categoria : null,
      descripcion: descripcion.trim() || selected.label,
    })
    setMonto('')
    setDescripcion('')
    setCategoria('')
  }

  return (
    <Panel>
      <div className="mb-3 flex items-center gap-2">
        <PlusCircle size={16} style={{ color: 'var(--accent-lift)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Registrar movimiento</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIPOS_MOVIMIENTO_CAJA.map(item => {
            const active = tipo === item.id
            const color = movimientoColor(item.id)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => { setTipo(item.id); setError(null) }}
                className="rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors"
                style={active
                  ? { background: 'var(--accent-soft)', color, border: `1px solid ${color}` }
                  : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                {item.short}
              </button>
            )
          })}
        </div>

        <div className="grid gap-3 lg:grid-cols-[140px_160px_1fr_auto] lg:items-end">
          <Field label="Monto">
            <input
              disabled={tipo === 'no_venta'}
              inputMode="decimal"
              value={tipo === 'no_venta' ? '0' : monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="$0"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50"
              style={inputStyle()}
            />
          </Field>
          {tipo === 'ajuste' ? (
            <Field label="Tipo ajuste">
              <select
                value={categoria}
                onChange={e => setCategoria(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle()}
              >
                <option value="">Sobrante</option>
                <option value="faltante">Faltante</option>
              </select>
            </Field>
          ) : (
            <Field label="Medio">
              <input
                value="Efectivo"
                readOnly
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle()}
              />
            </Field>
          )}
          <Field label="Descripcion">
            <input
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: compra urgente, retiro parcial, caja abierta"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle()}
            />
          </Field>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ color: 'var(--accent-lift)', border: '1px solid var(--accent-border)', background: 'var(--accent-soft)' }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
            Guardar
          </button>
        </div>
        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
      </form>
    </Panel>
  )
}

function CierreTurnoPanel({ turno, resumen, onClose, saving }) {
  const [denominaciones, setDenominaciones] = useState({})
  const [otros, setOtros] = useState('')
  const [deposito, setDeposito] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState(null)

  const contadoBilletes = useMemo(() => DENOMINACIONES.reduce((acc, denom) => {
    const qty = Number(denominaciones[denom] || 0)
    return acc + denom * qty
  }, 0), [denominaciones])

  const contado = contadoBilletes + parseAmount(otros)
  const diferencia = contado - Number(resumen.efectivoEsperado || 0)
  const color = diferenciaColor(diferencia)

  const updateDenom = (denom, value) => {
    setDenominaciones(prev => ({
      ...prev,
      [denom]: Math.max(0, Number(value || 0)),
    }))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (contado < 0) {
      setError('El efectivo contado no puede ser negativo.')
      return
    }
    setError(null)
    await onClose({
      turno_id: turno.id,
      cierre_monto: contado,
      efectivo_esperado: resumen.efectivoEsperado,
      deposito_monto: deposito,
      notas_cierre: notas,
      denominaciones_cierre: { billetes: denominaciones, otros: parseAmount(otros) },
    })
  }

  return (
    <Panel>
      <div className="mb-3 flex items-center gap-2">
        <Calculator size={16} style={{ color: 'var(--accent-lift)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Cierre de turno</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {DENOMINACIONES.map(denom => (
            <label key={denom} className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>${formatMoney(denom)}</span>
              <input
                type="number"
                min="0"
                value={denominaciones[denom] || ''}
                onChange={e => updateDenom(denom, e.target.value)}
                className="mt-1 w-full bg-transparent text-sm font-semibold outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
            </label>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[160px_160px_1fr_auto] lg:items-end">
          <Field label="Otros / monedas">
            <input
              inputMode="decimal"
              value={otros}
              onChange={e => setOtros(e.target.value)}
              placeholder="$0"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle()}
            />
          </Field>
          <Field label="Deposito">
            <input
              inputMode="decimal"
              value={deposito}
              onChange={e => setDeposito(e.target.value)}
              placeholder="$0"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle()}
            />
          </Field>
          <Field label="Nota cierre">
            <input
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Responsable, sobre, observaciones"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle()}
            />
          </Field>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Cerrar turno
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Contado" value={`$${formatMoney(contado)}`} icon={WalletCards} color="var(--accent-lift)" />
          <Metric label="Esperado" value={`$${formatMoney(resumen.efectivoEsperado)}`} icon={Calculator} color="#4f8ef7" />
          <Metric label="Diferencia" value={`${diferencia >= 0 ? '+' : '-'}$${formatMoney(Math.abs(diferencia))}`} detail={`Tolerancia $${formatMoney(TOLERANCIA_CAJA)}`} icon={AlertTriangle} color={color} />
        </div>
        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
      </form>
    </Panel>
  )
}

function MovimientosList({ movimientos }) {
  if (movimientos.length === 0) {
    return (
      <Panel>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Movimientos del turno</p>
        <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>Todavia no hay movimientos manuales.</p>
      </Panel>
    )
  }

  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Movimientos del turno</p>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{movimientos.length} registros</span>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {movimientos.slice(0, 8).map(mov => {
          const sign = tipoConfig(mov.tipo).sign
          const color = movimientoColor(mov.tipo)
          const Icon = sign < 0 ? ArrowDownCircle : sign > 0 ? ArrowUpCircle : Clock3
          return (
            <div key={mov.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--bg-input)', color }}>
                  <Icon size={15} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{mov.descripcion}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{tipoConfig(mov.tipo).label} - {timeLabel(mov.created_at)}</p>
                </div>
              </div>
              <p className="shrink-0 text-sm font-bold" style={{ color }}>
                {sign < 0 ? '-' : sign > 0 ? '+' : ''}${formatMoney(mov.monto)}
              </p>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export default function ArqueoCajaSection({ dateFrom, dateTo }) {
  const {
    turnoActual,
    turnos,
    resumen,
    loading,
    error,
    setupWarning,
    refetch,
    abrirTurno,
    registrarMovimiento,
    cerrarTurno,
    vincularPagosAlTurno,
  } = useCajaArqueo({ dateFrom, dateTo })

  const [busy, setBusy] = useState(null)
  const [notice, setNotice] = useState(null)

  const run = async (key, action, okText) => {
    setBusy(key)
    setNotice(null)
    try {
      await action()
      setNotice({ type: 'ok', text: okText })
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'No se pudo completar la accion.' })
    } finally {
      setBusy(null)
    }
  }

  const diferenciaActiva = 0

  return (
    <section className="mt-5 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Arqueo operativo
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Turno de caja y movimientos
          </h2>
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {(setupWarning || error || notice) && (
        <div className="space-y-2">
          {setupWarning && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
              {setupWarning}
            </div>
          )}
          {error && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{
              background: notice.type === 'ok' ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
              color: notice.type === 'ok' ? '#34d399' : '#f87171',
              border: `1px solid ${notice.type === 'ok' ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}>
              {notice.text}
            </div>
          )}
        </div>
      )}

      {!turnoActual ? (
        <EmptyTurnoForm
          saving={busy === 'abrir'}
          onOpen={(values) => run('abrir', () => abrirTurno(values), 'Turno abierto.')}
        />
      ) : (
        <>
          <Panel>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
                    <CheckCircle2 size={13} />
                    Turno abierto
                  </span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{turnoActual.caja_nombre}</span>
                </div>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Apertura {timeLabel(turnoActual.apertura_at)} - Fecha operativa {turnoActual.business_date}
                </p>
              </div>
              {resumen.pagosSinTurno.length > 0 && (
                <button
                  onClick={() => run('vincular', vincularPagosAlTurno, 'Pagos vinculados al turno.')}
                  disabled={Boolean(busy)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  style={{ color: 'var(--accent-lift)', border: '1px solid var(--accent-border)', background: 'var(--accent-soft)' }}
                >
                  {busy === 'vincular' ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                  Vincular {resumen.pagosSinTurno.length} pagos
                </button>
              )}
            </div>
          </Panel>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Efectivo esperado" value={`$${formatMoney(resumen.efectivoEsperado)}`} detail={`Apertura $${formatMoney(resumen.apertura)}`} icon={Banknote} color="#34d399" />
            <Metric label="Ventas cobradas" value={`$${formatMoney(resumen.ventasTotal)}`} detail={`${resumen.pagosTurno.length} pagos registrados`} icon={WalletCards} color="#4f8ef7" />
            <Metric label="Movimientos netos" value={`${resumen.movimientosNeto >= 0 ? '+' : '-'}$${formatMoney(Math.abs(resumen.movimientosNeto))}`} detail={`+${formatMoney(resumen.movimientosIngresos)} / -${formatMoney(resumen.movimientosEgresos)}`} icon={Calculator} color={resumen.movimientosNeto >= 0 ? '#34d399' : '#f87171'} />
            <Metric label="Revision" value={resumen.pedidosSinPago.length} detail={`Pedidos sin pago: $${formatMoney(resumen.pedidosSinPagoTotal)}`} icon={AlertTriangle} color={resumen.pedidosSinPago.length > 0 ? '#fbbf24' : diferenciaColor(diferenciaActiva)} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Panel>
              <div className="mb-3 flex items-center gap-2">
                <WalletCards size={16} style={{ color: 'var(--accent-lift)' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Conciliacion por medio</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {resumen.ventasPorMedio.map(medio => (
                  <div key={medio.id} className="flex items-center justify-between rounded-lg px-3 py-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{medio.label}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{medio.cantidad} pagos</p>
                    </div>
                    <p className="text-sm font-bold" style={{ color: medio.id === 'efectivo' ? '#34d399' : 'var(--accent-lift)' }}>
                      ${formatMoney(medio.total)}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                  <AlertTriangle size={17} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Puntos de control</p>
                  <p className="mt-2 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                    {resumen.pedidosSinPago.length === 0
                      ? 'Todos los pedidos del rango tienen pago registrado.'
                      : `${resumen.pedidosSinPago.length} pedidos del rango no tienen pago registrado.`}
                  </p>
                  <p className="text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                    {resumen.pagosSinTurno.length === 0
                      ? 'No hay pagos sueltos fuera del turno.'
                      : `${resumen.pagosSinTurno.length} pagos estan sin turno y conviene vincularlos.`}
                  </p>
                </div>
              </div>
            </Panel>
          </div>

          <MovimientoForm
            turno={turnoActual}
            saving={busy === 'movimiento'}
            onSubmit={(values) => run('movimiento', () => registrarMovimiento(values), 'Movimiento registrado.')}
          />

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <CierreTurnoPanel
              turno={turnoActual}
              resumen={resumen}
              saving={busy === 'cerrar'}
              onClose={(values) => run('cerrar', () => cerrarTurno(values), 'Turno cerrado.')}
            />
            <MovimientosList movimientos={resumen.movimientosTurno} />
          </div>
        </>
      )}

      {turnos.filter(turno => turno.estado === 'cerrado').length > 0 && (
        <Panel>
          <div className="mb-3 flex items-center gap-2">
            <Clock3 size={16} style={{ color: 'var(--accent-lift)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Ultimos cierres</p>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {turnos.filter(turno => turno.estado === 'cerrado').slice(0, 5).map(turno => (
              <div key={turno.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_140px_140px_140px] sm:items-center">
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{turno.caja_nombre}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeLabel(turno.apertura_at)} a {timeLabel(turno.cierre_at)}</p>
                </div>
                <p style={{ color: 'var(--text-secondary)' }}>Esperado ${formatMoney(turno.efectivo_esperado || 0)}</p>
                <p style={{ color: 'var(--text-secondary)' }}>Contado ${formatMoney(turno.cierre_monto || 0)}</p>
                <p className="font-bold" style={{ color: diferenciaColor(turno.diferencia || 0) }}>
                  {(Number(turno.diferencia || 0) >= 0) ? '+' : '-'}${formatMoney(Math.abs(Number(turno.diferencia || 0)))}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </section>
  )
}
