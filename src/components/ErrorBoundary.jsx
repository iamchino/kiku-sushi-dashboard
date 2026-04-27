import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }
  componentDidCatch(error, info) {
    this.setState({ error, info })
    console.error('[ErrorBoundary]', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: '#0f0f11', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '2rem',
          fontFamily: 'monospace',
        }}>
          <div style={{
            background: '#1c1c1f', border: '1px solid #f87171',
            borderRadius: '12px', padding: '2rem', maxWidth: '640px', width: '100%',
          }}>
            <p style={{ color: '#f87171', fontWeight: 700, marginBottom: '0.5rem', fontSize: '14px' }}>
              ⚠️ Error en la aplicación
            </p>
            <p style={{ color: '#e4e4e7', fontSize: '13px', marginBottom: '1rem' }}>
              {this.state.error?.message}
            </p>
            <pre style={{
              background: '#111113', borderRadius: '8px', padding: '1rem',
              color: '#a1a1aa', fontSize: '11px', overflowX: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '1rem', background: '#7c3aed', color: '#fff',
                border: 'none', borderRadius: '8px', padding: '8px 16px',
                cursor: 'pointer', fontSize: '13px', fontWeight: 600,
              }}
            >
              Recargar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
