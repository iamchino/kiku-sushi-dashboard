import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// White-label: la marca del dashboard sale de la base (web_config), no del
// código. Nombre, subtítulo y color de acento. Con esto el mismo sistema se
// instala para otro gastronómico cambiando tres campos.
const DEFAULTS = {
  nombre: 'KIKU SUSHI',
  subtitulo: 'Sistema de gestión',
  color: '#2a1d3d',
}

const hexRgb = (hex) => {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
const mezclar = (rgb, destino, f) => rgb.map(c => Math.round(c + (destino - c) * f))
const aHex = (rgb) => '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('')

// Deriva los tonos del acento a partir del color base y los aplica como
// variables CSS. Mismos nombres que define index.css: el tema entero sigue
// al color del negocio.
function aplicarAcento(hex) {
  try {
    const rgb = hexRgb(hex)
    const root = document.documentElement.style
    root.setProperty('--accent', hex)
    root.setProperty('--accent-rgb', rgb.join(','))
    root.setProperty('--accent-deep', aHex(mezclar(rgb, 0, 0.45)))
    const lift = mezclar(rgb, 255, 0.55)
    root.setProperty('--accent-lift', aHex(lift))
    root.setProperty('--accent-lift-rgb', lift.join(','))
  } catch { /* un hex inválido no rompe el tema por defecto */ }
}

export function useNegocio() {
  const [negocio, setNegocio] = useState(DEFAULTS)

  useEffect(() => {
    let alive = true
    supabase
      .from('web_config')
      .select('negocio_nombre, negocio_subtitulo, negocio_color')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive || error || !data) return
        const n = {
          nombre: data.negocio_nombre || DEFAULTS.nombre,
          subtitulo: data.negocio_subtitulo || DEFAULTS.subtitulo,
          color: data.negocio_color || DEFAULTS.color,
        }
        setNegocio(n)
        if (n.color !== DEFAULTS.color) aplicarAcento(n.color)
      })
    return () => { alive = false }
  }, [])

  // "KIKU SUSHI" → principal "KIKU", acento "SUSHI" (la última palabra va
  // coloreada, como la marca original). Con una sola palabra no hay acento.
  const partes = negocio.nombre.trim().split(/\s+/)
  const nombreAcento = partes.length > 1 ? partes.pop() : ''
  return { ...negocio, nombrePrincipal: partes.join(' '), nombreAcento }
}
