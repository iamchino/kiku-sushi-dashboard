import { useCallback, useEffect, useState } from 'react'
import { History, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Últimos accesos al sistema (ingresos, salidas, 2FA, cambios de contraseña).
// Sale de auth.audit_log_entries vía la RPC log_accesos(), que solo responde
// a admin y finanzas con el segundo factor hecho.

const COLOR = {
  'Ingreso':                   'var(--ok)',
  'Salida':                    'var(--text-muted)',
  '2FA verificado':            'var(--ok)',
  '2FA activado':              'var(--info)',
  '2FA desactivado':           'var(--warn)',
  'Pidió recuperar contraseña': 'var(--warn)',
  'Cambió la contraseña':      'var(--warn)',
  'Usuario creado':            'var(--info)',
  'Usuario borrado':           'var(--bad)',
}

function fecha(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).replace(',', '')
}

export default function AccesosPanel() {
  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [abierto, setAbierto] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: e } = await supabase.rpc('log_accesos', { p_limit: 150 })
    if (e) setError(e.message)
    setFilas(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const visibles = abierto ? filas : filas.slice(0, 12)

  return (
    <section
      className="rounded-xl mt-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <History size={15} style={{ color: 'var(--accent-lift)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Últimos accesos</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Quién entró, cuándo y desde qué IP. Si ves un ingreso que no reconocés, cambiá la contraseña de ese usuario.
            </p>
          </div>
        </div>
        <button
          onClick={cargar}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {error && (
        <p className="px-4 py-3 text-xs" style={{ color: 'var(--bad)' }}>
          No se pudo leer el registro: {error}. Hace falta correr la migración 20261008 en Supabase.
        </p>
      )}

      {!error && loading && filas.length === 0 && (
        <div className="flex items-center gap-2 px-4 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={13} className="animate-spin" /> Cargando…
        </div>
      )}

      {!error && !loading && filas.length === 0 && (
        <p className="px-4 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>Sin accesos registrados todavía.</p>
      )}

      {visibles.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr style={{ color: 'var(--text-xmuted)' }}>
                <th className="px-4 py-2 text-left font-semibold uppercase tracking-widest text-[10px]">Cuándo</th>
                <th className="px-4 py-2 text-left font-semibold uppercase tracking-widest text-[10px]">Acción</th>
                <th className="px-4 py-2 text-left font-semibold uppercase tracking-widest text-[10px]">Usuario</th>
                <th className="px-4 py-2 text-left font-semibold uppercase tracking-widest text-[10px]">IP</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f, i) => (
                <tr key={`${f.cuando}-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{fecha(f.cuando)}</td>
                  <td className="px-4 py-2 font-semibold whitespace-nowrap" style={{ color: COLOR[f.accion] || 'var(--text-secondary)' }}>{f.accion}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--text-primary)' }}>{f.email || '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{f.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filas.length > 12 && (
        <button
          onClick={() => setAbierto(a => !a)}
          className="w-full py-2 text-xs font-semibold"
          style={{ color: 'var(--accent-lift)', borderTop: '1px solid var(--border)' }}
        >
          {abierto ? 'Ver menos' : `Ver los ${filas.length} últimos`}
        </button>
      )}
    </section>
  )
}
