import { useContext, useMemo } from 'react'
import { PermisosContext } from './permisos'
import { puedeVer, puedeEditar, rutaPermitida, rutaPorDefecto, soloFichaje } from './permisosCore'

/**
 * Acceso a los permisos del usuario actual.
 *
 *   const { puede, puedeEditar, cargando } = usePermisos()
 *   if (puede('caja')) { … }
 */
export function usePermisos() {
  const ctx = useContext(PermisosContext)

  return useMemo(() => {
    const p = ctx?.permisos ?? null
    return {
      cargando: ctx?.cargando ?? true,
      // Con error != null estamos con las reglas del código, no con la matriz.
      error: ctx?.error ?? null,
      enFallback: p?.origen === 'fallback',
      recursos: p?.recursos ?? [],
      visibles: p?.visibles ?? [],
      puede: id => puedeVer(p, id),
      puedeEditar: id => puedeEditar(p, id),
      rutaPermitida: ruta => rutaPermitida(p, ruta),
      rutaPorDefecto: () => rutaPorDefecto(p),
      soloFichaje: () => soloFichaje(p),
      recargar: ctx?.recargar ?? (() => {}),
    }
  }, [ctx])
}
