import { useState, useEffect, useRef } from 'react'
import { X, Trash2, Loader2, ImageIcon, Plus, ChevronUp, ChevronDown, CalendarCheck, ShoppingBag, Link2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Experiencias del form de reservas de la web (ReservationFormV2)
const EXPERIENCIAS = [
  { id: 'umami_del_sur',        label: 'Umami del Sur' },
  { id: 'pacifico_y_patagonia', label: 'Pacífico y Patagonia' },
  { id: 'pasta_nikkei',         label: 'Pasta Nikkei' },
  { id: 'omakase',              label: 'Omakase' },
  { id: 'kiku_libre',           label: 'Kiku Libre' },
  { id: 'carta_abierta',        label: 'Carta abierta' },
]

// Acciones posibles del botón del especial en la web pública.
const CTA_TIPOS = [
  { id: 'reservar', label: 'Reservar', icon: CalendarCheck, hint: 'El botón lleva al formulario de reservas.' },
  { id: 'pedir',    label: 'Pedir',    icon: ShoppingBag,   hint: 'El botón lleva a pedir online un producto de deli / take away.' },
  { id: 'link',     label: 'Link',     icon: Link2,         hint: 'El botón lleva a una URL libre (WhatsApp, promo, etc.).' },
]

const EMPTY = {
  slug: '',
  titulo: '',
  titulo_acento: '',
  overline: '',
  numero: '',
  grupo: '',
  experiencia: 'umami_del_sur',
  cta_tipo: 'reservar',
  cta_producto_id: '',
  cta_url: '',
  cta_label: '',
  descripcion: '',
  descripcion_destacada: '',
  precio: '',
  precio_nota: 'por persona',
  firma: '',
  orden: 0,
  activo: true,
  dias: [],
  imagen_url: '',
  imagen_alt: '',
}

const slugify = (s) => s
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '')

export default function EspecialModal({ open, onClose, item, onSave }) {
  const [form, setForm] = useState(EMPTY)
  const [pasos, setPasos] = useState([])
  const [slugTouched, setSlugTouched] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [productos, setProductos] = useState([])
  const fileInputRef = useRef(null)

  // Productos de deli / take away para el botón "Pedir".
  useEffect(() => {
    if (!open) return
    let alive = true
    supabase
      .from('menu_items')
      .select('id, nombre, categoria, precio')
      .eq('tipo', 'delivery')
      .eq('activo', true)
      .order('categoria', { ascending: true })
      .order('orden', { ascending: true })
      .then(({ data }) => { if (alive) setProductos(data || []) })
    return () => { alive = false }
  }, [open])

  useEffect(() => {
    if (item) {
      setForm({
        slug: item.slug || '',
        titulo: item.titulo || '',
        titulo_acento: item.titulo_acento || '',
        overline: item.overline || '',
        numero: item.numero || '',
        grupo: item.grupo || '',
        experiencia: item.experiencia || 'umami_del_sur',
        cta_tipo: item.cta_tipo || 'reservar',
        cta_producto_id: item.cta_producto_id || '',
        cta_url: item.cta_url || '',
        cta_label: item.cta_label || '',
        descripcion: item.descripcion || '',
        descripcion_destacada: item.descripcion_destacada || '',
        precio: item.precio ?? '',
        precio_nota: item.precio_nota || '',
        firma: item.firma || '',
        orden: item.orden ?? 0,
        activo: item.activo ?? true,
        dias: Array.isArray(item.dias) ? item.dias : [],
        imagen_url: item.imagen_url || '',
        imagen_alt: item.imagen_alt || '',
      })
      setImagePreview(item.imagen_url || null)
      setPasos((item.especial_pasos || []).map(p => ({
        etiqueta: p.etiqueta || '',
        texto: p.texto || '',
        items: Array.isArray(p.items) ? p.items.map(it => ({ roll: it.roll || '', detalle: it.detalle || '' })) : [],
      })))
      setSlugTouched(true)
    } else {
      setForm(EMPTY)
      setPasos([])
      setImagePreview(null)
      setSlugTouched(false)
    }
    setImageFile(null)
    setErrorMsg(null)
  }, [item, open])

  if (!open) return null

  const handleField = (e) => {
    const { name, value, type, checked } = e.target
    setForm(f => {
      const next = { ...f, [name]: type === 'checkbox' ? checked : value }
      // Autogenerar slug desde el título mientras el usuario no lo haya tocado
      if (name === 'titulo' && !slugTouched) next.slug = slugify(value)
      return next
    })
  }

  // ── Pasos handlers ──────────────────────────────────────────────────────
  const addPaso = () => setPasos(p => [...p, { etiqueta: '', texto: '', items: [] }])
  const removePaso = (idx) => setPasos(p => p.filter((_, i) => i !== idx))
  const updatePaso = (idx, field, value) =>
    setPasos(p => p.map((paso, i) => i === idx ? { ...paso, [field]: value } : paso))
  const movePaso = (idx, dir) => setPasos(p => {
    const j = idx + dir
    if (j < 0 || j >= p.length) return p
    const next = [...p]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    return next
  })

  const addRoll = (pIdx) => setPasos(p => p.map((paso, i) =>
    i === pIdx ? { ...paso, items: [...paso.items, { roll: '', detalle: '' }] } : paso))
  const removeRoll = (pIdx, rIdx) => setPasos(p => p.map((paso, i) =>
    i === pIdx ? { ...paso, items: paso.items.filter((_, j) => j !== rIdx) } : paso))
  const updateRoll = (pIdx, rIdx, field, value) => setPasos(p => p.map((paso, i) =>
    i === pIdx
      ? { ...paso, items: paso.items.map((it, j) => j === rIdx ? { ...it, [field]: value } : it) }
      : paso))

  // ── Image handlers ──────────────────────────────────────────────────────
  const handleFileSelect = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFileSelect(e.dataTransfer.files[0])
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
    setForm(f => ({ ...f, imagen_url: '' }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.titulo.trim()) {
      setErrorMsg('El título es obligatorio.')
      return
    }
    const slug = form.slug.trim() || slugify(form.titulo)
    if (!slug) {
      setErrorMsg('No se pudo generar un identificador (slug) a partir del título.')
      return
    }

    // Validación de la acción del botón
    if (form.cta_tipo === 'pedir' && !form.cta_producto_id) {
      setErrorMsg('Elegí el producto de deli / take away al que lleva el botón "Pedir".')
      return
    }
    if (form.cta_tipo === 'link' && !form.cta_url.trim()) {
      setErrorMsg('Pegá la URL a la que lleva el botón.')
      return
    }

    const validPasos = pasos
      .filter(p => p.etiqueta.trim() && p.texto.trim())
      .map(p => ({ ...p, items: p.items.filter(it => it.roll.trim()) }))

    setSaving(true)
    setErrorMsg(null)

    // Limpiar los campos de CTA que no apliquen según el tipo elegido.
    const ctaFields = {
      cta_tipo: form.cta_tipo,
      cta_producto_id: form.cta_tipo === 'pedir' ? form.cta_producto_id : null,
      cta_url: form.cta_tipo === 'link' ? form.cta_url.trim() : null,
      cta_label: form.cta_label.trim() || null,
    }

    const payload = { ...form, ...ctaFields, slug, pasos: validPasos }
    const err = await onSave(payload, imageFile)
    setSaving(false)
    if (err) {
      setErrorMsg(typeof err === 'string' ? err : err.message || 'Error al guardar.')
    } else {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
              {item ? 'Editar especial' : 'Nuevo especial'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Especiales de Kiku · web pública
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="grid md:grid-cols-2 gap-0 divide-x" style={{ borderColor: 'var(--border)' }}>

            {/* ── LEFT: campos principales ── */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-[1fr_72px] gap-3">
                <Field label="Título *">
                  <input
                    name="titulo" value={form.titulo} onChange={handleField}
                    className="input-modal" placeholder="Ej: Umami" required
                  />
                </Field>
                <Field label="Número">
                  <input
                    name="numero" value={form.numero} onChange={handleField}
                    className="input-modal text-center" placeholder="01"
                  />
                </Field>
              </div>

              <Field label="Acento del título" hint="Se muestra con gradiente en la segunda línea. Ej: del Sur">
                <input
                  name="titulo_acento" value={form.titulo_acento} onChange={handleField}
                  className="input-modal" placeholder="Ej: del Sur"
                />
              </Field>

              <Field label="Overline (kanji decorativo)">
                <input
                  name="overline" value={form.overline} onChange={handleField}
                  className="input-modal" placeholder="Ej: — 南の旨味 —"
                />
              </Field>

              <Field
                label="Descripción"
                hint="Apretá Enter para hacer saltos de línea — se ven igual en la web."
              >
                <textarea
                  name="descripcion" value={form.descripcion} onChange={handleField}
                  className="input-modal resize-y" rows={5}
                  placeholder={"Texto que aparece bajo el título…\nPodés usar varias líneas."}
                />
              </Field>

              <Field
                label="Descripción destacada"
                hint="✨ Se muestra en un recuadro destacado debajo de la descripción. Ej: Consultar opción sin bebida · Descuento efectivo/transferencia. Vacío = no se muestra."
              >
                <textarea
                  name="descripcion_destacada" value={form.descripcion_destacada} onChange={handleField}
                  className="input-modal resize-y" rows={2}
                  placeholder={"Ej: Consultar opción sin bebida\nDescuento en efectivo / transferencia"}
                />
              </Field>

              {/* ── Acción del botón ── */}
              <div className="space-y-2.5 rounded-xl p-3.5" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Acción del botón
                </label>
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {CTA_TIPOS.map(({ id, label, icon: Ic }) => (
                    <button
                      key={id} type="button"
                      onClick={() => setForm(f => ({ ...f, cta_tipo: id }))}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-all"
                      style={form.cta_tipo === id
                        ? { background: 'var(--accent)', color: '#fff' }
                        : { background: 'var(--bg-card)', color: 'var(--text-muted)' }}
                    >
                      <Ic size={13} />
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
                  {CTA_TIPOS.find(c => c.id === form.cta_tipo)?.hint}
                </p>

                {/* Reservar → experiencia del form */}
                {form.cta_tipo === 'reservar' && (
                  <>
                    <Field label="Experiencia (form de reservas)">
                      <select name="experiencia" value={form.experiencia} onChange={handleField} className="input-modal">
                        {EXPERIENCIAS.map(x => (
                          <option key={x.id} value={x.id} style={{ background: 'var(--bg-input)' }}>{x.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Días que se ofrece (para reservar)" hint="Vacío = cualquier día abierto. En la web solo aparece en estos días.">
                      <DiasPicker
                        value={form.dias}
                        onChange={dias => setForm(f => ({ ...f, dias }))}
                      />
                    </Field>
                  </>
                )}

                {/* Pedir → producto de deli / take away */}
                {form.cta_tipo === 'pedir' && (
                  <Field label="Producto de deli / take away">
                    <select name="cta_producto_id" value={form.cta_producto_id} onChange={handleField} className="input-modal">
                      <option value="" style={{ background: 'var(--bg-input)' }}>— Elegí un producto —</option>
                      {productos.map(p => (
                        <option key={p.id} value={p.id} style={{ background: 'var(--bg-input)' }}>
                          {p.categoria ? `${p.categoria} · ` : ''}{p.nombre}
                        </option>
                      ))}
                    </select>
                    {productos.length === 0 && (
                      <p className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
                        No hay productos de delivery activos. Cargalos en la tab "Delivery / Pedidos".
                      </p>
                    )}
                  </Field>
                )}

                {/* Link → URL libre */}
                {form.cta_tipo === 'link' && (
                  <Field label="URL del botón" hint="Ej: https://wa.me/549... o https://...">
                    <input
                      name="cta_url" value={form.cta_url} onChange={handleField}
                      className="input-modal text-xs" placeholder="https://..."
                    />
                  </Field>
                )}

                {/* Texto opcional del botón */}
                <Field label="Texto del botón (opcional)">
                  <input
                    name="cta_label" value={form.cta_label} onChange={handleField}
                    className="input-modal text-xs"
                    placeholder={form.cta_tipo === 'reservar' ? 'Reservar' : form.cta_tipo === 'pedir' ? 'Pedir ahora' : 'Ver más'}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Precio">
                  <input
                    type="number" min="0" step="100"
                    name="precio" value={form.precio} onChange={handleField}
                    className="input-modal" placeholder="39500"
                  />
                </Field>
                <Field label="Nota del precio">
                  <input
                    name="precio_nota" value={form.precio_nota} onChange={handleField}
                    className="input-modal" placeholder="por persona"
                  />
                </Field>
              </div>

              <Field label="Firma (opcional)">
                <input
                  name="firma" value={form.firma} onChange={handleField}
                  className="input-modal" placeholder="Ej: — Chef Selection · Marcelo Castro —"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Orden">
                  <input
                    type="number" name="orden" value={form.orden} onChange={handleField}
                    className="input-modal" min={0}
                  />
                </Field>
                <Field label="Identificador (slug)">
                  <input
                    name="slug" value={form.slug}
                    onChange={e => { setSlugTouched(true); handleField(e) }}
                    className="input-modal" placeholder="umami"
                  />
                </Field>
              </div>

              <Field
                label="Grupo de carrusel (opcional)"
                hint="Poné la misma etiqueta en dos o más especiales para que se muestren JUNTOS como carrusel (ej: mundial). Vacío = se muestra solo, en su sección."
              >
                <input
                  name="grupo" value={form.grupo} onChange={handleField}
                  className="input-modal" placeholder="ej: mundial"
                />
              </Field>

              {/* Activo */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div className="relative">
                  <input
                    type="checkbox" name="activo" checked={form.activo} onChange={handleField}
                    className="sr-only peer"
                  />
                  <div
                    className="w-9 h-5 rounded-full transition-colors"
                    style={{ background: form.activo ? 'var(--accent)' : 'var(--border)' }}
                  />
                  <div
                    className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                    style={{ transform: form.activo ? 'translateX(16px)' : 'translateX(0)' }}
                  />
                </div>
                <span className="text-sm" style={{ color: form.activo ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                  {form.activo ? 'Visible en la web' : 'Oculto de la web'}
                </span>
              </label>
            </div>

            {/* ── RIGHT: imagen ── */}
            <div className="p-6 flex flex-col gap-4">
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Imagen del especial
              </p>

              {imagePreview ? (
                <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <img src={imagePreview} alt="preview" className="w-full h-52 object-cover" />
                  <button
                    type="button" onClick={clearImage}
                    className="absolute top-2 right-2 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20"
                    style={{ background: 'rgba(0,0,0,0.6)', color: '#f87171' }}
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-2 right-2 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                    style={{ background: 'rgba(0,0,0,0.7)', color: '#a1a1aa', border: '1px solid var(--border)' }}
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 rounded-xl cursor-pointer h-52 transition-all"
                  style={{
                    border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
                    background: dragOver ? 'var(--accent-soft)' : 'var(--bg-input)',
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(var(--accent-rgb),0.1)' }}
                  >
                    <ImageIcon size={22} style={{ color: 'var(--accent-lift)' }} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Arrastrá o hacé clic</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-xmuted)' }}>JPG, PNG, WEBP · ideal 4:5 vertical</p>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => handleFileSelect(e.target.files?.[0])}
              />

              <Field label="O pegar URL de imagen">
                <input
                  name="imagen_url" value={form.imagen_url}
                  onChange={e => {
                    handleField(e)
                    if (e.target.value) setImagePreview(e.target.value)
                    else setImagePreview(null)
                    setImageFile(null)
                  }}
                  className="input-modal text-xs" placeholder="https://..."
                />
              </Field>

              <Field label="Texto alternativo (accesibilidad)">
                <input
                  name="imagen_alt" value={form.imagen_alt} onChange={handleField}
                  className="input-modal text-xs" placeholder="Ej: Especial Umami — pasos de mar con maridaje"
                />
              </Field>

              <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
                💡 Si no subís imagen, la web usa la foto original del especial (cuando el
                identificador coincide: umami, pacifico, pasta-nikkei).
              </p>
            </div>
          </div>

          {/* ── PASOS (ancho completo) ── */}
          <div className="p-6 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Pasos del especial
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-xmuted)' }}>
                  Ej: Entrada / Principal / Maridaje. Opcional — un plato único (como Pasta Nikkei) puede no tener pasos.
                </p>
              </div>
              <button
                type="button" onClick={addPaso}
                className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-all"
                style={{ color: 'var(--accent-lift)', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}
              >
                <Plus size={11} /> Agregar paso
              </button>
            </div>

            {pasos.map((paso, idx) => (
              <div
                key={idx}
                className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start gap-2">
                  <div className="grid grid-cols-[140px_1fr] gap-2 flex-1">
                    <input
                      value={paso.etiqueta}
                      onChange={e => updatePaso(idx, 'etiqueta', e.target.value)}
                      className="input-modal text-xs" placeholder="Entrada"
                    />
                    <textarea
                      value={paso.texto}
                      onChange={e => updatePaso(idx, 'texto', e.target.value)}
                      className="input-modal text-xs resize-none" rows={2}
                      placeholder="Descripción del paso…"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button" onClick={() => movePaso(idx, -1)} disabled={idx === 0}
                      className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-30"
                      style={{ color: 'var(--text-xmuted)' }}
                    >
                      <ChevronUp size={12} />
                    </button>
                    <button
                      type="button" onClick={() => movePaso(idx, 1)} disabled={idx === pasos.length - 1}
                      className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-30"
                      style={{ color: 'var(--text-xmuted)' }}
                    >
                      <ChevronDown size={12} />
                    </button>
                  </div>
                  <button
                    type="button" onClick={() => removePaso(idx)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                    style={{ color: 'var(--text-xmuted)' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Rolls del paso */}
                <div className="pl-1 space-y-2">
                  {paso.items.map((it, rIdx) => (
                    <div key={rIdx} className="grid grid-cols-[150px_1fr_28px] gap-2 items-start">
                      <input
                        value={it.roll}
                        onChange={e => updateRoll(idx, rIdx, 'roll', e.target.value)}
                        className="input-modal text-xs" placeholder="Centolla roll"
                      />
                      <input
                        value={it.detalle}
                        onChange={e => updateRoll(idx, rIdx, 'detalle', e.target.value)}
                        className="input-modal text-xs" placeholder="Detalle del roll…"
                      />
                      <button
                        type="button" onClick={() => removeRoll(idx, rIdx)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ color: 'var(--text-xmuted)' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button" onClick={() => addRoll(idx)}
                    className="text-[11px] font-medium"
                    style={{ color: 'var(--accent-lift)' }}
                  >
                    + Agregar roll a este paso
                  </button>
                </div>
              </div>
            ))}

            {pasos.length === 0 && (
              <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
                Sin pasos. El especial se muestra solo con título, descripción y precio.
              </p>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between gap-3 px-6 py-4"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            {errorMsg ? (
              <p className="text-xs" style={{ color: '#f87171' }}>{errorMsg}</p>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              <button
                type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Cancelar
              </button>
              <button
                type="submit" disabled={saving}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50 flex items-center gap-2"
                style={{ background: saving ? 'var(--accent-deep)' : 'linear-gradient(135deg, var(--accent), var(--accent-deep))', boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.25)' }}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Guardando…' : item ? 'Guardar cambios' : 'Crear especial'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <style>{`
        .input-modal {
          width: 100%;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.15s;
        }
        .input-modal:focus { border-color: rgba(var(--accent-rgb),0.5); }
        .input-modal::placeholder { color: var(--text-xmuted); }
      `}</style>
    </div>
  )
}

// Selector compacto de días (0=Dom..6=Sáb). value/onChange = array de dow.
const DIAS_PICKER = [
  { dow: 1, l: 'Lun' }, { dow: 2, l: 'Mar' }, { dow: 3, l: 'Mié' }, { dow: 4, l: 'Jue' },
  { dow: 5, l: 'Vie' }, { dow: 6, l: 'Sáb' }, { dow: 0, l: 'Dom' },
]
function DiasPicker({ value, onChange }) {
  const set = new Set(value || [])
  const toggle = (dow) => {
    const next = new Set(set)
    next.has(dow) ? next.delete(dow) : next.add(dow)
    onChange([...next].sort((a, b) => a - b))
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {DIAS_PICKER.map(({ dow, l }) => {
        const on = set.has(dow)
        return (
          <button key={dow} type="button" onClick={() => toggle(dow)} aria-pressed={on}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={on
              ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
              : { background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {l}
          </button>
        )
      })}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      {children}
      {hint && <p className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>{hint}</p>}
    </div>
  )
}
