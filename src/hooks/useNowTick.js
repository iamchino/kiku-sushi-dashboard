import { useEffect, useState } from 'react'

/**
 * Devuelve un timestamp (Date.now()) que se refresca en cada `intervalMs`.
 * Útil para mostrar tiempos transcurridos sin llamar Date.now() en render.
 */
export function useNowTick(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}

/**
 * Calcula minutos transcurridos desde `since`, usando un now reactivo.
 * `since` puede ser string ISO o Date. Devuelve null si no hay valor.
 */
export function useMinutesSince(since, intervalMs = 30_000) {
  const now = useNowTick(intervalMs)
  if (!since) return null
  const t = typeof since === 'string' ? Date.parse(since) : new Date(since).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((now - t) / 60_000))
}
