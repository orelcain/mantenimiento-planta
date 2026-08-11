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
 *  - FIN de turno: qué pasó — piezas por máquina y total, % de cumplimiento vs
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
 *
 * ⚠ Se ignoran los states de duración CERO y los repetidos: Shoplogix emite
 * registros instantáneos que no son una detención de nada. Contarlos inflaba el
 * número casi a la mitad — el 10-ago Filete anunciaba 85 micro por Telegram
 * mientras el monitor público mostraba 58 para el mismo turno, y no había forma
 * de saber cuál creer. Las dos superficies tienen que contar igual.
 */
function resumenParos(states) {
  const out = { macroCount: 0, macroSec: 0, microCount: 0, microSec: 0 }
  const vistos = new Set()
  for (const s of states || []) {
    if (s?.type !== 'downtime') continue
    const dur = s.durationSec || 0
    if (dur <= 0) continue
    // Sin un inicio válido no se puede afirmar que dos paros sean el MISMO, así
    // que no se deduplica: mejor contar de más que borrar un paro real.
    const inicio = s.startAt?.toDate?.()?.getTime?.() ?? new Date(s.startAt || NaN).getTime()
    if (Number.isFinite(inicio)) {
      const clave = `${s.name || s.reason || ''}|${inicio}|${dur}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
    }
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
 * @param {string|null} [p.monitorUrl] — link público del monitor en vivo, para
 *   reenviar a Control de Producción. Va al final y con su propia explicación:
 *   quien recibe el brief tiene que saber que ESE link se puede compartir con
 *   gente sin cuenta, cosa que ningún otro link de la app permite.
 * @returns {string} HTML para Telegram
 */
function componerBriefInicioTurno({ plantLabel, shiftId, officialSchedule, currentJob, officialTargets, monitorUrl }) {
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
  if (monitorUrl) lineas.push('', lineaMonitor(monitorUrl))
  return lineas.join('\n')
}

/**
 * Línea con el link del monitor público. Una sola definición para el brief y
 * para el aviso suelto: el texto que explica QUÉ es ese link (compartible, sin
 * login, solo lectura) es lo que evita que se reenvíe creyendo otra cosa.
 */
function lineaMonitor(url) {
  return `📡 <a href="${url}">Monitor en vivo del turno</a> — para Control de Producción: sin login, solo mirar.`
}

/**
 * Aviso suelto con el link del monitor, para las líneas que NO tienen abierto
 * el canal Telegram de alertas (hoy, Filete). El link es lo que se pidió, así
 * que se manda igual; el resto de las alertas de esa línea siguen apagadas.
 * @returns {string} HTML para Telegram
 */
function componerAvisoMonitor({ plantLabel, shiftId, monitorUrl }) {
  return [
    `🟢 <b>Inicio de turno · ${plantLabel}</b>`,
    `${shiftId} ha arrancado`,
    '',
    lineaMonitor(monitorUrl),
  ].join('\n')
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
 * @param {{start: Date, end: Date}|null} [p.realSchedule] — ventana REAL derivada de
 *   intervals (scheduledStart/End del doc padre), NO la plantilla oficial de Shoplogix.
 *   El brief de inicio muestra "Horario oficial" (plantilla fija); acá mostramos el
 *   horario REAL en que el turno efectivamente corrió, para no confundir ambos.
 * @param {{start: Date, end: Date}|null} [p.effectiveSchedule] — de la primera a la
 *   última pieza (`effectiveStart/End` del doc padre). Se usa cuando el turno NO está
 *   acotado en Shoplogix: en Filete "Turno Dia" abarca 24 h y el brief decía
 *   "Horario real: 08:00 → 08:00", que no informa nada.
 * @param {number|null} [p.plannedTargetPieces] — piezas que planta pide por turno
 *   (target de PLANIFICACIÓN). Solo se usa si Shoplogix no mandó target oficial, y
 *   se rotula distinto: son dos cosas diferentes y confundirlas haría discutir el
 *   número equivocado en la reunión.
 * @param {{count: number, minutes: number}|null} [p.stopsWithoutCause] — paros que el
 *   sensor midió y siguen sin causa anotada. El brief es el momento en que alguien
 *   todavía se acuerda de lo que pasó: nombrarlos es lo que hace que se anoten.
 * @returns {string} HTML para Telegram
 */
/**
 * @param {Object} [p.outside] — producción que la línea hizo FUERA del horario
 *   del turno, ya sumada dentro de `machines` (ver checkShiftEndBriefs).
 *   `{ pieces, start, end }`. Solo sirve para mostrar el desglose: sin él, el
 *   total sería el mismo pero nadie entendería por qué no coincide con el
 *   horario del turno que muestra Shoplogix.
 */
function componerBriefFinTurno({ plantLabel, shiftId, dateKey, machines, officialTargets, currentJob, grader, realSchedule, effectiveSchedule, stopsWithoutCause, plannedTargetPieces, outside }) {
  const ms = machines || []
  const total = ms.reduce((a, m) => a + (m.totalCycles || 0), 0)

  const lineas = [`🏁 <b>Fin de turno · ${plantLabel}</b>`, `${shiftId} · ${dateKey}`]
  // Si la ventana del turno es mucho más ancha que la operación real, el turno
  // no está acotado en Shoplogix y mostrarla engaña ("08:00 → 08:00").
  const durMin = (w) => (w?.start && w?.end ? (w.end.getTime() - w.start.getTime()) / 60_000 : 0)
  const efeMin = durMin(effectiveSchedule)
  const progMin = durMin(realSchedule)
  const usarEfectiva = efeMin > 0 && (progMin <= 0 || efeMin < progMin * 0.75)
  // Con cola, el horario del turno MIENTE: Shoplogix cerró 15:30 y la línea
  // trabajó hasta las 16:30. Anunciar "07:45 → 15:30" arriba y "505 piezas
  // después" abajo se lee como un error del mensaje.
  const finReal = outside?.end && (!realSchedule?.end || outside.end > realSchedule.end)
    ? outside.end
    : realSchedule?.end
  if (usarEfectiva) {
    lineas.push(`🕐 Operación real: ${fmtHora(effectiveSchedule.start)} → ${fmtHora(effectiveSchedule.end)}`)
  } else if (realSchedule?.start && finReal) {
    lineas.push(`🕐 Horario real: ${fmtHora(realSchedule.start)} → ${fmtHora(finReal)}`)
  }

  // Producción por máquina + total
  lineas.push('')
  for (const m of ms) {
    lineas.push(`  · ${m.machineName || '?'}: <b>${fmtNum(m.totalCycles)}</b> pz`)
  }
  let totalLinea = `📦 Total: <b>${fmtNum(total)}</b> piezas`
  const targetTotal = Object.values(officialTargets || {}).reduce((a, b) => a + (b || 0), 0)
  const planificado = Number(plannedTargetPieces) > 0 ? Number(plannedTargetPieces) : 0
  // El target OFICIAL de Shoplogix manda; el planificado es el respaldo para las
  // áreas donde el rollup no llega (Filete). Se rotulan distinto a propósito.
  const refTotal = targetTotal > 0 ? targetTotal : planificado
  if (refTotal > 0) {
    const pct = (total / refTotal) * 100
    const emoji = pct >= 95 ? '✅' : pct >= 75 ? '🟡' : '🔴'
    const etiqueta = targetTotal > 0 ? 'del target' : 'de lo planificado'
    totalLinea += ` · ${emoji} ${pct.toFixed(0)}% ${etiqueta} (${fmtNum(refTotal)})`
  }
  lineas.push(totalLinea)
  // Desglose de la cola: el turno "cerró" a una hora y la línea siguió. Sin esta
  // línea el total no cuadra con el horario de arriba y parece un error.
  const fueraPz = Number(outside?.pieces) || 0
  if (fueraPz > 0) {
    const dentro = total - fueraPz
    const rango = outside.start && outside.end
      ? ` (${fmtHora(outside.start)}–${fmtHora(outside.end)})`
      : ''
    lineas.push(`   ↳ ${fmtNum(dentro)} dentro del horario + <b>${fmtNum(fueraPz)}</b> después${rango}`)
  }
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
  if (stopsWithoutCause && stopsWithoutCause.count > 0) {
    const n = stopsWithoutCause.count
    lineas.push(
      `📝 <b>${n}</b> paro${n === 1 ? '' : 's'} sin causa anotada` +
      (stopsWithoutCause.minutes > 0 ? ` (${fmtDur(stopsWithoutCause.minutes * 60)})` : '') +
      ' — anotala en Análisis de Turno',
    )
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
 * Ciclo de vida completo del check (F3, mensaje de recuperación):
 *   pending → wait → alert (mensaje "Sin piezas", el check NO se cierra) →
 *   wait (post-alerta, sin re-alertar) → recovered (mensaje "✅ arrancó") → cierra
 *   El único estado que re-evalúa actividad (uptime/estados cambiando) es el
 *   PRIMER paso a 'alert'; una vez alertado, `alerted:true` hace que 'wait'
 *   ignore la actividad y solo mire `totalCycles` — no tiene sentido "des-alertar"
 *   por perder actividad después de ya haber avisado.
 *
 * @param {Object} p
 * @param {number} p.totalCycles   suma de ciclos de todas las máquinas
 * @param {Array<{states: Array}>} p.machines  máquinas del turno (states normalizados)
 * @param {Date}   p.checkAt       cuándo venció el check
 * @param {Date}   p.now
 * @param {boolean} [p.alerted]    true si este check YA emitió la alerta "Sin piezas"
 *   en una corrida anterior (sigue pendiente esperando la recuperación, no cerrado)
 * @param {number} [p.expireHours] horas tras checkAt para dar el turno por perdido
 * @returns {'ok'|'alert'|'wait'|'expire'|'recovered'}
 *   ok        — nunca alertó y ya hay piezas (arrancó dentro del margen): cerrar sin mensaje
 *   expire    — sin piezas y el check lleva demasiado tiempo abierto (>expireHours desde
 *               checkAt): cerrar en silencio. Aplica ASÍ HAYA ALERTADO — sin este tope el
 *               ciclo de recuperación quedaría esperando piezas para siempre en un turno
 *               que se perdió del todo, recreando el backlog eterno que motivó F3
 *               (ver incidente 2026-07-17, PR #221).
 *   alert     — primera vez con actividad pero 0 piezas: alertar y SEGUIR pendiente
 *               (para poder emitir la recuperación cuando arranque)
 *   wait      — sin novedad: dejar el check pendiente
 *   recovered — ya había alertado y ahora hay piezas: mensaje de recuperación y cerrar
 */
function evaluarDelayCheck({ totalCycles, machines, checkAt, now, alerted = false, expireHours = 12 }) {
  if (totalCycles > 0) return alerted ? 'recovered' : 'ok'
  if (now.getTime() - checkAt.getTime() >= expireHours * 3600 * 1000) return 'expire'
  if (alerted) return 'wait' // ya avisó una vez; solo esperar piezas, no re-evaluar actividad
  const hayActividad = (machines || []).some((m) => {
    const states = m.states || []
    return states.some((s) => s?.type === 'uptime') || states.length > 1
  })
  return hayActividad ? 'alert' : 'wait'
}

/**
 * Mensaje de recuperación tras una alerta "Sin piezas" — cierra el ciclo: el
 * turno arrancó tarde pero arrancó. `delayMinutes` queda persistido en el
 * check (ver checkShiftStartDelays) como dato crudo para poder reportar
 * "retraso de arranque por turno" más adelante.
 */
function componerMensajeRecuperacion({ plantLabel, shiftId, delayMinutes }) {
  return `✅ <b>Arrancó</b> — ${plantLabel}\n${shiftId} · demoró <b>${delayMinutes} min</b> desde el horario programado`
}

module.exports = {
  componerBriefInicioTurno,
  componerAvisoMonitor,
  componerBriefFinTurno,
  resumenParos,
  evaluarDelayCheck,
  componerMensajeRecuperacion,
}
