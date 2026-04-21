/**
 * Backfill: computa pausas (≥1min) para cada `graderDailySummaries/{id}` que
 * todavía no las tenga, leyendo los `pieceRecords` de la subcollection.
 *
 * El detalle se guarda en `graderDailySummaries/{id}/meta/pauses`, y los
 * totales ligeros (tiempo muerto total, count de micros, etc.) se escriben
 * como campos del doc summary para soportar KPIs rápidos del calendario.
 *
 * El detector es un port plain-JS de `graderPauseDetector.ts::detectPauses()`.
 * Mantener en sync hasta que exista un test de paridad.
 *
 * Idempotente: por default skippea summaries que ya tienen `meta/pauses`.
 * Pasar `--force` para re-computar todos (preserva anotaciones manuales
 * previas via merge por id estable).
 *
 * Uso:
 *   node scripts/backfill-pauses.js             # run real
 *   node scripts/backfill-pauses.js --dry-run   # solo reporta
 *   node scripts/backfill-pauses.js --force     # re-computa todos
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    storageBucket: 'mantenimiento-planta-771a3.firebasestorage.app',
  })
}

const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')
if (DRY_RUN) console.log('🔍 DRY RUN — no se escribirá nada\n')
if (FORCE) console.log('⚡ FORCE — re-computando pauses aunque ya existan\n')

// ── Port JS de graderPauseDetector.ts ────────────────────────────────────
// Debe mantenerse en sync con el TS hasta que exista un test de paridad.

const MICRO_MIN_SEC = 60     // ≥ 1 min
const MICRO_MAX_SEC = 300    // < 5 min → micro
const PAUSA_MAX_SEC = 1800   // < 30 min → pausa
const LARGA_MAX_SEC = 3600   // < 60 min → larga

const COLACION_MIN_MIN = 45
const COLACION_MAX_MIN = 90

// Ventanas ampliadas (noche hasta 03:30) tras validación con 40+ turnos.
// Mantener en sync con graderPauseDetector.ts
const COLACION_WINDOWS = {
  'Turno día':   { start: 12 * 60 + 30, end: 14 * 60 + 30 },
  'Turno noche': { start:  0 * 60 + 30, end:  3 * 60 + 30 },
}

function tierFor(durSec) {
  if (durSec < PAUSA_MAX_SEC) return 'pausa'
  if (durSec < LARGA_MAX_SEC) return 'larga'
  return 'parada'
}

function isColacionCandidate(startMs, endMs, durSec, shiftId) {
  const durMin = durSec / 60
  if (durMin < COLACION_MIN_MIN || durMin > COLACION_MAX_MIN) return false
  const window = COLACION_WINDOWS[shiftId]
  if (!window) return false
  // Criterio "solape" gap ↔ ventana (ver graderPauseDetector.ts para doc)
  const s = new Date(startMs), e = new Date(endMs)
  const gapStartMin = s.getUTCHours() * 60 + s.getUTCMinutes()
  const gapEndMin = e.getUTCHours() * 60 + e.getUTCMinutes()
  const gapEndAdj = gapEndMin < gapStartMin ? gapEndMin + 24 * 60 : gapEndMin
  return gapStartMin <= window.end && gapEndAdj >= window.start
}

function makePauseId(startMs, durSec) {
  const d = new Date(startMs)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `p-${hh}${mm}-${Math.round(durSec / 60)}m`
}

function detectPauses(tsSorted, shiftId) {
  const pauses = []
  const microByHour = {}
  let microCount = 0
  let microTotalSec = 0
  let totalDeadTimeSec = 0

  for (let i = 1; i < tsSorted.length; i++) {
    const prev = tsSorted[i - 1]
    const curr = tsSorted[i]
    const prevMs = Date.parse(prev)
    const currMs = Date.parse(curr)
    if (isNaN(prevMs) || isNaN(currMs)) continue
    const gapSec = (currMs - prevMs) / 1000
    if (gapSec < MICRO_MIN_SEC) continue

    totalDeadTimeSec += gapSec

    if (gapSec < MICRO_MAX_SEC) {
      microCount++
      microTotalSec += gapSec
      const hh = String(new Date(prevMs).getUTCHours()).padStart(2, '0')
      microByHour[hh] = (microByHour[hh] ?? 0) + gapSec
      continue
    }

    const tier = tierFor(gapSec)
    const pause = {
      id: makePauseId(prevMs, gapSec),
      startAt: prev,
      endAt: curr,
      durationSec: Math.round(gapSec),
      tier,
    }
    if (isColacionCandidate(prevMs, currMs, gapSec, shiftId)) {
      pause.autoTag = 'colacion'
    }
    pauses.push(pause)
  }

  microTotalSec = Math.round(microTotalSec)
  totalDeadTimeSec = Math.round(totalDeadTimeSec)
  for (const h of Object.keys(microByHour)) {
    microByHour[h] = Math.round(microByHour[h])
  }

  return {
    pauses,
    microDetentions: { count: microCount, totalSec: microTotalSec, byHour: microByHour },
    totalDeadTimeSec,
  }
}

function mergeAnnotationsIntoPauses(fresh, previous) {
  if (!previous || previous.length === 0) return fresh
  const prevById = new Map(previous.map((p) => [p.id, p]))
  return fresh.map((p) => {
    const prev = prevById.get(p.id)
    if (!prev) return p
    return {
      ...p,
      ...(prev.tag != null && { tag: prev.tag }),
      ...(prev.note != null && { note: prev.note }),
      ...(prev.annotatedBy != null && { annotatedBy: prev.annotatedBy }),
      ...(prev.annotatedAt != null && { annotatedAt: prev.annotatedAt }),
    }
  })
}

// ── Main ─────────────────────────────────────────────────────────────────

// Debe coincidir con PAUSES_SCHEMA_VERSION en graderDailySummary.service.ts
const PAUSES_SCHEMA_VERSION = 1

async function main() {
  console.log('=== BACKFILL: pauses → graderDailySummaries/{id}/meta/pauses ===\n')

  const summariesSnap = await db.collection('graderDailySummaries').get()
  console.log(`Total summaries: ${summariesSnap.size}\n`)

  let processed = 0
  let skippedExisting = 0
  let skippedEmpty = 0
  let failed = 0
  let summaryIdx = 0
  let totalPauses = 0
  let totalColacion = 0
  let totalMicros = 0
  let totalDeadTimeSec = 0

  for (const summaryDoc of summariesSnap.docs) {
    summaryIdx++
    const summary = summaryDoc.data()
    const id = summary.id || summaryDoc.id
    const shiftId = summary.shiftId

    const metaPausesRef = summaryDoc.ref.collection('meta').doc('pauses')

    // Skip si ya existe (a menos que --force)
    let previousPauses = []
    if (!FORCE) {
      const existing = await metaPausesRef.get()
      if (existing.exists) {
        const data = existing.data()
        if (Array.isArray(data?.pauses)) {
          skippedExisting++
          if (summaryIdx % 50 === 0) {
            console.log(`  [${summaryIdx}/${summariesSnap.size}] progreso: ${processed} procesados, ${skippedExisting} ya tenían`)
          }
          continue
        }
      }
    } else {
      // En --force, leer pauses previas para preservar anotaciones
      const existing = await metaPausesRef.get()
      if (existing.exists) {
        const data = existing.data()
        if (Array.isArray(data?.pauses)) previousPauses = data.pauses
      }
    }

    try {
      const prSnap = await summaryDoc.ref.collection('pieceRecords').get()
      if (prSnap.empty) {
        skippedEmpty++
        continue
      }

      // Construir tsSorted desde los pieceRecords (ordenar en memoria)
      const tsSorted = prSnap.docs
        .map((d) => d.data().ts)
        .filter((ts) => typeof ts === 'string' && ts.length > 0)
        .sort()

      if (tsSorted.length < 2) {
        skippedEmpty++
        continue
      }

      const det = detectPauses(tsSorted, shiftId)
      const mergedPauses = mergeAnnotationsIntoPauses(det.pauses, previousPauses)

      const colacionCount = mergedPauses.filter((p) => p.autoTag === 'colacion').length
      const jsonKb = (JSON.stringify(mergedPauses).length / 1024).toFixed(1)

      console.log(
        `  [${summaryIdx}/${summariesSnap.size}] ${id}: ` +
        `${mergedPauses.length} pausas (${colacionCount} colación auto), ` +
        `${det.microDetentions.count} micros, ` +
        `tiempo muerto ${Math.round(det.totalDeadTimeSec / 60)}min (${jsonKb} KB)` +
        `${DRY_RUN ? ' [DRY RUN]' : ''}`
      )

      if (!DRY_RUN) {
        // 1) Escribir meta/pauses
        await metaPausesRef.set({
          pauses: mergedPauses,
          microDetentions: det.microDetentions,
          updatedAt: new Date().toISOString(),
          schemaVersion: PAUSES_SCHEMA_VERSION,
        })

        // 2) Actualizar summary doc con agregados ligeros
        await summaryDoc.ref.update({
          totalDeadTimeSec: det.totalDeadTimeSec,
          microDetentionsCount: det.microDetentions.count,
          microDetentionsTotalSec: det.microDetentions.totalSec,
          pausesCount: mergedPauses.length,
        })
      }

      processed++
      totalPauses += mergedPauses.length
      totalColacion += colacionCount
      totalMicros += det.microDetentions.count
      totalDeadTimeSec += det.totalDeadTimeSec
    } catch (err) {
      console.error(`  [${summaryIdx}/${summariesSnap.size}] ${id}: ❌ ERROR - ${err.message}`)
      failed++
    }
  }

  console.log('\n=== RESUMEN ===')
  console.log(`Total summaries:          ${summariesSnap.size}`)
  console.log(`Procesados:               ${processed}`)
  console.log(`Skipped (ya existían):    ${skippedExisting}`)
  console.log(`Skipped (sin records):    ${skippedEmpty}`)
  console.log(`Failed:                   ${failed}`)
  console.log(`Total pausas escritas:    ${totalPauses.toLocaleString()}`)
  console.log(`Total colaciones auto:    ${totalColacion.toLocaleString()}`)
  console.log(`Total micro-detenciones:  ${totalMicros.toLocaleString()}`)
  console.log(`Tiempo muerto total:      ${Math.round(totalDeadTimeSec / 3600)} h`)
  if (DRY_RUN) console.log('\n(DRY RUN — nada fue escrito)')
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
