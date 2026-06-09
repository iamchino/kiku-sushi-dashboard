import { useState, useEffect, useRef } from 'react'
import { X, Trash2, Loader2, ImageIcon, Plus } from 'lucide-react'

const ETIQUETAS = ['', 'Popular', 'Premium', 'Nuevo', 'Limitado']

const EMPTY = {
  nombre: '',
  descripcion: '',
  categoria: '',
  subtitulo: '',
  precio: '',
  etiqueta: '',
  activo: true,
  orden: 0,
  imagen_url: '',
}

export default function ProductModal({ open, onClose, item, tipo, categories, onSave }) {
  const [form, setForm] = useState(EMPTY)
  const [variantes, setVariantes] = useState([])
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  // Populate form when editing
  useEffect(() => {
    if (item) {
      setForm({
        nombre: item.nombre || '',
        descripcion: item.descripcion || '',
        categoria: item.categoria || '',
        subtitulo: item.subtitulo || '',
        precio: item.precio || '',
        etiqueta: item.etiqueta || '',
        activo: item.activo ?? true,
        orden: item.orden ?? 0,
        imagen_url: item.imagen_url || '',
      })
      setImagePreview(item.imagen_url || null)
      // Cargar variantes existentes
      setVariantes((item.menu_item_variantes || []).map(v => ({
        nombre: v.nombre || '',
        piezas: String(v.piezas || 1),
        precio: String(v.precio || 0),
      })))
    } else {
      setForm(EMPTY)
      setImagePreview(null)
      setVariantes([])
    }
    setImageFile(null)
    setErrorMsg(null)
  }, [item, open])

  if (!open) return null

  const handleField = (e) => {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  // ── Variantes handlers ──────────────────────────────────────────────────
  const addVariante = () => {
    setVariantes(v => [...v, { nombre: '', piezas: '1', precio: '' }])
  }

  const updateVariante = (idx, field, value) => {
    setVariantes(v => v.map((vr, i) => i === idx ? { ...vr, [field]: value } : vr))
  }

  const removeVariante = (idx) => {
    setVariantes(v => v.filter((_, i) => i !== idx))
  }

  // ── Image handlers ──────────────────────────────────────────────────────
  const handleFileSelect = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    handleFileSelect(file)
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
    setForm(f => ({ ...f, imagen_url: '' }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim() || !form.categoria.trim()) {
      setErrorMsg('Nombre y categoría son obligatorios.')
      return
    }

    // Validar variantes si existen
    const validVariantes = variantes.filter(v => v.nombre.trim() && v.precio)
    if (variantes.length > 0 && validVariantes.length === 0) {
      setErrorMsg('Completá al menos una variante con nombre y precio.')
      return
    }

    setSaving(true)
    setErrorMsg(null)

    // Pasar variantes al onSave
    const payload = { ...form, variantes: validVariantes.length > 0 ? validVariantes : [] }
    const err = await onSave(payload, imageFile)
    setSaving(false)
    if (err) {
      setErrorMsg(typeof err === 'string' ? err : err.message || 'Error al guardar.')
    } else {
      onClose()
    }
  }

  const tieneVariantes = variantes.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Card */}
      <div
        className="relative w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
              {item ? 'Editar producto' : 'Nuevo producto'}
            </p>
            <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--text-muted)' }}>
              {tipo === 'carta' ? 'Carta Salón' : 'Delivery / Pedidos'}
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

            {/* ── LEFT: Form fields ── */}
            <div className="p-6 space-y-4">

              {/* Nombre */}
              <Field label="Nombre *">
                <input
                  name="nombre" value={form.nombre} onChange={handleField}
                  className="input-modal" placeholder="Ej: Gyozas de Langostinos" required
                />
              </Field>

              {/* Descripción */}
              <Field label="Descripción">
                <textarea
                  name="descripcion" value={form.descripcion} onChange={handleField}
                  className="input-modal resize-none" rows={2}
                  placeholder="Ingredientes, preparación…"
                />
              </Field>

              {/* Categoría */}
              <Field label="Categoría *">
                <input
                  name="categoria" value={form.categoria} onChange={handleField}
                  className="input-modal" placeholder="Ej: Rolls de Sushi"
                  list="cat-suggestions" required
                />
                <datalist id="cat-suggestions">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              </Field>

              {/* Subtítulo categoría */}
              <Field label="Subtítulo de categoría">
                <input
                  name="subtitulo" value={form.subtitulo} onChange={handleField}
                  className="input-modal" placeholder="Ej: Empanadillas japonesas · 4 unidades"
                />
              </Field>

              {/* Precio simple (solo si NO tiene variantes) */}
              {!tieneVariantes && (
                <Field label="Precio">
                  <input
                    name="precio" value={form.precio} onChange={handleField}
                    className="input-modal" placeholder="Ej: $12.500"
                  />
                </Field>
              )}

              {/* ── VARIANTES ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Variantes de tamaño
                  </label>
                  <button
                    type="button" onClick={addVariante}
                    className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-all"
                    style={{ color: 'var(--accent-lift)', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}
                  >
                    <Plus size={11} /> Agregar
                  </button>
                </div>

                {tieneVariantes ? (
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_60px_90px_28px] gap-2 px-1">
                      <span className="text-[10px] font-medium uppercase" style={{ color: 'var(--text-xmuted)' }}>Nombre</span>
                      <span className="text-[10px] font-medium uppercase" style={{ color: 'var(--text-xmuted)' }}>Piezas</span>
                      <span className="text-[10px] font-medium uppercase" style={{ color: 'var(--text-xmuted)' }}>Precio</span>
                      <span />
                    </div>

                    {variantes.map((v, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_60px_90px_28px] gap-2 items-center">
                        <input
                          value={v.nombre}
                          onChange={e => updateVariante(idx, 'nombre', e.target.value)}
                          className="input-modal text-xs"
                          placeholder="5 piezas"
                        />
                        <input
                          type="number" min="0.5" step="0.5"
                          value={v.piezas}
                          onChange={e => updateVariante(idx, 'piezas', e.target.value)}
                          className="input-modal text-xs text-center"
                          placeholder="5"
                        />
                        <input
                          type="number" min="0" step="100"
                          value={v.precio}
                          onChange={e => updateVariante(idx, 'precio', e.target.value)}
                          className="input-modal text-xs"
                          placeholder="$4000"
                        />
                        <button
                          type="button" onClick={() => removeVariante(idx)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                          style={{ color: 'var(--text-xmuted)' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}

                    <p className="text-[10px] px-1" style={{ color: 'var(--text-xmuted)' }}>
                      💡 "Piezas" = cuántas porciones de la receta consume esta variante. Si tu receta rinde 10 y vendés de 5, poné 5.
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] px-1" style={{ color: 'var(--text-xmuted)' }}>
                    Sin variantes. Usá variantes cuando un producto tenga múltiples tamaños (5p, 9p, etc.)
                  </p>
                )}
              </div>

              {/* Etiqueta + Orden en row */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Etiqueta">
                  <select name="etiqueta" value={form.etiqueta} onChange={handleField} className="input-modal">
                    {ETIQUETAS.map(e => (
                      <option key={e} value={e} style={{ background: 'var(--bg-input)' }}>
                        {e || 'Sin etiqueta'}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Orden">
                  <input
                    type="number" name="orden" value={form.orden} onChange={handleField}
                    className="input-modal" min={0}
                  />
                </Field>
              </div>

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
                  {form.activo ? 'Visible en el menú' : 'Oculto del menú'}
                </span>
              </label>
            </div>

            {/* ── RIGHT: Image upload ── */}
            <div className="p-6 flex flex-col gap-4">
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Imagen del producto
              </p>

              {/* Drop zone / preview */}
              {imagePreview ? (
                <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <img
                    src={imagePreview} alt="preview"
                    className="w-full h-52 object-cover"
                  />
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
                    <p className="text-xs mt-1" style={{ color: 'var(--text-xmuted)' }}>JPG, PNG, WEBP · Máx 5MB</p>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => handleFileSelect(e.target.files?.[0])}
              />

              {/* URL manual fallback */}
              <Field label="O pegar URL de imagen">
                <input
                  name="imagen_url" value={form.imagen_url} onChange={e => {
                    handleField(e)
                    if (e.target.value) setImagePreview(e.target.value)
                    else setImagePreview(null)
                    setImageFile(null)
                  }}
                  className="input-modal text-xs" placeholder="https://..."
                />
              </Field>
            </div>
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
                {saving ? 'Guardando…' : item ? 'Guardar cambios' : 'Crear producto'}
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

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      {children}
    </div>
  )
}
