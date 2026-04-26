import clsx from 'clsx'

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const HORAS = Array.from({ length: 13 }, (_, i) => `${i + 11}h`)
const DIAS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getCellStyle(valor, max) {
  if (max === 0 || valor === 0) return { background: '#232327' }
  const ratio = valor / max
  const alpha = 0.1 + ratio * 0.85
  return {
    background: `rgba(232, 103, 58, ${alpha.toFixed(2)})`,
    boxShadow: ratio > 0.7 ? '0 0 6px rgba(232,103,58,0.3)' : 'none',
  }
}

export function HeatmapHoras({ data, loading }) {
  const valores = Object.values(data || {})
  const max = valores.length ? Math.max(...valores) : 0

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: '#1c1c1f', border: '1px solid #2a2a2e' }}
    >
      <h2 className="text-xs font-medium uppercase tracking-wide mb-4" style={{ color: '#52525b' }}>
        Mapa de calor — horarios de mayor demanda
      </h2>
      {loading ? (
        <div className="space-y-2">
          {DIAS.map(d => (
            <div key={d} className="flex gap-1 items-center">
              <div className="w-10 skeleton h-3 rounded" />
              {HORAS.map((_, i) => <div key={i} className="skeleton flex-1 h-7 rounded" />)}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="min-w-[580px]">
              {/* Header horas */}
              <div className="grid mb-1.5" style={{ gridTemplateColumns: '40px repeat(13, 1fr)' }}>
                <div />
                {HORAS.map(h => (
                  <div key={h} className="text-center text-[10px]" style={{ color: '#3f3f46' }}>{h}</div>
                ))}
              </div>
              {/* Filas por día */}
              {DIAS.map((dia, di) => (
                <div key={dia} className="grid mb-1" style={{ gridTemplateColumns: '40px repeat(13, 1fr)' }}>
                  <div className="text-[11px] flex items-center justify-end pr-2" style={{ color: '#52525b' }}>{dia}</div>
                  {HORAS.map((_, hi) => {
                    const hora = hi + 11
                    const key = `${DIAS_EN[di]}-${hora}`
                    const val = data?.[key] || 0
                    return (
                      <div
                        key={hi}
                        className="h-7 rounded mx-0.5 transition-all duration-150 hover:scale-105 cursor-default"
                        style={getCellStyle(val, max)}
                        title={`${dia} ${hora}h: ${val} pedidos`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          {/* Leyenda */}
          <div className="flex items-center gap-2 mt-4">
            <span className="text-[10px]" style={{ color: '#3f3f46' }}>Menos</span>
            {[0.05, 0.2, 0.4, 0.6, 0.8, 1].map((alpha, i) => (
              <div
                key={i}
                className="w-5 h-3 rounded"
                style={{ background: alpha < 0.1 ? '#232327' : `rgba(232,103,58,${alpha})` }}
              />
            ))}
            <span className="text-[10px]" style={{ color: '#3f3f46' }}>Más pedidos</span>
          </div>
        </>
      )}
    </div>
  )
}