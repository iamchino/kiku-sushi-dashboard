import { useState, useMemo } from 'react'
import { Plus, Trash2, Grid3X3, Loader2, Building2 } from 'lucide-react'
import SalonTabs from './SalonTabs'
import SalonCanvas from './SalonCanvas'
import MesaEditorTile from './MesaEditorTile'
import NuevaMesaModal from './NuevaMesaModal'
import NuevoSalonModal from './NuevoSalonModal'
import { useSalones } from '../../hooks/useSalones'
import { useMesas } from '../../hooks/useMesas'

/**
 * Editor de plano del salón.
 * - Drag para mover mesas
 * - Handle inferior derecho para resize
 * - Doble click sobre mesa → edita (número, capacidad, forma, dimensiones)
 * - Toolbar: nueva mesa, snap a grilla, eliminar selección
 * - Multi-salón con tabs + botón nuevo salón
 */
export default function SalonEditor() {
  const { salones, loading: loadingSalones, createSalon, updateSalon } = useSalones({ onlyActive: false })
  const [activeSalonId, setActiveSalonId] = useState(null)
  const [snapEnabled, setSnapEnabled]     = useState(true)
  const [selectedMesaId, setSelectedMesaId] = useState(null)
  const [editingMesa, setEditingMesa]     = useState(null)
  const [showNuevaMesa, setShowNuevaMesa] = useState(false)
  const [showNuevoSalon, setShowNuevoSalon] = useState(false)
  const [salonSize, setSalonSize] = useState({ ancho: '', alto: '' })
  const [savingSalon, setSavingSalon] = useState(false)

  const currentSalonId = activeSalonId || salones[0]?.id || null
  const currentSalon = useMemo(
    () => salones.find(s => s.id === currentSalonId),
    [salones, currentSalonId]
  )

  const {
    mesas, loading: loadingMesas,
    createMesa, updateMesa, eliminarMesa,
  } = useMesas({ salonId: currentSalonId })

  const selectedMesa = useMemo(
    () => mesas.find(m => m.id === selectedMesaId),
    [mesas, selectedMesaId]
  )

  const handleCommitMove = async (mesa, newX, newY) => {
    await updateMesa(mesa.id, { pos_x: newX, pos_y: newY })
  }

  const handleCommitResize = async (mesa, newW, newH) => {
    await updateMesa(mesa.id, { ancho: newW, alto: newH })
  }

  const handleCreateMesa = async (values) => {
    // posición default: esquina superior izquierda libre
    const result = await createMesa({
      ...values,
      pos_x: 20, pos_y: 20,
    })
    if (!result.error) setSelectedMesaId(result.data?.id)
    return result
  }

  const handleEditMesa = async (values) => {
    if (!editingMesa) return { error: new Error('Sin mesa') }
    return await updateMesa(editingMesa.id, values)
  }

  const suggestedNumero = useMemo(() => {
    const max = mesas.reduce((m, x) => Math.max(m, x.numero || 0), 0)
    return max + 1
  }, [mesas])

  const handleSizeBlur = async () => {
    if (!currentSalon) return
    const a = parseInt(salonSize.ancho) || currentSalon.ancho
    const al = parseInt(salonSize.alto) || currentSalon.alto
    if (a === currentSalon.ancho && al === currentSalon.alto) return
    setSavingSalon(true)
    await updateSalon(currentSalon.id, { ancho: a, alto: al })
    setSavingSalon(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-4 md:px-6 py-3 flex-wrap gap-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <Building2 size={16} style={{ color: 'var(--accent-lift)' }} />
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Editor de plano</h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSnapEnabled(v => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={snapEnabled
              ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
              : { background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
            }
          >
            <Grid3X3 size={12} /> Snap {snapEnabled ? 'on' : 'off'}
          </button>

          <button
            type="button"
            onClick={() => setShowNuevaMesa(true)}
            disabled={!currentSalonId}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
          >
            <Plus size={12} /> Mesa
          </button>

          {selectedMesa && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`¿Eliminar mesa ${selectedMesa.numero}?`)) return
                await eliminarMesa(selectedMesa.id)
                setSelectedMesaId(null)
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: 'transparent', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <Trash2 size={12} /> Eliminar mesa
            </button>
          )}
        </div>
      </div>

      <SalonTabs
        salones={salones}
        activeSalonId={currentSalonId}
        onSelectSalon={(s) => { setActiveSalonId(s.id); setSelectedMesaId(null); setSalonSize({ ancho:'', alto:'' }) }}
        countsBySalonId={{}}
        editMode
        onAddSalon={() => setShowNuevoSalon(true)}
      />

      {/* Configuración del salón actual */}
      {currentSalon && (
        <div
          className="flex items-center gap-3 px-4 md:px-6 py-2 text-xs flex-wrap"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-input)' }}
        >
          <span style={{ color: 'var(--text-muted)' }}>Tamaño del canvas:</span>
          <label className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            Ancho
            <input
              type="number" min={400} max={4000}
              defaultValue={currentSalon.ancho}
              onBlur={(e) => { setSalonSize(s => ({ ...s, ancho: e.target.value })); setTimeout(handleSizeBlur, 0) }}
              className="w-20 px-2 py-1 rounded text-xs outline-none"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </label>
          <label className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            Alto
            <input
              type="number" min={400} max={4000}
              defaultValue={currentSalon.alto}
              onBlur={(e) => { setSalonSize(s => ({ ...s, alto: e.target.value })); setTimeout(handleSizeBlur, 0) }}
              className="w-20 px-2 py-1 rounded text-xs outline-none"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </label>
          {savingSalon && <Loader2 size={11} className="animate-spin" style={{ color: 'var(--accent-lift)' }} />}
          {!currentSalon.activo && (
            <span className="ml-auto px-2 py-0.5 rounded text-[10px] font-medium"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
              Salón inactivo
            </span>
          )}
        </div>
      )}

      <SalonCanvas
        salon={currentSalon}
        mesas={mesas}
        selectedMesaId={selectedMesaId}
        loading={loadingMesas || loadingSalones}
        emptyHint="Salón vacío. Agregá la primera mesa con el botón + Mesa."
        renderMesa={(mesa, { selected, scale }) => (
          <MesaEditorTile
            key={mesa.id}
            mesa={mesa}
            selected={selected}
            scale={scale}
            snap={snapEnabled ? 20 : 0}
            onSelect={(m) => setSelectedMesaId(m.id)}
            onEdit={(m) => setEditingMesa(m)}
            onCommitMove={(x, y) => handleCommitMove(mesa, x, y)}
            onCommitResize={(w, h) => handleCommitResize(mesa, w, h)}
          />
        )}
      />

      <NuevaMesaModal
        open={showNuevaMesa}
        onClose={() => setShowNuevaMesa(false)}
        onSave={handleCreateMesa}
        suggestedNumero={suggestedNumero}
      />

      <NuevaMesaModal
        open={Boolean(editingMesa)}
        mesa={editingMesa}
        onClose={() => setEditingMesa(null)}
        onSave={handleEditMesa}
        onDelete={async (id) => {
          const r = await eliminarMesa(id)
          if (!r.error) setSelectedMesaId(null)
          return r
        }}
      />

      <NuevoSalonModal
        open={showNuevoSalon}
        onClose={() => setShowNuevoSalon(false)}
        onSave={async (values) => {
          const r = await createSalon(values)
          if (!r.error && r.data) setActiveSalonId(r.data.id)
          return r
        }}
      />
    </div>
  )
}
