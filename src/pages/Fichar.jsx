import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { QrCode, CheckCircle2, XCircle, MapPin, LogIn, LogOut, Clock, AlertTriangle, Loader2 } from 'lucide-react'
import { useFichaje } from '../hooks/useFichaje'
import { fmtMinutos, fmtHora } from '../lib/horas'
import EmpleadoHeader from '../components/layout/EmpleadoHeader'

// Pantalla de fichaje. El QR del local codifica /fichar?ficha=TOKEN:
// al abrirse (ya logueado), pide la ubicación y llama a la RPC fichar().
export default function FicharPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('ficha')

  const { empleado, marcasHoy, dentro, minutosHoy, loading, error, fichar } = useFichaje()

  // null | { fase: 'ubicando' } | { fase: 'ok', res } | { fase: 'error', msg }
  const [resultado, setResultado] = useState(null)
  const disparado = useRef(false)

  useEffect(() => {
    if (!token || disparado.current || loading) return
    if (!empleado) return // sin vínculo: se muestra el aviso de abajo
    disparado.current = true

    ;(async () => {
      setResultado({ fase: 'ubicando' })
      try {
        const res = await fichar(token)
        setResultado({ fase: 'ok', res })
      } catch (err) {
        setResultado({ fase: 'error', msg: err.message })
      } finally {
        // limpiamos el token de la URL para que un refresh no re-fiche
        navigate('/fichar', { replace: true })
      }
    })()
  }, [token, loading, empleado, fichar, navigate])

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
        {!token && !resultado && (
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
              La entrada o la salida se registran solas.
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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Estado actual</p>
                <p className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <span className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ background: dentro ? '#22c55e' : 'var(--text-xmuted)' }} />
                  {dentro ? 'Trabajando' : 'Fuera'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Hoy</p>
                <p className="text-lg font-bold flex items-center gap-1.5" style={{ color: 'var(--accent-lift)' }}>
                  <Clock size={15} /> {fmtMinutos(minutosHoy)}
                </p>
              </div>
            </div>

            {marcasHoy.length > 0 && (
              <div className="space-y-1.5 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                {marcasHoy.map(m => (
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
