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
          background: 'radial-gradient(ellipse at 60% 20%, rgba(232,103,58,0.08) 0%, transparent 60%), #0f0f11',
        }}
      >
        {/* Dot pattern overlay */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #2a2a2e 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            opacity: 0.5,
          }}
        />

        <div
          className="login-card relative w-full max-w-sm p-8 rounded-2xl"
          style={{
            background: 'rgba(28,28,31,0.85)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 32px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-4"
              style={{ background: 'linear-gradient(135deg, #E8673A, #C4501F)', boxShadow: '0 8px 24px rgba(232,103,58,0.3)' }}
            >
              K
            </div>
            <p className="text-xl font-bold tracking-tight text-white">
              KIKU <span style={{ color: '#E8673A' }}>SUSHI</span>
            </p>
            <p className="text-sm mt-1" style={{ color: '#52525b' }}>Sistema de gestión</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#a1a1aa' }}>
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
                onFocus={e => e.target.style.border = '1px solid rgba(232,103,58,0.5)'}
                onBlur={e => e.target.style.border = '1px solid #2a2a2e'}
                placeholder="admin@kikusushi.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#a1a1aa' }}>
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
                onFocus={e => e.target.style.border = '1px solid rgba(232,103,58,0.5)'}
                onBlur={e => e.target.style.border = '1px solid #2a2a2e'}
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <p
                className="text-xs px-3 py-2.5 rounded-lg"
                style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full text-white text-sm font-semibold py-2.5 rounded-lg transition-all duration-150 mt-2 disabled:opacity-50"
              style={{
                background: loading ? '#C4501F' : 'linear-gradient(135deg, #E8673A, #C4501F)',
                boxShadow: '0 4px 16px rgba(232,103,58,0.25)',
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