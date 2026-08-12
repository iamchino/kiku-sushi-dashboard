import { useState } from 'react'
import { Landmark, ArrowDownToLine, Scale, AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight, Link2, Plus } from 'lucide-react'
import { useCajaFuerte } from '../../hooks/useCajaFuerte'
import { ModalShell, Field, Select, TextArea } from '../finanzas/fields'
import { fmtMoney, fmtFecha, catLabel } from '../../lib/finanzas'

// La caja fuerte: dónde queda el efectivo cuando no está en la caja
// registradora. Entra al cerrar el turno (retiro), sale por pagos (desde
// Pagos, eligiendo origen "caja fuerte") o por ajustes.
export default function CajaFuertePanel() {
  const { movimientos, saldo, turnoAbierto, loading, error, retirar, ajustar } = useCajaFuerte()
  const [modal, setModal] = useState(null)   // 'agregar' | 'ajuste' | null
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
            title="Corregir el saldo tras un conteo (sobrante o faltante)"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            <Scale size={13} /> Corrección
          </button>
          <button onClick={() => abrir('agregar')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
            <Plus size={14} /> Agregar dinero
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
          La caja está cerrada. Podés agregar efectivo externo con &quot;Agregar dinero&quot;;
          para pagar con efectivo de acá, usá Pagos → origen &quot;caja fuerte&quot;.
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

      {modal === 'agregar' && (
        <AgregarModal onClose={() => setModal(null)} turnoAbierto={!!turnoAbierto}
          onSave={async (origen, monto, nota) => {
            if (origen === 'caja') {
              const r = await retirar(monto, nota)
              setAviso(`Retiro registrado: salió de la caja del día (el arqueo ya lo descuenta). Saldo de caja fuerte: ${fmtMoney(r?.saldo ?? 0)}.`)
            } else {
              const descripcion = nota.trim()
                ? `Depósito externo: ${nota.trim()}`
                : 'Depósito de efectivo externo'
              const r = await ajustar(monto, 'sobrante', descripcion)
              setAviso(`Depósito externo registrado. No toca la caja del día. Saldo de caja fuerte: ${fmtMoney(r?.saldo ?? 0)}.`)
            }
          }} />
      )}
      {modal === 'ajuste' && (
        <AjusteModal onClose={() => setModal(null)}
          onSave={async (monto, direccion, descripcion) => {
            const r = await ajustar(monto, direccion, descripcion)
            setAviso(`Corrección registrada. Saldo de caja fuerte: ${fmtMoney(r?.saldo ?? 0)}.`)
          }} />
      )}
    </section>
  )
}

// "Agregar dinero": la única puerta de entrada de efectivo. Obliga a decir de
// dónde viene la plata, porque las dos opciones hacen cosas distintas:
//   · de la caja del día  → retiro del turno abierto: el arqueo lo DESCUENTA
//   · efectivo externo    → ajuste sobrante: NO toca la caja del día
function AgregarModal({ onClose, onSave, turnoAbierto }) {
  const [origen, setOrigen] = useState(turnoAbierto ? 'caja' : 'externo')
  const [monto, setMonto] = useState('')
  const [nota, setNota]   = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)

  const handle = async () => {
    setBusy(true); setError(null)
    try { await onSave(origen, monto, nota); onClose() }
    catch (err) { setError(err.message); setBusy(false) }
  }

  const opcionStyle = (activa, deshabilitada) => ({
    border: activa ? '1px solid var(--accent-border)' : '1px solid var(--border)',
    background: activa ? 'var(--accent-soft)' : 'transparent',
    color: deshabilitada ? 'var(--text-xmuted)' : activa ? 'var(--accent-lift)' : 'var(--text-secondary)',
    opacity: deshabilitada ? 0.6 : 1,
  })

  return (
    <ModalShell title="Agregar dinero a la caja fuerte" icon={Plus} onClose={onClose} maxW="max-w-sm">
      <div className="p-5 space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>¿De dónde viene la plata?</p>
          <div className="grid grid-cols-1 gap-2">
            <button type="button" disabled={!turnoAbierto}
              onClick={() => setOrigen('caja')}
              className="text-left px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2"
              style={opcionStyle(origen === 'caja', !turnoAbierto)}>
              <ArrowDownToLine size={14} className="flex-shrink-0" />
              <span>
                De la caja del día (retiro del turno)
                <span className="block font-normal text-[10px] mt-0.5" style={{ color: 'var(--text-xmuted)' }}>
                  {turnoAbierto
                    ? 'El arqueo del turno lo descuenta. Las dos puntas quedan vinculadas.'
                    : 'No hay turno de caja abierto.'}
                </span>
              </span>
            </button>
            <button type="button"
              onClick={() => setOrigen('externo')}
              className="text-left px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2"
              style={opcionStyle(origen === 'externo', false)}>
              <Landmark size={14} className="flex-shrink-0" />
              <span>
                Efectivo externo (no estaba en la caja)
                <span className="block font-normal text-[10px] mt-0.5" style={{ color: 'var(--text-xmuted)' }}>
                  Un aporte, plata de otro lado. No toca la caja del día.
                </span>
              </span>
            </button>
          </div>
        </div>

        <Field label="Monto" value={monto} onChange={setMonto} inputMode="decimal" placeholder="0" required />
        <TextArea label={origen === 'caja' ? 'Nota (opcional)' : 'Motivo (opcional)'} value={nota} onChange={setNota}
          rows={2} placeholder={origen === 'caja' ? 'Cierre del sábado…' : 'Aporte para cambio…'} />

        {origen === 'externo' && turnoAbierto && (
          <p className="text-[11px] px-3 py-2 rounded-lg flex items-start gap-1.5"
            style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
            <span>Esto NO descuenta de la caja del día. Si la plata sale de la caja
            abierta, elegí &quot;De la caja del día&quot;.</span>
          </p>
        )}

        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
        <button onClick={handle} disabled={busy || !(Number(monto) > 0)}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          {busy ? 'Registrando…' : origen === 'caja' ? 'Retirar de la caja y depositar' : 'Depositar efectivo externo'}
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
    <ModalShell title="Corrección de saldo" icon={Scale} onClose={onClose} maxW="max-w-sm">
      <div className="p-5 space-y-4">
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          Para cuando el conteo real no coincide con el saldo registrado.
          Para depositar plata usá &quot;Agregar dinero&quot;.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto" value={monto} onChange={setMonto} inputMode="decimal" placeholder="0" required />
          <Select label="Dirección" value={direccion} onChange={setDireccion}
            options={[{ value: 'sobrante', label: 'Sobrante (suma)' }, { value: 'faltante', label: 'Faltante (resta)' }]} />
        </div>
        <TextArea label="Motivo" value={descripcion} onChange={setDescripcion} rows={2}
          placeholder="Conteo real, corrección…" />
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
