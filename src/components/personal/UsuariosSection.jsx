import { useState, useMemo } from 'react'
import { Plus, Trash2, KeyRound, UserCog, AlertTriangle, Loader2 } from 'lucide-react'
import { useUsuarios } from '../../hooks/useUsuarios'
import { supabase } from '../../lib/supabase'
import { ModalShell, Field, Select } from '../finanzas/fields'
import ConfirmDelete from '../finanzas/ConfirmDelete'

const ROLES = [
  { value: 'empleado', label: 'Empleado (solo fichaje)' },
  { value: 'mozo',     label: 'Mozo' },
  { value: 'cocina',   label: 'Cocina' },
  { value: 'finanzas', label: 'Finanzas (Finanzas + Personal + fichaje)' },
  { value: 'admin',    label: 'Admin (dashboard completo)' },
]

const ROLE_CHIP = {
  empleado: { bg: 'var(--accent-soft)',    color: 'var(--accent-lift)' },
  mozo:     { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
  cocina:   { bg: 'rgba(245,158,11,0.14)', color: '#f59e0b' },
  finanzas: { bg: 'rgba(16,185,129,0.14)', color: '#10b981' },
  admin:    { bg: 'rgba(168,85,247,0.14)', color: '#a855f7' },
}

const nombreDe = (e) => `${e.nombre} ${e.apellido || ''}`.trim()

// Gestión de logins (vía Edge Function admin-usuarios): crear/eliminar usuarios,
// resetear contraseña, mover el rol y vincularlos a un empleado del legajo.
//
// El rol y el vínculo se editan DESDE LA FILA, sin modal. Antes cada cambio
// eran dos clics y una ventana, y el rol propio ni siquiera se podía tocar.
export default function UsuariosSection({ empleados }) {
  const {
    usuarios, loading, error,
    crearUsuario, eliminarUsuario, cambiarPassword, cambiarRol, vincularEmpleado,
  } = useUsuarios()

  const [nuevo, setNuevo]       = useState(false)
  const [delUser, setDelUser]   = useState(null)
  const [passUser, setPassUser] = useState(null)
  const [busy, setBusy]         = useState(null)     // id de la fila trabajando
  const [aviso, setAviso]       = useState(null)     // { tipo, texto }
  // Confirmaciones inline: robar un empleado a otro login, o cambiarse el rol
  // uno mismo (que cierra la sesión). Nada de window.confirm.
  const [confirmar, setConfirmar] = useState(null)

  // Empleados activos sin login vinculado (candidatos para el alta).
  const sinLogin = useMemo(() => {
    const vinculados = new Set(usuarios.map(u => u.empleado?.empleado_id).filter(Boolean))
    return empleados.filter(e => e.activo && !vinculados.has(e.id) && !e.user_id)
  }, [empleados, usuarios])

  // empleado_id -> email del login que ya lo tiene. Es lo que permite avisar
  // "ese empleado ya es de otro" en vez de robarlo en silencio.
  const dueñoDe = useMemo(() => {
    const m = new Map()
    usuarios.forEach(u => { if (u.empleado?.empleado_id) m.set(u.empleado.empleado_id, u.email) })
    return m
  }, [usuarios])

  const activos = useMemo(() => empleados.filter(e => e.activo), [empleados])

  const correr = async (userId, accion, textoOk) => {
    setBusy(userId); setAviso(null)
    try {
      await accion()
      setAviso({ tipo: 'ok', texto: textoOk })
    } catch (err) {
      setAviso({ tipo: 'error', texto: err.message })
    } finally {
      setBusy(null)
    }
  }

  // Cambiarse el rol a uno mismo cierra la sesión (el rol viaja en el JWT).
  const cambiarRolPropio = async (u, role) => {
    setBusy(u.id); setAviso(null)
    try {
      await cambiarRol(u.id, role)
      await supabase.auth.signOut()
      window.location.reload()
    } catch (err) {
      setAviso({ tipo: 'error', texto: err.message })
      setBusy(null)
    }
  }

  const pedirCambioRol = (u, role) => {
    if (role === u.role) return
    if (u.es_yo) {
      setConfirmar({
        tipo: 'rol-propio', userId: u.id, role,
        texto: `Vas a cambiar TU propio rol a "${role}". Se te cierra la sesión y tenés que volver a entrar. Si perdés acceso a esta pantalla, otro admin te lo tiene que devolver.`,
        onOk: () => cambiarRolPropio(u, role),
      })
      return
    }
    correr(u.id, () => cambiarRol(u.id, role), `Rol de ${u.email} cambiado a ${role}. Se le cerraron las sesiones.`)
  }

  const pedirVinculo = (u, empleadoId) => {
    const actual = u.empleado?.empleado_id || ''
    if (empleadoId === actual) return

    if (!empleadoId) {
      correr(u.id, () => vincularEmpleado(actual, null), `${u.email} quedó sin empleado vinculado.`)
      return
    }

    const dueño = dueñoDe.get(empleadoId)
    if (dueño && dueño !== u.email) {
      const emp = activos.find(e => e.id === empleadoId)
      setConfirmar({
        tipo: 'robar', userId: u.id,
        texto: `${emp ? nombreDe(emp) : 'Ese empleado'} ya está vinculado a ${dueño}. Si seguís, ese login se queda sin empleado y deja de poder fichar.`,
        onOk: () => correr(u.id, () => vincularEmpleado(empleadoId, u.id), 'Vínculo movido.'),
      })
      return
    }
    correr(u.id, () => vincularEmpleado(empleadoId, u.id), 'Vínculo guardado.')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Los usuarios con rol <b>empleado</b> solo ven Fichar y Mis horas; los de rol <b>finanzas</b> ven Finanzas,
          Personal y su propio fichaje. Cambiá el rol y el empleado vinculado desde la fila misma.
        </p>
        <button onClick={() => setNuevo(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          <Plus size={14} /> Nuevo usuario
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {aviso && (
        <div className="px-4 py-2.5 rounded-xl text-sm" style={{
          background: aviso.tipo === 'ok' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${aviso.tipo === 'ok' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`,
          color: aviso.tipo === 'ok' ? '#10b981' : '#f87171',
        }}>
          {aviso.texto}
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">{[1, 2, 3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : (
        <div className="space-y-2">
          {usuarios.map(u => {
            const chip = ROLE_CHIP[u.role] || ROLE_CHIP.admin
            const trabajando = busy === u.id
            const vinculoActual = u.empleado?.empleado_id || ''
            const pidiendo = confirmar?.userId === u.id

            return (
              <div key={u.id} className="rounded-xl px-4 py-3"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {u.email}
                      {u.es_yo && <span className="ml-2 text-[10px]" style={{ color: 'var(--text-xmuted)' }}>(vos)</span>}
                    </p>

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {/* Rol, editable en la fila */}
                      <select
                        value={u.role}
                        disabled={trabajando}
                        onChange={e => pedirCambioRol(u, e.target.value)}
                        title="Cambiar rol"
                        className="text-[10px] font-semibold px-2 py-1 rounded-full capitalize cursor-pointer disabled:opacity-50"
                        style={{ background: chip.bg, color: chip.color, border: 'none', appearance: 'none', paddingRight: '1.5rem' }}
                      >
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.value}</option>)}
                      </select>

                      {/* Empleado vinculado, editable en la fila */}
                      <select
                        value={vinculoActual}
                        disabled={trabajando}
                        onChange={e => pedirVinculo(u, e.target.value)}
                        title="Vincular a un empleado del legajo"
                        className="text-[11px] px-2 py-1 rounded-lg cursor-pointer disabled:opacity-50 max-w-[16rem]"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                      >
                        <option value="">— Sin empleado vinculado —</option>
                        {activos.map(e => {
                          const dueño = dueñoDe.get(e.id)
                          const ajeno = dueño && dueño !== u.email
                          return (
                            <option key={e.id} value={e.id}>
                              {nombreDe(e)}{ajeno ? ` · ya usa ${dueño}` : ''}
                            </option>
                          )
                        })}
                      </select>

                      {trabajando && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setPassUser(u)} title="Cambiar contraseña"
                      className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <KeyRound size={13} />
                    </button>
                    {!u.es_yo && (
                      <button onClick={() => setDelUser(u)} title="Eliminar usuario"
                        className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; e.currentTarget.style.color = '#f87171' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {pidiendo && (
                  <div className="mt-3 rounded-lg px-3 py-2.5 text-xs"
                    style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                    <p style={{ color: '#fbbf24' }}>{confirmar.texto}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => { const fn = confirmar.onOk; setConfirmar(null); fn() }}
                        className="px-3 py-1 rounded-lg text-[11px] font-semibold text-white"
                        style={{ background: '#f59e0b' }}>
                        Sí, seguir
                      </button>
                      <button onClick={() => setConfirmar(null)}
                        className="px-3 py-1 rounded-lg text-[11px] font-semibold"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {nuevo && (
        <UsuarioModal
          empleadosSinLogin={sinLogin}
          onClose={() => setNuevo(false)}
          onSave={crearUsuario}
        />
      )}

      {passUser && (
        <PasswordModal
          usuario={passUser}
          onClose={() => setPassUser(null)}
          onSave={(pass) => cambiarPassword(passUser.id, pass)}
        />
      )}

      {delUser && (
        <ConfirmDelete titulo="Eliminar usuario"
          mensaje={`¿Eliminás el login ${delUser.email}? Deja de poder entrar y fichar. Sus fichajes históricos se conservan.`}
          onClose={() => setDelUser(null)}
          onConfirm={async () => {
            try { await eliminarUsuario(delUser.id) }
            catch (err) { setAviso({ tipo: 'error', texto: err.message }); throw err }
          }} />
      )}
    </div>
  )
}

function UsuarioModal({ empleadosSinLogin, onClose, onSave }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole]         = useState('empleado')
  const [empleadoId, setEmpleadoId] = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState(null)

  const handle = async () => {
    setBusy(true); setError(null)
    try {
      await onSave({ email, password, role, empleado_id: empleadoId || null })
      onClose()
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  return (
    <ModalShell title="Nuevo usuario" icon={UserCog} onClose={onClose} maxW="max-w-sm">
      <div className="p-5 space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="empleado@kikusushi.com.ar" required />
        <Field label="Contraseña" type="text" value={password} onChange={setPassword} placeholder="Mínimo 8 caracteres" required />
        <Select label="Rol" value={role} onChange={setRole} options={ROLES} required />
        <Select label="Vincular a empleado (opcional)" value={empleadoId} onChange={setEmpleadoId}
          options={[
            { value: '', label: '— Sin vincular por ahora —' },
            ...empleadosSinLogin.map(e => ({ value: e.id, label: nombreDe(e) })),
          ]} />
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          Pasale el email y la contraseña al empleado; puede cambiarla después. Sin vínculo no puede fichar.
        </p>
        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
        <button onClick={handle} disabled={busy || !email || password.length < 8}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          {busy ? 'Creando…' : 'Crear usuario'}
        </button>
      </div>
    </ModalShell>
  )
}

function PasswordModal({ usuario, onClose, onSave }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState(null)

  const handle = async () => {
    setBusy(true); setError(null)
    try { await onSave(password); onClose() }
    catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <ModalShell title={`Nueva contraseña · ${usuario.email}`} icon={KeyRound} onClose={onClose} maxW="max-w-sm">
      <div className="p-5 space-y-4">
        <Field label="Nueva contraseña" type="text" value={password} onChange={setPassword} placeholder="Mínimo 8 caracteres" required />
        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
        <button onClick={handle} disabled={busy || password.length < 8}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          {busy ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </div>
    </ModalShell>
  )
}
