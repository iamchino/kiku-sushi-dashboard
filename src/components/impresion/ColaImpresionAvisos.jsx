import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Send, X } from 'lucide-react'
import { esperarResultado, explicarResultadoCola } from '../../lib/colaImpresion'

// Aviso flotante en el dispositivo que mandó un ticket a la cola (el celular):
// "Enviado a la PC…" → "Impreso" / "Error" / "Sigue pendiente".

const CIERRE_OK_MS = 6000

export default function ColaImpresionAvisos() {
  const [avisos, setAvisos] = useState([]) // { id, titulo, estado, error }
  const cerrados = useRef(new Set())

  useEffect(() => {
    const alta = (e) => {
      const { id, titulo } = e.detail || {}
      if (!id) return
      setAvisos(a => [...a.filter(x => x.id !== id), { id, titulo, estado: 'enviado', error: null }])
      esperarResultado(id, { cancelado: () => cerrados.current.has(id) }).then(res => {
        if (cerrados.current.has(id)) return
        setAvisos(a => a.map(x => x.id === id ? { ...x, estado: res.estado, error: res.error } : x))
        if (res.estado === 'impreso') {
          setTimeout(() => setAvisos(a => a.filter(x => x.id !== id)), CIERRE_OK_MS)
        }
      })
    }
    window.addEventListener('kiku:cola-impresion', alta)
    return () => window.removeEventListener('kiku:cola-impresion', alta)
  }, [])

  const cerrar = (id) => {
    cerrados.current.add(id)
    setAvisos(a => a.filter(x => x.id !== id))
  }

  if (avisos.length === 0) return null

  return (
    <div className="fixed left-3 right-3 z-[96] flex flex-col gap-2 pointer-events-none" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}>
      {avisos.map(a => {
        const ok = a.estado === 'impreso'
        const mal = a.estado === 'error' || a.estado === 'descartado'
        const esperando = a.estado === 'enviado'
        const color = ok ? 'var(--ok)' : mal ? 'var(--bad)' : esperando ? 'var(--accent-lift)' : 'var(--warn)'
        const Icono = ok ? CheckCircle2 : mal ? AlertTriangle : esperando ? Loader2 : Send
        return (
          <div key={a.id} className="pointer-events-auto mx-auto w-full max-w-md rounded-xl px-4 py-3 flex items-start gap-3 shadow-lg"
            style={{ background: 'var(--bg-card)', border: `1px solid ${color}`, color: 'var(--text-primary)' }}>
            <Icono size={18} className={esperando ? 'animate-spin mt-0.5' : 'mt-0.5'} style={{ color }} />
            <div className="flex-1 min-w-0 text-sm">
              <p className="font-semibold truncate">{a.titulo}</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {esperando ? 'Enviado a la PC del local, esperando que lo imprima…' : explicarResultadoCola(a)}
              </p>
            </div>
            <button type="button" onClick={() => cerrar(a.id)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
