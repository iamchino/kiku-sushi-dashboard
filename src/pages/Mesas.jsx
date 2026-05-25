import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Settings, RefreshCw, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSalones } from '../hooks/useSalones'
import { useMesas } from '../hooks/useMesas'
import SalonTabs from '../components/mesas/SalonTabs'
import SalonCanvas from '../components/mesas/SalonCanvas'
import MesaDetallePanel from '../components/mesas/MesaDetallePanel'
import AbrirMesaModal from '../components/mesas/AbrirMesaModal'
import { ESTADO_MESA_CONFIG } from '../components/mesas/mesaColors'

const STORAGE_KEY = 'kiku.mesas.activeSalon'

export default function MesasPage() {
  const { salones, loading: loadingSalones } = useSalones({ onlyActive: true })

  const [activeSalonId, setActiveSalonId] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
  })

  useEffect(() => {
    if (activeSalonId) {
      try { localStorage.setItem(STORAGE_KEY, activeSalonId) } catch { /* ignore */ }
    }
  }, [activeSalonId])

  useEffect(() => {
    if (!salones.length) return
    if (!activeSalonId || !salones.find(s => s.id === activeSalonId)) {
      setActiveSalonId(salones[0].id)
    }
  }, [salones, activeSalonId])

  const {
    mesas, stats, loading: loadingMesas, refetch,
    agruparMesa, desagruparGrupo,
  } = useMesas({ salonId: activeSalonId })

  const [selectedMesaId, setSelectedMesaId] = useState(null)
  const [mesaAbrir,      setMesaAbrir]      = useState(null)

  const selectedMesa = useMemo(
    () => mesas.find(m => m.id === selectedMesaId) || null,
    [mesas, selectedMesaId]
  )

  // Mesas libres y NO miembros de otro grupo, para la opción "Unir mesa".
  // Se excluye la mesa seleccionada (no puede unirse consigo misma).
  const mesasDisponiblesParaUnir = useMemo(() => {
    if (!selectedMesa) return []
    return mesas.filter(m =>
      m.id !== selectedMesa.id &&
      m.estado_mesa === 'libre' &&
      !m.mesa_grupo_id &&
      !m.es_lider_grupo
    )
  }, [mesas, selectedMesa])

  const handleMesaClick = (mesa) => {
    // Si es miembro de un grupo, rutear al líder.
    if (mesa.mesa_grupo_id) {
      setSelectedMesaId(mesa.mesa_grupo_id)
      return
    }
    if (mesa.estado_mesa === 'libre') {
      setMesaAbrir(mesa)
    } else {
      setSelectedMesaId(mesa.id)
    }
  }

  const handleAbrirMesa = async (form) => {
    if (!mesaAbrir?.id) return { error: new Error('Mesa no seleccionada') }
    const personas = Math.max(1, parseInt(form.personas) || 1)
    const { error } = await supabase.rpc('abrir_mesa', {
      p_mesa_id:          mesaAbrir.id,
      p_personas:         personas,
      p_mozo_id:          form.mozoId || null,
      p_cliente_nombre:   form.clienteNombre?.trim()   || null,
      p_cliente_telefono: form.clienteTelefono?.trim() || null,
    })
    if (error) return { error }
    await refetch()
    setSelectedMesaId(mesaAbrir.id)
    setMesaAbrir(null)
    return { error: null }
  }

  const countsBySalonId = useMemo(() => {
    if (!activeSalonId) return {}
    return { [activeSalonId]: { libres: stats.libres, total: stats.total } }
  }, [activeSalonId, stats])

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-4 md:px-6 py-3 flex-shrink-0 gap-3 flex-wrap"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h1 className="text-lg md:text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Mesas
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Gestión visual del salón
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="hidden md:flex items-center gap-2 text-xs">
            <span
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium"
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-muted)',
                border: `1.5px dashed ${ESTADO_MESA_CONFIG.libre.borderHi}`,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-muted)' }} />
              {stats.libres} libres
            </span>
            <span
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium"
              style={{
                background: 'var(--accent-soft)',
                color: 'var(--accent-lift)',
                border: '1px solid var(--accent-border)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-lift)' }} />
              {stats.ocupadas} ocupadas
            </span>
          </div>

          <button
            type="button"
            onClick={refetch}
            disabled={loadingMesas}
            className="p-2 rounded-lg transition-all disabled:opacity-50"
            style={{ border: '1px solid var(--border)' }}
            title="Actualizar"
          >
            <RefreshCw size={14} className={loadingMesas ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
          </button>

          <Link
            to="/configuracion/salon"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}
          >
            <Settings size={13} />
            <span className="hidden sm:inline">Editar plano</span>
          </Link>
        </div>
      </div>

      <SalonTabs
        salones={salones}
        activeSalonId={activeSalonId}
        onSelectSalon={(s) => { setActiveSalonId(s.id); setSelectedMesaId(null) }}
        countsBySalonId={countsBySalonId}
      />

      {!loadingSalones && salones.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-4 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--accent-soft)' }}
          >
            <Building2 size={28} style={{ color: 'var(--accent-lift)' }} />
          </div>
          <div>
            <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
              Aún no creaste ningún salón
            </p>
            <p className="text-xs mt-1 max-w-md" style={{ color: 'var(--text-muted)' }}>
              Para empezar a usar mesas, creá tu primer salón y agregale mesas desde el editor de plano.
            </p>
          </div>
          <Link
            to="/configuracion/salon"
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))', boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.35)' }}
          >
            Ir al editor de plano
          </Link>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <div className={`flex-1 flex flex-col ${selectedMesa ? 'hidden lg:flex' : 'flex'}`}>
            <SalonCanvas
              salon={salones.find(s => s.id === activeSalonId)}
              mesas={mesas}
              selectedMesaId={selectedMesaId}
              onSelectMesa={handleMesaClick}
              loading={loadingMesas}
              emptyHint="Salón vacío. Agregá mesas desde el editor de plano."
            />
          </div>

          {selectedMesa && (
            <MesaDetallePanel
              mesa={selectedMesa}
              onClose={() => setSelectedMesaId(null)}
              onAbrirMesa={(m) => setMesaAbrir(m)}
              mesasDisponiblesParaUnir={mesasDisponiblesParaUnir}
              onUnir={async (leaderId, memberId) => {
                const res = await agruparMesa(leaderId, memberId)
                return res || {}
              }}
              onDesagrupar={async (leaderId) => {
                const res = await desagruparGrupo(leaderId)
                return res || {}
              }}
            />
          )}
        </div>
      )}

      <AbrirMesaModal
        open={Boolean(mesaAbrir)}
        mesa={mesaAbrir}
        onClose={() => setMesaAbrir(null)}
        onAbrir={handleAbrirMesa}
      />
    </div>
  )
}
