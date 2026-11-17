import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Banknote, Landmark, Loader2, PiggyBank, RefreshCw, Smartphone, Wallet } from 'lucide-react'
import { usePermisos } from '../../context/usePermisos'
import { armarDisponible, fmtSaldo, textoFaltan, validarSaldo } from '../../lib/disponible'
import { cargarDisponible, informarSaldoDeCuenta } from '../../lib/disponibleApi'
import { fmtFecha, localDateISO } from '../../lib/finanzas'
import { Field, ModalShell } from './fields'

// "Disponible hoy": con cuánta plata cuenta el negocio ahora y dónde está.
// No depende del período elegido arriba. La caja y la caja fuerte salen del
// sistema; el saldo de cada cuenta (banco, Mercado Pago) lo carga
// administración a mano cuando mira el home banking: el dashboard no se
// conecta a ningún banco.

const ICONOS = { caja: Wallet, caja_fuerte: PiggyBank, banco: Landmark, billetera: Smartphone, otro: Banknote }

function SaldoCuentaModal({ fila, onClose, onGuardado }) {
  const hoy = localDateISO()
  const [saldo, setSaldo] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [nota, setNota] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const v = validarSaldo({ saldo, fecha, nota }, hoy)
  // El saldo vigente es el de fecha más nueva: uno con fecha anterior al que
  // ya está cargado queda en el historial, pero no cambia lo que se muestra.
  const masViejo = Boolean(fila.fecha) && String(fecha || hoy).slice(0, 10) < fila.fecha

  const guardar = async () => {
    if (!v.ok) { setError(v.error); return }
    setBusy(true); setError(null)
    try {
      await informarSaldoDeCuenta({ cuentaId: fila.id, saldo: v.saldo, fecha: v.fecha, nota: v.nota })
      onGuardado(masViejo
        ? `Saldo de ${fila.nombre} del ${fmtFecha(v.fecha)} guardado en el historial. El vigente sigue siendo el del ${fmtFecha(fila.fecha)}.`
        : `Saldo de ${fila.nombre} actualizado: ${fmtSaldo(v.saldo)}.`)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <ModalShell title={`Saldo de ${fila.nombre}`} icon={Landmark} onClose={busy ? () => {} : onClose} maxW="max-w-sm">
      <div className="p-5 space-y-4" data-modal-saldo>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Copiá el saldo tal como figura en el home banking o en la app. El sistema no se conecta al banco: guarda este número y su fecha.
        </p>
        <div>
          <Field label="Saldo según el banco ($)" value={saldo} onChange={(x) => { setSaldo(x); setError(null) }}
            inputMode="decimal" placeholder="0" required />
          {/* El eco con puntos de miles: un cero de más se ve antes de guardar. */}
          {v.ok && (
            <p data-eco-saldo className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Vas a guardar <strong style={{ color: 'var(--text-primary)' }}>{fmtSaldo(v.saldo)}</strong>
              {fila.monto !== null && ` · el anterior era ${fmtSaldo(fila.monto)}`}
            </p>
          )}
        </div>
        <div>
          <Field label="Fecha del saldo" type="date" value={fecha} onChange={(x) => { setFecha(x); setError(null) }} />
          {masViejo && (
            <p data-saldo-viejo className="mt-1 text-[11px]" style={{ color: '#E8A23F' }}>
              Ya hay un saldo más nuevo, del {fmtFecha(fila.fecha)}: este queda en el historial y no cambia el disponible.
            </p>
          )}
        </div>
        <Field label="Nota (opcional)" value={nota} onChange={setNota} maxLength={200}
          placeholder="Ej: antes de acreditar las tarjetas" />
        {error && <p className="text-xs" style={{ color: '#F2708C' }} data-error-saldo>{error}</p>}
        <button onClick={guardar} disabled={busy || !String(saldo).trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--cta)' }}>
          {busy && <Loader2 size={14} className="animate-spin" />} Guardar saldo
        </button>
      </div>
    </ModalShell>
  )
}

export default function DisponibleHoy() {
  const { puede, puedeEditar } = usePermisos()
  const verCaja = puede('caja')
  const verCajaFuerte = puede('caja_fuerte')
  const editable = puedeEditar('finanzas')

  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState(null)
  const [aviso, setAviso] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const d = await cargarDisponible({ verCaja, verCajaFuerte })
    setDatos(d)
    setCargando(false)
  }, [verCaja, verCajaFuerte])

  useEffect(() => { cargar() }, [cargar])

  const modelo = useMemo(() => armarDisponible(datos || {}), [datos])
  const sinCuentas = modelo.cuentasDisponible && !modelo.filas.some(f => f.tipo === 'cuenta')

  return (
    <div className="rounded-xl p-4" data-disponible
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Banknote size={15} style={{ color: 'var(--accent-lift)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Disponible hoy</p>
            <button onClick={cargar} title="Actualizar" aria-label="Actualizar el disponible" disabled={cargando}
              className="rounded p-1 disabled:opacity-50" style={{ color: 'var(--text-xmuted)' }}>
              <RefreshCw size={12} className={cargando ? 'animate-spin' : ''} />
            </button>
          </div>
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Dónde está la plata ahora. No depende del período elegido arriba.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>
            {modelo.parcial ? 'Total cargado' : 'Total'}
          </p>
          <p className="text-2xl font-bold leading-tight tracking-tight" style={{ color: 'var(--text-primary)' }} data-disponible-total>
            {datos === null ? '—' : fmtSaldo(modelo.total)}
          </p>
          {datos !== null && modelo.faltan.length > 0 && (
            <p className="text-[10px]" style={{ color: '#E8A23F' }} data-disponible-faltan>{textoFaltan(modelo.faltan)}</p>
          )}
        </div>
      </div>

      {aviso && (
        <p className="mt-3 rounded-lg px-3 py-2 text-[11px]" data-disponible-aviso
          style={{ background: 'rgba(63,191,138,0.08)', border: '1px solid rgba(63,191,138,0.2)', color: '#3FBF8A' }}>
          {aviso}
        </p>
      )}

      {datos === null ? (
        <div className="mt-3 space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-11 rounded-lg" />)}</div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {modelo.filas.map(f => {
            const Icono = ICONOS[f.tipo === 'cuenta' ? f.clase : f.tipo] || Landmark
            return (
              <div key={f.id} data-disponible-fila={f.nombre}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-3 py-2"
                style={{ background: 'var(--bg-input)' }}>
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <Icono size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {f.nombre}
                      {f.tipo === 'cuenta' && !f.activa && <span className="ml-1.5 text-[10px] font-normal" style={{ color: 'var(--text-xmuted)' }}>(desactivada)</span>}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{f.detalle}</p>
                    {f.aviso && (
                      <p className="mt-0.5 flex items-start gap-1 text-[11px]" style={{ color: '#E8A23F' }} data-disponible-viejo>
                        <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" /> {f.aviso}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2.5">
                  <span className="text-sm font-bold tabular-nums"
                    style={{ color: f.monto === null ? 'var(--text-xmuted)' : f.monto < 0 ? '#F2708C' : 'var(--text-primary)' }}>
                    {f.monto === null ? '—' : fmtSaldo(f.monto)}
                  </span>
                  {f.tipo === 'cuenta' && editable && (
                    <button onClick={() => { setAviso(null); setEditando(f) }}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                      style={{ color: 'var(--accent-lift)', border: '1px solid var(--accent-border)', background: 'var(--accent-soft)' }}>
                      {f.sinSaldo ? 'Cargar saldo' : 'Actualizar'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {datos !== null && !modelo.cuentasDisponible && (
        <p className="mt-2 text-[11px]" style={{ color: '#E8A23F' }} data-disponible-sin-sql>
          Para sumar el saldo de los bancos falta correr el SQL 59 en Supabase. Por ahora se ven solo la caja y la caja fuerte.
        </p>
      )}
      {datos !== null && sinCuentas && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          No hay cuentas del negocio cargadas. Se agregan en Configuración → Negocio (Banco Galicia, Mercado Pago…).
        </p>
      )}
      <p className="mt-2 text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
        El saldo de cada cuenta se carga a mano, mirando el home banking: el sistema no se conecta al banco.
      </p>

      {editando && (
        <SaldoCuentaModal fila={editando} onClose={() => setEditando(null)}
          onGuardado={(msg) => { setAviso(msg); cargar() }} />
      )}
    </div>
  )
}
