/**
 * recompute-p0-causes.js
 *
 * Recalcula `topP0Causes` de los turnos que ya tienen su input de Puerta 0
 * guardado (`meta/gate0`) pero cuyo desglose sigue siendo el viejo.
 *
 * Por qué hace falta un script y no lo hace la app sola: el recálculo automático
 * (graderGate0Store.ts) se dispara cuando la vista detecta que el desglose no
 * corresponde a las gates vigentes. Los turnos de feb-2026 no tienen
 * `configHistory` — sin gates activas no hay con qué comparar, `detectConfigDrift`
 * devuelve null y el recálculo nunca ocurre. Se quedan mostrando "Sin causa" con
 * el input ya disponible al lado.
 *
 * Qué gates usa, en orden: `summary.gatesUsed` → último snapshot de
 * `configHistory` → ninguna. Sin gates, `classifyRecordToMatrix` igual resuelve
 * las 4 causas OFICIALES del Marelec desde la columna Error (fotocélula, too
 * close, puerta no preparada, fuera de límites); lo que no puede es descomponer
 * "fuera de límites" en calibre/calidad, que sí depende de la configuración.
 *
 * ⚠️ Escribe SOLO `topP0Causes`. No toca `pointZeroPieces` ni `pointZeroPct` —
 * son el conteo físico de la máquina y no dependen de la configuración.
 *
 * Uso:
 *   node scripts/recompute-p0-causes.js                 # dry-run (default)
 *   node scripts/recompute-p0-causes.js --confirm       # escribe
 *   node scripts/recompute-p0-causes.js --shift <id>    # un solo turno
 */

'use strict'
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const CONFIRM = process.argv.includes('--confirm')
const ONLY = (() => {
  const i = process.argv.indexOf('--shift')
  return i >= 0 ? process.argv[i + 1] : null
})()

const GATE0_SCHEMA_VERSION = 1

/** CALIBRE_WEIGHT_RANGES de graderAnalyticsThroughput.ts */
const CALIBRE_WEIGHT_RANGES = [
  { calibre: '0-2 lb', minGrams: 0, maxGrams: 916 },
  { calibre: '2-4 lb', minGrams: 916, maxGrams: 1833 },
  { calibre: '4-6 lb', minGrams: 1833, maxGrams: 2749 },
  { calibre: '6-8 lb', minGrams: 2749, maxGrams: 3665 },
  { calibre: '8-10 lb', minGrams: 3665, maxGrams: 4581 },
  { calibre: '10-12 lb', minGrams: 4581, maxGrams: 9163 },
]

/** parseMatrixErrorString de graderMatrixP0Causes.ts */
function parseMatrixErrorString(raw) {
  const s = (raw ?? '').toLowerCase().trim()
  const isFuera = s.includes('fuera de') || s.includes('fuera del') || s.includes('out of')
  if ((s.includes('puerta') || s.includes('door')) && (s.includes('prepar') || s.includes('ready'))) return 'puerta_no_preparada'
  if (s.includes('too close') || s.includes('too long') || s.includes('demasiado cerca') || s.includes('demasiado largo')
    || s.includes('demasiado próximo') || s.includes('demasiado proximo') || s.includes('no puede pesar')) return 'too_close_too_long'
  if (s.includes('fotoc') || s.includes('fotocelula') || s.includes('photocell') || s.includes('no leid') || s.includes('not read by')) return 'no_leido_fotocelula'
  if ((isFuera && (s.includes('rango') || s.includes('range') || s.includes('límit') || s.includes('limit')))
    || s.includes('peso por debajo') || s.includes('peso bajo el mínimo') || s.includes('peso bajo el minimo')
    || s.includes('weight below') || s.includes('below minimum')) return 'fuera_de_limites'
  return 'otro'
}

/** classifyRecordToMatrix de graderAnalyticsClassifier.ts */
function classifyRecordToMatrix(record, activeGates, weightRanges) {
  const errorStr = record.error ?? ''
  const parsed = parseMatrixErrorString(errorStr)
  if (parsed === 'no_leido_fotocelula') return 'no_leido_fotocelula'
  if (parsed === 'too_close_too_long') return 'too_close_too_long'
  if (parsed === 'puerta_no_preparada') return 'puerta_no_preparada'

  let perPieceG = record.weightPerPieceGrams
  if (!perPieceG && record.weightKg && record.pieces > 0) perPieceG = (record.weightKg / record.pieces) * 1000
  const hasExplicitError = !!errorStr && errorStr.trim().length > 0
  if (!hasExplicitError && (perPieceG == null || perPieceG < 10)) return 'no_leido_fotocelula'
  if (hasExplicitError && (perPieceG == null || perPieceG === 0)) {
    return parsed === 'fuera_de_limites' ? 'fuera_de_limites' : 'otro'
  }

  const matched = weightRanges.find((r) => perPieceG >= r.minGrams && perPieceG < r.maxGrams)
  if (!matched) return 'fuera_de_calibre'
  if (activeGates.length > 0) {
    if (!activeGates.some((g) => g.assignedCalibre === matched.calibre)) return 'fuera_de_calibre'
    if (record.quality
      && !activeGates.some((g) => g.assignedCalibre === matched.calibre && g.assignedQuality === record.quality)) {
      return 'fuera_de_calidad'
    }
    if (record.conservation && activeGates.some((g) => g.assignedConservation != null)
      && !activeGates.some((g) => g.assignedCalibre === matched.calibre && g.assignedQuality === record.quality
        && g.assignedConservation === record.conservation)) {
      return 'fuera_de_conservacion'
    }
    if (record.product && activeGates.some((g) => g.assignedProduct != null)
      && !activeGates.some((g) => g.assignedCalibre === matched.calibre && g.assignedQuality === record.quality
        && (!record.conservation || g.assignedConservation === record.conservation)
        && g.assignedProduct === record.product)) {
      return 'fuera_de_producto'
    }
  }
  return 'fuera_de_limites'
}

const r1 = (n) => +n.toFixed(1)

;(async () => {
  console.log(CONFIRM ? '⚠️  MODO ESCRITURA (--confirm)\n' : '🔍 DRY RUN — no se escribe nada. Usa --confirm para aplicar.\n')

  const snap = await db.collection('graderDailySummaries').where('gate0RecordsStored', '==', true).get()
  let objetivo = snap.docs.sort((a, b) => a.id.localeCompare(b.id))
  if (ONLY) objetivo = objetivo.filter((d) => d.id === ONLY)
  console.log(`Turnos con input de Puerta 0 guardado: ${objetivo.length}\n`)

  const stats = { cambiados: 0, iguales: 0, sinInput: 0, escritos: 0, saltados: 0 }

  for (const doc of objetivo) {
    const s = doc.data()
    const etiqueta = doc.id.padEnd(30)

    const chunks = await doc.ref.collection('meta').where('schemaVersion', '==', GATE0_SCHEMA_VERSION).get()
    const recs = chunks.docs
      .map((c) => c.data())
      .sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0))
      .flatMap((c) => c.records || [])
    if (recs.length === 0) {
      console.log(`— ${etiqueta} sin registros en meta/gate0`)
      stats.sinInput++
      continue
    }

    // Gates: las que usó el análisis → las vigentes → ninguna.
    let gates = (s.gatesUsed ?? []).filter((g) => g.active)
    let origenGates = 'gatesUsed'
    if (gates.length === 0) {
      const ch = await db.collection('graderShifts').doc(doc.id).collection('configHistory').orderBy('at', 'asc').get()
      const last = ch.docs[ch.docs.length - 1]
      gates = (last?.data().gates ?? []).filter((g) => g.active)
      origenGates = gates.length > 0 ? 'configHistory' : 'sin gates'
    }

    const total = s.pointZeroPieces || recs.reduce((a, x) => a + x.pieces, 0) || 1
    const causeMap = new Map()
    for (const rec of recs) {
      const k = classifyRecordToMatrix(rec, gates, CALIBRE_WEIGHT_RANGES)
      causeMap.set(k, (causeMap.get(k) ?? 0) + rec.pieces)
    }
    const nuevo = [...causeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 9)
      .map(([error, pieces]) => ({ error, pieces, pct: r1((pieces / total) * 100) }))

    const sumaNueva = nuevo.reduce((a, c) => a + c.pieces, 0)
    // Invariante: el desglose tiene que sumar las piezas de puerta 0 del turno.
    if (sumaNueva !== s.pointZeroPieces) {
      console.log(`✗ ${etiqueta} el desglose sumaría ${sumaNueva} pero el turno tiene ${s.pointZeroPieces} — se salta`)
      stats.saltados++
      continue
    }

    const antes = (s.topP0Causes ?? []).map((c) => `${c.error} ${c.pieces}`).join(' · ') || '(vacío)'
    const despues = nuevo.map((c) => `${c.error} ${c.pieces}`).join(' · ')
    if (antes === despues) {
      console.log(`= ${etiqueta} sin cambios`)
      stats.iguales++
      continue
    }

    console.log(`✓ ${etiqueta} [${origenGates}]`)
    console.log(`   antes:   ${antes}`)
    console.log(`   después: ${despues}`)
    stats.cambiados++

    if (CONFIRM) {
      await doc.ref.update({
        topP0Causes: nuevo,
        reclassifiedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      stats.escritos++
    }
  }

  console.log('\n── Resumen ──────────────────────────────────')
  console.log(`  con desglose nuevo:  ${stats.cambiados}`)
  console.log(`  ya estaban al día:   ${stats.iguales}`)
  console.log(`  saltados (no cuadra):${stats.saltados}`)
  console.log(`  sin input:           ${stats.sinInput}`)
  if (CONFIRM) console.log(`  ESCRITOS:            ${stats.escritos}`)
  else console.log('\n  (dry-run: no se escribió nada — usa --confirm para aplicar)')
  process.exit(0)
})().catch((e) => { console.error('ERR', e); process.exit(1) })
