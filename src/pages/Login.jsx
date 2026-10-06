import { useState } from 'react'
import { auth } from '../lib/supabase'

const styles = `
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
.login-card {
  animation: fadeInUp 0.4s ease forwards;
}
`

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await auth.login(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <>
      <style>{styles}</style>
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{
          background: 'radial-gradient(ellipse at 60% 20%, rgba(61,42,92,0.45) 0%, transparent 60%), radial-gradient(ellipse at 20% 90%, rgba(232,212,162,0.08) 0%, transparent 50%), #0B0712',
        }}
      >
        {/* Dot pattern overlay */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(232,212,162,0.18) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            opacity: 0.35,
          }}
        />

        <div
          className="login-card relative w-full max-w-sm p-8 rounded-2xl"
          style={{
            background: 'rgba(22,15,36,0.88)',
            border: '1px solid rgba(232,212,162,0.14)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 32px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-4"
              style={{ background: 'var(--cta)', boxShadow: 'var(--cta-shadow)' }}
            >
              K
            </div>
            <p className="font-display text-3xl tracking-wide" style={{ color: '#F5F0F7' }}>
              Kiku <span style={{ color: '#E8D4A2' }}>Sushi</span>
            </p>
            <p className="text-[11px] mt-1 uppercase tracking-[0.2em]" style={{ color: '#9B8FAA' }}>Sistema de gestión</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#B9AEC9' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder:text-zinc-600 outline-none transition-all"
                style={{
                  background: '#111113',
                  border: '1px solid #2a2a2e',
                }}
                onFocus={e => e.target.style.border = '1px solid rgba(var(--accent-rgb),0.5)'}
                onBlur={e => e.target.style.border = '1px solid #2a2a2e'}
                placeholder="admin@kikusushi.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#B9AEC9' }}>
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder:text-zinc-600 outline-none transition-all"
                style={{
                  background: '#111113',
                  border: '1px solid #2a2a2e',
                }}
                onFocus={e => e.target.style.border = '1px solid rgba(var(--accent-rgb),0.5)'}
                onBlur={e => e.target.style.border = '1px solid #2a2a2e'}
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <p
                className="text-xs px-3 py-2.5 rounded-lg"
                style={{ color: '#F2708C', background: 'rgba(227,77,107,0.08)', border: '1px solid rgba(227,77,107,0.15)' }}
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full text-white text-sm font-semibold py-2.5 rounded-lg transition-all duration-150 mt-2 disabled:opacity-50"
              style={{
                background: loading ? 'var(--accent-deep)' : 'var(--cta)',
                boxShadow: 'var(--cta-shadow)',
              }}
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
