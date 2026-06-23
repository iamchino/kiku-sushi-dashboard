import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, LayoutGrid, Users, Printer, Truck } from 'lucide-react'
import SalonEditor from '../components/mesas/SalonEditor'
import MozosManager from '../components/mesas/MozosManager'
import PrinterConfig from '../components/config/PrinterConfig'
import EnvioConfig from '../components/config/EnvioConfig'

const TABS = [
  { id: 'plano',       label: 'Plano del salón', Icon: LayoutGrid },
  { id: 'mozos',       label: 'Camareros',       Icon: Users },
  { id: 'impresoras',  label: 'Impresoras',      Icon: Printer },
  { id: 'envio',       label: 'Envío',           Icon: Truck },
]

/**
 * Página de configuración del salón:
 * - Editor de plano (drag/drop de mesas, multi-salón)
 * - Gestión de camareros
 * - Configuración de impresoras (GG EZ Print)
 */
export default function ConfigSalonPage() {
  const [tab, setTab] = useState('plano')

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-4 md:px-6 py-3 flex-shrink-0 flex-wrap gap-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <Link
            to="/mesas"
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-input)'}
            title="Volver"
          >
            <ArrowLeft size={15} />
          </Link>
          <div>
            <h1 className="text-lg md:text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Configuración del salón
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Diseñá el plano de tus salones, administrá camareros y configurá las impresoras
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={tab === id
                ? { background: 'var(--accent)', color: '#ffffff', border: '1px solid var(--accent)' }
                : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
              }
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'plano' && (
        <div className="flex-1 overflow-hidden">
          <SalonEditor />
        </div>
      )}

      {tab === 'mozos' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-2xl mx-auto">
            <MozosManager />
          </div>
        </div>
      )}

      {tab === 'impresoras' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-3xl mx-auto">
            <PrinterConfig />
          </div>
        </div>
      )}

      {tab === 'envio' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-3xl mx-auto">
            <EnvioConfig />
          </div>
        </div>
      )}
    </div>
  )
}
