import { useEffect, useRef, useState } from 'react'
import {
  X, Users, Clock, User, Plus, Minus, Trash2, Printer,
  Receipt, AlertCircle, Loader2, Ban, Tag, FileText, Link2, Unlink, ChevronDown,
} from 'lucide-react'
import { useMesaPedido } from '../../hooks/useMesaPedido'
import { useMinutesSince } from '../../hooks/useNowTick'
import { printComanda, printCustomerTicket, formatMoney } from '../../lib/printing'
import { getEstadoConfig } from './mesaColors'
import AgregarItemsModal from './AgregarItemsModal'
import CobrarMesaModal from './CobrarMesaModal'
import UnirMesaModal from './UnirMesaModal'
import DescuentoModal from '../pedidos/DescuentoModal'
import ComandaModal from '../pedidos/ComandaModal'

/**
 * Panel lateral de la mesa.
 *
 * Soporte de agrupación visual:
 *   - Si la mesa es líder de un grupo, muestra chip "+N" y botón "Desagrupar".
 *   - Si la mesa no es miembro de ningún grupo y está ocupada, muestra
 *     botón "Unir mesa" para agruparla con otra mesa libre.
 *   - Al cobrar/cerrar la mesa líder, también se desagrupan los miembros.
 */
export default function MesaDetallePanel({
  mesa, onClose, onAbrirMesa,
  onMesaChanged,  // () => void — refresca la lista de mesas del salón (canvas)
  mesasDisponiblesParaUnir = [],
  onUnir,        // (leaderId, memberId) => { error }
  onDesagrupar,  // (leaderId) => { error }
}) {
  const {
    pedido, items, itemsNoEnviados, itemsEnviados,
    subtotal, descuentoMonto, total,
    facturada, comprobanteAutorizado,
    loading, error: pedidoError,
    agregarItems, updateItemCantidad, removeItem,
    enviarACocina, cerrarMesa, cancelarMesa,
    aplicarDescuento, quitarDescuento,
    rondasKiku, rondasHistorial, platosKiku, totalPlatosKiku,
    ajustarRondaKiku, setPlatosKiku,
  } = useMesaPedido({ mesaId: mesa?.id })

  const [showAgregar,   setShowAgregar]   = useState(false)
  const [showCobrar,    setShowCobrar]    = useState(false)
  const [showUnir,      setShowUnir]      = useState(false)
  const [showDescuento, setShowDescuento] = useState(false)
  const [showComanda,   setShowComanda]   = useState(false)
  const [enviando,      setEnviando]      = useState(false)
  const [cancelando,    setCancelando]    = useState(false)
  const [desagrupando,  setDesagrupando]  = useState(false)
  const [actionErr,     setActionErr]     = useState(null)
  const [rondaBusy,     setRondaBusy]     = useState(false)
  const [rondaNota,     setRondaNota]     = useState('')
  const [showHistorial, setShowHistorial] = useState(false)
  const [repesOpen,     setRepesOpen]     = useState(false)
  // Anti "ghost click": en teléfono el tap que abre la mesa puede disparar un
  // click fantasma sobre el fondo y cerrar la ventana al instante. Ignoramos
  // los cierres por fondo durante los primeros ms tras abrir.
  const openedAtRef = useRef(Date.now())
  const handleBackdropClose = (e) => {
    if (e.target !== e.currentTarget) return
    if (Date.now() - openedAtRef.current < 400) return
    onClose?.()
  }
  // Platos por ronda editable (la "x" que prepara cocina). Se sincroniza con el
  // valor guardado del pedido (default = personas) cuando cambia la mesa/pedido.
  const [platos,        setPlatos]        = useState(1)

  useEffect(() => {
    setPlatos(platosKiku)
  }, [platosKiku])

  const minutos = useMinutesSince(mesa?.pedido_abierta_at)

  if (!mesa) return null

  const cfg = getEstadoConfig(mesa.estado_mesa)
  const todoEnviado = items.length > 0 && itemsNoEnviados.length === 0

  // "Libre" (tenedor libre): cualquier producto cuyo nombre contenga "libre"
  // habilita el contador de rondas. Usamos el nombre real del producto.
  const itemLibre = items.find(i => String(i.nombre || '').toLowerCase().includes('libre'))
  const tieneLibre = Boolean(itemLibre)
  const nombreLibre = itemLibre?.nombre || 'Libre'

  // Platos por ronda: límites razonables (1..40) y cambio del default persistido.
  const platosNum = Math.max(1, Math.min(40, parseInt(platos) || 1))
  const cambiarPlatos = async (nuevo) => {
    const val = Math.max(1, Math.min(40, parseInt(nuevo) || 1))
    setPlatos(val)
    // Persistimos el default para que sobreviva recargas / otros dispositivos.
    await setPlatosKiku(val)
  }

  // +1 ronda: incrementa el contador, guarda platos+nota en el historial e
  // imprime la comanda con "KIKU LIBRE x{platos} · RONDA N".
  const handleRondaKiku = async (delta) => {
    setRondaBusy(true); setActionErr(null)
    const { error, value, entry, platos: platosRonda } = await ajustarRondaKiku({
      delta,
      platos: platosNum,
      nota: rondaNota,
      mozo: mesa.mozo_nombre || null,
    })
    setRondaBusy(false)
    if (error) { setActionErr(error.message || 'Error con el contador'); return }
    // Solo imprimimos al sumar una ronda (no al corregir hacia abajo).
    if (delta > 0) {
      const cant = platosRonda || platosNum
      const res = await printComanda({
        ...pedido,
        pedido_items: [{ nombre: nombreLibre.toUpperCase(), cantidad: cant, notas: entry?.nota || null }],
        _ronda_label: `REPE ${nombreLibre.toUpperCase()}`,
        // Banner estructurado para que la comanda diga claramente la repe.
        _repe_num: value,
        _repe_platos: cant,
        _repe_nombre: nombreLibre.toUpperCase(),
        _repe_nota: entry?.nota || null,
      })
      if (!res?.ok) setActionErr('Ronda registrada, pero la comanda no se imprimió. Revisá la impresora.')
      setRondaNota('')
    }
  }

  // ── Grupo info ──────────────────────────────────────────────────────
  const esLider    = Boolean(mesa.es_lider_grupo)
  const esMiembro  = Boolean(mesa.mesa_grupo_id)
  const miembros   = mesa.miembros_grupo || []
  // Mostramos el botón "Unir mesa" siempre que tenga sentido (pedido abierto,
  // no facturada, no es miembro). Si no hay mesas libres para elegir, el modal
  // muestra un empty-state; así el botón nunca "desaparece" sin explicación.
  const puedeUnir  = Boolean(pedido) && !facturada && !esMiembro

  const handleEnviar = async () => {
    setEnviando(true); setActionErr(null)
    const aImprimir = [...itemsNoEnviados]
    const { error } = await enviarACocina()
    setEnviando(false)
    if (error) { setActionErr(error.message || 'Error al enviar'); return }
    if (aImprimir.length > 0) {
      const res = await printComanda({
        ...pedido,
        pedido_items: aImprimir,
        _ronda_label: itemsEnviados.length > 0 ? 'RONDA ADICIONAL' : null,
      })
      if (!res?.ok) setActionErr('Se envió a cocina, pero la comanda no se imprimió. Revisá la impresora.')
    }
  }

  const handleCancelar = async () => {
    if (!confirm('¿Cancelar la mesa? Se descartará el pedido sin facturar.')) return
    setCancelando(true); setActionErr(null)
    if (esLider && miembros.length > 0) {
      await onDesagrupar?.(mesa.id)
    }
    const { error } = await cancelarMesa()
    setCancelando(false)
    if (error) { setActionErr(error.message || 'Error al cancelar'); return }
    onMesaChanged?.()
    onClose?.()
  }

  const handleDesagrupar = async () => {
    if (!confirm('¿Liberar las mesas agrupadas? Quedarán independientes.')) return
    setDesagrupando(true); setActionErr(null)
    const { error } = await onDesagrupar?.(mesa.id) || {}
    setDesagrupando(false)
    if (error) setActionErr(error.message || 'Error al desagrupar')
  }

  const accionPrincipal = facturada
    ? { label: 'Cerrar mesa', icon: Receipt, color: '#71717a', onClick: () => setShowCobrar(true) }
    : null

  void todoEnviado; void enviando; void handleEnviar

  return (
    <>
    <div
      className="fixed inset-0 z-[55] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdropClose}
    >
    <aside
      className="flex flex-col w-full md:max-w-2xl max-h-[100dvh] md:max-h-[92vh] rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      onClick={e => e.stopPropagation()}
    >
      <div
        className="flex-shrink-0 px-4 py-3"
        style={{
          background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
          color: '#ffffff',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="font-bold text-3xl leading-none">
              Mesa {mesa.numero}
              {esLider && miembros.length > 0 && (
                <span className="ml-2 text-base align-middle opacity-90">
                  + {miembros.map(m => m.numero).join(', ')}
                </span>
              )}
            </p>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
              style={{ background: 'rgba(255,255,255,0.18)', color: '#ffffff' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.borderHi }} />
              {cfg.label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#ffffff' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
          >
            <X size={16} />
          </button>
        </div>

        {pedido && (
          <div className="flex items-center gap-3 mt-1.5 text-[11px] opacity-90 flex-wrap">
            <span className="flex items-center gap-1"><Users size={11} /> {pedido.personas || 1}</span>
            {mesa.mozo_nombre && (
              <span className="flex items-center gap-1"><User size={11} /> {mesa.mozo_nombre}</span>
            )}
            {minutos !== null && (
              <span className="flex items-center gap-1"><Clock size={11} /> {minutos}m</span>
            )}
            {pedido.cliente_nombre && (
              <span className="ml-auto font-medium opacity-100">{pedido.cliente_nombre}</span>
            )}
          </div>
        )}
      </div>

      {pedido && !facturada && (
        <div className="flex-shrink-0 p-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setShowAgregar(true)}
            className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent-lift)',
              border: '2px dashed var(--accent-border)',
            }}
          >
            <Plus size={18} /> Agregar productos
          </button>
        </div>
      )}

      {/* Contador de "repes" de libre — compacto y colapsable para no comerse
          el espacio de los productos de la mesa. */}
      {pedido && !facturada && tieneLibre && (
        <div className="flex-shrink-0 px-3 py-2 space-y-2"
          style={{ borderBottom: '1px solid var(--border)', background: 'rgba(251,191,36,0.06)' }}>

          {/* Barra compacta — siempre visible: contador + botón Repe */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRepesOpen(v => !v)}
              className="flex items-center gap-2 min-w-0 flex-1 text-left"
              title={repesOpen ? 'Ocultar opciones' : 'Ver opciones de repe'}
            >
              <ChevronDown
                size={18}
                className="flex-shrink-0 transition-transform"
                style={{ color: 'var(--text-muted)', transform: repesOpen ? 'rotate(180deg)' : 'none' }}
              />
              <span className="min-w-0">
                <span className="block text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{nombreLibre} · Repes</span>
                <span className="block text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                  {platosNum} platos/repe{totalPlatosKiku > 0 ? ` · ${totalPlatosKiku} en total` : ''}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleRondaKiku(-1)}
              disabled={rondaBusy || rondasKiku === 0}
              className="w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform flex-shrink-0"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              title="Restar repe (no imprime)"
            >
              <Minus size={18} />
            </button>
            <button
              type="button"
              onClick={() => handleRondaKiku(1)}
              disabled={rondaBusy}
              className="h-11 px-5 rounded-xl flex items-center justify-center gap-1.5 text-base font-extrabold text-white disabled:opacity-50 active:scale-95 transition-transform flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
              title="Sumar repe e imprimir comanda"
            >
              {rondaBusy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Repe
            </button>
          </div>

          {/* Opciones (desplegable): platos por repe + nota + historial */}
          {repesOpen && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Cada repe imprime una comanda con los platos que prepara cocina</p>

              {/* Platos por repe (la "x" que prepara la sushi woman) */}
              <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Platos por repe</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Sale en comanda como {nombreLibre} x{platosNum}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => cambiarPlatos(platosNum - 1)}
                    disabled={rondaBusy || platosNum <= 1}
                    className="w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                    title="Menos platos"
                  >
                    <Minus size={18} />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={40}
                    value={platos}
                    onChange={e => setPlatos(e.target.value)}
                    onBlur={e => cambiarPlatos(e.target.value)}
                    className="w-14 h-11 rounded-xl text-center text-xl font-extrabold tabular-nums outline-none"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#f59e0b' }}
                  />
                  <button
                    type="button"
                    onClick={() => cambiarPlatos(platosNum + 1)}
                    disabled={rondaBusy || platosNum >= 40}
                    className="w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                    title="Más platos"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={rondaNota}
                onChange={e => setRondaNota(e.target.value)}
                placeholder="Nota para cocina (opcional): ej. 2 salmón, 1 sin palta…"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />

              {/* Historial de repes — desplegable */}
              {rondasHistorial.length > 0 && (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                  <button
                    type="button"
                    onClick={() => setShowHistorial(v => !v)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      Historial de repes ({rondasHistorial.length})
                    </span>
                    <ChevronDown
                      size={16}
                      className="transition-transform"
                      style={{ transform: showHistorial ? 'rotate(180deg)' : 'none' }}
                    />
                  </button>
                  {showHistorial && (
                    <div className="px-1.5 pb-1.5 max-h-44 overflow-y-auto space-y-1">
                      {[...rondasHistorial].reverse().map((h, idx) => (
                        <div key={idx} className="flex items-start gap-2 px-1.5 py-1 rounded" style={{ background: 'var(--bg-input)' }}>
                          <span className="text-[11px] font-extrabold tabular-nums flex-shrink-0 px-1 rounded"
                            style={{ color: '#f59e0b', background: 'rgba(251,191,36,0.12)' }}
                            title={`Repe ${h.ronda}`}>
                            #{h.ronda}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>
                              {nombreLibre} x{h.platos || 1}
                            </p>
                            {h.nota && <p className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>{h.nota}</p>}
                            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                              {h.at ? new Date(h.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''}
                              {h.mozo ? ` · ${h.mozo}` : ''}
                              {!h.nota ? ' · sin nota' : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {pedidoError && (
          <div className="mx-3 mt-3 rounded-lg p-2.5 text-xs flex items-start gap-2"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
            <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Error al cargar el pedido</p>
              <p className="opacity-90 mt-0.5 break-all">{pedidoError}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-lift)' }} />
          </div>
        ) : !pedido ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: mesa.estado_mesa === 'libre' ? 'var(--accent-soft)' : 'rgba(251,191,36,0.15)' }}>
              <Users size={26} style={{ color: mesa.estado_mesa === 'libre' ? 'var(--accent-lift)' : '#fbbf24' }} />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {mesa.estado_mesa === 'libre' ? 'Mesa disponible' : 'Mesa ocupada, sin pedido visible'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {mesa.estado_mesa === 'libre'
                  ? `Capacidad ${mesa.capacidad} personas`
                  : 'Revisá la consola (F12) para más info.'
                }
              </p>
            </div>
            {mesa.estado_mesa === 'libre' && (
              <button
                type="button"
                onClick={() => onAbrirMesa?.(mesa)}
                className="w-full mt-2 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02]"
                style={{
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
                  boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.35)',
                }}
              >
                Abrir mesa
              </button>
            )}
          </div>
        ) : (
          <div className="px-3 py-3 space-y-3">
            {esLider && miembros.length > 0 && (
              <div className="rounded-lg p-2.5 flex items-center gap-2 text-xs"
                style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent-lift)' }}>
                <Link2 size={14} className="flex-shrink-0" />
                <p className="flex-1 font-medium">
                  Mesa unida con {miembros.map(m => `mesa ${m.numero}`).join(', ')}
                </p>
              </div>
            )}

            {itemsNoEnviados.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--accent-lift)' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    Por enviar a cocina
                  </p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: '#fff' }}>
                    {itemsNoEnviados.reduce((a, i) => a + i.cantidad, 0)}
                  </span>
                </div>
                <div className="space-y-1 rounded-lg p-1.5" style={{ border: '1px solid var(--accent-border)', background: 'var(--accent-soft)' }}>
                  {itemsNoEnviados.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onMinus={() => updateItemCantidad(item.id, item.cantidad - 1)}
                      onPlus={()  => updateItemCantidad(item.id, item.cantidad + 1)}
                      onRemove={() => removeItem(item.id)}
                      editable
                    />
                  ))}
                </div>
              </section>
            )}

            {itemsEnviados.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    En cocina / servidos
                  </p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
                    {itemsEnviados.reduce((a, i) => a + i.cantidad, 0)}
                  </span>
                </div>
                <div className="space-y-1">
                  {itemsEnviados.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onMinus={() => updateItemCantidad(item.id, item.cantidad - 1)}
                      onPlus={()  => updateItemCantidad(item.id, item.cantidad + 1)}
                      onRemove={() => removeItem(item.id)}
                      editable={!facturada}
                      dimmed
                    />
                  ))}
                </div>
              </section>
            )}

            {items.length === 0 && (
              <div className="text-center py-6 text-xs" style={{ color: 'var(--text-xmuted)' }}>
                Mesa abierta sin productos.
              </div>
            )}

            {facturada && (
              <div className="rounded-lg p-2.5 text-xs flex items-start gap-2" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent-lift)' }}>
                <Receipt size={13} className="flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold">Factura emitida</p>
                  <p className="mt-0.5 opacity-90 truncate">CAE {comprobanteAutorizado?.cae} · #{comprobanteAutorizado?.numero}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {pedido && (
        <div className="flex-shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <div className="px-4 py-3 flex items-end justify-between gap-3"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total</p>
              <p className="font-bold text-2xl leading-none mt-0.5" style={{ color: 'var(--accent-lift)' }}>
                ${formatMoney(total)}
              </p>
              {descuentoMonto > 0 && (
                <p className="text-[10px] mt-0.5" style={{ color: '#34d399' }}>
                  Subt ${formatMoney(subtotal)} · descuento -${formatMoney(descuentoMonto)}
                </p>
              )}
            </div>
            {!facturada && (
              <button
                type="button"
                onClick={() => setShowDescuento(true)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors flex-shrink-0"
                style={{
                  background: descuentoMonto > 0 ? 'rgba(52,211,153,0.1)' : 'var(--bg-input)',
                  color: descuentoMonto > 0 ? '#34d399' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
                title="Aplicar descuento / gift card"
              >
                <Tag size={10} /> {descuentoMonto > 0 ? `-$${formatMoney(descuentoMonto)}` : 'Desc.'}
              </button>
            )}
          </div>

          {actionErr && (
            <div className="mx-3 mt-2 rounded-md px-2 py-1.5 text-[11px] flex items-center gap-1.5" style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
              <AlertCircle size={11} /> {actionErr}
            </div>
          )}

          {accionPrincipal && (
            <div className="px-3 pt-3">
              <button
                type="button"
                onClick={accionPrincipal.onClick}
                disabled={(items.length === 0 && !facturada) || accionPrincipal.loading}
                className="w-full py-4 rounded-xl text-base font-extrabold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 hover:scale-[1.01]"
                style={{
                  background: accionPrincipal.gradient || accionPrincipal.color,
                  boxShadow: accionPrincipal.shadow || 'none',
                }}
              >
                {accionPrincipal.loading
                  ? <><Loader2 size={18} className="animate-spin" /> Procesando…</>
                  : <><accionPrincipal.icon size={18} /> {accionPrincipal.label}</>
                }
              </button>
            </div>
          )}

          <div className="grid grid-cols-4 gap-1 p-3">
            <IconButton
              icon={Printer}
              label="Comanda"
              onClick={() => setShowComanda(true)}
            />
            <IconButton
              icon={FileText}
              label="Pre-cuenta"
              onClick={() => printCustomerTicket(pedido)}
            />
            <IconButton
              icon={Receipt}
              label={facturada ? 'Ticket fiscal' : 'Cobrar'}
              onClick={() => setShowCobrar(true)}
              accent
            />
            {esLider && miembros.length > 0 ? (
              <IconButton
                icon={desagrupando ? Loader2 : Unlink}
                label={`Desagrupar (${miembros.length})`}
                onClick={handleDesagrupar}
                disabled={desagrupando}
                spin={desagrupando}
                danger
              />
            ) : puedeUnir ? (
              <IconButton
                icon={Link2}
                label="Unir mesa"
                onClick={() => setShowUnir(true)}
                accent
              />
            ) : !facturada ? (
              <IconButton
                icon={cancelando ? Loader2 : Ban}
                label="Cancelar"
                onClick={handleCancelar}
                disabled={cancelando}
                danger
                spin={cancelando}
              />
            ) : null}
          </div>

          {!facturada && ((esLider && miembros.length > 0) || puedeUnir) && (
            <div className="px-3 pb-3">
              <button
                type="button"
                onClick={handleCancelar}
                disabled={cancelando}
                className="w-full py-2 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                style={{ background: 'transparent', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                {cancelando ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
                Cancelar mesa
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
    </div>

      <AgregarItemsModal
        open={showAgregar}
        mesa={mesa}
        soloCarta
        onClose={() => setShowAgregar(false)}
        onAdd={async (newItems) => {
          const { error } = await agregarItems(newItems)
          return { error }
        }}
      />

      <CobrarMesaModal
        open={showCobrar}
        onClose={() => setShowCobrar(false)}
        pedido={pedido}
        onCerrarMesa={async () => {
          if (esLider && miembros.length > 0) {
            await onDesagrupar?.(mesa.id)
          }
          const { error } = await cerrarMesa()
          if (!error) { onMesaChanged?.(); onClose?.() }
          return { error }
        }}
      />

      <UnirMesaModal
        open={showUnir}
        leaderMesa={mesa}
        mesasDisponibles={mesasDisponiblesParaUnir}
        onClose={() => setShowUnir(false)}
        onUnir={onUnir}
      />

      <DescuentoModal
        open={showDescuento}
        pedido={pedido}
        items={items}
        onClose={() => setShowDescuento(false)}
        onAplicar={aplicarDescuento}
        onQuitar={quitarDescuento}
      />

      <ComandaModal
        open={showComanda}
        pedido={pedido}
        items={items}
        onClose={() => setShowComanda(false)}
      />
    </>
  )
}

function IconButton({ icon: Icon, label, onClick, accent = false, danger = false, disabled = false, spin = false }) {
  const baseStyle = danger
    ? { background: 'transparent', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }
    : accent
      ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
      : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg transition-colors disabled:opacity-50"
      style={baseStyle}
    >
      <Icon size={14} className={spin ? 'animate-spin' : ''} />
      <span className="text-[9px] font-semibold leading-none">{label}</span>
    </button>
  )
}

function ItemRow({ item, onMinus, onPlus, onRemove, editable = true, dimmed = false }) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-md"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        opacity: dimmed ? 0.75 : 1,
      }}
    >
      {editable ? (
        <div className="flex items-center rounded" style={{ background: 'var(--bg-input)' }}>
          <button type="button" onClick={onMinus} className="w-5 h-6 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            <Minus size={11} />
          </button>
          <span className="text-xs font-bold w-5 text-center" style={{ color: 'var(--text-primary)' }}>{item.cantidad}</span>
          <button type="button" onClick={onPlus} className="w-5 h-6 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            <Plus size={11} />
          </button>
        </div>
      ) : (
        <span className="text-xs font-bold w-8 text-center px-1 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}>
          {item.cantidad}×
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.nombre}</p>
        {item.notas && <p className="text-[10px] truncate italic" style={{ color: 'var(--text-xmuted)' }}>{item.notas}</p>}
      </div>
      <span className="text-[11px] font-bold flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
        ${formatMoney(item.precio_unitario * item.cantidad)}
      </span>
      {editable && (
        <button type="button" onClick={onRemove} className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text-xmuted)' }}>
          <Trash2 size={11} />
        </button>
      )}
    </div>
  )
}
