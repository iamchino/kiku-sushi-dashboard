import { useState, useMemo } from 'react'
import { Wallet, Plus, AlertTriangle, Link2, Clock, CheckCircle2 } from 'lucide-react'
import { usePagos } from '../../hooks/usePagos'
import { useProveedores } from '../../hooks/useProveedores'
import { ModalShell, Field, Select, TextArea } from '../finanzas/fields'
import { CATEGORIAS, MEDIOS_PAGO, fmtMoney, fmtFecha, catLabel, catColor, medioLabel, localDateISO } from '../../lib/finanzas'

// Pagos centralizados: TODOS los egresos del negocio se registran acá, con la
// caja abierta o cerrada. Un pago es un egreso — Finanzas lo ve al instante.
//
// Reglas visibles para quien paga:
//   · turno abierto + efectivo  → sale de la caja y se descuenta del arqueo
//   · turno abierto + otro medio → queda vinculado al turno, no toca el efectivo
//   · caja cerrada               → se registra igual, sin turno
export default function PagosPanel() {
  const { pagos, empleados, turnoAbierto, loading, error, registrarPago } = usePagos()
  const [modal, setModal] = useState(false)
  const [aviso, setAviso] = useState(null)

  const guardar = async (form) => {
    const r = await registrarPago(form)
    setAviso(r?.descuenta_arqueo
      ? 'Pago registrado. Salió del efectivo de la caja: el arqueo ya lo descuenta.'
      : turnoAbierto
        ? 'Pago registrado y vinculado al turno abierto (no toca el efectivo de la caja).'
        : 'Pago registrado. No había turno de caja abierto, quedó sin vincular.')
  }

  return (
    <section className="rounded-2xl p-5 space-y-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <Wallet size={16} style={{ color: 'var(--accent-lift)' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Pagos</h2>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Todos los egresos del negocio se registran acá — sueldos, proveedores, servicios.
              {turnoAbierto
                ? ' Hay turno abierto: los pagos en efectivo se descuentan del arqueo.'
                : ' La caja está cerrada: los pagos se registran igual, sin turno.'}
            </p>
          </div>
        </div>
        <button onClick={() => { setAviso(null); setModal(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          <Plus size={14} /> Registrar pago
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      {aviso && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent-lift)' }}>
          <CheckCircle2 size={14} /> {aviso}
        </div>
      )}

      {/* Últimos pagos, con todo el detalle a la vista */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
      ) : pagos.length === 0 ? (
        <p className="text-xs py-2" style={{ color: 'var(--text-xmuted)' }}>Todavía no hay pagos registrados.</p>
      ) : (
        <div className="space-y-1.5">
          {pagos.slice(0, 10).map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 flex-wrap"
              style={{ background: 'var(--bg-app)', border: '1px solid var(--border-card)' }}>
              <div className="min-w-0">
                <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                  {p.descripcion}
                  {p.proveedor?.razon_social && <span style={{ color: 'var(--text-muted)' }}> · {p.proveedor.razon_social}</span>}
                  {p.empleado && <span style={{ color: 'var(--text-muted)' }}> · {p.empleado.nombre} {p.empleado.apellido || ''}</span>}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px]">
                  <span className="font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: `${catColor(p.categoria)}22`, color: catColor(p.categoria) }}>
                    {catLabel(p.categoria)}
                  </span>
                  <span style={{ color: 'var(--text-xmuted)' }}>{fmtFecha(p.fecha)} · {medioLabel(p.medio_pago)}</span>
                  {p.estado === 'pendiente' && (
                    <span className="flex items-center gap-1" style={{ color: '#f59e0b' }}>
                      <Clock size={10} /> pendiente{p.vencimiento ? ` · vence ${fmtFecha(p.vencimiento)}` : ''}
                    </span>
                  )}
                  {p.caja_turno_id && (
                    <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Link2 size={10} /> caja
                    </span>
                  )}
                </div>
              </div>
              <span className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                {fmtMoney(p.monto)}
              </span>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <PagoModal
          empleados={empleados}
          turnoAbierto={!!turnoAbierto}
          onClose={() => setModal(false)}
          onSave={guardar}
        />
      )}
    </section>
  )
}

function PagoModal({ empleados, turnoAbierto, onClose, onSave }) {
  const { proveedores } = useProveedores()
  const [form, setForm] = useState({
    categoria: 'proveedores', descripcion: '', monto: '', medio_pago: 'efectivo',
    estado: 'pagado', fecha: localDateISO(), proveedor_id: '', empleado_id: '',
    subtipo: '', periodo: '', vencimiento: '', comprobante_nro: '', notas: '',
  })
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }))
  const esSueldo = form.categoria === 'sueldos'
  const pendiente = form.estado === 'pendiente'

  const efectoCaja = useMemo(() => {
    if (pendiente) return 'Queda como cuenta por pagar: no toca la caja hasta que lo marques pagado.'
    if (!turnoAbierto) return 'La caja está cerrada: el pago se registra sin turno y no toca ningún arqueo.'
    if (form.medio_pago === 'efectivo') return 'Sale del efectivo de la caja abierta: el arqueo lo descuenta automáticamente.'
    return 'Se vincula al turno abierto, pero al no ser efectivo no toca el arqueo.'
  }, [pendiente, turnoAbierto, form.medio_pago])

  const handle = async () => {
    setBusy(true); setError(null)
    try { await onSave(form); onClose() }
    catch (err) { setError(err.message); setBusy(false) }
  }

  const valido = form.descripcion.trim() && Number(form.monto) > 0 && (!esSueldo || form.empleado_id)

  return (
    <ModalShell title="Registrar pago" icon={Wallet} onClose={onClose} maxW="max-w-md">
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Categoría" value={form.categoria} onChange={set('categoria')} required
            options={CATEGORIAS.map(c => ({ value: c.id, label: c.label }))} />
          <Select label="Medio de pago" value={form.medio_pago} onChange={set('medio_pago')} required
            options={MEDIOS_PAGO.map(m => ({ value: m.id, label: m.label }))} />
        </div>

        <Field label="Descripción" value={form.descripcion} onChange={set('descripcion')}
          placeholder={esSueldo ? 'Adelanto / sueldo semana…' : 'Factura pescadería, hielo…'} required />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto" value={form.monto} onChange={set('monto')} inputMode="decimal" placeholder="0" required />
          <Field label="Fecha" type="date" value={form.fecha} onChange={set('fecha')} />
        </div>

        {esSueldo ? (
          <Select label="Empleado" value={form.empleado_id} onChange={set('empleado_id')} required
            options={[{ value: '', label: '— Elegí al empleado —' },
              ...empleados.map(e => ({ value: e.id, label: `${e.nombre} ${e.apellido || ''}`.trim() }))]} />
        ) : (
          <Select label="Proveedor (opcional)" value={form.proveedor_id} onChange={set('proveedor_id')}
            options={[{ value: '', label: '— Sin proveedor —' },
              ...(proveedores || []).map(p => ({ value: p.id, label: p.razon_social }))]} />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Select label="Estado" value={form.estado} onChange={set('estado')}
            options={[{ value: 'pagado', label: 'Pagado' }, { value: 'pendiente', label: 'Pendiente (cta. por pagar)' }]} />
          {pendiente
            ? <Field label="Vencimiento" type="date" value={form.vencimiento} onChange={set('vencimiento')} />
            : <Field label="Comprobante (opcional)" value={form.comprobante_nro} onChange={set('comprobante_nro')} placeholder="Nº factura / recibo" />}
        </div>

        <TextArea label="Notas (opcional)" value={form.notas} onChange={set('notas')} rows={2}
          placeholder="Lo que haga falta para que Finanzas entienda el pago sin preguntar" />

        {/* Qué va a pasar con la caja, dicho ANTES de guardar */}
        <p className="text-[11px] px-3 py-2 rounded-lg"
          style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent-lift)' }}>
          {efectoCaja}
        </p>

        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
        <button onClick={handle} disabled={busy || !valido}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          {busy ? 'Registrando…' : 'Registrar pago'}
        </button>
      </div>
    </ModalShell>
  )
}
