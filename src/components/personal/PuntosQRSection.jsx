import { useState, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'
import { Plus, MapPin, Printer, RefreshCw, Copy, Check, QrCode as QrIcon } from 'lucide-react'
import { obtenerUbicacion } from '../../lib/horas'
import { Field } from '../finanzas/fields'

// QR fijos del local. Cada punto codifica  {origen}/fichar?ficha=TOKEN .
// La geocerca se configura acá: "Capturar ubicación" parado en el local.
export default function PuntosQRSection({ horas }) {
  const { puntos, crearPunto, actualizarPunto, regenerarToken, loading } = horas
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [error, setError] = useState(null)

  const handleCrear = async () => {
    if (!nuevoNombre.trim()) return
    setError(null)
    try {
      await crearPunto({ nombre: nuevoNombre.trim() })
      setNuevoNombre('')
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Imprimí el QR y pegalo en el local. Al escanearlo, el empleado ficha con su propio login —
        la <b>geocerca</b> exige además estar físicamente ahí.
      </p>

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="skeleton h-48 rounded-xl" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {puntos.map(p => (
            <PuntoCard key={p.id} punto={p} actualizarPunto={actualizarPunto} regenerarToken={regenerarToken} />
          ))}

          {/* Alta de punto adicional */}
          <div className="rounded-2xl p-5 flex flex-col justify-center gap-3"
            style={{ background: 'var(--bg-card)', border: '1px dashed var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Nuevo punto de fichaje</p>
            <Field label="Nombre" value={nuevoNombre} onChange={setNuevoNombre} placeholder="Ej: Puerta cocina" />
            <button onClick={handleCrear} disabled={!nuevoNombre.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
              <Plus size={14} /> Crear punto
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PuntoCard({ punto, actualizarPunto, regenerarToken }) {
  const [qrUrl, setQrUrl]     = useState(null)
  const [radio, setRadio]     = useState(String(punto.radio_m ?? 100))
  const [busyGeo, setBusyGeo] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [error, setError]     = useState(null)

  const url = `${window.location.origin}/fichar?ficha=${punto.token}`
  const tieneGeo = punto.lat != null && punto.lng != null

  useEffect(() => {
    let vivo = true
    QRCode.toDataURL(url, { width: 480, margin: 2 })
      .then(d => { if (vivo) setQrUrl(d) })
      .catch(() => { if (vivo) setQrUrl(null) })
    return () => { vivo = false }
  }, [url])

  const capturarUbicacion = useCallback(async () => {
    setBusyGeo(true); setError(null)
    try {
      const u = await obtenerUbicacion()
      await actualizarPunto(punto.id, { lat: u.lat, lng: u.lng })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyGeo(false)
    }
  }, [punto.id, actualizarPunto])

  const guardarRadio = useCallback(async () => {
    const r = parseInt(radio, 10)
    if (!Number.isFinite(r) || r < 10 || r > 1000) { setError('Radio entre 10 y 1000 m.'); return }
    setError(null)
    try { await actualizarPunto(punto.id, { radio_m: r }) }
    catch (err) { setError(err.message) }
  }, [radio, punto.id, actualizarPunto])

  const imprimir = useCallback(() => {
    if (!qrUrl) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html><head><title>QR Fichaje · ${punto.nombre}</title>
      <style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px}
      img{width:420px;height:420px}h1{font-size:22px;margin:0}p{color:#555;margin:0;font-size:14px}</style></head>
      <body><h1>KIKU SUSHI · Fichaje</h1><p>${punto.nombre} — escaneá con la cámara para fichar entrada/salida</p>
      <img src="${qrUrl}" onload="window.print()"/></body></html>`)
    w.document.close()
  }, [qrUrl, punto.nombre])

  const copiar = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch { /* clipboard no disponible */ }
  }, [url])

  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', opacity: punto.activo ? 1 : 0.6 }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <QrIcon size={15} style={{ color: 'var(--accent-lift)' }} /> {punto.nombre}
        </p>
        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={punto.activo}
            onChange={e => actualizarPunto(punto.id, { activo: e.target.checked })} />
          Activo
        </label>
      </div>

      <div className="flex justify-center">
        {qrUrl ? (
          <img src={qrUrl} alt={`QR ${punto.nombre}`} className="w-44 h-44 rounded-xl"
            style={{ background: '#fff', padding: 6 }} />
        ) : (
          <div className="skeleton w-44 h-44 rounded-xl" />
        )}
      </div>

      {/* Geocerca */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs flex items-center gap-1.5" style={{ color: tieneGeo ? '#22c55e' : '#f59e0b' }}>
            <MapPin size={12} />
            {tieneGeo ? `Geocerca activa (${punto.lat.toFixed(5)}, ${punto.lng.toFixed(5)})` : 'Sin geocerca: falta capturar la ubicación'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={capturarUbicacion} disabled={busyGeo}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
            <MapPin size={12} /> {busyGeo ? 'Ubicando…' : (tieneGeo ? 'Re-capturar ubicación' : 'Capturar ubicación (parado en el local)')}
          </button>
          <input value={radio} onChange={e => setRadio(e.target.value)} onBlur={guardarRadio}
            inputMode="numeric" className="w-16 rounded-lg text-xs text-center outline-none py-2"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>m</span>
        </div>
      </div>

      {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}

      {/* Acciones */}
      <div className="flex items-center gap-2">
        <button onClick={imprimir}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          <Printer size={12} /> Imprimir
        </button>
        <button onClick={copiar} title="Copiar URL del QR"
          className="p-2 rounded-lg transition-colors" style={{ border: '1px solid var(--border)', color: copiado ? '#22c55e' : 'var(--text-muted)' }}>
          {copiado ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <button
          onClick={() => {
            if (window.confirm('¿Regenerar el token? El QR impreso deja de servir y hay que imprimir el nuevo.')) {
              regenerarToken(punto.id)
            }
          }}
          title="Regenerar token (invalida el QR impreso)"
          className="p-2 rounded-lg transition-colors" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <RefreshCw size={13} />
        </button>
      </div>
    </div>
  )
}
