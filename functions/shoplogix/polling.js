/**
 * Scheduler "human-like" para polling de Shoplogix.
 *
 * En vez de polling fijo cada 5 min (detectable como bot), calculamos
 * intervalos variables que simulan un operador humano revisando el whiteboard.
 *
 * Principios (ver docs/SHOPLOGIX_INTEGRATION_PLAN.md §4):
 *   1. Solo polling durante horas de turno (07-19 día, 19-07 noche).
 *   2. Intervalo base depende de la fase del turno:
 *      - Startup (0-90 min):     10 min base
 *      - Actividad normal:        5 min
 *      - Colación:               20 min
 *      - Cierre (últimos 60 min): 3 min
 *      - Fuera de turno:         60 min
 *   3. Jitter ±30% en cada intervalo.
 *   4. Desfase: nunca minutos múltiplos de 5 (ej. :03, :17, :42).
 *   5. Entre máquinas: pausa 1.5-3.5s.
 */

// ── Configuración de turnos (Chile, wall-clock local) ────────────────────────

const SHIFT_SCHEDULE = {
  'Turno día':   { startH: 7,  startM: 0, endH: 19, endM: 0 },
  'Turno noche': { startH: 19, startM: 0, endH: 7,  endM: 0 }, // cruza medianoche
}

/** Ventanas de colación (minutos absolutos desde inicio turno). */
const LUNCH_WINDOWS = {
  'Turno día':   { startMin: 5 * 60 + 30, endMin: 6 * 60 + 30 },   // 12:30-13:30
  'Turno noche': { startMin: 5 * 60 + 30, endMin: 6 * 60 + 30 },   // 00:30-01:30
}

const SHIFT_DURATION_MIN = 12 * 60

/**
 * Chile es UTC-3 (verano) o UTC-4 (invierno). Para simplicidad usamos -3 fijo
 * (OK para turnos de planta; la diferencia de 1h rara vez afecta decisiones
 * de polling).
 */
const CHILE_UTC_OFFSET_HOURS = 3

/** Retorna Date "wall clock Chile" equivalente a `now` en UTC. */
function toChileWall(now) {
  return new Date(now.getTime() - CHILE_UTC_OFFSET_HOURS * 3600 * 1000)
}

/**
 * Determina el turno activo dado `now`. Retorna null si estamos entre turnos
 * (ventana corta 07:00 y 19:00 es el cambio).
 */
function currentShift(now = new Date()) {
  const w = toChileWall(now)
  const h = w.getUTCHours()
  const m = w.getUTCMinutes()
  const minutesOfDay = h * 60 + m

  // Turno día: 07:00-19:00 local
  if (minutesOfDay >= 7 * 60 && minutesOfDay < 19 * 60) {
    const startMin = 7 * 60
    return {
      shiftId: 'Turno día',
      minutesIntoShift: minutesOfDay - startMin,
      totalShiftMin: SHIFT_DURATION_MIN,
    }
  }

  // Turno noche: 19:00-07:00 (cruza medianoche)
  if (minutesOfDay >= 19 * 60) {
    const startMin = 19 * 60
    return {
      shiftId: 'Turno noche',
      minutesIntoShift: minutesOfDay - startMin,
      totalShiftMin: SHIFT_DURATION_MIN,
    }
  }
  // Madrugada 00:00-06:59
  if (minutesOfDay < 7 * 60) {
    const minutesIntoShift = (5 * 60) + minutesOfDay  // 5h desde 19:00 hasta 00:00
    return {
      shiftId: 'Turno noche',
      minutesIntoShift,
      totalShiftMin: SHIFT_DURATION_MIN,
    }
  }
  return null
}

function isLunchWindow(ctx) {
  const w = LUNCH_WINDOWS[ctx.shiftId]
  if (!w) return false
  return ctx.minutesIntoShift >= w.startMin && ctx.minutesIntoShift < w.endMin
}

/**
 * Calcula delay hasta el próximo poll, en segundos.
 * Retorna número entero entre [60, 3600].
 */
function nextPollDelaySec(now = new Date()) {
  const ctx = currentShift(now)

  // Fuera de turno: sleep largo
  if (!ctx) return 60 * 60  // 1h

  const minInto = ctx.minutesIntoShift
  const totalMin = ctx.totalShiftMin

  let baseMin
  if (minInto < 90)                     baseMin = 10  // startup
  else if (minInto > totalMin - 60)     baseMin =  3  // cierre
  else if (isLunchWindow(ctx))          baseMin = 20  // colación
  else                                  baseMin =  5  // actividad

  // Jitter ±30%
  const jitter = (Math.random() - 0.5) * 0.6
  const delayMin = baseMin * (1 + jitter)

  // Offset en segundos para evitar boundaries :00 :05 :10 :15...
  const offsetSec = (Math.floor(Math.random() * 4) + 1) * 60  // 60-240s

  const total = Math.round(delayMin * 60 + offsetSec)
  return Math.max(60, Math.min(3600, total))
}

/**
 * Pausa aleatoria 1.5-3.5 segundos entre queries a máquinas distintas.
 */
async function pauseBetweenMachines() {
  const ms = 1500 + Math.random() * 2000
  return new Promise(r => setTimeout(r, ms))
}

module.exports = {
  SHIFT_SCHEDULE,
  LUNCH_WINDOWS,
  SHIFT_DURATION_MIN,
  toChileWall,
  currentShift,
  isLunchWindow,
  nextPollDelaySec,
  pauseBetweenMachines,
}
