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
// OJO: esto SOLO regula la CADENCIA de polling (fases startup/colación/cierre).
// Los turnos REALES y sus horarios los define Shoplogix y se derivan de los
// intervals en syncDay (deriveShiftGroups) — no de esta tabla. `currentShift`
// cubre las 24h, así el wakeup sincroniza siempre aunque los horarios cambien.

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
 * Offset UTC real de Chile continental (America/Santiago) para un instante dado.
 * Chile alterna UTC-3 (verano, ~sep→abr) y UTC-4 (invierno, ~abr→sep).
 *
 * IMPORTANTE: antes se usaba -3 FIJO. En invierno eso corría el reloj de pared
 * 1 hora: `currentDateKey()` (sync.js) cambiaba de día a las 07:00 REALES en vez
 * de las 08:00, y la última hora de la ventana del día anterior (07:00–08:00
 * wall) quedaba sin re-sincronizar — pérdida silenciosa de la cola de turnos
 * nocturnos que terminan pasadas las 07:00.
 */
/**
 * El instante actual expresado como HORA DE PLANTA, para mandárselo a Shoplogix.
 *
 * ⚠ Shoplogix interpreta el `start` que recibe como hora de planta, no como
 * UTC. Mandarle `new Date()` es preguntarle por un momento 4 horas en el
 * futuro. Verificado el 2026-08-19: a las 19:58 UTC la consulta devolvia la
 * ficha del turno de la noche (21:30→05:15) con TODO en cero — existe, tiene
 * horario, no tiene produccion, porque todavia no empezaba.
 *
 * Eso tuvo dos victimas silenciosas: el pulso (cpm siempre 0) y el contador
 * vivo del sync (`shoplogixLive`), que quedaban congelados apenas el desfase
 * dejaba de caer dentro de un turno real. Yal parecia sano de casualidad: su
 * Turno 3 va de 00:00 a 07:45, asi que con 4 horas de corrimiento seguia
 * aterrizando adentro.
 *
 * El resultado se formatea con `toShoplogixTime`, que usa getters UTC — por eso
 * hay que restar el offset y NO sumarlo.
 */
function ahoraEnPlanta(now = new Date()) {
  return new Date(now.getTime() - chileUtcOffsetHours(now) * 3600_000)
}

function chileUtcOffsetHours(now = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  const parts = {}
  for (const p of dtf.formatToParts(now)) parts[p.type] = p.value
  const wallAsUtcMs = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute),
  )
  // offset = UTC − wall clock (Chile: 3 en verano, 4 en invierno)
  return Math.round((now.getTime() - wallAsUtcMs) / 3600000)
}

/** Retorna Date "wall clock Chile" equivalente a `now` en UTC (DST-aware). */
function toChileWall(now) {
  return new Date(now.getTime() - chileUtcOffsetHours(now) * 3600 * 1000)
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
  ahoraEnPlanta,
  SHIFT_SCHEDULE,
  LUNCH_WINDOWS,
  SHIFT_DURATION_MIN,
  chileUtcOffsetHours,
  toChileWall,
  currentShift,
  isLunchWindow,
  nextPollDelaySec,
  pauseBetweenMachines,
}
