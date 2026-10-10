/**
 * Preparar una foto para la web pública antes de subirla a Storage.
 *
 * Las placas de Instagram (1080×1350 PNG) pesan 0,7–1,2 MB cada una; seis
 * en un carrusel son ~5 MB que el cliente baja desde el celular. Acá se
 * redimensionan (lado mayor ≤ 1600 px) y se re-codifican a WebP en el
 * navegador, antes de subir: quedan en 100–200 KB sin pérdida visible.
 *
 * Si el navegador no sabe hacer WebP (muy viejo), cae a JPEG; si falla todo,
 * devuelve el archivo original para no bloquear la subida.
 */

const LADO_MAX = 1600
const CALIDAD = 0.86

function cargarImagen(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')) }
    img.src = url
  })
}

function aBlob(canvas, tipo, calidad) {
  return new Promise(resolve => canvas.toBlob(resolve, tipo, calidad))
}

/**
 * @param {File} file
 * @returns {Promise<{ blob: Blob, ext: string, contentType: string }>}
 */
export async function prepararImagenWeb(file) {
  const original = { blob: file, ext: (file.name.split('.').pop() || 'jpg').toLowerCase(), contentType: file.type }
  // Los GIF animados o SVG se suben tal cual.
  if (!/^image\/(png|jpe?g|webp|heic|heif)$/i.test(file.type)) return original
  try {
    const img = await cargarImagen(file)
    const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * escala)
    const h = Math.round(img.naturalHeight * escala)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    // Fondo blanco por si la imagen tiene transparencia y termina en JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)

    let blob = await aBlob(canvas, 'image/webp', CALIDAD)
    let ext = 'webp'
    let contentType = 'image/webp'
    if (!blob || blob.type !== 'image/webp') {
      blob = await aBlob(canvas, 'image/jpeg', CALIDAD)
      ext = 'jpg'
      contentType = 'image/jpeg'
    }
    if (!blob) return original
    // Si por lo que sea quedó más pesada que la original, mejor la original.
    if (blob.size >= file.size && escala === 1) return original
    return { blob, ext, contentType }
  } catch {
    return original
  }
}

/** "1234567" → "1,2 MB" */
export function pesoLegible(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
