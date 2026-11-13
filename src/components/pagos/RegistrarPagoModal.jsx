import { useEffect, useMemo, useRef, useState } from 'react'
import { Wallet, Pencil, Package } from 'lucide-react'
import { usePagos } from '../../hooks/usePagos'
import { useProveedores } from '../../hooks/useProveedores'
import { ModalShell, Field, Select, TextArea } from '../finanzas/fields'
import { CATEGORIAS, MEDIOS_PAGO, localDateISO, DIAS_ANTES_DE_SER_DEUDA, naturalezaPendiente } from '../../lib/finanzas'
import ProductosBoleta from './ProductosBoleta'
import { TOLERANCIA_BOLETA, armarFilas, cambioLaBoleta, itemsParaGuardar, problemaBoleta, puedeLlevarProductos } from '../../lib/compras'
import { cargarItemsDePago, cargarProductosCompra } from '../../lib/comprasApi'

// Alta centralizada de pagos: ESTE es el único formulario para registrar un
// egreso del negocio. Lo usan Caja → Pagos, el arqueo del turno abierto
// (botón "Egreso") y Finanzas → Egresos. Cualquier cambio de reglas se hace
// una sola vez, acá.
//
// Reglas de dónde sale la plata, visibles para quien paga:
//   · efectivo + "caja del día"    → descuenta del arqueo del turno abierto
//   · efectivo + "caja fuerte"     → descuenta del saldo de la caja fuerte
//   · efectivo sin origen          → no toca ninguna caja
//   · transferencia + cuenta banco → queda registrado y se lista en el turno,
//                                    pero NO afecta el arqueo: esa cuenta no la
//                                    controla la caja del local
//   · tarjetas / cheque            → se registran sin mover caja ni banco
//
// El trabajo transaccional lo hace el RPC registrar_pago().
//
// Productos de la boleta (SQL 56): en un pago de mercadería o proveedores se
// pueden cargar los productos que vinieron. Al guardar, la base los mete al
// stock, actualiza el precio de costo y deja todo atado a este pago; corregir
// o anular el pago corrige o devuelve el stock. Va en una sola transacción
// (registrar_compra / editar_compra). Sin el SQL 56 la sección no aparece.
export default function RegistrarPagoModal({
  onClose,
  onRegistrado,
  // Fila de un pago ya registrado: el formulario pasa a modo EDICIÓN y el
  // guardado va por editar_pago(), que además mueve el reflejo del pago en la
  // caja del día o en la caja fuerte.
  initial = null,
  origenInicial = null,
  // 'pendiente' arranca el formulario como cuenta por pagar (una proyección):
  // no mueve plata todavía y pide fecha de vencimiento.
  estadoInicial = 'pagado',
  titulo = 'Registrar pago',
  // Modo proyección: el pago SIEMPRE queda pendiente y no se ofrece marcarlo
  // pagado desde acá. Una proyección no es una deuda: se convierte sola en
  // deuda cuando faltan DIAS_ANTES_DE_SER_DEUDA días para el vencimiento.
  modoProyeccion = false,
}) {
  const {
    empleados, turnoAbierto, bancoCuenta, cuentas, registrarPago, editarPago, registrarCompra, editarCompra,
  } = usePagos({ lista: false })
  const { proveedores } = useProveedores()

  const edicion = Boolean(initial)

  const [form, setForm] = useState(() => edicion
    ? {
        categoria: initial.categoria || 'proveedores',
        descripcion: initial.descripcion || '',
        monto: String(initial.monto ?? ''),
        medio_pago: initial.medio_pago || 'efectivo',
        estado: initial.estado || 'pagado',
        fecha: initial.fecha?.slice(0, 10) || localDateISO(),
        proveedor_id: initial.proveedor_id || '',
        empleado_id: initial.empleado_id || '',
        subtipo: initial.subtipo || '',
        periodo: initial.periodo || '',
        vencimiento: initial.vencimiento?.slice(0, 10) || '',
        comprobante_nro: initial.comprobante_nro || '',
        notas: initial.notas || '',
        // 'auto' mantiene el origen que ya tenía el pago.
        origen: initial.pagado_desde || 'auto',
        cuenta_id: initial.cuenta_id || '',
      }
    : {
        categoria: 'proveedores', descripcion: '', monto: '', medio_pago: 'efectivo',
        estado: estadoInicial, fecha: localDateISO(), proveedor_id: '', empleado_id: '',
        subtipo: '', periodo: '', vencimiento: '', comprobante_nro: '', notas: '',
        origen: origenInicial || 'auto',
        cuenta_id: '',
      })
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)

  // ── Productos de la boleta ────────────────────────────────────────────────
  // compras.disponible: null = todavía no se sabe · false = falta el SQL 56.
  const [compras, setCompras] = useState({ disponible: null, productos: [], cargando: false })
  const [conProductos, setConProductos] = useState(false)
  const [filas, setFilas] = useState([])
  const [itemsOriginales, setItemsOriginales] = useState([])
  const [permitirDiferencia, setPermitirDiferencia] = useState(false)
  // Los productos que el pago ya tenía se vuelcan a las filas UNA sola vez: si
  // el usuario quita uno, no tiene que volver al cambiar de proveedor.
  const originalesVolcados = useRef(false)

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

  // Cuentas del negocio (Configuración → Negocio). Para elegir se ofrecen las
  // activas; una cuenta desactivada que el pago YA tenía se sigue mostrando
  // para no perderla al editar.
  const cuentasOfrecidas = useMemo(() => {
    const activas = (cuentas || []).filter(c => c.activa)
    if (form.cuenta_id && !activas.some(c => c.id === form.cuenta_id)) {
      const vieja = (cuentas || []).find(c => c.id === form.cuenta_id)
      if (vieja) return [...activas, { ...vieja, nombre: `${vieja.nombre} (desactivada)` }]
    }
    return activas
  }, [cuentas, form.cuenta_id])
  const hayCuentas = cuentasOfrecidas.length > 0

  // La cuenta efectiva: la elegida si sigue disponible; si no, la primera
  // activa (que es también la que usa la base cuando no se manda ninguna).
  const cuentaResuelta = useMemo(() => {
    if (origenResuelto !== 'banco' || !hayCuentas) return ''
    if (cuentasOfrecidas.some(c => c.id === form.cuenta_id)) return form.cuenta_id
    return cuentasOfrecidas[0].id
  }, [origenResuelto, hayCuentas, cuentasOfrecidas, form.cuenta_id])
  const nombreCuenta = hayCuentas
    ? (cuentasOfrecidas.find(c => c.id === cuentaResuelta)?.nombre || bancoCuenta)
    : bancoCuenta

  // El select de transferencia junta origen + cuenta en un solo valor:
  //   'banco:<id>' → esa cuenta · 'ninguno' → otra cuenta / sin origen.
  const valorCuenta = origenResuelto === 'banco' ? `banco:${cuentaResuelta}` : 'ninguno'
  const elegirCuenta = (v) => {
    if (v === 'ninguno') { set('origen')('ninguno'); return }
    const id = v.startsWith('banco:') ? v.slice(6) : ''
    setForm(f => ({ ...f, origen: 'banco', cuenta_id: id }))
  }

  const efectoCaja = useMemo(() => {
    if (modoProyeccion) {
      const natural = naturalezaPendiente(form.vencimiento || null)
      if (!form.vencimiento) {
        return 'Sin fecha de vencimiento entra como PROYECCIÓN. Todavía no es deuda y no toca ninguna caja.'
      }
      return natural === 'deuda'
        ? `Ojo: con ese vencimiento entra directo como DEUDA (falta${DIAS_ANTES_DE_SER_DEUDA === 1 ? '' : 'n'} menos de ${DIAS_ANTES_DE_SER_DEUDA} días). Poné una fecha más lejana si querés que quede como proyección.`
        : `Entra como PROYECCIÓN. Va a pasar a DEUDA solo, ${DIAS_ANTES_DE_SER_DEUDA} días antes del vencimiento. No toca ninguna caja.`
    }
    if (pendiente) return edicion
      ? 'Vuelve a quedar como cuenta por pagar: si ya había salido de una caja, la plata se le devuelve a esa caja.'
      : 'Queda como cuenta por pagar: no toca la caja hasta que lo marques pagado.'
    if (esEfectivo) {
      if (origenResuelto === 'caja_fuerte') return 'Sale de la CAJA FUERTE: descuenta de su saldo, no toca el arqueo del turno.'
      if (origenResuelto === 'caja') return turnoAbierto
        ? 'Sale de la CAJA DEL DÍA (turno abierto): el arqueo lo descuenta automáticamente.'
        : 'No veo ningún turno de caja abierto. Si guardás así, la base va a rechazar el pago: abrí el turno en Arqueo o elegí otro origen.'
      return 'Efectivo sin origen registrado: no descuenta de la caja ni de la caja fuerte.'
    }
    if (esTransferencia) {
      if (origenResuelto === 'banco') return turnoAbierto
        ? `Sale de ${nombreCuenta}: se lista en el turno abierto pero NO afecta el arqueo ni la diferencia del cierre. Esa cuenta no pasa por la caja del local.`
        : `Sale de ${nombreCuenta}. Queda registrado como egreso; no afecta ningún arqueo.`
      return 'Transferencia sin origen registrado: queda anotada, sin descontar de ninguna cuenta.'
    }
    return 'No es efectivo ni transferencia: se registra sin tocar la caja ni la cuenta del banco.'
  }, [modoProyeccion, form.vencimiento, pendiente, turnoAbierto, esEfectivo, esTransferencia, origenResuelto, nombreCuenta, edicion])

  // Lo que ya tenía cargado el pago (solo al editar). Si tenía productos, la
  // sección arranca abierta con ellos.
  const pagoId = initial?.id || null
  const montoInicial = Number(initial?.monto) || 0
  useEffect(() => {
    if (!pagoId) return undefined
    let vivo = true
    cargarItemsDePago(pagoId).then(items => {
      if (!vivo || items.length === 0) return
      setItemsOriginales(items)
      setConProductos(true)
      // Si la boleta ya se había guardado con una diferencia aceptada
      // (impuestos, envío), se respeta: no hay que volver a tildarla para
      // corregir otra cosa.
      const total = items.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0)
      if (Math.abs(total - montoInicial) > TOLERANCIA_BOLETA) setPermitirDiferencia(true)
    })
    return () => { vivo = false }
  }, [pagoId, montoInicial])

  // La lista de productos depende del proveedor elegido: marca lo que se le
  // compra habitualmente y trae su último precio. Se pide una vez al abrir
  // (para saber si el SQL 56 está) y cada vez que cambia el proveedor.
  const pideProductos = !modoProyeccion && (conProductos || puedeLlevarProductos(form.categoria))
  useEffect(() => {
    if (!pideProductos) return undefined
    let vivo = true
    setCompras(c => ({ ...c, cargando: true }))
    cargarProductosCompra(form.proveedor_id || null)
      .then(res => { if (vivo) setCompras({ ...res, cargando: false }) })
      .catch(() => { if (vivo) setCompras({ disponible: false, productos: [], cargando: false }) })
    return () => { vivo = false }
  }, [pideProductos, form.proveedor_id])

  // Con la lista en mano se arman las filas: lo que el pago ya tenía, lo que
  // el usuario ya cargó y los habituales del proveedor que falten.
  useEffect(() => {
    if (!conProductos || compras.disponible !== true || compras.cargando) return
    const existentes = originalesVolcados.current ? [] : itemsOriginales
    if (itemsOriginales.length > 0) originalesVolcados.current = true
    setFilas(actuales => armarFilas({ productos: compras.productos, existentes, actuales }))
  }, [conProductos, compras, itemsOriginales])

  const ofreceProductos = compras.disponible === true && !modoProyeccion && !esSueldo
    && (puedeLlevarProductos(form.categoria) || itemsOriginales.length > 0)
  const filasAEnviar = ofreceProductos && conProductos ? filas : []
  const hayItems = itemsParaGuardar(filasAEnviar).length > 0
  // El pago va por registrar_compra / editar_compra si lleva productos o si
  // los tenía (para que sacarlos también devuelva el stock).
  const vaComoCompra = compras.disponible === true && (hayItems || itemsOriginales.length > 0)
  const saleDelStock = vaComoCompra && itemsOriginales.length > 0 && !hayItems
  const problemaProductos = hayItems
    ? problemaBoleta({ filas: filasAEnviar, monto: form.monto, permitirDiferencia })
    : null
  const proveedorNombre = (proveedores || []).find(p => p.id === form.proveedor_id)?.razon_social || ''

  const valido = form.descripcion.trim() && Number(form.monto) > 0 && (!esSueldo || form.empleado_id) && !problemaProductos

  const guardar = async () => {
    setBusy(true); setError(null)
    try {
      const nItems = itemsParaGuardar(filasAEnviar).length
      const colaStock = !vaComoCompra ? ''
        : nItems > 0
          ? (edicion
              ? (cambioLaBoleta(itemsOriginales, filasAEnviar) ? ' El stock se actualizó con los cambios de la boleta.' : '')
              : ` ${nItems === 1 ? 'Entró 1 producto' : `Entraron ${nItems} productos`} al stock con el precio de la boleta.`)
          : ' Los productos que tenía la boleta salieron del stock.'
      if (edicion) {
        const datos = { ...form, origen: origenResuelto, cuenta_id: cuentaResuelta }
        const resultado = vaComoCompra
          ? await editarCompra(initial, datos, filasAEnviar, motivo, permitirDiferencia)
          : await editarPago(initial, datos, motivo)
        onRegistrado?.(
          (resultado?.descuenta_arqueo
            ? 'Pago corregido. El movimiento de la caja del día se actualizó con él.'
            : resultado?.origen === 'caja_fuerte'
              ? 'Pago corregido. El movimiento de la caja fuerte se actualizó con él.'
              : 'Pago corregido.') + colaStock,
          resultado,
        )
        onClose()
        return
      }
      const datosAlta = {
        ...form,
        estado: modoProyeccion ? 'pendiente' : form.estado,
        origen: origenResuelto,
        cuenta_id: cuentaResuelta,
      }
      const resultado = vaComoCompra
        ? await registrarCompra(datosAlta, filasAEnviar, permitirDiferencia)
        : await registrarPago(datosAlta)
      onRegistrado?.(
        (form.estado === 'pendiente'
          ? (naturalezaPendiente(form.vencimiento || null) === 'deuda'
              ? 'Guardado. Como vence enseguida, entró directo como DEUDA.'
              : 'Guardado como PROYECCIÓN. Va a pasar a deuda solo, cerca del vencimiento.')
          : resultado?.origen === 'banco'
          ? `Pago registrado. Salió de ${resultado?.cuenta_nombre || nombreCuenta}: queda a la vista en el turno, sin afectar el arqueo.`
          : resultado?.descuenta_arqueo
          ? 'Pago registrado. Salió de la caja del día: el arqueo ya lo descuenta.'
          : resultado?.origen === 'caja_fuerte'
            ? 'Pago registrado. Salió de la caja fuerte: su saldo ya lo descuenta.'
            : turnoAbierto
              ? 'Pago registrado y vinculado al turno abierto (no toca el efectivo de la caja).'
              : 'Pago registrado. No había turno de caja abierto, quedó sin vincular.') + colaStock,
        resultado,
      )
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <ModalShell title={edicion ? 'Editar pago' : titulo} icon={edicion ? Pencil : Wallet} onClose={onClose}
      maxW={ofreceProductos && conProductos ? 'max-w-2xl' : 'max-w-md'}>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Categoría" value={form.categoria} onChange={set('categoria')} required
            options={CATEGORIAS.map(c => ({ value: c.id, label: c.label }))} />
          <Select label={modoProyeccion ? 'Medio de pago previsto' : 'Medio de pago'}
            value={form.medio_pago} onChange={set('medio_pago')} required
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

        {esTransferencia && !pendiente && (hayCuentas
          ? (
            <Select label="¿De qué cuenta sale la transferencia?" value={valorCuenta} onChange={elegirCuenta}
              hint="Las cuentas se cargan en Configuración → Negocio."
              options={[
                ...cuentasOfrecidas.map(c => ({ value: `banco:${c.id}`, label: c.nombre })),
                { value: 'ninguno', label: 'Otra cuenta / sin registrar origen' },
              ]} />
          ) : (
            <Select label="¿De qué cuenta sale la transferencia?" value={origenResuelto} onChange={set('origen')}
              options={[
                { value: 'banco', label: `${bancoCuenta} (no afecta el arqueo del turno)` },
                { value: 'ninguno', label: 'Otra cuenta / sin registrar origen' },
              ]} />
          )
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

        {/* Productos de la boleta: entran al stock con este mismo pago. */}
        {ofreceProductos && !conProductos && (
          <button type="button" onClick={() => setConProductos(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left"
            style={{ border: '1px dashed var(--accent-border)', background: 'var(--accent-soft)' }}>
            <Package size={16} className="flex-shrink-0" style={{ color: 'var(--accent-lift)' }} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold" style={{ color: 'var(--accent-lift)' }}>
                Cargar los productos de la boleta
              </span>
              <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Entran al stock y actualizan el precio de costo, atados a este pago.
              </span>
            </span>
          </button>
        )}
        {ofreceProductos && conProductos && (
          <ProductosBoleta
            productos={compras.productos}
            filas={filas}
            setFilas={setFilas}
            monto={form.monto}
            onUsarTotal={(total) => { set('monto')(String(total)); setPermitirDiferencia(false) }}
            permitirDiferencia={permitirDiferencia}
            setPermitirDiferencia={setPermitirDiferencia}
            proveedorNombre={proveedorNombre}
            cargando={compras.cargando && filas.length === 0}
            onCerrar={() => { setConProductos(false); setPermitirDiferencia(false) }}
          />
        )}
        {saleDelStock && (
          <p className="text-[11px] px-3 py-2 rounded-lg"
            style={{ background: 'rgba(232,162,63,0.10)', border: '1px solid rgba(232,162,63,0.30)', color: 'var(--warn, #E8A23F)' }}>
            Este pago tenía {itemsOriginales.length === 1 ? '1 producto cargado' : `${itemsOriginales.length} productos cargados`}: si
            guardás sin productos, esas cantidades salen del stock.
          </p>
        )}

        {modoProyeccion ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vence el" type="date" value={form.vencimiento} onChange={set('vencimiento')} />
            <Field label="Comprobante (opcional)" value={form.comprobante_nro} onChange={set('comprobante_nro')} placeholder="Nº factura / recibo" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Select label="Estado" value={form.estado} onChange={set('estado')}
              options={[{ value: 'pagado', label: 'Pagado' }, { value: 'pendiente', label: 'Pendiente (cta. por pagar)' }]} />
            {pendiente
              ? <Field label="Vencimiento" type="date" value={form.vencimiento} onChange={set('vencimiento')} />
              : <Field label="Comprobante (opcional)" value={form.comprobante_nro} onChange={set('comprobante_nro')} placeholder="Nº factura / recibo" />}
          </div>
        )}

        <TextArea label="Notas (opcional)" value={form.notas} onChange={set('notas')} rows={2}
          placeholder="Lo que haga falta para que Finanzas entienda el pago sin preguntar" />

        {/* Qué va a pasar con la caja, dicho ANTES de guardar */}
        <p className="text-[11px] px-3 py-2 rounded-lg"
          style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent-lift)' }}>
          {efectoCaja}
        </p>

        {/* En una corrección conviene dejar dicho por qué: queda en el
            historial del pago, junto al antes y el después de cada campo. */}
        {edicion && (
          <Field label="Motivo del cambio (opcional)" value={motivo} onChange={setMotivo}
            placeholder="Ej: el monto de la factura era otro" />
        )}

        {problemaProductos && (
          <p className="text-xs" style={{ color: 'var(--warn, #E8A23F)' }} data-problema-productos>{problemaProductos}</p>
        )}
        {error && <p className="text-xs" style={{ color: '#F2708C' }}>{error}</p>}
        <button onClick={guardar} disabled={busy || !valido}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--cta)' }}>
          {busy
            ? (edicion ? 'Guardando…' : 'Registrando…')
            : edicion
              ? 'Guardar cambios'
              : (modoProyeccion ? 'Agregar a la proyección'
                  : hayItems ? (pendiente ? 'Agregar a pendientes y cargar al stock' : 'Registrar pago y cargar al stock')
                  : (pendiente ? 'Agregar a pendientes' : 'Registrar pago'))}
        </button>
      </div>
    </ModalShell>
  )
}
