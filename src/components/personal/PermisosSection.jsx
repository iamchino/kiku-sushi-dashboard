import { useState, useMemo, useEffect } from 'react'
import { Plus, Trash2, ShieldCheck, AlertTriangle, Lock, Users, Check } from 'lucide-react'
import { usePermisosAdmin } from '../../hooks/usePermisosAdmin'
import { usePermisos } from '../../context/usePermisos'
import { useRole } from '../../context/useRole'
import { ModalShell, Field } from '../finanzas/fields'
import ConfirmDelete from '../finanzas/ConfirmDelete'

// Qué puede ver cada rol. Una fila por sección, una columna por rol.
//
// El guardado va por rol y en una sola llamada (RPC guardar_permisos_rol): la
// guarda anti-lockout de la base es diferida y necesita ver el estado final,
// no un checkbox a la vez.
export default function PermisosSection() {
  const { roles, recursos, matriz, conteos, loading, error,
          guardarRol, crearRol, eliminarRol, aplicarYa } = usePermisosAdmin()

  const { recargar: recargarMisPermisos } = usePermisos()
  const miRol = useRole()

  const [rolSel, setRolSel]   = useState(null)
  // El borrador guarda a qué rol pertenece: así una recarga de la matriz
  // (crear/eliminar rol) no pisa lo que la persona venía tildando.
  const [borrador, setBorrador] = useState(null)   // { rol, set }
  const [nuevo, setNuevo]     = useState(false)
  const [delRol, setDelRol]   = useState(null)
  const [confirmando, setConfirmando] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso]     = useState(null)
  const [errGuardar, setErrGuardar] = useState(null)

  useEffect(() => {
    if (!rolSel && roles.length) setRolSel(roles[0].id)
  }, [roles, rolSel])

  // Solo inicializa el borrador cuando todavía no hay uno para este rol.
  // Antes esto corría en CADA recarga de `matriz` y descartaba en silencio los
  // cambios sin guardar (p. ej. al crear un rol nuevo en el medio).
  useEffect(() => {
    if (!rolSel || !matriz[rolSel]) return
    setBorrador(prev => (prev?.rol === rolSel ? prev : { rol: rolSel, set: new Set(matriz[rolSel]) }))
  }, [rolSel, matriz])

  const grupos = useMemo(() => {
    const g = new Map()
    for (const r of recursos) {
      if (!g.has(r.grupo)) g.set(r.grupo, [])
      g.get(r.grupo).push(r)
    }
    return [...g.entries()]
  }, [recursos])

  const rol = roles.find(r => r.id === rolSel)
  const original = matriz[rolSel] ?? new Set()
  const seleccion = borrador?.rol === rolSel ? borrador.set : original
  const sucio = borrador?.rol === rolSel && (
    seleccion.size !== original.size || [...seleccion].some(id => !original.has(id))
  )

  const quitados = [...original].filter(id => !seleccion.has(id))
  const agregados = [...seleccion].filter(id => !original.has(id))
  const nombreRecurso = id => recursos.find(r => r.id === id)?.nombre ?? id
  const afectados = conteos[rolSel] ?? 0
  // Sacarse a uno mismo la administración de permisos: la base lo permite
  // mientras otro rol lo conserve, pero deja a esta persona afuera.
  const autoLockout = rolSel === miRol && original.has('permisos') && !seleccion.has('permisos')

  const alternar = (id) => {
    setBorrador(prev => {
      const base = prev?.rol === rolSel ? prev.set : original
      const s = new Set(base)
      if (s.has(id)) s.delete(id); else s.add(id)
      return { rol: rolSel, set: s }
    })
  }

  const cambiarRolSel = (id) => {
    if (id === rolSel) return
    if (sucio && !window.confirm('Tenés cambios sin guardar en este rol. ¿Los descartás?')) return
    setBorrador(null); setAviso(null); setErrGuardar(null)
    setRolSel(id)
  }

  const guardar = async () => {
    setConfirmando(null)
    setGuardando(true); setErrGuardar(null); setAviso(null)
    try {
      await guardarRol(rolSel, [...seleccion])
    } catch (err) {
      setErrGuardar(err.message)
      setGuardando(false)
      return
    }

    // A partir de acá los permisos YA se guardaron. Lo que siga es secundario y
    // no se puede reportar como si el guardado hubiera fallado.
    let extra
    try {
      const r = await aplicarYa(rolSel)
      extra = r?.cerradas
        ? ` Se cerraron ${r.cerradas} sesión(es): esas personas tienen que volver a entrar.`
        : ' Nadie de ese rol tenía sesión abierta.'
    } catch (err) {
      extra = ` Ojo: no se pudieron cerrar sus sesiones (${err.message}), así que a quien ya esté logueado el cambio le aplica cuando renueve su token.`
    }

    // Si me cambié los permisos a mí mismo, el menú y el guard de rutas siguen
    // con la matriz vieja hasta que se relean.
    if (rolSel === miRol) { try { await recargarMisPermisos() } catch { /* no bloquea */ } }

    setBorrador(null)
    setAviso(`Permisos de ${rol?.nombre} guardados.${extra}`)
    setGuardando(false)
  }

  if (loading) return <div className="space-y-2.5">{[1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>

  if (error) return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
      <AlertTriangle size={14} /> {error}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <p className="text-sm max-w-xl" style={{ color: 'var(--text-muted)' }}>
          Elegí un rol y tildá qué secciones puede ver. Al guardar se les cierra la sesión
          a quienes tengan ese rol, para que el cambio aplique en el momento.
        </p>
        <button onClick={() => setNuevo(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          <Plus size={14} /> Nuevo rol
        </button>
      </div>

      {/* Selector de rol */}
      <div className="flex flex-wrap gap-2">
        {roles.map(r => {
          const activo = r.id === rolSel
          return (
            <button key={r.id} onClick={() => cambiarRolSel(r.id)} disabled={guardando}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
              style={activo
                ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                : { color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              {r.sistema && <Lock size={11} />}
              {r.nombre}
              <span className="inline-flex items-center gap-1 text-[10px] font-normal opacity-70">
                <Users size={10} /> {conteos[r.id] ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      {rol && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl px-4 py-3"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{rol.nombre}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-xmuted)' }}>
                {rol.descripcion || 'Sin descripción'}
                {rol.sistema && ' · rol del sistema, no se puede eliminar'}
              </p>
            </div>
            {!rol.sistema && (
              <button onClick={() => setDelRol(rol)} title="Eliminar rol"
                className="p-1.5 rounded-lg transition-colors flex-shrink-0" style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; e.currentTarget.style.color = '#f87171' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
                <Trash2 size={13} />
              </button>
            )}
          </div>

          {/* Grilla de secciones */}
          <div className="space-y-4">
            {grupos.map(([grupo, items]) => (
              <div key={grupo}>
                <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text-xmuted)' }}>
                  {grupo}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {items.map(r => {
                    const marcado = seleccion.has(r.id)
                    return (
                      <button key={r.id} onClick={() => alternar(r.id)}
                        className="flex items-start gap-2.5 text-left rounded-xl px-3 py-2.5 transition-colors"
                        style={{
                          background: marcado ? 'var(--accent-soft)' : 'var(--bg-card)',
                          border: `1px solid ${marcado ? 'var(--accent-border)' : 'var(--border-card)'}`,
                        }}>
                        <span className="mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                          style={{
                            background: marcado ? 'var(--accent)' : 'transparent',
                            border: `1px solid ${marcado ? 'var(--accent)' : 'var(--border)'}`,
                          }}>
                          {marcado && <Check size={11} color="#fff" />}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm font-medium"
                            style={{ color: 'var(--text-primary)' }}>
                            {r.nombre}
                            {r.sensible && <ShieldCheck size={11} style={{ color: '#f59e0b' }} />}
                          </span>
                          <span className="block text-[11px] mt-0.5" style={{ color: 'var(--text-xmuted)' }}>
                            {r.descripcion}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {errGuardar && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {errGuardar}
            </div>
          )}
          {aviso && (
            <div className="px-4 py-3 rounded-xl text-sm"
              style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent-lift)' }}>
              {aviso}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap sticky bottom-0 py-3"
            style={{ background: 'var(--bg-app)' }}>
            <button onClick={() => setConfirmando(true)} disabled={!sucio || guardando}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
            {sucio && (
              <button onClick={() => setBorrador(null)}
                className="px-3 py-2 rounded-lg text-xs font-semibold"
                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                Descartar
              </button>
            )}
            <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
              {seleccion.size} sección(es) habilitada(s)
              {sucio ? ' · hay cambios sin guardar' : ''}
            </span>
          </div>
        </>
      )}

      {confirmando && (
        <ConfirmarCambios
          rol={rol} afectados={afectados} autoLockout={autoLockout}
          quitados={quitados.map(nombreRecurso)} agregados={agregados.map(nombreRecurso)}
          quedaVacio={seleccion.size === 0}
          onClose={() => setConfirmando(null)} onConfirm={guardar}
        />
      )}

      {nuevo && <RolModal onClose={() => setNuevo(false)} onSave={crearRol} />}

      {delRol && (
        <ConfirmDelete titulo="Eliminar rol"
          mensaje={`¿Eliminás el rol ${delRol.nombre}? Si alguien lo tiene asignado, la base no te va a dejar hasta que le cambies el rol.`}
          onClose={() => setDelRol(null)}
          onConfirm={async () => { await eliminarRol(delRol.id); setRolSel(null) }} />
      )}
    </div>
  )
}

// Confirmación antes de guardar. Los permisos son fáciles de tocar de más, y
// el efecto lo sufre gente que no está mirando la pantalla: conviene decir en
// castellano qué se saca, a cuántas personas afecta, y frenar los dos casos
// que dejan a alguien colgado.
function ConfirmarCambios({ rol, afectados, autoLockout, quitados, agregados, quedaVacio, onClose, onConfirm }) {
  const [ok, setOk] = useState(!autoLockout)

  return (
    <ModalShell title="Confirmar cambios de permisos" icon={ShieldCheck} onClose={onClose} maxW="max-w-md">
      <div className="p-5 space-y-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Rol <b>{rol?.nombre}</b> · {afectados === 0
            ? 'nadie lo tiene asignado todavía'
            : `${afectados} persona(s) lo tienen asignado`}.
        </p>

        {quitados.length > 0 && (
          <div className="rounded-xl px-3 py-2.5 text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <p className="font-semibold text-xs mb-1" style={{ color: '#f87171' }}>Pierden acceso a</p>
            <p style={{ color: 'var(--text-secondary)' }}>{quitados.join(' · ')}</p>
          </div>
        )}

        {agregados.length > 0 && (
          <div className="rounded-xl px-3 py-2.5 text-sm"
            style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}>
            <p className="font-semibold text-xs mb-1" style={{ color: 'var(--accent-lift)' }}>Ganan acceso a</p>
            <p style={{ color: 'var(--text-secondary)' }}>{agregados.join(' · ')}</p>
          </div>
        )}

        {quedaVacio && (
          <p className="text-xs flex items-start gap-2" style={{ color: '#f59e0b' }}>
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
            El rol queda sin ninguna sección. Quien lo tenga va a entrar a una pantalla
            que le dice que no tiene permisos, y nada más.
          </p>
        )}

        {autoLockout && (
          <label className="flex items-start gap-2 text-xs cursor-pointer rounded-xl px-3 py-2.5"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
            <input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} className="mt-0.5" />
            <span>
              Te estás sacando a vos la administración de permisos. Después de guardar no
              vas a poder volver a esta pantalla. Entiendo lo que estoy haciendo.
            </span>
          </label>
        )}

        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          Al guardar se cierran las sesiones abiertas de ese rol para que el cambio
          aplique en el momento.
        </p>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={!ok}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
            Guardar
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function RolModal({ onClose, onSave }) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState(null)

  // El id sale del nombre: es lo que se guarda en el JWT y no se puede cambiar
  // después, así que mejor no pedírselo a mano.
  const id = nombre
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // saca acentos
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 31)
    .replace(/^_+|_+$/g, '')

  const idValido = /^[a-z][a-z0-9_]{1,30}$/.test(id)

  const handle = async () => {
    setBusy(true); setError(null)
    try { await onSave({ id, nombre, descripcion }); onClose() }
    catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <ModalShell title="Nuevo rol" icon={ShieldCheck} onClose={onClose} maxW="max-w-sm">
      <div className="p-5 space-y-4">
        <Field label="Nombre" value={nombre} onChange={setNombre} placeholder="Encargado de turno" required />
        <Field label="Descripción (opcional)" value={descripcion} onChange={setDescripcion}
          placeholder="Qué hace este rol" />
        <p className="text-[11px]" style={{ color: nombre && !idValido ? '#f59e0b' : 'var(--text-xmuted)' }}>
          {!nombre
            ? 'El nombre define el identificador interno del rol.'
            : idValido
              ? <>Se va a guardar como <b>{id}</b>. No se puede cambiar después.</>
              : 'El nombre tiene que empezar con una letra y tener al menos dos caracteres (ej: "Encargado de turno", no "2do turno").'}
        </p>
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          Nace sin ninguna sección habilitada. Tildá las que necesite y guardá, y recién
          después asignáselo a alguien desde la pestaña Usuarios.
        </p>
        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
        <button onClick={handle} disabled={busy || !nombre || !idValido}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          {busy ? 'Creando…' : 'Crear rol'}
        </button>
      </div>
    </ModalShell>
  )
}
