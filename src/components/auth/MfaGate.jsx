import { useCallback, useEffect, useRef, useState } from 'react'
import { KeyRound, Loader2, LogOut, Smartphone } from 'lucide-react'
import { supabase, auth } from '../../lib/supabase'
import { rolesConMfa } from '../../lib/mfa'

// Segundo factor (código de 6 dígitos, Google Authenticator o similar).
//
// Para los roles que lo exigen (mfa_roles en la base: admin y finanzas), la
// base no responde NADA mientras la sesión no sea aal2. Esta pantalla se
// interpone entre el login y el dashboard:
//   · sin autenticador configurado → muestra el QR y pide el primer código;
//   · con autenticador → pide el código del momento.
// Para los demás roles no hace nada.

async function estadoMfa() {
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const { data: factores } = await supabase.auth.mfa.listFactors()
  const verificados = (factores?.totp || []).filter(f => f.status === 'verified')
  const pendientes  = (factores?.totp || []).filter(f => f.status !== 'verified')
  return {
    actual: aal?.currentLevel || 'aal1',
    verificados,
    pendientes,
  }
}

function Marco({ titulo, subtitulo, icon: Icon, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-app)' }}>
      <div
        className="w-full max-w-sm rounded-2xl p-7"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)' }}>
            <Icon size={18} />
          </div>
          <div>
            <p className="font-display text-xl leading-tight" style={{ color: 'var(--text-primary)' }}>{titulo}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitulo}</p>
          </div>
        </div>
        {children}
        <button
          onClick={() => auth.logout()}
          className="mt-5 inline-flex items-center gap-1.5 text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          <LogOut size={12} /> Salir y entrar con otro usuario
        </button>
      </div>
    </div>
  )
}

function CampoCodigo({ value, onChange, disabled, autoFocus }) {
  return (
    <input
      id="mfa-codigo"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      autoFocus={autoFocus}
      disabled={disabled}
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="000000"
      className="w-full rounded-lg px-3 py-3 text-center text-2xl tracking-[0.5em] outline-none"
      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}
    />
  )
}

function Error({ texto }) {
  if (!texto) return null
  return (
    <p className="mt-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>
      {texto}
    </p>
  )
}

/** Alta del autenticador: QR + primer código. */
function Enrolar({ onListo }) {
  const [factor, setFactor] = useState(null)   // { id, qr, secret }
  const [codigo, setCodigo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [verSecreto, setVerSecreto] = useState(false)
  const iniciado = useRef(false)

  useEffect(() => {
    if (iniciado.current) return
    iniciado.current = true
    ;(async () => {
      // Limpiar altas a medias de intentos anteriores (quedan como 'unverified').
      const { data: f } = await supabase.auth.mfa.listFactors()
      for (const p of (f?.totp || []).filter(x => x.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: p.id })
      }
      const { data, error: e } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Kiku ${new Date().toLocaleDateString('es-AR')}`,
      })
      if (e) { setError(e.message); return }
      setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    })()
  }, [])

  const confirmar = async (e) => {
    e.preventDefault()
    if (!factor || codigo.length !== 6) return
    setBusy(true); setError(null)
    const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (e1) { setError(e1.message); setBusy(false); return }
    const { error: e2 } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.id, code: codigo })
    if (e2) {
      setError('El código no coincide. Fijate que el reloj del celular esté en hora y probá con el siguiente.')
      setCodigo(''); setBusy(false); return
    }
    onListo()
  }

  return (
    <Marco
      icon={Smartphone}
      titulo="Activá el segundo factor"
      subtitulo="Tu rol maneja plata y permisos: además de la contraseña, va a pedir un código del celular."
    >
      <ol className="text-xs space-y-1.5 mb-4" style={{ color: 'var(--text-secondary)' }}>
        <li>1. Instalá <b>Google Authenticator</b> (o Authy, 1Password, Microsoft Authenticator).</li>
        <li>2. Tocá <b>+</b> y escaneá este código.</li>
        <li>3. Escribí abajo los 6 dígitos que te muestra.</li>
      </ol>

      <div className="flex justify-center rounded-xl p-3 mb-4" style={{ background: '#fff' }}>
        {factor
          ? <img src={factor.qr} alt="Código QR para el autenticador" width={180} height={180} />
          : <Loader2 size={24} className="animate-spin" style={{ color: '#3D2A5C' }} />}
      </div>

      {factor && (
        <p className="text-[11px] mb-3 text-center" style={{ color: 'var(--text-muted)' }}>
          {verSecreto
            ? <span className="select-all break-all" style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{factor.secret}</span>
            : <button type="button" onClick={() => setVerSecreto(true)} style={{ color: 'var(--accent-lift)' }}>¿No podés escanear? Mostrar la clave para cargarla a mano</button>}
        </p>
      )}

      <form onSubmit={confirmar}>
        <CampoCodigo value={codigo} onChange={setCodigo} disabled={!factor || busy} />
        <Error texto={error} />
        <button
          type="submit"
          disabled={!factor || busy || codigo.length !== 6}
          className="mt-3 w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--cta)' }}
        >
          {busy ? <Loader2 size={15} className="animate-spin inline" /> : 'Activar y entrar'}
        </button>
      </form>
    </Marco>
  )
}

/** Ingreso con autenticador ya configurado. */
function Desafio({ factor, onListo }) {
  const [codigo, setCodigo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const confirmar = useCallback(async (code) => {
    if (code.length !== 6 || busy) return
    setBusy(true); setError(null)
    const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (e1) { setError(e1.message); setBusy(false); return }
    const { error: e2 } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.id, code })
    if (e2) {
      setError('Código incorrecto. Esperá al siguiente y volvé a probar.')
      setCodigo(''); setBusy(false); return
    }
    onListo()
  }, [factor.id, busy, onListo])

  // Al completar los 6 dígitos se envía solo.
  useEffect(() => { if (codigo.length === 6) confirmar(codigo) }, [codigo, confirmar])

  return (
    <Marco
      icon={KeyRound}
      titulo="Código de verificación"
      subtitulo="Abrí el autenticador en tu celular y escribí los 6 dígitos."
    >
      <form onSubmit={e => { e.preventDefault(); confirmar(codigo) }}>
        <CampoCodigo value={codigo} onChange={setCodigo} disabled={busy} autoFocus />
        <Error texto={error} />
        <button
          type="submit"
          disabled={busy || codigo.length !== 6}
          className="mt-3 w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--cta)' }}
        >
          {busy ? <Loader2 size={15} className="animate-spin inline" /> : 'Entrar'}
        </button>
      </form>
      <p className="mt-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        ¿Cambiaste de celular? Pedile a otro administrador que te resetee el segundo factor desde Personal › Usuarios.
      </p>
    </Marco>
  )
}

export default function MfaGate({ role, children }) {
  const [estado, setEstado] = useState({ cargando: true, exige: false, listo: false, factor: null })

  const revisar = useCallback(async () => {
    const roles = await rolesConMfa()
    const exige = roles.includes(role)
    if (!exige) { setEstado({ cargando: false, exige: false, listo: true, factor: null }); return }
    const m = await estadoMfa()
    if (m.actual === 'aal2') { setEstado({ cargando: false, exige: true, listo: true, factor: null }); return }
    setEstado({ cargando: false, exige: true, listo: false, factor: m.verificados[0] || null })
  }, [role])

  useEffect(() => { revisar() }, [revisar])

  // Al pasar el desafío, supabase-js emite MFA_CHALLENGE_VERIFIED con la
  // sesión nueva (aal2). Volvemos a revisar para soltar el dashboard.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'MFA_CHALLENGE_VERIFIED') revisar()
    })
    return () => subscription.unsubscribe()
  }, [revisar])

  if (estado.cargando) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-app)' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent-lift)', borderTopColor: 'transparent' }} />
      </div>
    )
  }
  if (estado.listo) return children
  if (estado.factor) return <Desafio factor={estado.factor} onListo={revisar} />
  return <Enrolar onListo={revisar} />
}

