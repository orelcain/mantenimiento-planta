/**
 * turnoBrief — composición de los briefs de turno para Telegram (HTML).
 *
 * Funciones PURAS (sin Firestore/red) para que sean testeables con node:test:
 * el caller (functions/index.js) junta los datos desde los docs de turno y
 * este módulo solo redacta.
 *
 * Dos briefs:
 *  - INICIO de turno: qué viene — horario oficial, especie/trabajo en curso y
 *    target del turno (campos officialSchedule/currentJob/officialTargets del
 *    doc padre, capturados del rollup de Shoplogix — solo existen para el
 *    turno vigente al momento del sync; si faltan, el brief degrada con "—").
 *  - FIN de turno: qué pasó — piezas por Baader y total, % de cumplimiento vs
 *    target oficial, uptime promedio, paros macro/micro con minutos, y calidad
 *    P0% del Grader cuando hay Excel cargado (Planta Principal en temporada).
 */

/** ¿El state es una micro-detención? (mismo criterio que onShoplogixMachineUpdated) */
function esMicro(state) {
  return (state?.name || '').toLowerCase().includes('micro')
}

/**
 * Totales de paros de un array de states normalizados
 * ({type, name, reason, durationSec}).
 */
function resumenParos(states) {
  const out = { macroCount: 0, macroSec: 0, microCount: 0, microSec: 0 }
  for (const s of states || []) {
    if (s?.type !== 'downtime') continue
    const dur = s.durationSec || 0
    if (esMicro(s)) {
      out.microCount += 1
      out.microSec += dur
    } else {
      out.macroCount += 1
      out.macroSec += dur
    }
  }
  return out
}

/** "1.234" con separador chileno (Intl es-CL usa punto de miles). */
function fmtNum(n) {
  return Math.round(n || 0).toLocaleString('es-CL')
}

/** Segundos → "1h 23m" / "45m" / "30s". */
function fmtDur(sec) {
  if (!sec || sec <= 0) return '0m'
  if (sec < 60) return `${Math.round(sec)}s`
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

/** Date (wall-clock-as-UTC del proyecto) → "HH:MM". */
function fmtHora(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/**
 * Brief de INICIO de turno.
 * @param {object} p
 * @param {string} p.plantLabel   — "Chonchi" | "Yal"
 * @param {string} p.shiftId      — "Turno 2"
 * @param {{start: Date, end: Date}|null} p.officialSchedule
 * @param {{name: string, jobMaxRunRate: number|null}|null} p.currentJob
 * @param {Record<string, number>|null} p.officialTargets — machineid → ciclos
 * @returns {string} HTML para Telegram
 */
function componerBriefInicioTurno({ plantLabel, shiftId, officialSchedule, currentJob, officialTargets }) {
  const lineas = [`🟢 <b>Inicio de turno · ${plantLabel}</b>`, `${shiftId} ha arrancado`]
  if (officialSchedule?.start && officialSchedule?.end) {
    lineas.push(`🕐 Horario oficial: ${fmtHora(officialSchedule.start)} → ${fmtHora(officialSchedule.end)}`)
  }
  if (currentJob?.name) {
    const rate = currentJob.jobMaxRunRate ? ` (máx ${fmtNum(currentJob.jobMaxRunRate)} pph)` : ''
    lineas.push(`🐟 Especie: <b>${currentJob.name}</b>${rate}`)
  }
  const targets = Object.values(officialTargets || {})
  if (targets.length > 0) {
    const total = targets.reduce((a, b) => a + (b || 0), 0)
    if (total > 0) lineas.push(`🎯 Target del turno: <b>${fmtNum(total)}</b> ciclos (${targets.length} máquinas)`)
  }
  return lineas.join('\n')
}

/**
 * Brief de FIN de turno.
 * @param {object} p
 * @param {string} p.plantLabel
 * @param {string} p.shiftId
 * @param {string} p.dateKey
 * @param {Array<{machineName: string, totalCycles: number, shiftRuntime: number, states: Array}>} p.machines
 * @param {Record<string, number>|null} p.officialTargets — machineid → ciclos (se usa la SUMA)
 * @param {{name: string}|null} p.currentJob
 * @param {{pointZeroPct: number, totalPieces: number}|null} p.grader — calidad si hay Excel
 * @returns {string} HTML para Telegram
 */
function componerBriefFinTurno({ plantLabel, shiftId, dateKey, machines, officialTargets, currentJob, grader }) {
  const ms = machines || []
  const total = ms.reduce((a, m) => a + (m.totalCycles || 0), 0)

  const lineas = [`🏁 <b>Fin de turno · ${plantLabel}</b>`, `${shiftId} · ${dateKey}`]

  // Producción por máquina + total
  lineas.push('')
  for (const m of ms) {
    lineas.push(`  · ${m.machineName || '?'}: <b>${fmtNum(m.totalCycles)}</b> pz`)
  }
  let totalLinea = `📦 Total: <b>${fmtNum(total)}</b> piezas`
  const targetTotal = Object.values(officialTargets || {}).reduce((a, b) => a + (b || 0), 0)
  if (targetTotal > 0) {
    const pct = (total / targetTotal) * 100
    const emoji = pct >= 95 ? '✅' : pct >= 75 ? '🟡' : '🔴'
    totalLinea += ` · ${emoji} ${pct.toFixed(0)}% del target (${fmtNum(targetTotal)})`
  }
  lineas.push(totalLinea)
  if (currentJob?.name) lineas.push(`🐟 Especie: ${currentJob.name}`)

  // Uptime promedio (shiftRuntime ya excluye planned downtime del denominador)
  const runtimes = ms.map((m) => m.shiftRuntime).filter((r) => typeof r === 'number' && r > 0)
  if (runtimes.length > 0) {
    const avg = (runtimes.reduce((a, b) => a + b, 0) / runtimes.length) * 100
    lineas.push(`⚙️ Uptime promedio: <b>${avg.toFixed(0)}%</b>`)
  }

  // Paros del turno (suma de las máquinas)
  const paros = ms.reduce((acc, m) => {
    const r = resumenParos(m.states)
    acc.macroCount += r.macroCount; acc.macroSec += r.macroSec
    acc.microCount += r.microCount; acc.microSec += r.microSec
    return acc
  }, { macroCount: 0, macroSec: 0, microCount: 0, microSec: 0 })
  if (paros.macroCount > 0 || paros.microCount > 0) {
    const partes = []
    if (paros.macroCount > 0) partes.push(`⛔ ${paros.macroCount} paro${paros.macroCount === 1 ? '' : 's'} (${fmtDur(paros.macroSec)})`)
    if (paros.microCount > 0) partes.push(`⚡ ${paros.microCount} micro (${fmtDur(paros.microSec)})`)
    lineas.push(partes.join(' · '))
  } else {
    lineas.push('✅ Sin paros registrados')
  }

  // Calidad del Grader (solo cuando hay Excel cargado — Planta Principal)
  if (grader && typeof grader.pointZeroPct === 'number') {
    lineas.push(`🎚 Calidad (Grader): P0 <b>${grader.pointZeroPct.toFixed(2)}%</b> · ${fmtNum(grader.totalPieces)} pz clasificadas`)
  }

  return lineas.join('\n')
}

/**
 * Evalúa un delay-check de inicio de turno vencido (alerta "Sin piezas").
 *
 * En un día SIN proceso, Shoplogix igual crea los turnos programados: cada
 * máquina queda con 0 ciclos y un único estado idle de fondo ("Detencion",
 * type break o downtime según la planta). Eso NO es un turno demorado — es un
 * día sin producción, y alertar ahí es puro ruido. Actividad real = aparece
 * algún estado uptime, o los estados empiezan a cambiar (más de un estado por
 * máquina: la línea está intentando algo).
 *
 * @param {Object} p
 * @param {number} p.totalCycles   suma de ciclos de todas las máquinas
 * @param {Array<{states: Array}>} p.machines  máquinas del turno (states normalizados)
 * @param {Date}   p.checkAt       cuándo venció el check
 * @param {Date}   p.now
 * @param {number} [p.expireHours] horas tras checkAt para dar el turno por perdido
 * @returns {'ok'|'alert'|'wait'|'expire'}
 *   ok     — hay piezas: cerrar sin alertar
 *   expire — sin piezas y el turno quedó atrás: cerrar en silencio (día sin proceso)
 *   alert  — hay actividad en Shoplogix pero 0 piezas: alertar UNA vez y cerrar
 *   wait   — sin actividad todavía: dejar el check pendiente hasta que Shoplogix
 *            registre un cambio (piezas o estado nuevo fuera del idle de fondo)
 */
function evaluarDelayCheck({ totalCycles, machines, checkAt, now, expireHours = 12 }) {
  if (totalCycles > 0) return 'ok'
  if (now.getTime() - checkAt.getTime() >= expireHours * 3600 * 1000) return 'expire'
  const hayActividad = (machines || []).some((m) => {
    const states = m.states || []
    return states.some((s) => s?.type === 'uptime') || states.length > 1
  })
  return hayActividad ? 'alert' : 'wait'
}

module.exports = { componerBriefInicioTurno, componerBriefFinTurno, resumenParos, evaluarDelayCheck }
