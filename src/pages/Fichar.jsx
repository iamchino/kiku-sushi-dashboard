import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { QrCode, CheckCircle2, XCircle, MapPin, LogIn, LogOut, Clock, AlertTriangle, Loader2 } from 'lucide-react'
import { useFichaje } from '../hooks/useFichaje'
import { fmtMinutos, fmtHora, fmtFechaHora } from '../lib/horas'
import EmpleadoHeader from '../components/layout/EmpleadoHeader'

// Un escaneo sin confirmar vence a los 5 minutos: si la pantalla quedó
// abierta, nadie ficha horas después por tocar sin mirar.
const ESCANEO_VIGENTE_MS = 5 * 60 * 1000

// Una salida a menos de esto de la entrada casi siempre es un segundo
// escaneo al llegar ("¿quedó?"): se pide confirmar dos veces.
const MIN_SALIDA_SOSPECHOSA = 30

// Pantalla de fichaje. El QR del local codifica /fichar?ficha=TOKEN.
//
// Antes fichaba SOLA al abrirse y limpiaba el token de la URL recién cuando
// la RPC respondía. Si el empleado bloqueaba el celu mientras se buscaba el
// GPS, Chrome guardaba la pestaña con el token y, al reabrirla horas después,
// volvía a fichar: una SALIDA fantasma a mitad del turno, y la salida real de
// la madrugada terminaba registrada como ENTRADA.
//
// Ahora: el token se saca de la URL al instante (queda solo en memoria) y el
// empleado confirma con un botón que dice qué se va a registrar.
export default function FicharPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tokenUrl = params.get('ficha')

  const {
    empleado, marcasJornada, dentro, abandonada, entradaAbierta,
    minutosJornada, proximaMarca, ultimaMarca, salidaCorregible,
    loading, error, fichar,
  } = useFichaje()

  // Escaneo pendiente de confirmar: { token, en } (solo en memoria).
  const [escaneo, setEscaneo] = useState(null)
  // null | { fase: 'ubicando' } | { fase: 'ok', res } | { fase: 'error', msg }
  const [resultado, setResultado] = useState(null)
  const enCurso = useRef(false)

  // Tomar el token y limpiar la URL YA: un refresh o una pestaña restaurada
  // nunca más tiene con qué fichar.
  useEffect(() => {
    if (!tokenUrl) return
    setEscaneo({ token: tokenUrl, en: Date.now() })
    setResultado(null)
    navigate('/fichar', { replace: true })
  }, [tokenUrl, navigate])

  // Vencimiento del escaneo sin confirmar.
  useEffect(() => {
    if (!escaneo) return
    const resta = escaneo.en + ESCANEO_VIGENTE_MS - Date.now()
    const t = setTimeout(() => setEscaneo(null), Math.max(0, resta))
    return () => clearTimeout(t)
  }, [escaneo])

  const confirmar = async (opciones) => {
    if (!escaneo || enCurso.current) return
    enCurso.current = true
    const { token } = escaneo
    setEscaneo(null)
    setResultado({ fase: 'ubicando' })
    try {
      const res = await fichar(token, opciones)
      setResultado({ fase: 'ok', res })
    } catch (err) {
      setResultado({ fase: 'error', msg: err.message })
    } finally {
      enCurso.current = false
    }
  }

  const pideConfirmacion = Boolean(escaneo && empleado && !loading && !resultado)
  const minutosDesdeEntrada = entradaAbierta && escaneo
    ? Math.max(0, Math.round((escaneo.en - entradaAbierta.getTime()) / 60000))
    : null
  const salidaSospechosa = proximaMarca === 'salida' &&
    minutosDesdeEntrada !== null && minutosDesdeEntrada < MIN_SALIDA_SOSPECHOSA
  // "hace cuánto" se mide contra el momento del escaneo (no cambia al re-renderizar).
  const haceCuanto = ultimaMarca && escaneo
    ? fmtMinutos(Math.max(0, Math.round((escaneo.en - new Date(ultimaMarca.ts).getTime()) / 60000)))
    : ''

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)' }}>
      <EmpleadoHeader />

      <div className="max-w-md mx-auto p-4 space-y-4 pb-10">
        {/* Saludo */}
        {empleado && (
          <p className="text-sm pt-2" style={{ color: 'var(--text-muted)' }}>
            Hola, <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {empleado.nombre} {empleado.apellido || ''}
            </span>
          </p>
        )}

        {/* Confirmación del escaneo */}
        {pideConfirmacion && (
          <div className="rounded-2xl p-5 space-y-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--accent-border)' }}>
            {proximaMarca === 'salida' ? (
              <>
                <div className="text-center space-y-1">
                  <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Vas a registrar tu</p>
                  <p className="text-2xl font-bold" style={{ color: '#f87171' }}>SALIDA</p>
                  {entradaAbierta && (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Trabajando desde {fmtFechaHora(entradaAbierta)} · {fmtMinutos(minutosJornada)}
                    </p>
                  )}
                </div>
                {salidaSospechosa ? (
                  <>
                    <div className="rounded-xl px-3 py-2.5 flex items-start gap-2 text-xs"
                      style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
                      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                      <span>
                        Tu entrada ya quedó registrada hace {fmtMinutos(minutosDesdeEntrada)}.
                        No hace falta volver a escanear: el próximo escaneo es para cuando te vayas.
                      </span>
                    </div>
                    <BotonFichar tipo="entrada" onClick={() => setEscaneo(null)}>
                      Ya fiché mi entrada, listo
                    </BotonFichar>
                    <BotonFichar tipo="salida" secundario onClick={() => confirmar({ tipoEsperado: 'salida' })}>
                      Me voy igual: registrar SALIDA
                    </BotonFichar>
                  </>
                ) : (
                  <BotonFichar tipo="salida" onClick={() => confirmar({ tipoEsperado: 'salida' })}>
                    Registrar SALIDA
                  </BotonFichar>
                )}
              </>
            ) : (
              <>
                <div className="text-center space-y-1">
                  <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Vas a registrar tu</p>
                  <p className="text-2xl font-bold" style={{ color: '#22c55e' }}>ENTRADA</p>
                </div>

                {salidaCorregible && ultimaMarca && (
                  <div className="rounded-xl px-3 py-2.5 flex items-start gap-2 text-xs"
                    style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>
                      Ya figura una <b>salida</b> a las {fmtHora(ultimaMarca.ts)} (hace {haceCuanto}).
                      Si recién estás terminando tu turno, esa salida fue un error: tocá
                      &quot;Estoy terminando mi turno&quot; y se corrige a esta hora.
                    </span>
                  </div>
                )}

                {salidaCorregible ? (
                  <div className="space-y-2">
                    <BotonFichar tipo="salida" onClick={() => confirmar({ corregirSalida: true })}>
                      Estoy terminando mi turno
                    </BotonFichar>
                    <BotonFichar tipo="entrada" secundario onClick={() => confirmar({ tipoEsperado: 'entrada' })}>
                      Empiezo un turno nuevo (ENTRADA)
                    </BotonFichar>
                  </div>
                ) : (
                  <BotonFichar tipo="entrada" onClick={() => confirmar({ tipoEsperado: 'entrada' })}>
                    Registrar ENTRADA
                  </BotonFichar>
                )}
              </>
            )}
            <button onClick={() => setEscaneo(null)}
              className="w-full text-xs py-1" style={{ color: 'var(--text-muted)' }}>
              Cancelar
            </button>
          </div>
        )}

        {/* Resultado del escaneo */}
        {resultado?.fase === 'ubicando' && (
          <div className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-lift)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Verificando que estés en el local…
            </p>
            <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <MapPin size={12} /> Usando tu ubicación (geocerca)
            </p>
          </div>
        )}

        {resultado?.fase === 'ok' && (
          <div className="rounded-2xl p-6 flex flex-col items-center gap-2 text-center"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
            <CheckCircle2 size={40} style={{ color: '#22c55e' }} />
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {resultado.res?.mensaje}
            </p>
            <p className="text-2xl font-bold tracking-tight" style={{ color: '#22c55e' }}>
              {fmtHora(resultado.res?.ts)}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {resultado.res?.tipo === 'entrada' ? 'Que tengas buen turno 🍣' : 'Hasta la próxima 👋'}
            </p>
          </div>
        )}

        {resultado?.fase === 'error' && (
          <div className="rounded-2xl p-6 flex flex-col items-center gap-2 text-center"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <XCircle size={40} style={{ color: '#f87171' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              No se pudo fichar
            </p>
            <p className="text-sm" style={{ color: '#f87171' }}>{resultado.msg}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Volvé a escanear el QR del local para reintentar.
            </p>
          </div>
        )}

        {/* Sin token: instrucción */}
        {!escaneo && !resultado && (
          <div className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--accent-soft)' }}>
              <QrCode size={26} style={{ color: 'var(--accent-lift)' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Escaneá el QR del local para fichar
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Abrí la cámara del celu y apuntá al QR pegado en el local.
              Después confirmás si es tu entrada o tu salida.
            </p>
          </div>
        )}

        {/* Usuario sin empleado vinculado */}
        {!loading && !empleado && (
          <div className="rounded-xl px-4 py-3 flex items-start gap-2 text-sm"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
            <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
            <span>Tu usuario todavía no está vinculado a un empleado. Avisale al encargado para que te habilite.</span>
          </div>
        )}

        {error && empleado && (
          <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {/* Estado actual */}
        {empleado && (
          <div className="rounded-2xl p-5 space-y-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Estado actual</p>
                <p className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <span className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ background: dentro ? '#22c55e' : 'var(--text-xmuted)' }} />
                  {dentro ? 'Trabajando' : 'Fuera'}
                </p>
                {/* Un turno que cruza la medianoche sigue siendo el mismo turno:
                    se dice desde cuándo, así nadie duda de que falta la salida. */}
                {dentro && entradaAbierta && (
                  <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Desde {fmtFechaHora(entradaAbierta)} · el próximo escaneo marca la SALIDA
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Este turno</p>
                <p className="text-lg font-bold flex items-center gap-1.5 whitespace-nowrap" style={{ color: 'var(--accent-lift)' }}>
                  <Clock size={15} /> {fmtMinutos(minutosJornada)}
                </p>
              </div>
            </div>

            {abandonada && (
              <div className="rounded-xl px-3 py-2.5 flex items-start gap-2 text-xs"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  Quedó una entrada sin salida de hace más de 16 horas. Tu próximo escaneo cuenta
                  como entrada nueva; avisale al encargado para que cargue la salida que falta.
                </span>
              </div>
            )}

            {marcasJornada.length > 0 && (
              <div className="space-y-1.5 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                {marcasJornada.map(m => (
                  <div key={m.id} className="flex items-center justify-between text-sm pt-1.5">
                    <span className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                      {m.tipo === 'entrada'
                        ? <LogIn size={13} style={{ color: '#22c55e' }} />
                        : <LogOut size={13} style={{ color: '#f87171' }} />}
                      {m.tipo === 'entrada' ? 'Entrada' : 'Salida'}
                      {m.origen === 'manual' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md"
                          style={{ background: 'var(--accent-soft)', color: 'var(--text-muted)' }}>
                          manual
                        </span>
                      )}
                    </span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {fmtHora(m.ts)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {empleado && (
          <Link to="/mis-horas"
            className="block text-center text-sm font-semibold px-4 py-3 rounded-xl transition-all"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
            Ver mis horas de la semana →
          </Link>
        )}
      </div>
    </div>
  )
}

function BotonFichar({ tipo, secundario = false, onClick, children }) {
  const color = tipo === 'salida' ? '#ef4444' : '#16a34a'
  const Icono = tipo === 'salida' ? LogOut : LogIn
  return (
    <button onClick={onClick}
      className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-base font-bold transition-transform active:scale-[0.98]"
      style={secundario
        ? { background: 'transparent', color, border: `1px solid ${color}` }
        : { background: color, color: '#fff' }}>
      <Icono size={18} /> {children}
    </button>
  )
}
