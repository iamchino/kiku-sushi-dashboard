import { useMemo, useState } from 'react'
import {
  X, Calendar, Clock, Users, Phone, Mail, FileText,
  Loader2, AlertCircle, Check, XCircle, UserMinus, Utensils,
  Salad, Accessibility, Sparkles, RotateCcw,
} from 'lucide-react'
import {
  RESERVA_ESTADO_LABEL, RESERVA_ESTADO_COLOR,
  TIPO_EXPERIENCIA_LABEL, TIPO_EXPERIENCIA_COLOR,
} from '../../hooks/useReservas'

const ORIGEN_META = {
  web:       { label: 'Web',       color: '#4f8ef7' },
  dashboard: { label: 'Dashboard', color: 'var(--accent-lift)' },
  telefono:  { label: 'Teléfono',  color: '#fbbf24' },
  whatsapp:  { label: 'WhatsApp',  color: '#34d399' },
}

/**
 * Modal de detalle de reserva con acciones:
 *   - Confirmar (si está pendiente)
 *   - Sentar → abre selector de mesa libre y llama a sentar_reserva
 *   - No-show
 *   - Cancelar
 *   - Eliminar (definitivo)
 */
export default function ReservaDetalleModal({
  reserva, mesasLibres = [],
  onClose, onActualizarEstado, onSentar, onEliminar, onReactivar,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [mesaSeleccionada, setMesaSeleccionada] = useState(null)
  const [modoSentar, setModoSentar] = useState(false)

  const estadoMeta = useMemo(() => reserva ? RESERVA_ESTADO_COLOR[reserva.estado] : null, [reserva])
  const origenMeta = useMemo(() => reserva ? (ORIGEN_META[reserva.origen] || ORIGEN_META.dashboard) : null, [reserva])

  if (!reserva) return null

  const puedeConfirmar = reserva.estado === 'pendiente'
  const puedeSentar    = ['pendiente', 'confirmada'].includes(reserva.estado)
  const puedeMarcarNo  = ['pendiente', 'confirmada'].includes(reserva.estado)
  const puedeCancelar  = !['cancelada', 'sentada'].includes(reserva.estado)
  const puedeReactivar = ['cancelada', 'no_show'].includes(reserva.estado)

  const handleEstado = async (nuevoEstado) => {
    setBusy(true); setError(null)
    const { error: err } = await onActualizarEstado?.(reserva.id, nuevoEstado) || {}
    setBusy(false)
    if (err) { setError(err.message || 'Error al actualizar'); return }
    if (nuevoEstado === 'cancelada' || nuevoEstado === 'no_show') onClose?.()
  }

  const handleSentar = async () => {
    if (!mesaSeleccionada) { setError('Seleccioná una mesa primero'); return }
    setBusy(true); setError(null)
    const { error: err } = await onSentar?.(reserva.id, mesaSeleccionada) || {}
    setBusy(false)
    if (err) { setError(err.message || 'Error al sentar la reserva'); return }
    onClose?.()
  }

  const handleReactivar = async () => {
    setBusy(true); setError(null)
    const { error: err } = await onReactivar?.(reserva.id) || {}
    setBusy(false)
    if (err) { setError(err.message || 'No se pudo restablecer la reserva'); return }
    onClose?.()
  }

  const handleEliminar = async () => {
    if (!confirm('¿Eliminar la reserva definitivamente? Esta acción no se puede deshacer.')) return
    setBusy(true); setError(null)
    const { error: err } = await onEliminar?.(reserva.id) || {}
    setBusy(false)
    if (err) { setError(err.message || 'Error al eliminar'); return }
    onClose?.()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-xl max-h-[92vh] flex flex-col rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex-shrink-0 px-5 py-4 flex items-start justify-between gap-3"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))', color: '#fff' }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[10px] font-medium uppercase tracking-wider opacity-80">Reserva</p>
              {estadoMeta && (
                <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>
                  {RESERVA_ESTADO_LABEL[reserva.estado]}
                </span>
              )}
              {origenMeta && (
                <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}>
                  {origenMeta.label}
                </span>
              )}
            </div>
            <p className="font-bold text-lg leading-tight mt-1">{reserva.cliente_nombre}</p>
            <div className="flex items-center gap-3 mt-1 text-[11px] opacity-95 flex-wrap">
              <span className="flex items-center gap-1"><Calendar size={11} /> {reserva.fecha}</span>
              <span className="flex items-center gap-1"><Clock size={11} /> {String(reserva.hora).slice(0,5)}</span>
              <span className="flex items-center gap-1"><Users size={11} /> {reserva.personas}p · {reserva.duracion_min}m</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && (
            <div className="rounded-lg p-2.5 text-xs flex items-start gap-2"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {reserva.tipo_experiencia && TIPO_EXPERIENCIA_LABEL[reserva.tipo_experiencia] && (
            <div className="rounded-lg p-3 flex items-center gap-2"
              style={{
                background: `${TIPO_EXPERIENCIA_COLOR[reserva.tipo_experiencia]}10`,
                border: `1px solid ${TIPO_EXPERIENCIA_COLOR[reserva.tipo_experiencia]}30`,
              }}>
              <Sparkles size={13} style={{ color: TIPO_EXPERIENCIA_COLOR[reserva.tipo_experiencia] }} />
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-wide font-bold"
                  style={{ color: 'var(--text-muted)' }}>
                  Experiencia
                </p>
                <p className="text-sm font-semibold"
                  style={{ color: TIPO_EXPERIENCIA_COLOR[reserva.tipo_experiencia] }}>
                  {TIPO_EXPERIENCIA_LABEL[reserva.tipo_experiencia]}
                </p>
              </div>
            </div>
          )}

          {(reserva.cliente_telefono || reserva.cliente_email) && (
            <div className="rounded-lg p-3 space-y-1.5"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Contacto
              </p>
              {reserva.cliente_telefono && (
                <div className="flex items-center gap-2 text-xs">
                  <Phone size={12} style={{ color: 'var(--text-muted)' }} />
                  <a href={`tel:${reserva.cliente_telefono}`} className="hover:underline" style={{ color: 'var(--accent-lift)' }}>
                    {reserva.cliente_telefono}
                  </a>
                </div>
              )}
              {reserva.cliente_email && (
                <div className="flex items-center gap-2 text-xs">
                  <Mail size={12} style={{ color: 'var(--text-muted)' }} />
                  <a href={`mailto:${reserva.cliente_email}`} className="hover:underline" style={{ color: 'var(--accent-lift)' }}>
                    {reserva.cliente_email}
                  </a>
                </div>
              )}
            </div>
          )}

          {reserva.restricciones && (
            <div className="rounded-lg p-3"
              style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.20)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#22c55e' }}>
                <Salad size={10} className="inline mr-1" /> Restricciones alimentarias
              </p>
              <p className="text-xs whitespace-pre-wrap leading-snug" style={{ color: 'var(--text-secondary)' }}>
                {reserva.restricciones}
              </p>
            </div>
          )}

          {reserva.accesibilidad && (
            <div className="rounded-lg p-3"
              style={{ background: 'rgba(79,142,247,0.06)', border: '1px solid rgba(79,142,247,0.20)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#4f8ef7' }}>
                <Accessibility size={10} className="inline mr-1" /> Accesibilidad
              </p>
              <p className="text-xs whitespace-pre-wrap leading-snug" style={{ color: 'var(--text-secondary)' }}>
                {reserva.accesibilidad}
              </p>
            </div>
          )}

          {reserva.notas && (
            <div className="rounded-lg p-3"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
                <FileText size={10} className="inline mr-1" /> Notas
              </p>
              <p className="text-xs whitespace-pre-wrap leading-snug" style={{ color: 'var(--text-secondary)' }}>
                {reserva.notas}
              </p>
            </div>
          )}

          {/* Selector de mesa para sentar */}
          {modoSentar && (
            <div className="rounded-lg p-3 space-y-2"
              style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--accent-lift)' }}>
                Elegí una mesa libre para sentar a {reserva.cliente_nombre} ({reserva.personas}p):
              </p>
              {mesasLibres.length === 0 ? (
                <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                  No hay mesas libres en este momento.
                </p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {mesasLibres.map(m => {
                    const isSel = mesaSeleccionada === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMesaSeleccionada(m.id)}
                        className="flex flex-col items-center justify-center py-2 rounded-lg transition-all"
                        style={{
                          background: isSel ? 'var(--accent)' : 'var(--bg-card)',
                          color: isSel ? '#fff' : 'var(--text-primary)',
                          border: isSel ? '2px solid var(--accent)' : '1px solid var(--border)',
                        }}
                      >
                        <span className="font-bold text-sm">{m.numero}</span>
                        <span className="text-[9px] opacity-70">{m.capacidad}p</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 p-3 space-y-2"
          style={{ borderTop: '1px solid var(--border)' }}>
          {modoSentar ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setModoSentar(false); setMesaSeleccionada(null) }}
                className="flex-1 py-2 rounded-lg text-xs font-medium"
                style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleSentar}
                disabled={busy || !mesaSeleccionada}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Utensils size={14} />}
                Sentar y abrir mesa
              </button>
            </div>
          ) : (
            <>
              {puedeReactivar && (
                <button
                  type="button"
                  onClick={handleReactivar}
                  disabled={busy}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  Restablecer reserva
                </button>
              )}

              {puedeSentar && (
                <button
                  type="button"
                  onClick={() => setModoSentar(true)}
                  disabled={busy}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
                    boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.35)',
                  }}
                >
                  <Utensils size={14} /> Sentar reserva
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                {puedeConfirmar && (
                  <button
                    type="button"
                    onClick={() => handleEstado('confirmada')}
                    disabled={busy}
                    className="py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                    style={{ background: 'var(--bg-input)', color: '#4f8ef7', border: '1px solid var(--border)' }}
                  >
                    <Check size={12} /> Confirmar
                  </button>
                )}
                {puedeMarcarNo && (
                  <button
                    type="button"
                    onClick={() => handleEstado('no_show')}
                    disabled={busy}
                    className="py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                    style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                  >
                    <UserMinus size={12} /> No-show
                  </button>
                )}
              </div>

              {puedeCancelar && (
                <button
                  type="button"
                  onClick={() => handleEstado('cancelada')}
                  disabled={busy}
                  className="w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                  style={{ background: 'transparent', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
                >
                  <XCircle size={12} /> Cancelar reserva
                </button>
              )}

              <button
                type="button"
                onClick={handleEliminar}
                disabled={busy}
                className="w-full py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-50"
                style={{ background: 'transparent', color: 'var(--text-xmuted)' }}
              >
                Eliminar definitivamente
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
