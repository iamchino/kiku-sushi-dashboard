import { useEffect, useRef, useState } from 'react'
import {
  Soup, Save, Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff,
  ImagePlus, X, GripVertical,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * Editor de la sección "Nuevo" de la web pública: el plato del momento.
 * Tabla web_config (fila única id=1), columnas novedad_*.
 *
 * Es un contenedor genérico a propósito. Hoy es el ramen; cuando el ramen deje
 * de ser novedad, se cambian fotos, título y precio desde acá y pasa a ser
 * otra cosa, sin tocar código.
 *
 * La sección va justo después del hero en el home. Nace apagada: la idea es
 * cargar fotos, copy y precio con calma, y recién prenderla cuando esté lista.
 * Mientras novedad_activo = false, la web ni siquiera renderiza la sección.
 *
 * Las fotos van al bucket menu-images bajo el prefijo novedad/ (mismo bucket
 * que usan los productos y los especiales).
 */

const MAX_IMAGENES = 5
const MIN_IMAGENES_PARA_PUBLICAR = 2
const MAX_MB = 5

// 18000 → "18.000" (formato argentino)
const fmt = (n) => Number(n || 0).toLocaleString('es-AR')

const VACIO = {
  activo: false,
  overline: '',
  titulo: '',
  tituloAccent: '',
  descripcion: '',
  precio: 0,
  imagenes: [],
}

export default function NovedadTab() {
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(VACIO)
  const [saveState, setSaveState] = useState('idle') // idle|saving|ok|error
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const fileRef = useRef(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    supabase
      .from('web_config')
      .select('novedad_activo, novedad_overline, novedad_titulo, novedad_titulo_accent, novedad_descripcion, novedad_precio, novedad_imagenes')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!alive) return
        if (err) setError(err.message)
        if (data) {
          setForm({
            activo: Boolean(data.novedad_activo),
            overline: data.novedad_overline ?? '',
            titulo: data.novedad_titulo ?? '',
            tituloAccent: data.novedad_titulo_accent ?? '',
            descripcion: data.novedad_descripcion ?? '',
            precio: Number(data.novedad_precio ?? 0),
            imagenes: Array.isArray(data.novedad_imagenes) ? data.novedad_imagenes : [],
          })
        }
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  // ── Subida de imágenes ─────────────────────────────────────────────────────
  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!files.length) return

    const libres = MAX_IMAGENES - form.imagenes.length
    if (libres <= 0) {
      setError(`Ya tenés ${MAX_IMAGENES} fotos. Borrá alguna para subir otra.`)
      return
    }

    const aSubir = files.slice(0, libres)
    if (files.length > libres) {
      setError(`Solo entran ${libres} foto${libres > 1 ? 's' : ''} más. Subo las primeras ${libres}.`)
    } else {
      setError(null)
    }

    setUploading(true)
    const nuevas = []
    for (const file of aSubir) {
      if (!file.type.startsWith('image/')) {
        setError(`"${file.name}" no es una imagen.`)
        continue
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`"${file.name}" pesa más de ${MAX_MB} MB. Achicala y volvé a intentar.`)
        continue
      }
      const ext = file.name.split('.').pop()
      const fileName = `novedad/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('menu-images')
        .upload(fileName, file, { upsert: true, contentType: file.type })
      if (upErr) {
        setError(upErr.message || `No se pudo subir "${file.name}".`)
        continue
      }
      const { data: { publicUrl } } = supabase.storage
        .from('menu-images')
        .getPublicUrl(fileName)
      nuevas.push({ url: publicUrl, alt: '' })
    }
    setUploading(false)
    if (nuevas.length) setForm(f => ({ ...f, imagenes: [...f.imagenes, ...nuevas] }))
  }

  const quitarImagen = (idx) =>
    setForm(f => ({ ...f, imagenes: f.imagenes.filter((_, i) => i !== idx) }))

  const setAlt = (idx, alt) =>
    setForm(f => ({ ...f, imagenes: f.imagenes.map((im, i) => (i === idx ? { ...im, alt } : im)) }))

  // Reordenar arrastrando: la primera foto es la principal (fondo de la sección).
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

  // ── Validación ─────────────────────────────────────────────────────────────
  // Espejo de los CHECK de la base: no dejamos publicar una sección vacía.
  const faltantes = []
  if (!form.descripcion.trim()) faltantes.push('la descripción')
  if (form.imagenes.length < MIN_IMAGENES_PARA_PUBLICAR) {
    faltantes.push(`${MIN_IMAGENES_PARA_PUBLICAR} fotos como mínimo (tenés ${form.imagenes.length})`)
  }
  const puedePublicar = faltantes.length === 0

  const guardar = async () => {
    if (form.activo && !puedePublicar) {
      setError(`Para mostrar la sección falta: ${faltantes.join(' y ')}.`)
      setSaveState('error')
      return
    }
    if (!Number.isFinite(Number(form.precio)) || Number(form.precio) < 0) {
      setError('El precio tiene que ser 0 o mayor.')
      setSaveState('error')
      return
    }

    setSaveState('saving'); setError(null)
    const { error: err } = await supabase
      .from('web_config')
      .upsert({
        id: 1,
        novedad_activo: form.activo,
        novedad_overline: form.overline.trim(),
        novedad_titulo: form.titulo.trim(),
        novedad_titulo_accent: form.tituloAccent.trim(),
        novedad_descripcion: form.descripcion.trim(),
        novedad_precio: Math.round(Number(form.precio) || 0),
        novedad_imagenes: form.imagenes,
        updated_at: new Date().toISOString(),
      })
    if (err) {
      setSaveState('error')
      setError(err.message || 'No se pudo guardar.')
      return
    }
    setSaveState('ok')
    setTimeout(() => setSaveState('idle'), 1800)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={16} className="animate-spin mr-2" />
        Cargando…
      </div>
    )
  }

  const card = { background: 'var(--bg-card)', border: '1px solid var(--border)' }
  const input = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }
  const labelCls = 'text-xs font-semibold uppercase tracking-wide'

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Explicación */}
      <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ ...card, color: 'var(--text-secondary)' }}>
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>El plato nuevo.</strong> Es la primera sección
          del home, justo debajo del video del hero — lo primero que ve el cliente al bajar.
          Sirve para lo que estén lanzando en el momento: hoy el ramen, mañana lo que venga.
          Cargá las fotos, el texto y el precio con calma: mientras esté oculta, la web no la muestra.
          Cuando esté lista, la prendés acá y aparece al instante.
        </p>
      </div>

      {/* Visibilidad */}
      <div className="rounded-xl p-4 flex items-center justify-between gap-4" style={card}>
        <div className="flex items-center gap-2.5">
          {form.activo
            ? <Eye size={16} style={{ color: '#34d399' }} />
            : <EyeOff size={16} style={{ color: 'var(--text-muted)' }} />}
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {form.activo ? 'Visible en la web' : 'Oculta'}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {form.activo
                ? 'Los clientes ven la sección ahora mismo.'
                : puedePublicar
                  ? 'Ya tenés todo cargado: prendela cuando quieras.'
                  : `Falta ${faltantes.join(' y ')} para poder mostrarla.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!form.activo && !puedePublicar) {
              setError(`Para mostrar la sección falta: ${faltantes.join(' y ')}.`)
              return
            }
            setError(null)
            set('activo', !form.activo)
          }}
          disabled={!form.activo && !puedePublicar}
          className="relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: form.activo ? 'var(--accent)' : 'var(--bg-input)', border: '1px solid var(--border)' }}
          aria-pressed={form.activo}
          title={!form.activo && !puedePublicar ? `Falta ${faltantes.join(' y ')}` : undefined}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
            style={{ left: form.activo ? '24px' : '4px' }}
          />
        </button>
      </div>

      {/* Fotos */}
      <div className="rounded-xl p-4 space-y-3" style={card}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ImagePlus size={14} style={{ color: 'var(--accent)' }} />
            <p className={labelCls} style={{ color: 'var(--text-muted)' }}>
              Fotos · {form.imagenes.length}/{MAX_IMAGENES}
            </p>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
            Mínimo {MIN_IMAGENES_PARA_PUBLICAR} · máx {MAX_MB} MB c/u
          </p>
        </div>

        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Se muestran en un carrusel, en este orden. La <strong style={{ color: 'var(--text-secondary)' }}>primera</strong> abre
          el carrusel y además va de fondo a la sección. Arrastralas para reordenarlas.
          Podés poner de {MIN_IMAGENES_PARA_PUBLICAR} a {MAX_IMAGENES}: si son tres, son tres — no quedan huecos.
        </p>

        {form.imagenes.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {form.imagenes.map((im, idx) => (
              <div
                key={im.url}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(idx)}
                onDragEnd={() => setDragIdx(null)}
                className="relative rounded-lg overflow-hidden group"
                style={{
                  border: idx === 0 ? '1px solid var(--accent)' : '1px solid var(--border)',
                  opacity: dragIdx === idx ? 0.4 : 1,
                  cursor: 'grab',
                }}
              >
                <img src={im.url} alt={im.alt || ''} className="w-full h-24 object-cover" />
                {idx === 0 && (
                  <span
                    className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    1ª · portada
                  </span>
                )}
                <GripVertical
                  size={12}
                  className="absolute top-1.5 right-7 opacity-0 group-hover:opacity-60 transition-opacity"
                  style={{ color: '#fff' }}
                />
                <button
                  type="button"
                  onClick={() => quitarImagen(idx)}
                  className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(0,0,0,0.6)' }}
                  aria-label="Quitar foto"
                >
                  <X size={11} style={{ color: '#fff' }} />
                </button>
                <input
                  value={im.alt}
                  onChange={(e) => setAlt(idx, e.target.value)}
                  placeholder="Describí la foto"
                  title="Texto alternativo: lo lee Google y los lectores de pantalla"
                  className="w-full px-1.5 py-1 text-[10px] outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: 'none' }}
                />
              </div>
            ))}
          </div>
        )}

        {form.imagenes.length < MAX_IMAGENES && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={onPickFiles}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full py-6 rounded-lg text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}
            >
              {uploading
                ? <><Loader2 size={14} className="animate-spin" /> Subiendo…</>
                : <><ImagePlus size={14} /> Agregar foto{form.imagenes.length === 0 ? 's' : ''}</>}
            </button>
          </>
        )}
      </div>

      {/* Título */}
      <div className="rounded-xl p-4 space-y-3" style={card}>
        <div className="flex items-center gap-2">
          <Soup size={14} style={{ color: 'var(--accent)' }} />
          <p className={labelCls} style={{ color: 'var(--text-muted)' }}>Título</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>Primera palabra</label>
            <input
              value={form.titulo}
              onChange={e => set('titulo', e.target.value)}
              maxLength={24}
              placeholder="Ramen"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={input}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>Segunda (en dorado)</label>
            <input
              value={form.tituloAccent}
              onChange={e => set('tituloAccent', e.target.value)}
              maxLength={24}
              placeholder="de Kiku"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={input}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
            Texto japonés decorativo (opcional, va arriba del título)
          </label>
          <input
            value={form.overline}
            onChange={e => set('overline', e.target.value)}
            maxLength={16}
            placeholder="ラーメン"
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={input}
          />
        </div>
      </div>

      {/* Descripción */}
      <div className="rounded-xl p-4 space-y-2" style={card}>
        <p className={labelCls} style={{ color: 'var(--text-muted)' }}>Descripción</p>
        <textarea
          value={form.descripcion}
          onChange={e => set('descripcion', e.target.value)}
          rows={4}
          maxLength={400}
          placeholder="Caldo de 12 horas, chashu de cerdo braseado, huevo marinado y fideos frescos hechos en casa."
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
          style={input}
        />
        <p className="text-[10px] text-right" style={{ color: 'var(--text-xmuted)' }}>
          {form.descripcion.length}/400
        </p>
      </div>

      {/* Precio */}
      <div className="rounded-xl p-4 space-y-2" style={card}>
        <p className={labelCls} style={{ color: 'var(--text-muted)' }}>Precio</p>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
          <input
            type="number"
            min={0}
            step={100}
            value={form.precio}
            onChange={e => set('precio', e.target.value === '' ? 0 : Number(e.target.value))}
            className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
            style={input}
          />
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          {Number(form.precio) > 0
            ? <>Se muestra como <strong style={{ color: 'var(--text-secondary)' }}>${fmt(form.precio)}</strong>.</>
            : 'En 0 la web no muestra precio — útil mientras lo definís.'}
        </p>
      </div>

      {/* Preview */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
          Vista previa
        </p>
        <div
          className="relative rounded-lg overflow-hidden"
          style={{ background: '#08040E', opacity: form.activo ? 1 : 0.45, minHeight: 170 }}
        >
          {form.imagenes[0] && (
            <img
              src={form.imagenes[0].url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'brightness(0.5)' }}
            />
          )}
          <div className="relative p-5">
            {form.overline.trim() && (
              <p className="text-[9px] tracking-[0.4em] mb-2" style={{ color: '#E8D4A2' }}>
                — {form.overline} —
              </p>
            )}
            <p className="text-2xl mb-2" style={{ color: '#F5F0F7', fontFamily: 'Georgia, serif', fontWeight: 300 }}>
              {form.titulo || 'Tu plato'}{' '}
              {form.tituloAccent && <span style={{ color: '#E8D4A2' }}>{form.tituloAccent}</span>}
            </p>
            <p className="text-[11px] leading-relaxed max-w-sm" style={{ color: '#9B8FAA' }}>
              {form.descripcion.trim() || 'Acá va la descripción del plato.'}
            </p>
            {Number(form.precio) > 0 && (
              <p className="text-sm mt-3" style={{ color: '#E8D4A2', fontFamily: 'Georgia, serif' }}>
                ${fmt(form.precio)}
              </p>
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
        <div
          className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
        >
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {saveState === 'ok' && (
          <span className="flex items-center gap-1 text-xs" style={{ color: '#22c55e' }}>
            <CheckCircle2 size={13} /> Guardado
          </span>
        )}
        <button
          type="button"
          onClick={guardar}
          disabled={saveState === 'saving' || uploading}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
        >
          {saveState === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar
        </button>
      </div>
    </div>
  )
}
