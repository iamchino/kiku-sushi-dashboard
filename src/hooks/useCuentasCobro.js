import { useEffect, useState } from 'react'
import { cargarCuentasParaCobro } from '../lib/cuentasCorrientesApi'

/**
 * Cuentas corrientes disponibles para cobrar (activas, con su saldo).
 * Se cargan cada vez que se abre el modal de cobro. Si no hay ninguna —o la
 * migración todavía no corrió— devuelve [] y el medio no se ofrece.
 */
export function useCuentasCobro(activo) {
  const [cuentas, setCuentas] = useState([])

  useEffect(() => {
    if (!activo) return undefined
    let vivo = true
    cargarCuentasParaCobro()
      .then(rows => { if (vivo) setCuentas(rows) })
      .catch(() => { if (vivo) setCuentas([]) })
    return () => { vivo = false }
  }, [activo])

  return cuentas
}
