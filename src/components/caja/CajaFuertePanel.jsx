import { useState } from 'react'
import { Landmark, ArrowDownToLine, Scale, AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight, Link2 } from 'lucide-react'
import { useCajaFuerte } from '../../hooks/useCajaFuerte'
import { ModalShell, Field, Select, TextArea } from '../finanzas/fields'
import { fmtMoney, fmtFecha, catLabel } from '../../lib/finanzas'

// La caja fuerte: dónde queda el efectivo cuando no está en la caja
// registradora. Entra al cerrar el turno (retiro), sale por pagos (desde
// Pagos, eligiendo origen "caja fuerte") o por ajustes.
export default function CajaFuertePanel() {
  const { movimientos, saldo, turnoAbierto, loading, error, retirar, ajustar } = useCajaFuerte()
  const [modal, setModal] = useState(null)   // 'retiro' | 'ajuste' | null
  const [aviso, setAviso] = useState(null)

  const abrir = (tipo) => { setAviso(null); setModal(tipo) }

  return (
    <section className="rounded-2xl p-5 space-y-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <Landmark size={16} style={{ color: 'var(--accent-lift)' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Caja fuerte</h2>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              El efectivo fuera de la caja. Al cerrar el turno, retirá el efectivo acá;
              si no lo hacés, el próximo turno abre con ese efectivo como fondo inicial.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => abrir('ajuste')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            <Scale size={13} /> Ajuste
          </button>
          <button onClick={() => abrir('retiro')} disabled={!turnoAbierto}
            title={turnoAbierto ? 'Retirar efectivo del turno abierto' : 'No hay turno de caja abierto'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
            <ArrowDownToLine size={14} /> Retirar de la caja
          </button>
        </div>
      </div>

      {/* Saldo */}
      <div className="rounded-xl px-4 py-3 flex items-center justify-between"
        style={{ background: 'var(--bg-app)', border: '1px solid var(--border-card)' }}>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Efectivo en caja fuerte</span>
        <span className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {saldo === null ? '…' : fmtMoney(saldo)}
        </span>
      </div>

      {!turnoAbierto && (
        <p className="text-[11px] px-3 py-2 rounded-lg" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent-lift)' }}>
          La caja está cerrada. Para pagar con efectivo de acá, usá Pagos → origen &quot;caja fuerte&quot;.
          Si necesitás depositar efectivo sin turno abierto, registralo como ajuste (sobrante) con el motivo.
        </p>
      )}

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

      {/* Movimientos */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
      ) : movimientos.length === 0 ? (
        <p className="text-xs py-2" style={{ color: 'var(--text-xmuted)' }}>
          Sin movimientos todavía. El primero suele ser el retiro del cierre de turno.
        </p>
      ) : (
        <div className="space-y-1.5">
          {movimientos.map(m => {
            const suma = m.tipo === 'deposito' || (m.tipo === 'ajuste' && m.categoria === 'sobrante')
            return (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 flex-wrap"
                style={{ background: 'var(--bg-app)', border: '1px solid var(--border-card)' }}>
                <div className="min-w-0 flex items-center gap-2.5">
                  {suma
                    ? <ArrowDownRight size={14} className="flex-shrink-0" style={{ color: '#34d399' }} />
                    : <ArrowUpRight size={14} className="flex-shrink-0" style={{ color: '#f87171' }} />}
                  <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{m.descripcion}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
                      <span>{fmtFecha(m.created_at?.slice(0, 10))}</span>
                      {m.turno?.business_date && (
                        <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                          <Link2 size={10} /> turno {fmtFecha(m.turno.business_date)}
                        </span>
                      )}
                      {m.egreso && (
                        <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                          <Link2 size={10} /> pago · {catLabel(m.egreso.categoria)}
                        </span>
                      )}
                      {m.tipo === 'ajuste' && (
                        <span style={{ color: '#f59e0b' }}>ajuste {m.categoria}</span>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-sm font-semibold flex-shrink-0"
                  style={{ color: suma ? '#34d399' : '#f87171' }}>
                  {suma ? '+' : '−'}{fmtMoney(m.monto)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {modal === 'retiro' && (
        <RetiroModal onClose={() => setModal(null)}
          onSave={async (monto, notas) => {
            const r = await retirar(monto, notas)
            setAviso(`Retiro registrado. El arqueo del turno ya lo descuenta. Saldo de caja fuerte: ${fmtMoney(r?.saldo ?? 0)}.`)
          }} />
      )}
      {modal === 'ajuste' && (
        <AjusteModal onClose={() => setModal(null)}
          onSave={async (monto, direccion, descripcion) => {
            const r = await ajustar(monto, direccion, descripcion)
            setAviso(`Ajuste registrado. Saldo de caja fuerte: ${fmtMoney(r?.saldo ?? 0)}.`)
          }} />
      )}
    </section>
  )
}

function RetiroModal({ onClose, onSave }) {
  const [monto, setMonto] = useState('')
  const [notas, setNotas] = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)

  const handle = async () => {
    setBusy(true); setError(null)
    try { await onSave(monto, notas); onClose() }
    catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <ModalShell title="Retirar efectivo a la caja fuerte" icon={ArrowDownToLine} onClose={onClose} maxW="max-w-sm">
      <div className="p-5 space-y-4">
        <Field label="Monto a retirar" value={monto} onChange={setMonto} inputMode="decimal" placeholder="0" required />
        <TextArea label="Nota (opcional)" value={notas} onChange={setNotas} rows={2} placeholder="Cierre del sábado…" />
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          Sale del efectivo del turno abierto (el arqueo lo descuenta) y se deposita en la
          caja fuerte. Las dos puntas quedan registradas y vinculadas.
        </p>
        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
        <button onClick={handle} disabled={busy || !(Number(monto) > 0)}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          {busy ? 'Registrando…' : 'Retirar a caja fuerte'}
        </button>
      </div>
    </ModalShell>
  )
}

function AjusteModal({ onClose, onSave }) {
  const [monto, setMonto] = useState('')
  const [direccion, setDireccion] = useState('sobrante')
  const [descripcion, setDescripcion] = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)

  const handle = async () => {
    setBusy(true); setError(null)
    try { await onSave(monto, direccion, descripcion); onClose() }
    catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <ModalShell title="Ajuste de caja fuerte" icon={Scale} onClose={onClose} maxW="max-w-sm">
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto" value={monto} onChange={setMonto} inputMode="decimal" placeholder="0" required />
          <Select label="Dirección" value={direccion} onChange={setDireccion}
            options={[{ value: 'sobrante', label: 'Sobrante (suma)' }, { value: 'faltante', label: 'Faltante (resta)' }]} />
        </div>
        <TextArea label="Motivo" value={descripcion} onChange={setDescripcion} rows={2}
          placeholder="Conteo real, depósito con caja cerrada, corrección…" />
        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
        <button onClick={handle} disabled={busy || !(Number(monto) > 0) || !descripcion.trim()}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          {busy ? 'Registrando…' : 'Registrar ajuste'}
        </button>
      </div>
    </ModalShell>
  )
}
