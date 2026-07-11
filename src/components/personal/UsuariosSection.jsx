import { useState, useMemo } from 'react'
import { Plus, Trash2, KeyRound, Link2, UserCog, AlertTriangle } from 'lucide-react'
import { useUsuarios } from '../../hooks/useUsuarios'
import { ModalShell, Field, Select } from '../finanzas/fields'
import ConfirmDelete from '../finanzas/ConfirmDelete'

const ROLES = [
  { value: 'empleado', label: 'Empleado (solo fichaje)' },
  { value: 'mozo',     label: 'Mozo' },
  { value: 'cocina',   label: 'Cocina' },
  { value: 'admin',    label: 'Admin (dashboard completo)' },
]

const ROLE_CHIP = {
  empleado: { bg: 'var(--accent-soft)',        color: 'var(--accent-lift)' },
  mozo:     { bg: 'rgba(59,130,246,0.12)',     color: '#3b82f6' },
  cocina:   { bg: 'rgba(245,158,11,0.14)',     color: '#f59e0b' },
  admin:    { bg: 'rgba(168,85,247,0.14)',     color: '#a855f7' },
}

// Gestión de logins (vía Edge Function admin-usuarios, solo Finanzas):
// crear/eliminar usuarios, resetear contraseña y vincularlos a un empleado
// del legajo para que puedan fichar.
export default function UsuariosSection({ empleados }) {
  const { usuarios, loading, error, crearUsuario, eliminarUsuario, cambiarPassword, vincularEmpleado } = useUsuarios()

  const [nuevo, setNuevo]       = useState(false)
  const [delUser, setDelUser]   = useState(null)
  const [passUser, setPassUser] = useState(null)
  const [linkUser, setLinkUser] = useState(null)

  // Empleados activos sin login vinculado (candidatos a vincular).
  const sinLogin = useMemo(() => {
    const vinculados = new Set(usuarios.map(u => u.empleado?.empleado_id).filter(Boolean))
    return empleados.filter(e => e.activo && !vinculados.has(e.id) && !e.user_id)
  }, [empleados, usuarios])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Los usuarios con rol <b>empleado</b> solo ven Fichar y Mis horas. Vinculá cada login a un empleado del legajo.
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

      {loading ? (
        <div className="space-y-2.5">{[1, 2, 3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : (
        <div className="space-y-2">
          {usuarios.map(u => {
            const chip = ROLE_CHIP[u.role] || ROLE_CHIP.admin
            return (
              <div key={u.id} className="flex items-center justify-between rounded-xl px-4 py-3 gap-3 flex-wrap"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {u.email}
                    {u.es_yo && <span className="ml-2 text-[10px]" style={{ color: 'var(--text-xmuted)' }}>(vos)</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                      style={{ background: chip.bg, color: chip.color }}>
                      {u.role}
                    </span>
                    {u.empleado ? (
                      <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        <Link2 size={11} /> {u.empleado.nombre}
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>sin empleado vinculado</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setLinkUser(u)} title="Vincular a un empleado"
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
                    {u.empleado ? 'Vínculo' : 'Vincular'}
                  </button>
                  <button onClick={() => setPassUser(u)} title="Cambiar contraseña"
                    className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
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
            )
          })}
        </div>
      )}

      {/* Crear usuario */}
      {nuevo && (
        <UsuarioModal
          empleadosSinLogin={sinLogin}
          onClose={() => setNuevo(false)}
          onSave={crearUsuario}
        />
      )}

      {/* Cambiar contraseña */}
      {passUser && (
        <PasswordModal
          usuario={passUser}
          onClose={() => setPassUser(null)}
          onSave={(pass) => cambiarPassword(passUser.id, pass)}
        />
      )}

      {/* Vincular a empleado */}
      {linkUser && (
        <VincularModal
          usuario={linkUser}
          empleados={empleados.filter(e => e.activo)}
          onClose={() => setLinkUser(null)}
          onSave={vincularEmpleado}
        />
      )}

      {delUser && (
        <ConfirmDelete titulo="Eliminar usuario"
          mensaje={`¿Eliminás el login ${delUser.email}? Deja de poder entrar y fichar. Sus fichajes históricos se conservan.`}
          onClose={() => setDelUser(null)} onConfirm={() => eliminarUsuario(delUser.id)} />
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
            ...empleadosSinLogin.map(e => ({ value: e.id, label: `${e.nombre} ${e.apellido || ''}`.trim() })),
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

function VincularModal({ usuario, empleados, onClose, onSave }) {
  const actual = usuario.empleado?.empleado_id || ''
  const [empleadoId, setEmpleadoId] = useState(actual)
  const [busy, setBusy]             = useState(false)
  const [error, setError]           = useState(null)

  const handle = async () => {
    setBusy(true); setError(null)
    try {
      if (empleadoId) {
        await onSave(empleadoId, usuario.id)               // vincular / cambiar
      } else if (actual) {
        await onSave(actual, null)                          // desvincular
      }
      onClose()
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  return (
    <ModalShell title={`Vincular · ${usuario.email}`} icon={Link2} onClose={onClose} maxW="max-w-sm">
      <div className="p-5 space-y-4">
        <Select label="Empleado del legajo" value={empleadoId} onChange={setEmpleadoId}
          options={[
            { value: '', label: '— Sin vínculo (no puede fichar) —' },
            ...empleados.map(e => ({ value: e.id, label: `${e.nombre} ${e.apellido || ''}`.trim() })),
          ]} />
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          El fichaje y las horas se registran a nombre del empleado vinculado.
        </p>
        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
        <button onClick={handle} disabled={busy}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          {busy ? 'Guardando…' : 'Guardar vínculo'}
        </button>
      </div>
    </ModalShell>
  )
}
