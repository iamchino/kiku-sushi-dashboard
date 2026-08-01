import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { PermisosContext } from './permisos'
import { canAccessFinanzas, DEFAULT_ROLE } from './role'
import { construirPermisos } from './permisosCore'
import { permisosFallback } from './permisosFallback'

/**
 * Carga la matriz de permisos del rol del usuario desde la base y la deja
 * disponible para el guard de rutas y el menú.
 *
 * Si la consulta falla, cae a las reglas hardcodeadas de role.js (ver
 * permisosFallback) en vez de dejar a la persona sin nada: el local tiene que
 * poder seguir laburando aunque la matriz no cargue.
 */
export function PermisosProvider({ rol, user, children }) {
  const [estado, setEstado] = useState({ permisos: null, cargando: true, error: null })

  // Nos quedamos con la identidad del usuario, no con el objeto: supabase-js
  // entrega una Session NUEVA en cada refresh de token (~1 h), al volver de
  // background y al resumir la app de Capacitor. Si dependiéramos del objeto,
  // esas recargas cambiarían la identidad de `cargar`, volveríamos a
  // `cargando: true` y AppRoutes desmontaría todo el router: en pleno turno la
  // pantalla parpadea a spinner y se pierde la mesa abierta o el formulario a
  // medio llenar.
  const userId = user?.id ?? null
  const userEmail = user?.email ?? null

  // Descarta respuestas viejas: si se solapan dos cargas (p. ej. getSession y
  // el INITIAL_SESSION de onAuthStateChange), la que llega tarde no pisa a la
  // que corresponde al rol actual.
  const generacion = useRef(0)

  const cargar = useCallback(async () => {
    const miGeneracion = ++generacion.current
    const usuario = { id: userId, email: userEmail }

    if (!rol) {
      // Inalcanzable hoy (getRoleFromUser siempre devuelve algo), pero sin esto
      // quedaría `cargando: true` para siempre y el spinner colgado.
      setEstado({ permisos: permisosFallback(DEFAULT_ROLE, usuario), cargando: false, error: null })
      return
    }
    // Solo mostramos el spinner en la primera carga. En las recargas se sigue
    // usando la matriz vigente hasta que llega la nueva.
    setEstado(e => (e.permisos ? e : { ...e, cargando: true }))
    try {
      const [{ data: recursos, error: e1 }, { data: filas, error: e2 }] = await Promise.all([
        supabase.from('recursos').select('id, nombre, descripcion, ruta, grupo, sensible, orden'),
        supabase.from('rol_permisos').select('recurso_id, ver, editar').eq('rol_id', rol),
      ])
      if (e1) throw e1
      if (e2) throw e2
      // Base sin sembrar (la migración de la fase 1 todavía no corrió): mejor
      // el fallback que un menú vacío.
      if (!recursos?.length) throw new Error('El catálogo de recursos está vacío.')

      // OJO: `filas` vacío NO es un error y no dispara el fallback. Puede ser
      // un rol nuevo al que todavía no le configuraron nada, y en ese caso lo
      // correcto es no darle nada — no devolverle los permisos del código.
      // App.jsx muestra una pantalla explicando la situación.
      if (miGeneracion !== generacion.current) return
      setEstado({
        permisos: construirPermisos({
          recursos,
          filas: filas ?? [],
          rol,
          accesoFinanzasPorEmail: canAccessFinanzas(usuario),
        }),
        cargando: false,
        error: null,
      })
    } catch (err) {
      console.error('[permisos] no se pudo leer la matriz, uso las reglas del código:', err)
      if (miGeneracion !== generacion.current) return
      setEstado({
        permisos: permisosFallback(rol, usuario),
        cargando: false,
        error: err.message ?? String(err),
      })
    }
  }, [rol, userId, userEmail])

  useEffect(() => { cargar() }, [cargar])

  const valor = useMemo(() => ({ ...estado, recargar: cargar }), [estado, cargar])

  return <PermisosContext.Provider value={valor}>{children}</PermisosContext.Provider>
}
