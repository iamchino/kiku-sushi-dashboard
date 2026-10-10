import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Sun, Save, Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff,
  ImagePlus, X, GripVertical, CalendarClock, ExternalLink, ArrowLeft, ArrowRight,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { prepararImagenWeb, pesoLegible } from '../../lib/imagenesWeb'

/**
 * Editor de la sección "Mediodías" de la web pública: el menú de mediodía
 * del mes. Tabla web_config (fila única id=1), columnas mediodia_*.
 *
 * Qué se maneja acá: si la sección se ve, los textos y las fotos del menú
 * (las placas que también van a Instagram). Las fotos se achican y se pasan
 * a WebP en el navegador antes de subir, así la web carga liviana.
 *
 * Qué NO se maneja acá (y por qué): los menús con precio y detalle, y los
 * días con turno de mediodía, ya viven en Configuración → Reservas. La web
 * los lee de ahí para la página, el bloque del home y el form de reservas:
 * una sola fuente, nada duplicado.
 *
 * Dónde aparece: página /mediodias, bloque del home (después de Kiku Libre),
 * link "Mediodías" en el header y en el footer. Apagada, nada de eso existe.
 */

const MAX_IMAGENES = 12
const MIN_IMAGENES_PARA_PUBLICAR = 1
const MAX_MB = 12
const BUCKET = 'menu-images'
const PREFIJO = 'mediodia'

const VACIO = {
  activo: false,
  overline: '昼のキク',
  titulo: 'Kiku',
  tituloAccent: 'Mediodía',
  subtitulo: '',
  descripcion: '',
  diasTexto: '',
  notaSalon: '',
  notaPickup: '',
  imagenes: [],
}

const COLUMNAS =
  'mediodia_activo, mediodia_overline, mediodia_titulo, mediodia_titulo_accent, mediodia_subtitulo, ' +
  'mediodia_descripcion, mediodia_dias_texto, mediodia_nota_salon, mediodia_nota_pickup, mediodia_imagenes'

export default function MediodiaTab() {
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(VACIO)
  const [saveState, setSaveState] = useState('idle') // idle|saving|ok|error
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(null)   // texto de progreso o null
  const [dragIdx, setDragIdx] = useState(null)
  const [menus, setMenus] = useState([])             // de reservas_config, solo lectura
  const [diasMediodia, setDiasMediodia] = useState([])
  const fileRef = useRef(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('web_config').select(COLUMNAS).eq('id', 1).maybeSingle(),
      supabase.from('reservas_config').select('menus_mediodia').eq('id', 1).maybeSingle(),
      supabase.from('reservas_dias').select('dow, mediodia'),
    ]).then(([cfg, res, dias]) => {
      if (!alive) return
      if (cfg.error) setError(cfg.error.message)
      const d = cfg.data
      if (d) {
        setForm({
          activo: Boolean(d.mediodia_activo),
          overline: d.mediodia_overline ?? '',
          titulo: d.mediodia_titulo ?? 'Kiku',
          tituloAccent: d.mediodia_titulo_accent ?? 'Mediodía',
          subtitulo: d.mediodia_subtitulo ?? '',
          descripcion: d.mediodia_descripcion ?? '',
          diasTexto: d.mediodia_dias_texto ?? '',
          notaSalon: d.mediodia_nota_salon ?? '',
          notaPickup: d.mediodia_nota_pickup ?? '',
          imagenes: Array.isArray(d.mediodia_imagenes) ? d.mediodia_imagenes : [],
        })
      }
      const m = res.data?.menus_mediodia
      setMenus(Array.isArray(m) ? m.filter(x => x && x.activo !== false && x.nombre) : [])
      setDiasMediodia(Array.isArray(dias.data) ? dias.data.filter(x => x.mediodia).map(x => x.dow) : [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  // ── Subida de fotos (achicadas y en WebP) ──────────────────────────────────
  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return

    const libres = MAX_IMAGENES - form.imagenes.length
    if (libres <= 0) {
      setError(`Ya tenés ${MAX_IMAGENES} fotos. Borrá alguna para subir otra.`)
      return
    }
    const aSubir = files.slice(0, libres)
    setError(files.length > libres ? `Solo entran ${libres} foto${libres > 1 ? 's' : ''} más. Subo las primeras ${libres}.` : null)

    const nuevas = []
    for (let i = 0; i < aSubir.length; i++) {
      const file = aSubir[i]
      setUploading(`Subiendo ${i + 1} de ${aSubir.length}…`)
      if (!file.type.startsWith('image/')) { setError(`"${file.name}" no es una imagen.`); continue }
      if (file.size > MAX_MB * 1024 * 1024) { setError(`"${file.name}" pesa más de ${MAX_MB} MB.`); continue }

      const { blob, ext, contentType } = await prepararImagenWeb(file)
      const fileName = `${PREFIJO}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, blob, { upsert: true, contentType })
      if (upErr) { setError(upErr.message || `No se pudo subir "${file.name}".`); continue }
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(fileName)
      // Alt por defecto: el nombre del archivo sin extensión ni guiones.
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
      nuevas.push({ url: publicUrl, alt, _peso: blob.size })
    }
    setUploading(null)
    if (nuevas.length) setForm(f => ({ ...f, imagenes: [...f.imagenes, ...nuevas] }))
  }

  const quitarImagen = (idx) => setForm(f => ({ ...f, imagenes: f.imagenes.filter((_, i) => i !== idx) }))
  const setAlt = (idx, alt) => setForm(f => ({ ...f, imagenes: f.imagenes.map((im, i) => (i === idx ? { ...im, alt } : im)) }))
  const mover = (idx, delta) => setForm(f => {
    const dest = idx + delta
    if (dest < 0 || dest >= f.imagenes.length) return f
    const arr = [...f.imagenes]
    const [m] = arr.splice(idx, 1)
    arr.splice(dest, 0, m)
    return { ...f, imagenes: arr }
  })
  const onDrop = (destIdx) => {
    if (dragIdx === null || dragIdx === destIdx) return setDragIdx(null)
    setForm(f => {
      const arr = [...f.imagenes]
      const [movida] = arr.splice(dragIdx, 1)
      arr.splice(destIdx, 0, movida)
      return { ...f, imagenes: arr }
    })
    setDragIdx(null)
  }

  // ── Validación (espejo del CHECK de la base) ───────────────────────────────
  const faltantes = []
  if (form.imagenes.length < MIN_IMAGENES_PARA_PUBLICAR) faltantes.push('al menos una foto del menú')
  if (!form.diasTexto.trim()) faltantes.push('los días y horario')
  const puedePublicar = faltantes.length === 0

  const guardar = async () => {
    if (form.activo && !puedePublicar) {
      setError(`Para mostrar la sección falta: ${faltantes.join(' y ')}.`)
      setSaveState('error')
      return
    }
    setSaveState('saving'); setError(null)
    const { error: err } = await supabase
      .from('web_config')
      .upsert({
        id: 1,
        mediodia_activo: form.activo,
        mediodia_overline: form.overline.trim(),
        mediodia_titulo: form.titulo.trim() || 'Kiku',
        mediodia_titulo_accent: form.tituloAccent.trim() || 'Mediodía',
        mediodia_subtitulo: form.subtitulo.trim(),
        mediodia_descripcion: form.descripcion.trim(),
        mediodia_dias_texto: form.diasTexto.trim(),
        mediodia_nota_salon: form.notaSalon.trim(),
        mediodia_nota_pickup: form.notaPickup.trim(),
        // Solo url y alt van a la base (el peso es informativo de esta sesión).
        mediodia_imagenes: form.imagenes.map(({ url, alt }) => ({ url, alt: alt || '' })),
        updated_at: new Date().toISOString(),
      })
    if (err) {
      setSaveState('error')
      setError(err.message?.includes('mediodia') ? 'La base no tiene la columna mediodia_*: hace falta correr la migración 20261010 (SQL-CIERRES 37).' : (err.message || 'No se pudo guardar.'))
      return
    }
    setSaveState('ok')
    setTimeout(() => setSaveState('idle'), 1800)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={16} className="animate-spin mr-2" /> Cargando…
      </div>
    )
  }

  const card = { background: 'var(--bg-card)', border: '1px solid var(--border)' }
  const input = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }
  const labelCls = 'text-xs font-semibold uppercase tracking-wide'
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const fmt = (n) => Number(n || 0).toLocaleString('es-AR')

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Explicación */}
      <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ ...card, color: 'var(--text-secondary)' }}>
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>El menú de mediodía del mes.</strong> Tiene página
          propia (<span style={{ color: 'var(--text-primary)' }}>kikusushi.ar/mediodias</span>), un bloque en el
          inicio después de Kiku Libre y el link "Mediodías" en el menú de la web. Cada mes subís las placas
          nuevas, borrás las viejas y guardás: la web cambia al instante. Mientras esté oculta, nada de eso se ve.
        </p>
      </div>

      {/* Visibilidad */}
      <div className="rounded-xl p-4 flex items-center justify-between gap-4" style={card}>
        <div className="flex items-center gap-2.5">
          {form.activo ? <Eye size={16} style={{ color: 'var(--ok)' }} /> : <EyeOff size={16} style={{ color: 'var(--text-muted)' }} />}
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {form.activo ? 'Visible en la web' : 'Oculta'}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {form.activo
                ? 'Los clientes ven la página, el bloque del inicio y el link del menú.'
                : puedePublicar ? 'Ya tenés todo cargado: prendela cuando quieras.' : `Falta ${faltantes.join(' y ')} para poder mostrarla.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!form.activo && !puedePublicar) { setError(`Para mostrar la sección falta: ${faltantes.join(' y ')}.`); return }
            setError(null); set('activo', !form.activo)
          }}
          disabled={!form.activo && !puedePublicar}
          className="relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: form.activo ? 'var(--accent)' : 'var(--bg-input)', border: '1px solid var(--border)' }}
          aria-pressed={form.activo}
        >
          <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: form.activo ? '24px' : '4px' }} />
        </button>
      </div>

      {/* Fotos */}
      <div className="rounded-xl p-4 space-y-3" style={card}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ImagePlus size={14} style={{ color: 'var(--accent)' }} />
            <p className={labelCls} style={{ color: 'var(--text-muted)' }}>Placas del menú · {form.imagenes.length}/{MAX_IMAGENES}</p>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>Verticales (4:5) · se achican solas</p>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Las mismas placas que van a Instagram. Van en un carrusel, en este orden; la{' '}
          <strong style={{ color: 'var(--text-secondary)' }}>primera</strong> es la portada (fondo del bloque del inicio y
          de la página). Arrastralas o usá las flechas para ordenarlas. Antes de subir se pasan a WebP y a 1600 px
          como máximo: pesan 10 veces menos y se ven igual.
        </p>

        {form.imagenes.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {form.imagenes.map((im, idx) => (
              <div
                key={im.url}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(idx)}
                onDragEnd={() => setDragIdx(null)}
                className="relative rounded-lg overflow-hidden group"
                style={{ border: idx === 0 ? '1px solid var(--accent)' : '1px solid var(--border)', opacity: dragIdx === idx ? 0.4 : 1, cursor: 'grab' }}
              >
                <img src={im.url} alt={im.alt || ''} className="w-full object-cover" style={{ aspectRatio: '4 / 5' }} />
                {idx === 0 && (
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide" style={{ background: 'var(--accent)', color: '#fff' }}>
                    1ª · portada
                  </span>
                )}
                {im._peso && (
                  <span className="absolute bottom-7 left-1 px-1.5 py-0.5 rounded text-[9px]" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                    {pesoLegible(im._peso)}
                  </span>
                )}
                <GripVertical size={12} className="absolute top-1.5 right-7 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: '#fff' }} />
                <button type="button" onClick={() => quitarImagen(idx)} aria-label="Quitar foto"
                  className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.6)' }}>
                  <X size={11} style={{ color: '#fff' }} />
                </button>
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={() => mover(idx, -1)} disabled={idx === 0} aria-label="Mover antes" className="p-1 rounded disabled:opacity-30" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <ArrowLeft size={11} style={{ color: '#fff' }} />
                  </button>
                  <button type="button" onClick={() => mover(idx, 1)} disabled={idx === form.imagenes.length - 1} aria-label="Mover después" className="p-1 rounded disabled:opacity-30" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <ArrowRight size={11} style={{ color: '#fff' }} />
                  </button>
                </div>
                <input
                  value={im.alt || ''}
                  onChange={(e) => setAlt(idx, e.target.value)}
                  placeholder="Ej: Martes"
                  title="Qué muestra la placa (lo leen Google y los lectores de pantalla)"
                  className="w-full px-1.5 py-1 text-[10px] outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: 'none' }}
                />
              </div>
            ))}
          </div>
        )}

        {form.imagenes.length < MAX_IMAGENES && (
          <>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPickFiles} className="hidden" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!!uploading}
              className="w-full py-6 rounded-lg text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}
            >
              {uploading
                ? <><Loader2 size={14} className="animate-spin" /> {uploading}</>
                : <><ImagePlus size={14} /> Agregar placa{form.imagenes.length === 0 ? 's' : ''} (podés elegir varias)</>}
            </button>
          </>
        )}
      </div>

      {/* Días y horario */}
      <div className="rounded-xl p-4 space-y-2" style={card}>
        <div className="flex items-center gap-2">
          <Sun size={14} style={{ color: 'var(--accent)' }} />
          <p className={labelCls} style={{ color: 'var(--text-muted)' }}>Días y horario</p>
        </div>
        <input
          value={form.diasTexto}
          onChange={e => set('diasTexto', e.target.value)}
          maxLength={60}
          placeholder="Martes a viernes de 12 a 16 hs"
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
          style={input}
        />
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          Tal cual se muestra en la página y en el inicio. Los días en que se puede <em>reservar</em> mediodía
          {' '}(hoy: {diasMediodia.length ? diasMediodia.sort().map(d => DIAS[d]).join(', ') : 'ninguno'}) y los turnos
          se marcan en{' '}
          <Link to="/configuracion?tab=reservas" className="underline" style={{ color: 'var(--accent-lift)' }}>Configuración → Reservas</Link>.
        </p>
      </div>

      {/* Textos */}
      <div className="rounded-xl p-4 space-y-3" style={card}>
        <p className={labelCls} style={{ color: 'var(--text-muted)' }}>Título y textos</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>Primera palabra</label>
            <input value={form.titulo} onChange={e => set('titulo', e.target.value)} maxLength={24} placeholder="Kiku" className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={input} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>Segunda (en dorado)</label>
            <input value={form.tituloAccent} onChange={e => set('tituloAccent', e.target.value)} maxLength={24} placeholder="Mediodía" className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={input} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>Bajada (en mayúsculas chicas, bajo el título)</label>
          <input value={form.subtitulo} onChange={e => set('subtitulo', e.target.value)} maxLength={80} placeholder="Nuevo menú de mediodía · Salón y Pick up" className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={input} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>Descripción</label>
          <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)} rows={3} maxLength={300}
            placeholder="Entrada, principal a elección y bebida, a precio fijo. Cocina japonesa o sushi, en el salón o para retirar."
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none" style={input} />
          <p className="text-[10px] text-right" style={{ color: 'var(--text-xmuted)' }}>{form.descripcion.length}/300</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>Nota "Salón"</label>
            <textarea value={form.notaSalon} onChange={e => set('notaSalon', e.target.value)} rows={2} maxLength={200} placeholder="Precio final, servicio de mesa incluido." className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none" style={input} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>Nota "Pick up"</label>
            <textarea value={form.notaPickup} onChange={e => set('notaPickup', e.target.value)} rows={2} maxLength={200} placeholder="Pedidos con retiro en el local." className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none" style={input} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>Texto japonés decorativo (opcional, arriba del título)</label>
          <input value={form.overline} onChange={e => set('overline', e.target.value)} maxLength={16} placeholder="昼のキク" className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={input} />
        </div>
      </div>

      {/* Menús (solo lectura, viven en Reservas) */}
      <div className="rounded-xl p-4 space-y-2" style={card}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock size={14} style={{ color: 'var(--accent)' }} />
            <p className={labelCls} style={{ color: 'var(--text-muted)' }}>Menús y precios</p>
          </div>
          <Link to="/configuracion?tab=reservas" className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--accent-lift)' }}>
            Editar en Reservas <ExternalLink size={11} />
          </Link>
        </div>
        {menus.length === 0 ? (
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            No hay menús de mediodía cargados. Sin menús, la página muestra las placas pero no la lista de precios
            ni el "desde $…".
          </p>
        ) : (
          <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
            {menus.map((m, i) => (
              <li key={m.id || i} className="flex justify-between gap-3">
                <span>{m.nombre}</span>
                <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{m.precio > 0 ? `$${fmt(m.precio)}` : '—'}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          Son los mismos menús que se ofrecen al reservar un mediodía. La web muestra "desde" el más barato.
        </p>
      </div>

      {/* Vista previa */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>Vista previa</p>
        <div className="relative rounded-lg overflow-hidden" style={{ background: '#08040E', opacity: form.activo ? 1 : 0.45, minHeight: 190 }}>
          {form.imagenes[0] && (
            <img src={form.imagenes[0].url} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'brightness(0.35) blur(8px)', transform: 'scale(1.1)' }} />
          )}
          <div className="relative p-5 flex gap-4 items-center">
            <div className="flex-1">
              {form.overline.trim() && <p className="text-[9px] tracking-[0.4em] mb-2" style={{ color: '#E8D4A2' }}>— {form.overline} —</p>}
              <p className="text-2xl mb-1" style={{ color: '#F5F0F7', fontFamily: 'Georgia, serif', fontWeight: 300 }}>
                {form.titulo || 'Kiku'} <span style={{ color: '#E8D4A2' }}>{form.tituloAccent || 'Mediodía'}</span>
              </p>
              {form.subtitulo.trim() && <p className="text-[9px] tracking-[0.3em] uppercase mb-2" style={{ color: '#E8D4A2' }}>{form.subtitulo}</p>}
              <p className="text-[11px] leading-relaxed max-w-sm" style={{ color: '#9B8FAA' }}>{form.descripcion.trim() || 'Acá va la descripción.'}</p>
              <p className="text-[10px] mt-3 inline-block px-2 py-1" style={{ color: '#F5F0F7', border: '1px solid rgba(232,212,162,0.3)' }}>
                {form.diasTexto.trim() || 'Días y horario'}
              </p>
            </div>
            {form.imagenes.slice(0, 3).length > 0 && (
              <div className="hidden sm:flex -space-x-6">
                {form.imagenes.slice(0, 3).map((im, i) => (
                  <img key={im.url} src={im.url} alt="" className="w-16 rounded-md object-cover" style={{ aspectRatio: '4 / 5', transform: `rotate(${(i - 1) * 6}deg)`, border: '1px solid rgba(232,212,162,0.3)' }} />
                ))}
              </div>
            )}
          </div>
        </div>
        {!form.activo && (
          <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
            (Está oculta: así se vería si la prendés. La web real usa tipografías y animaciones propias.)
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2" style={{ background: 'var(--bad-soft)', border: '1px solid var(--border)', color: 'var(--bad)' }}>
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {saveState === 'ok' && (
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--ok)' }}>
            <CheckCircle2 size={13} /> Guardado
          </span>
        )}
        <button
          type="button"
          onClick={guardar}
          disabled={saveState === 'saving' || !!uploading}
          className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: 'var(--cta)' }}
        >
          {saveState === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar
        </button>
      </div>
    </div>
  )
}
