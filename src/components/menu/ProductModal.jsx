import { useState, useEffect, useRef } from 'react'
import { X, Upload, Trash2, Loader2, ImageIcon } from 'lucide-react'

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
    } else {
      setForm(EMPTY)
      setImagePreview(null)
    }
    setImageFile(null)
    setErrorMsg(null)
  }, [item, open])

  if (!open) return null

  const handleField = (e) => {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

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
    setSaving(true)
    setErrorMsg(null)
    const err = await onSave(form, imageFile)
    setSaving(false)
    if (err) {
      setErrorMsg(typeof err === 'string' ? err : err.message || 'Error al guardar.')
    } else {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ background: '#1c1c1f', border: '1px solid #2a2a2e', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #2a2a2e' }}>
          <div>
            <p className="font-semibold text-white text-base">
              {item ? 'Editar producto' : 'Nuevo producto'}
            </p>
            <p className="text-xs mt-0.5 capitalize" style={{ color: '#52525b' }}>
              {tipo === 'carta' ? 'Carta Salón' : 'Delivery / Pedidos'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ color: '#71717a' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="grid md:grid-cols-2 gap-0 divide-x" style={{ borderColor: '#2a2a2e' }}>

            {/* ── LEFT: Form fields ── */}
            <div className="p-6 space-y-4">

              {/* Nombre */}
              <Field label="Nombre *">
                <input
                  name="nombre" value={form.nombre} onChange={handleField}
                  className="input-dark" placeholder="Ej: Gyozas de Langostinos" required
                />
              </Field>

              {/* Descripción */}
              <Field label="Descripción">
                <textarea
                  name="descripcion" value={form.descripcion} onChange={handleField}
                  className="input-dark resize-none" rows={3}
                  placeholder="Ingredientes, preparación…"
                />
              </Field>

              {/* Categoría */}
              <Field label="Categoría *">
                <input
                  name="categoria" value={form.categoria} onChange={handleField}
                  className="input-dark" placeholder="Ej: Rollos de Sushi"
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
                  className="input-dark" placeholder="Ej: Empanadillas japonesas · 4 unidades"
                />
              </Field>

              {/* Precio */}
              <Field label="Precio">
                <input
                  name="precio" value={form.precio} onChange={handleField}
                  className="input-dark" placeholder='Ej: $12.500  o  5p: $12.500 / 9p: $23.200'
                />
              </Field>

              {/* Etiqueta + Orden en row */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Etiqueta">
                  <select name="etiqueta" value={form.etiqueta} onChange={handleField} className="input-dark">
                    {ETIQUETAS.map(e => (
                      <option key={e} value={e} style={{ background: '#111113' }}>
                        {e || 'Sin etiqueta'}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Orden">
                  <input
                    type="number" name="orden" value={form.orden} onChange={handleField}
                    className="input-dark" min={0}
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
                    className="w-9 h-5 rounded-full transition-colors peer-checked:bg-[#7c3aed]"
                    style={{ background: form.activo ? '#7c3aed' : '#2a2a2e' }}
                  />
                  <div
                    className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                    style={{ transform: form.activo ? 'translateX(16px)' : 'translateX(0)' }}
                  />
                </div>
                <span className="text-sm" style={{ color: form.activo ? '#a1a1aa' : '#52525b' }}>
                  {form.activo ? 'Visible en el menú' : 'Oculto del menú'}
                </span>
              </label>
            </div>

            {/* ── RIGHT: Image upload ── */}
            <div className="p-6 flex flex-col gap-4">
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: '#52525b' }}>
                Imagen del producto
              </p>

              {/* Drop zone / preview */}
              {imagePreview ? (
                <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid #2a2a2e' }}>
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
                    style={{ background: 'rgba(0,0,0,0.7)', color: '#a1a1aa', border: '1px solid #2a2a2e' }}
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
                    border: `2px dashed ${dragOver ? '#7c3aed' : '#2a2a2e'}`,
                    background: dragOver ? 'rgba(124,58,237,0.05)' : '#111113',
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(124,58,237,0.1)' }}
                  >
                    <ImageIcon size={22} style={{ color: '#7c3aed' }} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-white/70">Arrastrá o hacé clic</p>
                    <p className="text-xs mt-1" style={{ color: '#3f3f46' }}>JPG, PNG, WEBP · Máx 5MB</p>
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
                  className="input-dark text-xs" placeholder="https://..."
                />
              </Field>
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between gap-3 px-6 py-4"
            style={{ borderTop: '1px solid #2a2a2e' }}
          >
            {errorMsg ? (
              <p className="text-xs" style={{ color: '#f87171' }}>{errorMsg}</p>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              <button
                type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
                style={{ color: '#71717a', border: '1px solid #2a2a2e' }}
              >
                Cancelar
              </button>
              <button
                type="submit" disabled={saving}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50 flex items-center gap-2"
                style={{ background: saving ? '#5b21b6' : 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 16px rgba(124,58,237,0.25)' }}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Guardando…' : item ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <style>{`
        .input-dark {
          width: 100%;
          background: #111113;
          border: 1px solid #2a2a2e;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          color: #e4e4e7;
          outline: none;
          transition: border-color 0.15s;
        }
        .input-dark:focus { border-color: rgba(124,58,237,0.5); }
        .input-dark::placeholder { color: #3f3f46; }
      `}</style>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium" style={{ color: '#a1a1aa' }}>{label}</label>
      {children}
    </div>
  )
}
