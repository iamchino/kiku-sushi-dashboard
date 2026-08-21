import { useMemo, useState } from 'react'
import { Wallet } from 'lucide-react'
import { usePagos } from '../../hooks/usePagos'
import { useProveedores } from '../../hooks/useProveedores'
import { ModalShell, Field, Select, TextArea } from '../finanzas/fields'
import { CATEGORIAS, MEDIOS_PAGO, localDateISO } from '../../lib/finanzas'

// Alta centralizada de pagos: ESTE es el único formulario para registrar un
// egreso del negocio. Lo usan Caja → Pagos, el arqueo del turno abierto
// (botón "Egreso") y Finanzas → Egresos. Cualquier cambio de reglas se hace
// una sola vez, acá.
//
// Reglas de dónde sale la plata, visibles para quien paga:
//   · efectivo + "caja del día"    → descuenta del arqueo del turno abierto
//   · efectivo + "caja fuerte"     → descuenta del saldo de la caja fuerte
//   · efectivo sin origen          → no toca ninguna caja
//   · transferencia + cuenta banco → descuenta del ESPERADO EN TRANSFERENCIAS
//                                    del turno; nunca toca la caja fuerte
//   · tarjetas / cheque            → se registran sin mover caja ni banco
//
// El trabajo transaccional lo hace el RPC registrar_pago().
export default function RegistrarPagoModal({
  onClose,
  onRegistrado,
  origenInicial = null,
  // 'pendiente' arranca el formulario como cuenta por pagar (una proyección):
  // no mueve plata todavía y pide fecha de vencimiento.
  estadoInicial = 'pagado',
  titulo = 'Registrar pago',
}) {
  const { empleados, turnoAbierto, bancoCuenta, registrarPago } = usePagos({ lista: false })
  const { proveedores } = useProveedores()

  const [form, setForm] = useState({
    categoria: 'proveedores', descripcion: '', monto: '', medio_pago: 'efectivo',
    estado: estadoInicial, fecha: localDateISO(), proveedor_id: '', empleado_id: '',
    subtipo: '', periodo: '', vencimiento: '', comprobante_nro: '', notas: '',
    origen: origenInicial || 'auto',
  })
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }))
  const esSueldo        = form.categoria === 'sueldos'
  const pendiente       = form.estado === 'pendiente'
  const esEfectivo      = form.medio_pago === 'efectivo'
  const esTransferencia = form.medio_pago === 'transferencia'

  // De dónde sale la plata, ya resuelto para que el select nunca mienta:
  //   · efectivo      → caja del día | caja fuerte | ninguno
  //   · transferencia → cuenta del negocio (banco) | ninguno
  //   · resto         → no mueve nada
  // 'auto' es el default de la base. Las opciones elegidas por el usuario no
  // se pisan ni se bloquean: si algo no cierra, lo valida el RPC.
  const origenResuelto = useMemo(() => {
    if (pendiente) return 'ninguno'
    if (esEfectivo) {
      return ['caja', 'caja_fuerte', 'ninguno'].includes(form.origen)
        ? form.origen
        : (turnoAbierto ? 'caja' : 'caja_fuerte')
    }
    if (esTransferencia) {
      return ['banco', 'ninguno'].includes(form.origen) ? form.origen : 'banco'
    }
    return 'ninguno'
  }, [pendiente, esEfectivo, esTransferencia, form.origen, turnoAbierto])

  const efectoCaja = useMemo(() => {
    if (pendiente) return 'Queda como cuenta por pagar: no toca la caja hasta que lo marques pagado.'
    if (esEfectivo) {
      if (origenResuelto === 'caja_fuerte') return 'Sale de la CAJA FUERTE: descuenta de su saldo, no toca el arqueo del turno.'
      if (origenResuelto === 'caja') return turnoAbierto
        ? 'Sale de la CAJA DEL DÍA (turno abierto): el arqueo lo descuenta automáticamente.'
        : 'No veo ningún turno de caja abierto. Si guardás así, la base va a rechazar el pago: abrí el turno en Arqueo o elegí otro origen.'
      return 'Efectivo sin origen registrado: no descuenta de la caja ni de la caja fuerte.'
    }
    if (esTransferencia) {
      if (origenResuelto === 'banco') return turnoAbierto
        ? `Sale de ${bancoCuenta}: descuenta del ESPERADO EN TRANSFERENCIAS del turno abierto. No toca la caja fuerte, que es efectivo.`
        : `Sale de ${bancoCuenta}. Como no hay turno abierto, queda registrado sin imputarse a ningún arqueo.`
      return 'Transferencia sin origen registrado: queda anotada, sin descontar de ninguna cuenta.'
    }
    return 'No es efectivo ni transferencia: se registra sin tocar la caja ni la cuenta del banco.'
  }, [pendiente, turnoAbierto, esEfectivo, esTransferencia, origenResuelto, bancoCuenta])

  const valido = form.descripcion.trim() && Number(form.monto) > 0 && (!esSueldo || form.empleado_id)

  const guardar = async () => {
    setBusy(true); setError(null)
    try {
      const resultado = await registrarPago({ ...form, origen: origenResuelto })
      onRegistrado?.(
        form.estado === 'pendiente'
          ? 'Pago pendiente agregado a la proyección. Cuando lo pagues, marcalo pagado con el lápiz.'
          : resultado?.origen === 'banco'
          ? (resultado?.descuenta_arqueo
              ? `Pago registrado. Salió de ${bancoCuenta}: el esperado en transferencias del turno ya lo descuenta.`
              : `Pago registrado. Salió de ${bancoCuenta} (no había turno abierto al que imputarlo).`)
          : resultado?.descuenta_arqueo
          ? 'Pago registrado. Salió de la caja del día: el arqueo ya lo descuenta.'
          : resultado?.origen === 'caja_fuerte'
            ? 'Pago registrado. Salió de la caja fuerte: su saldo ya lo descuenta.'
            : turnoAbierto
              ? 'Pago registrado y vinculado al turno abierto (no toca el efectivo de la caja).'
              : 'Pago registrado. No había turno de caja abierto, quedó sin vincular.',
        resultado,
      )
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <ModalShell title={titulo} icon={Wallet} onClose={onClose} maxW="max-w-md">
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Categoría" value={form.categoria} onChange={set('categoria')} required
            options={CATEGORIAS.map(c => ({ value: c.id, label: c.label }))} />
          <Select label="Medio de pago" value={form.medio_pago} onChange={set('medio_pago')} required
            options={MEDIOS_PAGO.map(m => ({ value: m.id, label: m.label }))} />
        </div>

        {esEfectivo && !pendiente && (
          <Select label="¿De dónde sale el efectivo?" value={origenResuelto} onChange={set('origen')}
            options={[
              // Siempre seleccionable: si no hay turno abierto se avisa en el
              // texto de abajo y, en última instancia, lo valida la base.
              {
                value: 'caja',
                label: turnoAbierto
                  ? 'Caja del día / turno abierto (descuenta del arqueo)'
                  : 'Caja del día / turno abierto (no veo un turno abierto)',
              },
              { value: 'caja_fuerte', label: 'Caja fuerte (descuenta de su saldo)' },
              { value: 'ninguno', label: 'Otro efectivo / sin registrar origen' },
            ]} />
        )}

        {esTransferencia && !pendiente && (
          <Select label="¿De qué cuenta sale la transferencia?" value={origenResuelto} onChange={set('origen')}
            options={[
              { value: 'banco', label: `${bancoCuenta} (descuenta del esperado en transferencias)` },
              { value: 'ninguno', label: 'Otra cuenta / sin registrar origen' },
            ]} />
        )}

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
        <button onClick={guardar} disabled={busy || !valido}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          {busy ? 'Registrando…' : (pendiente ? 'Agregar a la proyección' : 'Registrar pago')}
        </button>
      </div>
    </ModalShell>
  )
}
