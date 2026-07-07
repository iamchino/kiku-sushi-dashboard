import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Printer, Truck, Clock } from 'lucide-react'
import PrinterConfig from '../components/config/PrinterConfig'
import EnvioConfig from '../components/config/EnvioConfig'
import HorariosConfig from '../components/config/HorariosConfig'
import { useRole } from '../context/useRole'

// Cada tab declara qué roles lo pueden ver. El mozo sólo ve Impresoras (para
// corregir la IP); envío y horarios quedan para admin.
const TABS = [
  { id: 'impresoras', label: 'Impresoras', Icon: Printer, roles: ['admin', 'mozo'] },
  { id: 'envio',      label: 'Envío',      Icon: Truck,   roles: ['admin'] },
  { id: 'horarios',   label: 'Horarios',   Icon: Clock,   roles: ['admin'] },
]

/**
 * Configuración general del negocio:
 * - Impresoras (GG EZ Print)
 * - Envío (base + zonas de delivery)
 * - Horarios especiales de apertura (ej. días de partido)
 *
 * El plano del salón y los camareros siguen en "Configuración del salón" (dentro de Mesas).
 */
export default function ConfiguracionPage() {
  const role = useRole()
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const visibleTabs = TABS.filter(t => t.roles.includes(role))
  const initialTab = visibleTabs.some(t => t.id === tabParam) ? tabParam : (visibleTabs[0]?.id || 'impresoras')
  const [tab, setTab] = useState(initialTab)

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-4 md:px-6 py-3 flex-shrink-0 flex-wrap gap-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h1 className="text-lg md:text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Configuración
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Impresoras, costos de envío y horarios especiales de apertura
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {visibleTabs.map(({ id, label, Icon }) => (
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

      {tab === 'horarios' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-3xl mx-auto">
            <HorariosConfig />
          </div>
        </div>
      )}
    </div>
  )
}
