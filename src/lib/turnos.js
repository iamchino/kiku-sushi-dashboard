// Armado de TURNOS (entrada → salida) a partir del log crudo de fichajes.
//
// Por qué existe: la lista de marcas sueltas no se entiende. Si alguien entra
// un martes 18:00 y sale el miércoles 00:08, en el log aparecen dos renglones
// en dos días distintos del calendario y parece que trabajó dos veces. Acá se
// emparejan y el turno queda atribuido al DÍA OPERATIVO, que es el día de la
// ENTRADA en hora de Argentina: ese turno es del martes, aunque termine el
// miércoles. Es el mismo criterio que usa la base (vista_jornadas_dia agrupa
// por `entrada at time zone 'America/Argentina/Buenos_Aires'`), así lo que se
// ve en pantalla y lo que se paga coinciden.
//
// Además, a diferencia de vista_jornadas, acá NO se pierde ninguna marca:
//   · entrada sin salida y con otra entrada después → 'sin_salida' (se olvidó
//     de fichar la salida)
//   · salida sin entrada previa                     → 'sin_entrada'
//   · última entrada sin salida                     → turno ABIERTO (está adentro)
import { arDateISO } from './horas'

// Un turno abierto por más de esto ya no es "está trabajando": es una salida
// que nadie fichó. Espeja la ventana de la base (fichar() corta el turno
// abandonado a las 16 h).
export const HORAS_TURNO_MAX = 16

function construir(empleadoId, entrada, salida, ahoraMs, horasMax, abiertoPosible) {
  const inicio = entrada?.ts || null
  const fin = salida?.ts || null
  const ref = entrada || salida
  const minutos = inicio && fin
    ? Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 60000)
    : null
  const abierto = Boolean(inicio && !fin && abiertoPosible)
  const transcurrido = abierto
    ? Math.max(0, Math.round((ahoraMs - new Date(inicio).getTime()) / 60000))
    : null
  return {
    // Estable entre refetch: se arma con los id de las marcas que lo forman.
    id: `${entrada?.id || 'x'}~${salida?.id || 'x'}`,
    empleado_id: empleadoId,
    empleado: ref?.empleado || null,
    entradaMarca: entrada || null,
    salidaMarca: salida || null,
    entrada: inicio,
    salida: fin,
    // Día operativo = día de la entrada en hora de Argentina.
    dia: arDateISO(inicio || fin),
    minutos,
    abierto,
    transcurrido,
    // Abierto hace demasiado: se olvidaron de fichar la salida.
    excedido: Boolean(abierto && transcurrido > horasMax * 60),
    cruzaMedianoche: Boolean(inicio && fin && arDateISO(inicio) !== arDateISO(fin)),
    anomalia: !inicio ? 'sin_entrada' : (!fin && !abierto ? 'sin_salida' : null),
  }
}

// marcas: filas de `fichajes` ({ id, empleado_id, tipo, ts, ... }), en
// cualquier orden. Devuelve los turnos ordenados del más nuevo al más viejo.
export function armarTurnos(marcas, { ahora = Date.now(), horasMax = HORAS_TURNO_MAX } = {}) {
  const porEmpleado = new Map()
  for (const m of marcas || []) {
    if (!m?.empleado_id || !m?.ts) continue
    if (!porEmpleado.has(m.empleado_id)) porEmpleado.set(m.empleado_id, [])
    porEmpleado.get(m.empleado_id).push(m)
  }

  const ahoraMs = ahora instanceof Date ? ahora.getTime() : Number(ahora)
  const turnos = []

  for (const [empleadoId, lista] of porEmpleado) {
    lista.sort((a, b) =>
      new Date(a.ts) - new Date(b.ts) ||
      String(a.created_at || '').localeCompare(String(b.created_at || '')))

    let abierta = null
    for (const m of lista) {
      if (m.tipo === 'entrada') {
        // Dos entradas seguidas: la primera se quedó sin salida.
        if (abierta) { turnos.push(construir(empleadoId, abierta, null, ahoraMs, horasMax, false)); }
        abierta = m
      } else {
        turnos.push(construir(empleadoId, abierta, m, ahoraMs, horasMax, false))
        abierta = null
      }
    }
    // La última entrada sin salida es la única que puede estar "en curso".
    if (abierta) turnos.push(construir(empleadoId, abierta, null, ahoraMs, horasMax, true))
  }

  turnos.sort((a, b) => new Date(b.entrada || b.salida) - new Date(a.entrada || a.salida))
  return turnos
}

// Agrupa turnos por día operativo → [{ dia, turnos }] de más nuevo a más viejo.
export function agruparPorDia(turnos) {
  const mapa = new Map()
  for (const t of turnos) {
    if (!mapa.has(t.dia)) mapa.set(t.dia, [])
    mapa.get(t.dia).push(t)
  }
  return [...mapa.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dia, lista]) => ({
      dia,
      turnos: lista.sort((a, b) => new Date(b.entrada || b.salida) - new Date(a.entrada || a.salida)),
    }))
}
