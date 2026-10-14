/**
 * guardiaTurnos — vigila en vivo que el horario del turno que muestra la app
 * sea el que dice Shoplogix, y avisa por Telegram si se descuadra.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Regla de Orel: «Shoplogix manda con el horario». Se rompió dos veces por la
 * misma causa: el arreglo de julio (#160) fue de PANTALLA y cada superficie
 * nueva volvió a mostrar el dato malo. El 28-09-2026 el Turno 1 Lunes de
 * Chonchi (00:00→07:15) se veía «hasta las 04:31», y el monitor estimaba el
 * cierre del Turno 2 (09:15→17:00) a las 14:44. En los dos casos lo vio Orel en
 * planta, no un test. Los tests protegen el código; esto vigila los DATOS: si
 * Shoplogix cambia algo mañana, el aviso llega antes de que alguien lo note.
 *
 * ── Las tres reglas ─────────────────────────────────────────────────────────
 *   1. CIERRE EN CURSO   con el turno corriendo, el cierre guardado es el del
 *                        horario oficial (ver `resolveShiftWindow`).
 *   2. MONITOR           si el turno tiene horario oficial, el cierre del
 *                        monitor sale de Shoplogix y no de una estimación.
 *   3. SIN HORARIO       el turno que está produciendo no tiene horario oficial
 *                        (Shoplogix describe OTRO turno, o lo renombraron).
 *
 * ── Costo ───────────────────────────────────────────────────────────────────
 * Las reglas son funciones puras sobre lo que el sync y el monitor ya tienen en
 * memoria: cero lecturas. Solo cuando hay un hallazgo se lee/escribe UN doc
 * (`system/shoplogixGuardiaTurnos`) para no repetir el aviso: el mismo
 * hallazgo se avisa una vez cada 6 h.
 *
 * ── Escalas de tiempo ───────────────────────────────────────────────────────
 * Todo lo que viene de intervals y del rollup está en wall-clock-as-UTC; `nowWall`
 * tiene que venir en la misma escala (`toChileWall`). Nunca comparar con
 * `Date.now()` sin convertir.
 */

/** Minutos desde la última pieza para considerar que el turno sigue produciendo. */
const PRODUCIENDO_MIN = 20
/** Producción mínima antes de exigir horario oficial: el rollup puede tardar en cambiar de turno. */
const GRACIA_ARRANQUE_MIN = 30
/** El mismo hallazgo no se repite antes de esto. */
const DEDUPE_MS = 6 * 3600_000
const MAX_TURNO_MS = 16 * 3600_000

const aMs = (t) => {
  if (!t) return null
  if (t instanceof Date) return Number.isNaN(t.getTime()) ? null : t.getTime()
  if (typeof t.toDate === 'function') return t.toDate().getTime()
  const ms = new Date(t).getTime()
  return Number.isNaN(ms) ? null : ms
}
const hhmm = (ms) => (ms == null ? '--:--' : new Date(ms).toISOString().slice(11, 16))

/** Horario oficial que describe ESTE turno (mismas vallas que el sync), o null. */
function oficialCoherente(official, scheduledStartMs) {
  const ini = aMs(official?.start)
  const fin = aMs(official?.end)
  if (ini == null || fin == null) return null
  if (!(fin - ini > 0 && fin - ini <= MAX_TURNO_MS)) return null
  if (scheduledStartMs != null && Math.abs(ini - scheduledStartMs) > 12 * 3600_000) return null
  return { ini, fin }
}

/**
 * Reglas 1 y 3 sobre los turnos que el sync acaba de escribir en la ventana VIVA.
 *
 * @param {object} p
 * @param {Array<{docId: string, shiftId: string, scheduledStart: *, scheduledEnd: *, effectiveEnd: *, officialSchedule: *}>} p.turnos
 * @param {{shiftLabel: string}|null} p.rollup — null si no se pudo leer: entonces la regla 3 no opina.
 * @param {Date} p.nowWall
 * @returns {Array<{clave: string, regla: string, texto: string}>}
 */
function revisarTurnosDelSync({ plantSlug, turnos, rollup, nowWall }) {
  const ahora = aMs(nowWall)
  if (ahora == null) return []
  const out = []
  const conNombre = turnos.filter((t) => !/unscheduled/i.test(t.shiftId))

  // 1. CIERRE EN CURSO
  for (const t of conNombre) {
    const ini = aMs(t.scheduledStart)
    const fin = aMs(t.scheduledEnd)
    const of = oficialCoherente(t.officialSchedule, ini)
    if (!of || fin == null || ahora >= of.fin) continue   // sin oficial, o ya cerró
    if (fin !== of.fin) {
      out.push({
        clave: `${plantSlug}|${t.docId}|cierre-en-curso`,
        regla: 'cierre-en-curso',
        texto: `${plantSlug} · ${t.shiftId}: en curso, Shoplogix lo programa ${hhmm(of.ini)}→${hhmm(of.fin)} y la app guarda ${hhmm(ini)}→${hhmm(fin)}.`,
      })
    }
  }

  // 3. SIN HORARIO — solo el turno con nombre MÁS RECIENTE que siga produciendo:
  // en el cambio de turno el anterior pierde el rollup a propósito.
  if (rollup) {
    const vivo = [...conNombre]
      .sort((a, b) => (aMs(b.scheduledStart) ?? 0) - (aMs(a.scheduledStart) ?? 0))[0]
    const ini = aMs(vivo?.scheduledStart)
    const ultima = aMs(vivo?.effectiveEnd)
    const produciendo = ultima != null && ahora - ultima <= PRODUCIENDO_MIN * 60_000
    const yaAnduvo = ini != null && ultima != null && ultima - ini >= GRACIA_ARRANQUE_MIN * 60_000
    if (vivo && produciendo && yaAnduvo && !oficialCoherente(vivo.officialSchedule, ini)) {
      out.push({
        clave: `${plantSlug}|${vivo.docId}|sin-horario`,
        regla: 'sin-horario',
        texto: `${plantSlug} · ${vivo.shiftId}: está produciendo desde ${hhmm(ini)} y no tiene horario oficial — `
          + `Shoplogix describe «${rollup.shiftLabel ?? '¿?'}». ¿Renombraron el turno o no está configurado?`,
      })
    }
  }
  return out
}

/**
 * Regla 2 sobre lo que el monitor público acaba de publicar.
 *
 * @param {object} p
 * @param {string} p.shiftDocId — turno que muestra el monitor como actual
 * @param {object} p.live — el `live` publicado
 * @param {object} p.parent — doc padre de ese turno
 */
function revisarMonitor({ plantSlug, shiftDocId, live, parent }) {
  if (!live || live.shiftClosed) return []
  const of = oficialCoherente(parent?.officialSchedule, aMs(parent?.scheduledStart))
  if (!of || live.plannedEndSource === 'shoplogix') return []
  return [{
    clave: `${plantSlug}|${shiftDocId}|monitor`,
    regla: 'monitor',
    texto: `${plantSlug} · ${shiftDocId.slice(11)}: el monitor estima el cierre ${hhmm(aMs(live.plannedEnd))} `
      + `(${live.plannedEndSource ?? 'sin fuente'}) y Shoplogix lo programa ${hhmm(of.fin)}.`,
  }]
}

/**
 * Avisa por Telegram lo que no se haya avisado en las últimas 6 h. Sin
 * hallazgos no toca Firestore.
 *
 * @param {object} p
 * @param {FirebaseFirestore.Firestore} p.db
 * @param {(texto: string) => Promise<*>} p.enviar
 * @param {Array<{clave: string, texto: string}>} p.hallazgos
 * @returns {Promise<number>} cuántos se avisaron
 */
async function avisarHallazgos({ db, enviar, hallazgos, ahoraMs = Date.now() }) {
  if (!hallazgos.length) return 0
  const ref = db.doc('system/shoplogixGuardiaTurnos')
  const snap = await ref.get()
  const vistos = (snap.exists && snap.data().vistos) || {}
  const nuevos = hallazgos.filter((h) => !(ahoraMs - (Date.parse(vistos[h.clave] ?? '') || 0) < DEDUPE_MS))
  if (!nuevos.length) return 0

  const sello = new Date(ahoraMs).toISOString()
  // Se poda lo viejo para que el doc no crezca para siempre.
  const vigentes = Object.fromEntries(
    Object.entries(vistos).filter(([, iso]) => ahoraMs - (Date.parse(iso) || 0) < 7 * 86_400_000),
  )
  for (const h of nuevos) vigentes[h.clave] = sello
  await ref.set({ vistos: vigentes }, { merge: false })

  await enviar(
    '🕐 <b>Horario de turno descuadrado con Shoplogix</b>\n\n'
    + nuevos.map((h) => `• ${escaparHtml(h.texto)}`).join('\n')
    + '\n\n<i>Regla: el horario lo manda Shoplogix. Este aviso no se repite por 6 h.</i>',
  )
  return nuevos.length
}

const escaparHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

module.exports = { revisarTurnosDelSync, revisarMonitor, avisarHallazgos, oficialCoherente }
