import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Link2,
  Loader2,
  LockKeyhole,
  PlusCircle,
  RefreshCw,
  WalletCards,
} from 'lucide-react'
import { MEDIOS_ARQUEO, MEDIOS_MOVIMIENTO, TIPOS_MOVIMIENTO_CAJA, useCajaArqueo } from '../../hooks/useCajaArqueo'
import { formatMoney } from '../../lib/printing'

const TOLERANCIA_CAJA = 1000

const CANAL_LABEL = {
  salon: 'Salon',
  delivery: 'Delivery',
  whatsapp: 'WhatsApp',
  pedidosya: 'PedidosYa',
  rappi: 'Rappi',
}

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
  const [medio, setMedio] = useState('efectivo')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoria, setCategoria] = useState('')
  const [error, setError] = useState(null)
  const selected = tipoConfig(tipo)

  const submit = async (e) => {
    e.preventDefault()
    if (parseAmount(monto) <= 0) {
      setError('Ingresa un monto mayor a cero.')
      return
    }
    if (!descripcion.trim()) {
      setError('Agrega una descripcion corta.')
      return
    }
    setError(null)
    await onSubmit({
      turno_id: turno.id,
      tipo,
      medio_pago: medio,
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
        <Field label="Tipo de movimiento">
          <div className="grid grid-cols-3 gap-2">
            {TIPOS_MOVIMIENTO_CAJA.map(item => {
              const active = tipo === item.id
              const color = movimientoColor(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setTipo(item.id); setError(null) }}
                  className="rounded-lg px-3 py-2 text-center text-xs font-semibold transition-colors"
                  style={active
                    ? { background: 'var(--accent-soft)', color, border: `1px solid ${color}` }
                    : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  {item.short}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Medio">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {MEDIOS_MOVIMIENTO.map(item => {
              const active = medio === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMedio(item.id)}
                  className="rounded-lg px-3 py-2 text-center text-xs font-semibold transition-colors"
                  style={active
                    ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                    : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  {item.short}
                </button>
              )
            })}
          </div>
        </Field>

        <div className="grid gap-3 lg:grid-cols-[140px_160px_1fr_auto] lg:items-end">
          <Field label="Monto">
            <input
              inputMode="decimal"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="$0"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
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
            <div className="hidden lg:block" />
          )}
          <Field label="Descripcion">
            <input
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: compra urgente, vuelto, saldo a favor"
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
  const [contadoPorMedio, setContadoPorMedio] = useState({})
  const [notas, setNotas] = useState('')
  const [error, setError] = useState(null)

  const medios = resumen.esperadoPorMedio || []

  const totalEsperado = useMemo(
    () => medios.reduce((acc, medio) => acc + Number(medio.esperado || 0), 0),
    [medios],
  )
  const totalContado = useMemo(
    () => medios.reduce((acc, medio) => acc + parseAmount(contadoPorMedio[medio.id]), 0),
    [medios, contadoPorMedio],
  )
  const diferenciaTotal = totalContado - totalEsperado

  const updateContado = (id, value) => {
    setContadoPorMedio(prev => ({ ...prev, [id]: value }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const esperadoMap = {}
    medios.forEach(medio => { esperadoMap[medio.id] = medio.esperado })
    setError(null)
    await onClose({
      turno_id: turno.id,
      contado_por_medio: contadoPorMedio,
      esperado_por_medio: esperadoMap,
      notas_cierre: notas,
    })
  }

  return (
    <Panel>
      <div className="mb-3 flex items-center gap-2">
        <Calculator size={16} style={{ color: 'var(--accent-lift)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Cierre de turno</p>
      </div>
      <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        Anota lo contado en cada medio. La diferencia se calcula contra lo esperado del turno.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <div className="hidden gap-3 px-3 sm:grid sm:grid-cols-[1fr_140px_140px_140px]">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Medio</span>
            <span className="text-right text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Esperado</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Contado</span>
            <span className="text-right text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Diferencia</span>
          </div>
          {medios.map(medio => {
            const contado = parseAmount(contadoPorMedio[medio.id])
            const tieneValor = String(contadoPorMedio[medio.id] ?? '').trim() !== ''
            const diferencia = contado - Number(medio.esperado || 0)
            return (
              <div
                key={medio.id}
                className="grid items-center gap-3 rounded-lg px-3 py-2 sm:grid-cols-[1fr_140px_140px_140px]"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
              >
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{medio.label}</span>
                <span className="text-sm sm:text-right" style={{ color: 'var(--text-secondary)' }}>
                  <span className="sm:hidden text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Esperado </span>
                  ${formatMoney(medio.esperado)}
                </span>
                <input
                  inputMode="decimal"
                  value={contadoPorMedio[medio.id] ?? ''}
                  onChange={e => updateContado(medio.id, e.target.value)}
                  placeholder="$0"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
                <span className="text-sm font-semibold sm:text-right" style={{ color: tieneValor ? diferenciaColor(diferencia) : 'var(--text-muted)' }}>
                  {tieneValor ? `${diferencia >= 0 ? '+' : '-'}$${formatMoney(Math.abs(diferencia))}` : '-'}
                </span>
              </div>
            )
          })}
        </div>

        <Field label="Nota cierre">
          <input
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Responsable, sobre, observaciones"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle()}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Total contado" value={`$${formatMoney(totalContado)}`} icon={WalletCards} color="var(--accent-lift)" />
          <Metric label="Total esperado" value={`$${formatMoney(totalEsperado)}`} icon={Calculator} color="#4f8ef7" />
          <Metric label="Diferencia" value={`${diferenciaTotal >= 0 ? '+' : '-'}$${formatMoney(Math.abs(diferenciaTotal))}`} detail={`Tolerancia $${formatMoney(TOLERANCIA_CAJA)}`} icon={AlertTriangle} color={diferenciaColor(diferenciaTotal)} />
        </div>

        <div className="flex justify-end">
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

function medioLabel(id) {
  return MEDIOS_ARQUEO.find(medio => medio.id === id)?.label || id
}

function pagoDetalle(pago) {
  const partes = []
  if (pago.pedido_mesa) partes.push(`Mesa ${pago.pedido_mesa}`)
  const canal = CANAL_LABEL[pago.pedido_canal] || pago.pedido_canal
  if (canal) partes.push(canal)
  if (pago.pedido_id) partes.push(`#${String(pago.pedido_id).slice(-4).toUpperCase()}`)
  if (pago.numero_operacion) partes.push(`Op. ${pago.numero_operacion}`)
  return partes.join(' - ')
}

function ConciliacionPanel({ ventasPorMedio, pagos }) {
  // Set de medios seleccionados. Vacio = mostrar todos.
  const [seleccionados, setSeleccionados] = useState(() => new Set())

  const toggle = (id) => {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const pagosVisibles = useMemo(() => {
    if (seleccionados.size === 0) return pagos
    return pagos.filter(pago => seleccionados.has(pago.medio_pago))
  }, [pagos, seleccionados])

  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <WalletCards size={16} style={{ color: 'var(--accent-lift)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Conciliacion por medio</p>
        </div>
        {seleccionados.size > 0 && (
          <button
            type="button"
            onClick={() => setSeleccionados(new Set())}
            className="text-xs font-semibold"
            style={{ color: 'var(--accent-lift)' }}
          >
            Ver todos
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {ventasPorMedio.map(medio => {
          const active = seleccionados.has(medio.id)
          return (
            <button
              key={medio.id}
              type="button"
              onClick={() => toggle(medio.id)}
              className="flex items-center justify-between rounded-lg px-3 py-3 text-left transition-colors"
              style={active
                ? { background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }
                : { background: 'var(--bg-input)', border: '1px solid var(--border)' }}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{medio.label}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{medio.cantidad} pagos</p>
              </div>
              <p className="text-sm font-bold" style={{ color: medio.id === 'efectivo' ? '#34d399' : 'var(--accent-lift)' }}>
                ${formatMoney(medio.total)}
              </p>
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {seleccionados.size === 0
              ? 'Detalle de pagos (todos)'
              : `Detalle: ${[...seleccionados].map(medioLabel).join(', ')}`}
          </p>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{pagosVisibles.length} pagos</span>
        </div>

        {pagosVisibles.length === 0 ? (
          <p className="rounded-lg px-3 py-4 text-sm" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
            No hay pagos para este filtro.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y rounded-lg" style={{ borderColor: 'var(--border)', border: '1px solid var(--border)' }}>
            {pagosVisibles.map(pago => (
              <div key={pago.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {medioLabel(pago.medio_pago)}
                  </p>
                  <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                    {[pagoDetalle(pago), timeLabel(pago.created_at)].filter(Boolean).join(' - ')}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold" style={{ color: pago.medio_pago === 'efectivo' ? '#34d399' : 'var(--accent-lift)' }}>
                  ${formatMoney(pago.monto)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}

function belongsToTurnLocal(row, turno, fieldName) {
  if (!turno || !row) return false
  if (row[fieldName]) return row[fieldName] === turno.id
  if (!row.created_at) return false
  const created = new Date(row.created_at).getTime()
  const start = new Date(turno.apertura_at).getTime()
  const end = turno.cierre_at ? new Date(turno.cierre_at).getTime() : Date.now()
  return created >= start && created <= end
}

function CierreDetalle({ turno, movimientos, pagos }) {
  const detalleMedios = turno.denominaciones_cierre?.medios || null
  const movs = movimientos.filter(mov => belongsToTurnLocal(mov, turno, 'turno_id'))
  const turnoPagos = pagos.filter(pago => belongsToTurnLocal(pago, turno, 'caja_turno_id'))

  const cobrosPorMedio = MEDIOS_ARQUEO.map(medio => {
    const rows = turnoPagos.filter(pago => pago.medio_pago === medio.id)
    const total = rows.reduce((acc, row) => acc + Number(row.monto || 0), 0)
    return { ...medio, total, cantidad: rows.length }
  })

  return (
    <div className="mt-1 space-y-4 rounded-lg p-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
      <div className="grid gap-2 sm:grid-cols-3 text-xs">
        <div>
          <p className="font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Apertura</p>
          <p style={{ color: 'var(--text-secondary)' }}>Fondo inicial ${formatMoney(turno.apertura_monto || 0)}</p>
          {turno.notas_apertura && <p style={{ color: 'var(--text-muted)' }}>{turno.notas_apertura}</p>}
        </div>
        <div>
          <p className="font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Cierre</p>
          <p style={{ color: 'var(--text-secondary)' }}>{timeLabel(turno.cierre_at)}</p>
          {turno.notas_cierre && <p style={{ color: 'var(--text-muted)' }}>{turno.notas_cierre}</p>}
        </div>
        <div>
          <p className="font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Totales</p>
          <p style={{ color: 'var(--text-secondary)' }}>Esperado ${formatMoney(turno.efectivo_esperado || 0)}</p>
          <p style={{ color: 'var(--text-secondary)' }}>Contado ${formatMoney(turno.cierre_monto || 0)}</p>
        </div>
      </div>

      {/* Desglose por medio del cierre */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Cierre por medio</p>
        {detalleMedios ? (
          <div className="space-y-1">
            <div className="hidden gap-2 px-2 sm:grid sm:grid-cols-[1fr_110px_110px_110px] text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              <span>Medio</span><span className="text-right">Esperado</span><span className="text-right">Contado</span><span className="text-right">Diferencia</span>
            </div>
            {MEDIOS_ARQUEO.map(medio => {
              const dato = detalleMedios[medio.id] || { esperado: 0, contado: 0 }
              const dif = Number(dato.contado || 0) - Number(dato.esperado || 0)
              return (
                <div key={medio.id} className="grid gap-2 rounded px-2 py-1.5 text-xs sm:grid-cols-[1fr_110px_110px_110px]" style={{ background: 'var(--bg-card)' }}>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{medio.label}</span>
                  <span className="sm:text-right" style={{ color: 'var(--text-secondary)' }}>${formatMoney(dato.esperado)}</span>
                  <span className="sm:text-right" style={{ color: 'var(--text-secondary)' }}>${formatMoney(dato.contado)}</span>
                  <span className="font-semibold sm:text-right" style={{ color: diferenciaColor(dif) }}>{dif >= 0 ? '+' : '-'}${formatMoney(Math.abs(dif))}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Cierre antiguo sin desglose por medio.</p>
        )}
      </div>

      {/* Cobros del turno por medio */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Cobros del turno</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {cobrosPorMedio.map(medio => (
            <div key={medio.id} className="flex items-center justify-between rounded px-2 py-1.5 text-xs" style={{ background: 'var(--bg-card)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{medio.label} · {medio.cantidad}</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>${formatMoney(medio.total)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Movimientos del turno */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Movimientos del turno ({movs.length})
        </p>
        {movs.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sin movimientos manuales.</p>
        ) : (
          <div className="divide-y rounded" style={{ borderColor: 'var(--border)', border: '1px solid var(--border)' }}>
            {movs.map(mov => {
              const sign = tipoConfig(mov.tipo).sign
              const color = movimientoColor(mov.tipo)
              return (
                <div key={mov.id} className="flex items-center justify-between gap-3 px-2 py-1.5 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-semibold" style={{ color: 'var(--text-primary)' }}>{mov.descripcion}</p>
                    <p className="truncate" style={{ color: 'var(--text-muted)' }}>
                      {tipoConfig(mov.tipo).label} · {medioLabel(mov.medio_pago)} · {timeLabel(mov.created_at)}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold" style={{ color }}>
                    {sign < 0 ? '-' : sign > 0 ? '+' : ''}${formatMoney(mov.monto)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function CierresHistorial({ turnos, movimientos, pagos }) {
  const [abierto, setAbierto] = useState(null)
  const cerrados = turnos.filter(turno => turno.estado === 'cerrado').slice(0, 5)

  return (
    <Panel>
      <div className="mb-3 flex items-center gap-2">
        <Clock3 size={16} style={{ color: 'var(--accent-lift)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Ultimos cierres</p>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {cerrados.map(turno => {
          const expanded = abierto === turno.id
          const dif = Number(turno.diferencia || 0)
          return (
            <div key={turno.id} className="py-2">
              <button
                type="button"
                onClick={() => setAbierto(expanded ? null : turno.id)}
                className="grid w-full items-center gap-2 py-1 text-left text-sm sm:grid-cols-[20px_1fr_140px_140px_140px] sm:items-center"
              >
                <span style={{ color: 'var(--text-muted)' }}>
                  {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </span>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{turno.caja_nombre}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeLabel(turno.apertura_at)} a {timeLabel(turno.cierre_at)}</p>
                </div>
                <p style={{ color: 'var(--text-secondary)' }}>Esperado ${formatMoney(turno.efectivo_esperado || 0)}</p>
                <p style={{ color: 'var(--text-secondary)' }}>Contado ${formatMoney(turno.cierre_monto || 0)}</p>
                <p className="font-bold" style={{ color: diferenciaColor(dif) }}>
                  {dif >= 0 ? '+' : '-'}${formatMoney(Math.abs(dif))}
                </p>
              </button>
              {expanded && <CierreDetalle turno={turno} movimientos={movimientos} pagos={pagos} />}
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
    movimientos,
    pagos,
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
            <ConciliacionPanel ventasPorMedio={resumen.ventasPorMedio} pagos={resumen.pagosTurno} />

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
        <CierresHistorial turnos={turnos} movimientos={movimientos} pagos={pagos} />
      )}
    </section>
  )
}
