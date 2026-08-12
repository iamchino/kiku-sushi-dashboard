import { useState, useMemo } from 'react'
import { RefreshCw, CalendarDays, ChevronLeft, ChevronRight, ListChecks, ClipboardList, Trash2 } from 'lucide-react'
import { useProduccion } from '../hooks/useProduccion'
import { useRole } from '../context/useRole'
import ProgresoBar from '../components/produccion/ProgresoBar'
import TareaCard from '../components/produccion/TareaCard'
import CompletarModal from '../components/produccion/CompletarModal'
import NuevaTareaForm from '../components/produccion/NuevaTareaForm'

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatFecha(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function isToday(dateStr) {
  return dateStr === new Date().toISOString().split('T')[0]
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function ProduccionPage() {
  const role = useRole()
  // Gestión de la lista (crear, eliminar, cambiar fecha): solo admin y finanzas.
  const isAdmin = role === 'admin' || role === 'finanzas'
  // Cargar tareas y anotaciones: también cocina (Marce y Fran pueden anotar
  // refuerzos o cargar una producción que hicieron).
  const puedeCargar = isAdmin || role === 'cocina'

  const {
    lista, tareas, recetas, stockItems, subRecetas, stats,
    loading, error, fecha, setFecha,
    createLista, deleteLista, addTarea, deleteTarea,
    completarTarea, revertirTarea, fetchData,
  } = useProduccion()

  const [completarTarget, setCompletarTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [creando, setCreando] = useState(false)
  const [borrarListaOpen, setBorrarListaOpen] = useState(false)
  const [borrandoLista, setBorrandoLista] = useState(false)
  const [errorLista, setErrorLista] = useState(null)

  // Receta asociada a cada tarea
  const getReceta = (tarea) => recetas.find(r => r.id === tarea.receta_id) || null
  const getStockProduccion = (tarea) =>
    stockItems.find(s => s.tipo_stock === 'produccion' && s.receta_id === tarea.receta_id) || null

  // Separar pendientes y completadas
  const pendientes = useMemo(() => tareas.filter(t => t.estado !== 'completada'), [tareas])
  const completadas = useMemo(() => tareas.filter(t => t.estado === 'completada'), [tareas])

  // Crear lista si no existe
  const handleCrearLista = async () => {
    setCreando(true)
    await createLista(fecha)
    setCreando(false)
  }

  // Eliminar la lista completa (solo admin/finanzas)
  const handleBorrarLista = async () => {
    setBorrandoLista(true)
    setErrorLista(null)
    const r = await deleteLista()
    setBorrandoLista(false)
    if (r?.error) { setErrorLista(r.error.message || 'No se pudo eliminar la lista.'); return }
    setBorrarListaOpen(false)
  }

  // Delete tarea
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    await deleteTarea(deleteTarget.id)
    setDeleteTarget(null)
    setDeleting(false)
  }

  // Dark bg for cocina role (matches KDS)
  const isCocina = role === 'cocina'
  const containerStyle = isCocina
    ? { background: '#0a0a0c', minHeight: 'calc(100vh - 56px)' }
    : {}

  return (
    <div
      className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto"
      style={{ ...containerStyle, paddingBottom: isCocina ? '80px' : undefined }}
    >
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}>
            <ListChecks size={22} style={{ color: 'var(--accent-lift)' }} />
            Producción
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Tareas de preparación del día
          </p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {isAdmin && lista && (
            <button onClick={() => { setErrorLista(null); setBorrarListaOpen(true) }}
              title="Eliminar la lista de este día"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
              style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
              <Trash2 size={13} /> Eliminar lista
            </button>
          )}
          <button onClick={fetchData} disabled={loading}
            className="p-2 rounded-lg disabled:opacity-50"
            style={{ border: '1px solid var(--border)' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* ── Navegación de fecha (admin puede cambiar, cocina solo ve hoy) ── */}
      <div className="flex items-center justify-between rounded-xl px-3 py-2"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        {isAdmin ? (
          <>
            <button onClick={() => setFecha(f => addDays(f, -1))}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <ChevronLeft size={16} />
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
                {formatFecha(fecha)}
              </p>
              {!isToday(fecha) && (
                <button onClick={() => setFecha(new Date().toISOString().split('T')[0])}
                  className="text-[10px] font-medium" style={{ color: 'var(--accent-lift)' }}>
                  Ir a hoy
                </button>
              )}
            </div>
            <button onClick={() => setFecha(f => addDays(f, 1))}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <ChevronRight size={16} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 mx-auto py-1">
            <CalendarDays size={14} style={{ color: 'var(--accent-lift)' }} />
            <p className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
              {formatFecha(fecha)}
            </p>
            {isToday(fecha) && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
                HOY
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : !lista ? (
        /* ── No hay lista ── */
        <div className="flex flex-col items-center justify-center py-16 gap-4 rounded-xl"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <ClipboardList size={40} style={{ color: 'var(--text-xmuted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No hay lista de producción para este día
          </p>
          {isAdmin && (
            <button onClick={handleCrearLista} disabled={creando}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))', boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.25)' }}>
              {creando ? 'Creando...' : '+ Crear lista'}
            </button>
          )}
        </div>
      ) : (
        /* ── Lista existe: mostrar tareas ── */
        <div className="space-y-4">
          {/* Progreso */}
          <ProgresoBar stats={stats} />

          {/* Notas de la dueña */}
          {lista.notas && (
            <div className="px-4 py-3 rounded-xl text-xs"
              style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--text-primary)' }}>
              📝 <span className="font-medium" style={{ color: 'var(--accent-lift)' }}>Nota:</span> {lista.notas}
            </div>
          )}

          {/* Agregar tarea / anotación (admin, finanzas y cocina) */}
          {puedeCargar && (
            <NuevaTareaForm
              subRecetas={subRecetas}
              onAdd={addTarea}
            />
          )}

          {/* Tareas pendientes */}
          {pendientes.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-2"
                style={{ color: 'var(--text-xmuted)' }}>
                Pendientes
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{ background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent-lift)' }}>
                  {pendientes.length}
                </span>
              </p>
              {pendientes.map(t => (
                <TareaCard
                  key={t.id}
                  tarea={t}
                  receta={getReceta(t)}
                  stockProduccion={getStockProduccion(t)}
                  isAdmin={isAdmin}
                  onCompletar={setCompletarTarget}
                  onRevertir={revertirTarea}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}

          {/* Tareas completadas */}
          {completadas.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-2"
                style={{ color: 'var(--text-xmuted)' }}>
                Completadas
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                  {completadas.length}
                </span>
              </p>
              {completadas.map(t => (
                <TareaCard
                  key={t.id}
                  tarea={t}
                  receta={getReceta(t)}
                  stockProduccion={getStockProduccion(t)}
                  isAdmin={isAdmin}
                  onCompletar={setCompletarTarget}
                  onRevertir={(tarea) => revertirTarea(tarea.id)}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}

          {/* Sin tareas */}
          {tareas.length === 0 && (
            <div className="flex flex-col items-center py-12 gap-2">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No hay tareas aún
              </p>
              {puedeCargar && (
                <p className="text-xs" style={{ color: 'var(--text-xmuted)' }}>
                  Usá el botón de arriba para agregar tareas
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Modal completar ── */}
      <CompletarModal
        open={!!completarTarget}
        onClose={() => setCompletarTarget(null)}
        tarea={completarTarget}
        receta={completarTarget ? getReceta(completarTarget) : null}
        stockProduccion={completarTarget ? getStockProduccion(completarTarget) : null}
        recetas={recetas}
        onConfirm={completarTarea}
      />

      {/* ── Modal eliminar lista ── */}
      {borrarListaOpen && lista && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setBorrarListaOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.3)' }}>
            <div className="text-center space-y-2">
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>¿Eliminar la lista del día?</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Se eliminan la lista y sus {tareas.length} tarea{tareas.length === 1 ? '' : 's'}.
              </p>
              {tareas.some(t => t.estado === 'completada') && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                  Hay tareas completadas: el stock que ya movieron NO se devuelve.
                  Si necesitás revertirlas, hacelo antes de eliminar.
                </p>
              )}
            </div>
            {errorLista && <p className="text-xs text-center" style={{ color: '#ef4444' }}>{errorLista}</p>}
            <div className="flex gap-3">
              <button onClick={() => setBorrarListaOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Cancelar
              </button>
              <button onClick={handleBorrarLista} disabled={borrandoLista}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>
                {borrandoLista ? 'Eliminando...' : 'Eliminar lista'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal delete ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.3)' }}>
            <div className="text-center space-y-2">
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>¿Eliminar tarea?</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                "{deleteTarget.descripcion}" se eliminará.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
