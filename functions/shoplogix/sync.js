/**
 * Orquestador de sync Shoplogix → Firestore.
 *
 * Dos modos de operación:
 *
 *   syncDay (nuevo — recomendado):
 *     Consulta el día completo (00:00-24:00) una sola vez por planta y deriva
 *     los turnos reales a partir del campo `shift` en los intervalos de producción.
 *     Escribe un doc por turno real: `${dateKey}_Turno 1`, `${dateKey}_Turno 2`, etc.
 *     Soporta cualquier número de turnos (2 en Chonchi, 3 en Yal).
 *
 *   syncShift (legado — backward compat):
 *     Consulta con ventana hardcodeada (09:00-22:00 o 19:00-07:00) y escribe
 *     `${dateKey}_Turno día` o `${dateKey}_Turno noche`. Mantener para el
 *     trigger HTTP de testing/backfill cuando se pasa shiftId explícitamente.
 *
 * Errores:
 *   - AUTH_EXPIRED → propaga (el wrapper decide si alertar)
 *   - Network → skip esa máquina y continuar
 */

const { PLANT_MACHINES } = require('./machines')
const { queryShoplogix, queryShoplogixBearer } = require('./client')
const { normalizeShift } = require('./normalizer')
const { toShoplogixTime, parseShoplogixTime } = require('./time')
const { pauseBetweenMachines, currentShift } = require('./polling')

/** Plantas activas — usada en wakeup scheduler. */
const ACTIVE_PLANTS = Object.freeze(['chonchi', 'yal'])

// ── Helpers de ventana temporal ───────────────────────────────────────────────

/**
 * Ventana de consulta para el día completo (wall-clock-as-UTC).
 * Ancla en 08:00 en lugar de 00:00: esto asegura que turnos nocturnos que
 * cruzan medianoche (ej. Yal Turno 3: ~22:00→07:45) queden completamente
 * dentro de la ventana del día al que pertenecen, y no aparezcan como
 * remanente espurio en la ventana del día siguiente.
 *
 * Ejemplo para dateKey = "2026-04-28":
 *   window = 08:00 Apr 28 → 08:00 Apr 29
 *   Turno 2 (09:00-22:00 Apr 28) ← dentro ✓
 *   Turno 3 (~22:00 Apr 28 → 07:45 Apr 29) ← dentro ✓
 *
 * Ejemplo para dateKey = "2026-04-29":
 *   window = 08:00 Apr 29 → 08:00 Apr 30
 *   Turno 2 (09:00-22:00 Apr 29) ← dentro ✓ (sin remanente de Apr 28)
 */
function fullDayWindow(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d,     8, 0, 0))
  const end   = new Date(Date.UTC(y, m - 1, d + 1, 8, 0, 0))
  return { start: toShoplogixTime(start), end: toShoplogixTime(end) }
}

/**
 * Ventana hardcodeada (legado) para syncShift.
 * Sigue siendo necesaria para backfill manual de turnos específicos.
 */
function shiftWindow(dateKey, shiftId) {
  const [y, m, d] = dateKey.split('-').map(Number)
  let startH = 9, endH = 22
  if (shiftId === 'Turno noche') { startH = 19; endH = 31 }
  const start = new Date(Date.UTC(y, m - 1, d, startH, 0, 0))
  const end   = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + endH * 3600 * 1000)
  return { start: toShoplogixTime(start), end: toShoplogixTime(end) }
}

/**
 * Deriva turnos reales desde el campo `shift` de los intervalos de producción.
 * Descarta "Unscheduled". Retorna array ordenado por scheduledStart.
 *
 * @param {Array} machineProductionResponses — array de objetos raw de la API
 *   (uno por máquina), cada uno con `.machineProduction[]`.
 * @returns {Array<{shiftId, scheduledStart, scheduledEnd}>}
 */
function deriveShiftGroups(machineProductionResponses) {
  // Usar la primera máquina que tenga intervalos (todas deberían tener los mismos shifts)
  const firstWithIntervals = machineProductionResponses.find(r => r?.machineProduction?.length > 0)
  if (!firstWithIntervals) return []

  const perShift = {}
  for (const iv of firstWithIntervals.machineProduction) {
    if (!iv.shift || iv.shift === 'Unscheduled') continue
    if (!perShift[iv.shift]) {
      perShift[iv.shift] = { first: iv, last: iv }
    } else {
      perShift[iv.shift].last = iv
    }
  }

  return Object.entries(perShift)
    .map(([shiftId, { first, last }]) => ({
      shiftId,
      scheduledStart: parseShoplogixTime(first.start),
      scheduledEnd:   parseShoplogixTime(last.end),
    }))
    .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime())
}

/** Determina el dateKey de "hoy" en Chile (UTC-3 fijo). */
function currentDateKey(now = new Date()) {
  const chileNow = new Date(now.getTime() - 3 * 3600 * 1000)
  const y = chileNow.getUTCFullYear()
  const m = String(chileNow.getUTCMonth() + 1).padStart(2, '0')
  const d = String(chileNow.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Determina dateKey + shiftId para "ahora mismo" (legado, para syncShift).
 */
function currentShiftKey(now = new Date()) {
  const ctx = currentShift(now)
  if (!ctx) return null
  const chileNow = new Date(now.getTime() - 3 * 3600 * 1000)
  let dateDay = chileNow.getUTCDate()
  if (ctx.shiftId === 'Turno noche' && chileNow.getUTCHours() < 7) {
    dateDay = new Date(chileNow.getTime() - 24 * 3600 * 1000).getUTCDate()
  }
  const year = chileNow.getUTCFullYear()
  const month = chileNow.getUTCMonth() + 1
  const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(dateDay).padStart(2, '0')}`
  return { dateKey, shiftId: ctx.shiftId }
}

// ── syncDay (nuevo) ───────────────────────────────────────────────────────────

/**
 * Sync de un día completo — detecta turnos reales desde intervals.shift.
 *
 * Ventajas sobre syncShift:
 *   - No hardcodea ventanas de turno (funciona para 2 o 3 turnos).
 *   - shiftStart/End correctos (no los bounds de consulta).
 *   - States filtrados al rango real del turno.
 *   - Doc IDs reflejan nombres reales de Shoplogix ("Turno 1", "Turno 2", etc.)
 *
 * @param {object} opts
 * @param {import('firebase-admin/firestore').Firestore} opts.db
 * @param {string} [opts.accessToken] — Bearer OAuth
 * @param {string} [opts.cookie]      — Cookie legado
 * @param {string} [opts.plantSlug]   — 'chonchi' | 'yal'
 * @param {string} [opts.dateKey]     — "YYYY-MM-DD"; default: hoy en Chile
 * @param {function} [opts.logger]
 */
async function syncDay({ db, accessToken, cookie, plantSlug = 'chonchi', dateKey, logger = console }) {
  if (!accessToken && !cookie) throw new Error('[syncDay] se requiere accessToken (Bearer) o cookie (legacy)')

  const machines = PLANT_MACHINES[plantSlug]
  if (!machines) throw new Error(`[syncDay] plantSlug desconocido: "${plantSlug}"`)

  const query = accessToken
    ? (opts) => queryShoplogixBearer({ accessToken, ...opts })
    : (opts) => queryShoplogix({ cookie, ...opts })

  if (!dateKey) {
    // Fuera de turno: igual sincronizamos el día actual para capturar data
    // de shifts que ya empezaron o están por empezar.
    dateKey = currentDateKey()
  }

  const window = fullDayWindow(dateKey)
  logger.info(`[shoplogix-syncDay][${plantSlug}] ${dateKey} (${window.start}→${window.end})`)

  const syncedAt = new Date()

  // 1. Fetch production (full-day) para todas las máquinas
  const productionResponses = []
  const summaryResponses    = []

  for (const machine of machines) {
    try {
      const prod = await query({
        type: 'whiteboardproduction',
        params: { machines: machine.machineid, start: window.start, end: window.end, minutes: 5 },
      })
      productionResponses.push(prod?.machines?.[0] ?? null)
    } catch (err) {
      if (err.code === 'AUTH_EXPIRED') throw err
      logger.warn(`[syncDay][${plantSlug}] ${machine.name} production err: ${err.message}`)
      productionResponses.push(null)
    }
    await pauseBetweenMachines()

    try {
      const summ = await query({
        type: 'whiteboardsummary',
        params: { machines: machine.machineid, start: window.start, end: window.end },
      })
      summaryResponses.push(summ?.machines?.[0] ?? null)
    } catch (err) {
      if (err.code === 'AUTH_EXPIRED') throw err
      logger.warn(`[syncDay][${plantSlug}] ${machine.name} summary err: ${err.message}`)
      summaryResponses.push(null)
    }
    await pauseBetweenMachines()
  }

  // 2. Derivar grupos de turno reales
  const shiftGroups = deriveShiftGroups(productionResponses)

  if (shiftGroups.length === 0) {
    logger.info(`[shoplogix-syncDay][${plantSlug}] ${dateKey}: sin turnos detectados (sin datos aún)`)
    return { plantSlug, dateKey, shiftGroups: [] }
  }

  logger.info(
    `[shoplogix-syncDay][${plantSlug}] ${dateKey}: ${shiftGroups.length} turno(s) detectados: ` +
    shiftGroups.map(g => `${g.shiftId} (${toShoplogixTime(g.scheduledStart)}→${toShoplogixTime(g.scheduledEnd)})`).join(', '),
  )

  const allShiftResults = []

  // 3. Por cada turno: filtrar intervals + normalize + escribir
  for (const group of shiftGroups) {
    const shiftMachineResults = []

    for (let i = 0; i < machines.length; i++) {
      const rawProd = productionResponses[i]
      const rawSumm = summaryResponses[i]

      if (!rawProd || !rawSumm) {
        shiftMachineResults.push({ machineid: machines[i].machineid, status: 'empty' })
        continue
      }

      try {
        // Filtrar intervals al turno por VENTANA TEMPORAL (no por etiqueta shift).
        //
        // Histórico: antes filtrábamos por `iv.shift === group.shiftId`. Eso falla
        // cuando Shoplogix etiqueta inconsistentemente las máquinas — caso real
        // 2026-04-29 T3 Yal: M1 tenía sus intervals 01:25-07:35 etiquetados
        // "Turno 3" correctamente, pero M2/M3 tenían sus 05:00-07:35 etiquetados
        // con otro shift (o "Unscheduled") y al mismo tiempo unos intervals de la
        // tarde Apr-28 (13:15-15:35) mal etiquetados como "Turno 3". Resultado:
        // se descartaba lo bueno y guardábamos basura.
        //
        // M1 (la primera máquina con datos) es la fuente de verdad para los
        // bounds del turno via deriveShiftGroups. Ahora filtramos por solapamiento
        // temporal con [scheduledStart, scheduledEnd] usando una tolerancia de
        // 5 min (un bucket) para incluir el primer/último que arranque justo
        // antes/después del bound exacto.
        const TOLERANCE_MS = 5 * 60 * 1000
        const groupStartMs = group.scheduledStart.getTime() - TOLERANCE_MS
        const groupEndMs   = group.scheduledEnd.getTime()   + TOLERANCE_MS
        const filteredProd = {
          ...rawProd,
          machineProduction: (rawProd.machineProduction || [])
            .filter(iv => {
              if (!iv.start) return false
              const ivStartMs = parseShoplogixTime(iv.start).getTime()
              return ivStartMs >= groupStartMs && ivStartMs <= groupEndMs
            }),
        }

        const doc = normalizeShift({
          production:    filteredProd,
          summary:       rawSumm,
          dateKey,
          shiftId:       group.shiftId,
          shiftStartAt:  group.scheduledStart,
          shiftEndAt:    group.scheduledEnd,
          syncedAt,
          scheduleSource: 'intervals',
        })

        const ref = db.doc(
          `shoplogix/${plantSlug}/shifts/${dateKey}_${group.shiftId}/machines/${machines[i].machineid}`,
        )
        await ref.set(doc, { merge: true })

        shiftMachineResults.push({
          machineid:   machines[i].machineid,
          name:        machines[i].name,
          status:      'ok',
          intervals:   doc.intervals.length,
          states:      doc.states.length,
          totalCycles: doc.totalCycles,
        })
      } catch (err) {
        logger.warn(`[syncDay][${plantSlug}] ${machines[i].name} normalizer err: ${err.message}`)
        shiftMachineResults.push({ machineid: machines[i].machineid, status: 'error', error: err.message })
      }
    }

    // Metadata del doc padre del turno
    await db.doc(`shoplogix/${plantSlug}/shifts/${dateKey}_${group.shiftId}`).set({
      dateKey,
      shiftId:        group.shiftId,
      scheduledStart: group.scheduledStart,
      scheduledEnd:   group.scheduledEnd,
      scheduleSource: 'intervals',
      lastSyncAt:     syncedAt,
      machines:       shiftMachineResults,
    }, { merge: true })

    allShiftResults.push({ shiftId: group.shiftId, machines: shiftMachineResults })
    logger.info(`[shoplogix-syncDay][${plantSlug}] ${dateKey} ${group.shiftId} OK`, { machines: shiftMachineResults })
  }

  return { plantSlug, dateKey, shiftGroups: shiftGroups.map(g => g.shiftId), results: allShiftResults }
}

// ── syncShift (legado) ────────────────────────────────────────────────────────

/**
 * Sync de un turno específico con ventana hardcodeada (legado).
 * Conservado para backward compat con el trigger HTTP cuando se pasa shiftId.
 * Para sync regular usar syncDay.
 */
async function syncShift({ db, accessToken, cookie, plantSlug = 'chonchi', dateKey, shiftId, logger = console }) {
  if (!accessToken && !cookie) throw new Error('[sync] se requiere accessToken (Bearer) o cookie (legacy)')

  const machines = PLANT_MACHINES[plantSlug]
  if (!machines) throw new Error(`[sync] plantSlug desconocido: "${plantSlug}"`)

  const query = accessToken
    ? (opts) => queryShoplogixBearer({ accessToken, ...opts })
    : (opts) => queryShoplogix({ cookie, ...opts })

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
  logger.info(`[shoplogix-sync][${plantSlug}] (legado) ${key.dateKey} ${key.shiftId} (${window.start}→${window.end})`)

  const results = []
  const syncedAt = new Date()

  for (const machine of machines) {
    try {
      const production = await query({
        type: 'whiteboardproduction',
        params: { machines: machine.machineid, start: window.start, end: window.end, minutes: 5 },
      })

      await pauseBetweenMachines()

      const summary = await query({
        type: 'whiteboardsummary',
        params: { machines: machine.machineid, start: window.start, end: window.end },
      })

      const prodMachine = production?.machines?.[0]
      const sumMachine  = summary?.machines?.[0]

      if (!prodMachine || !sumMachine) {
        logger.warn(`[shoplogix-sync][${plantSlug}] ${machine.name}: respuesta vacía`)
        results.push({ machineid: machine.machineid, status: 'empty' })
        continue
      }

      const queryStart = parseShoplogixTime(window.start)
      const queryEnd   = parseShoplogixTime(window.end)

      const doc = normalizeShift({
        production:   prodMachine,
        summary:      sumMachine,
        dateKey:      key.dateKey,
        shiftId:      key.shiftId,
        shiftStartAt: queryStart,
        shiftEndAt:   queryEnd,
        syncedAt,
        scheduleSource: 'legacy',
      })

      const ref = db.doc(
        `shoplogix/${plantSlug}/shifts/${key.dateKey}_${key.shiftId}/machines/${machine.machineid}`,
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
        logger.error(`[shoplogix-sync][${plantSlug}] AUTH_EXPIRED — aborta sync`, { err: err.message })
        throw err
      }
      logger.error(`[shoplogix-sync][${plantSlug}] ${machine.name} error`, { err: err.message })
      results.push({ machineid: machine.machineid, status: 'error', error: err.message })
    }

    await pauseBetweenMachines()
  }

  await db.doc(`shoplogix/${plantSlug}/shifts/${key.dateKey}_${key.shiftId}`).set({
    dateKey:   key.dateKey,
    shiftId:   key.shiftId,
    lastSyncAt: syncedAt,
    machines:  results,
  }, { merge: true })

  logger.info(`[shoplogix-sync][${plantSlug}] Fin ${key.dateKey} ${key.shiftId}`, { results })
  return { plantSlug, dateKey: key.dateKey, shiftId: key.shiftId, syncedAt, results }
}

module.exports = {
  ACTIVE_PLANTS,
  shiftWindow,
  fullDayWindow,
  deriveShiftGroups,
  currentShiftKey,
  currentDateKey,
  syncDay,
  syncShift,
}
