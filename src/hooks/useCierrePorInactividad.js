import { useEffect } from 'react'
import { auth } from '../lib/supabase'

// Cierra la sesión si el dispositivo estuvo inactivo demasiado tiempo.
//
// Supabase mantiene la sesión mientras se refresque el token, así que una
// pestaña abierta no se desloguea nunca. Acá se guarda la última actividad
// (toque, tecla, scroll) y, al volver a la pestaña o cada minuto, se compara:
//   · roles con 2FA (admin, finanzas): 12 horas sin usar → afuera;
//   · el resto (cocina, mozo, empleado): 7 días → afuera.
// El celular de cocina que se usa todos los días nunca llega al límite.

const CLAVE = 'kiku-ultima-actividad'
const HORA = 60 * 60 * 1000
export const LIMITES = {
  sensible: 12 * HORA,
  operativo: 7 * 24 * HORA,
}

function leer() {
  try { return Number(localStorage.getItem(CLAVE)) || 0 } catch { return 0 }
}
function marcar() {
  try { localStorage.setItem(CLAVE, String(Date.now())) } catch { /* sin storage */ }
}
export function limpiarActividad() {
  try { localStorage.removeItem(CLAVE) } catch { /* sin storage */ }
}

export function useCierrePorInactividad({ activo, sensible }) {
  useEffect(() => {
    if (!activo) return
    const limite = sensible ? LIMITES.sensible : LIMITES.operativo

    // Primera vez: arranca el reloj ahora, no cierra a alguien recién llegado.
    if (!leer()) marcar()

    const revisar = () => {
      const ultima = leer()
      if (ultima && Date.now() - ultima > limite) {
        limpiarActividad()
        auth.logout()
      }
    }

    // Actividad: como máximo una escritura cada 30 s.
    let ultimaMarca = 0
    const actividad = () => {
      const t = Date.now()
      if (t - ultimaMarca > 30_000) { ultimaMarca = t; marcar() }
    }
    const eventos = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    eventos.forEach(e => window.addEventListener(e, actividad, { passive: true }))
    const alVolver = () => { if (document.visibilityState === 'visible') revisar() }
    document.addEventListener('visibilitychange', alVolver)
    const timer = setInterval(revisar, 60_000)
    revisar()

    return () => {
      eventos.forEach(e => window.removeEventListener(e, actividad))
      document.removeEventListener('visibilitychange', alVolver)
      clearInterval(timer)
    }
  }, [activo, sensible])
}
