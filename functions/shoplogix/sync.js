/**
 * Orquestador de sync Shoplogix → Firestore.
 *
 * Flujo:
 *   1. Lee cookie de Secret Manager (SHOPLOGIX_COOKIE).
 *   2. Determina turno actual (o el que le pidan explícitamente).
 *   3. Para cada máquina (3 Baaders Chonchi):
 *      a. GET whiteboardproduction
 *      b. GET whiteboardsummary
 *      c. Normaliza
 *      d. Escribe a Firestore con merge
 *      e. Pausa "human-like" entre máquinas
 *   4. Retorna resumen del sync.
 *
 * Errores:
 *   - AUTH_EXPIRED → log crítico + alerta (requiere refrescar cookie manual)
 *   - Network → reintenta hasta 2 veces con backoff
 *   - Otros → skip esa máquina y continuar
 */

const { CHONCHI_EVISCERADORAS } = require('./machines')
const { queryShoplogix } = require('./client')
const { normalizeShift } = require('./normalizer')
const { toShoplogixTime } = require('./time')
const { pauseBetweenMachines, currentShift } = require('./polling')

const PLANT_SLUG = 'chonchi'

/** Calcula start/end del turno en formato Shoplogix para una fecha+turno dados. */
function shiftWindow(dateKey, shiftId) {
  // dateKey: "2026-02-26"
  // Turno día: 09:00 local → 18:15 local. Pero Shoplogix guarda en UTC que
  // visualmente coincide con hora local (ver docs §8).
  // Por simpleza: consulta 09:00-22:00 UTC del dateKey — suficiente overlap.
  const [y, m, d] = dateKey.split('-').map(Number)
  let startH = 9, endH = 22
  if (shiftId === 'Turno noche') {
    startH = 19
    endH = 31  // +1 día 07:00 → 31:00
  }
  const start = new Date(Date.UTC(y, m - 1, d, startH, 0, 0))
  const end   = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + endH * 3600 * 1000)
  return {
    start: toShoplogixTime(start),
    end:   toShoplogixTime(end),
  }
}

/**
 * Determina dateKey + shiftId para "ahora mismo" (si no se provee override).
 */
function currentShiftKey(now = new Date()) {
  const ctx = currentShift(now)
  if (!ctx) return null
  // dateKey = fecha local del inicio del turno
  const chileNow = new Date(now.getTime() - 3 * 3600 * 1000)
  // Si es turno noche y estamos en madrugada, el dateKey es el día anterior
  let dateDay = chileNow.getUTCDate()
  if (ctx.shiftId === 'Turno noche' && chileNow.getUTCHours() < 7) {
    dateDay = new Date(chileNow.getTime() - 24 * 3600 * 1000).getUTCDate()
  }
  const year = chileNow.getUTCFullYear()
  const month = chileNow.getUTCMonth() + 1
  const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(dateDay).padStart(2, '0')}`
  return { dateKey, shiftId: ctx.shiftId }
}

/**
 * Sync completo de un turno — trae data de las 3 Evisceradoras y escribe a Firestore.
 *
 * @param {object} deps
 * @param {import('firebase-admin/firestore').Firestore} deps.db
 * @param {string} deps.cookie
 * @param {string} [deps.dateKey]  — override; default: turno actual
 * @param {string} [deps.shiftId]  — override
 * @param {function} [deps.logger] — logger (default: console)
 */
async function syncShift({ db, cookie, dateKey, shiftId, logger = console }) {
  if (!cookie) throw new Error('[sync] cookie vacía')
  let key = { dateKey, shiftId }
  if (!key.dateKey || !key.shiftId) {
    const current = currentShiftKey()
    if (!current) {
      logger.info('[shoplogix-sync] Fuera de turno, skip')
      return { skipped: true, reason: 'outside-shift' }
    }
    key = current
  }

  const window = shiftWindow(key.dateKey, key.shiftId)
  logger.info(`[shoplogix-sync] Inicio ${key.dateKey} ${key.shiftId} (${window.start}→${window.end})`)

  const results = []
  const syncedAt = new Date()

  for (const machine of CHONCHI_EVISCERADORAS) {
    try {
      const production = await queryShoplogix({
        cookie,
        type: 'whiteboardproduction',
        params: {
          machines: machine.machineid,
          start: window.start,
          end: window.end,
          minutes: 5,
        },
      })

      await pauseBetweenMachines()

      const summary = await queryShoplogix({
        cookie,
        type: 'whiteboardsummary',
        params: {
          machines: machine.machineid,
          start: window.start,
          end: window.end,
        },
      })

      const prodMachine = production?.machines?.[0]
      const sumMachine  = summary?.machines?.[0]

      if (!prodMachine || !sumMachine) {
        logger.warn(`[shoplogix-sync] ${machine.name}: respuesta vacía`)
        results.push({ machineid: machine.machineid, status: 'empty' })
        continue
      }

      const doc = normalizeShift({
        production: prodMachine,
        summary: sumMachine,
        dateKey: key.dateKey,
        shiftId: key.shiftId,
        syncedAt,
      })

      const ref = db.doc(
        `shoplogix/${PLANT_SLUG}/shifts/${key.dateKey}_${key.shiftId}/machines/${machine.machineid}`,
      )
      await ref.set(doc, { merge: true })

      results.push({
        machineid: machine.machineid,
        name: machine.name,
        status: 'ok',
        intervals: doc.intervals.length,
        states: doc.states.length,
        totalCycles: doc.totalCycles,
      })
    } catch (err) {
      if (err.code === 'AUTH_EXPIRED') {
        logger.error(`[shoplogix-sync] AUTH_EXPIRED — aborta sync`, { err: err.message })
        throw err  // propaga — el wrapper decide si alertar
      }
      logger.error(`[shoplogix-sync] ${machine.name} error`, { err: err.message })
      results.push({ machineid: machine.machineid, status: 'error', error: err.message })
    }

    await pauseBetweenMachines()
  }

  // Metadatos del sync al doc padre
  await db.doc(`shoplogix/${PLANT_SLUG}/shifts/${key.dateKey}_${key.shiftId}`).set({
    dateKey: key.dateKey,
    shiftId: key.shiftId,
    lastSyncAt: syncedAt,
    machines: results,
  }, { merge: true })

  logger.info(`[shoplogix-sync] Fin ${key.dateKey} ${key.shiftId}`, { results })
  return { dateKey: key.dateKey, shiftId: key.shiftId, syncedAt, results }
}

module.exports = {
  PLANT_SLUG,
  shiftWindow,
  currentShiftKey,
  syncShift,
}
