/**
 * Re-procesa la atribución día/turno de los summaries del Grader.
 *
 * Contexto (PR #329): `assignShiftAndDate` leía los timestamps del Excel con
 * hora LOCAL sobre strings escritos como wall-clock-as-UTC. En Chile (UTC-4)
 * eso corría el corte 4 horas y partía un turno que cruza medianoche en varios
 * pedazos repartidos en dos días. Caso real: el turno del 31-jul-2026 quedó
 * como `2026-08-01__Turno noche` (657 pzs) + `2026-07-31__Turno noche` (876),
 * cuando Shoplogix dice que es UN turno: `2026-07-31 · Turno 1`.
 *
 * El fix corrige las cargas NUEVAS pero no reescribe lo ya guardado. Este
 * script recalcula desde los `pieceRecords` crudos (que sí están guardados),
 * usando EXACTAMENTE la misma lógica que la app —se importa bundleada, no
 * reimplementada— y con Shoplogix como fuente de verdad del turno y del día.
 *
 * Uso:
 *   node scripts/reprocess-shift-attribution.js              # dry-run
 *   node scripts/reprocess-shift-attribution.js --apply      # escribe
 *   node scripts/reprocess-shift-attribution.js --only=2026-07  # filtra por mes
 *
 * Requiere el bundle: ver scripts/build-grader-core.js
 */
const admin = require('firebase-admin')
const path = require('path')
const sa = require('../serviceAccountKey.json')
const core = require('./_grader-core.cjs')

const APPLY = process.argv.includes('--apply')
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || ''

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const FP = admin.firestore.FieldPath

/** id de summary original -> {summary, count}. Global: se usa en el reporte. */
const origen = new Map()

/** Registros crudos (post-dedupe) de todas las lineas, para el control de integridad. */
const crudosPorLinea = []

const SUMMARIES = 'graderDailySummaries'
const PIECE_SUB = 'pieceRecords'
const DEFAULT_LINE = 'chonchi-eviscerado'

function buildDailySummaryId(dateKey, shiftId, plantLineId) {
  if (!plantLineId || plantLineId === DEFAULT_LINE) return `${dateKey}__${shiftId}`
  return `${plantLineId}__${dateKey}__${shiftId}`
}

function shiftDateKey(dateKey, days) {
  const t = Date.parse(`${dateKey}T12:00:00.000Z`)
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10)
}

const toDate = (v) => (v && v.toDate ? v.toDate() : v ? new Date(v) : null)

/** Ventanas reales de Shoplogix para un conjunto de días. Mismas reglas que la app. */
async function loadWindows(dateKeys, plantSlug) {
  const days = new Set()
  for (const dk of dateKeys) { days.add(dk); days.add(shiftDateKey(dk, -1)) }

  const windows = []
  for (const dk of Array.from(days).sort()) {
    const snap = await db.collection(`shoplogix/${plantSlug}/shifts`)
      .where(FP.documentId(), '>=', `${dk}_`)
      .where(FP.documentId(), '<=', `${dk}_`)
      .get()
      .catch(() => null)
    if (!snap) continue
    for (const d of snap.docs) {
      const r = d.data()
      const shiftId = String(r.shiftId ?? d.id.slice(dk.length + 1))
      if (shiftId === 'Unscheduled') continue
      const s = toDate(r.scheduledStart), e = toDate(r.scheduledEnd)
      if (!s || !e || !(e.getTime() > s.getTime())) continue
      windows.push({
        sessionDate: String(r.dateKey ?? dk),
        shiftId,
        startMs: s.getTime(),
        endMs: e.getTime(),
      })
    }
  }
  return windows
}

async function main() {
  const snap = await db.collection(SUMMARIES).get()
  let summaries = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  if (ONLY) summaries = summaries.filter((s) => String(s.dateKey || '').startsWith(ONLY))
  console.log(`Summaries a evaluar: ${summaries.length}${ONLY ? ` (filtro ${ONLY})` : ''}\n`)

  // Agrupar por línea: cada línea se re-segmenta con su propio horario/planta.
  const byLine = new Map()
  for (const s of summaries) {
    const line = s.plantLineId || DEFAULT_LINE
    if (!byLine.has(line)) byLine.set(line, [])
    byLine.get(line).push(s)
  }

  const plan = []   // { targetId, dateKey, shiftId, plantLineId, records, sources[], fromIds[] }

  for (const [plantLineId, list] of byLine) {
    const cfg = core.getPlantLineConfig(plantLineId)
    const schedule = core.normalizeShiftSchedule(undefined, cfg.defaultShiftSchedule)
    console.log(`── Línea ${plantLineId} (${cfg.plantSlug}) · ${list.length} summaries`)

    // 1. Traer los pieceRecords crudos de cada summary
    const all = []
    for (const s of list) {
      const recs = await db.collection(SUMMARIES).doc(s.id).collection(PIECE_SUB).get()
      const parsed = recs.docs.map((d) => d.data()).filter((r) => r && r.ts)
      origen.set(s.id, { summary: s, count: parsed.length })
      for (const r of parsed) all.push({ ...r, __from: s.id })
    }
    if (all.length === 0) { console.log('   (sin pieceRecords crudos — no se puede recalcular)\n'); continue }

    // 2. Ventanas reales de Shoplogix para los días tocados
    const dateKeys = new Set(all.map((r) => r.ts.slice(0, 10)))
    const windows = await loadWindows(dateKeys, cfg.plantSlug)
    console.log(`   registros=${all.length} · días=${dateKeys.size} · ventanas Shoplogix=${windows.length}`)

    // 3. Re-segmentar con la MISMA lógica de la app
    const unique = core.dedupePieceRecords(all).unique
    for (const r of unique) crudosPorLinea.push(r)
    const segs = core.segmentByDayAndShift(unique, [], schedule, windows)

    for (const [, seg] of core.sortedSegmentEntries(segs)) {
      const targetId = buildDailySummaryId(seg.sessionDate, seg.shiftId, plantLineId)
      const fromIds = Array.from(new Set(seg.pieceRecords.map((r) => r.__from)))
      const sources = Array.from(new Set(
        fromIds.flatMap((id) => (origen.get(id)?.summary.sourceFileNames) || []),
      ))
      plan.push({
        targetId, plantLineId,
        dateKey: seg.sessionDate, shiftId: seg.shiftId,
        segment: { ...seg, pieceRecords: seg.pieceRecords.map(({ __from, ...r }) => r), gate0Records: [] },
        records: seg.pieceRecords,
        sources, fromIds,
      })
    }
    console.log('')
  }

  // 4. Reporte
  const currentIds = new Set(summaries.map((s) => s.id))
  const targetIds = new Set(plan.map((p) => p.targetId))
  const toDelete = summaries.filter((s) => !targetIds.has(s.id))

  console.log('═══ PLAN ═══\n')
  let cambios = 0
  for (const p of plan) {
    const sum = core.computeShiftSummary(p.segment, 'reprocess', p.sources, 'reprocess-script')
    const piezas = p.segment.pieceRecords.reduce((s, r) => s + (r.pieces || 0), 0)
    const esNuevo = !currentIds.has(p.targetId)
    const fuentes = p.fromIds.filter((id) => id !== p.targetId)
    const cambia = esNuevo || fuentes.length > 0
    if (cambia) cambios++
    console.log(
      `${cambia ? '►' : ' '} ${p.targetId.padEnd(38)} ${String(piezas).padStart(7)} pzs · ` +
      `P0=${String(sum.pointZeroPieces).padStart(5)} (${sum.pointZeroPct}%) · ` +
      `${String(sum.startAt).slice(0, 16)}→${String(sum.endAt).slice(0, 16)}` +
      (esNuevo ? '  [NUEVO]' : ''))
    if (fuentes.length > 0) {
      for (const f of p.fromIds) {
        const o = origen.get(f)
        console.log(`      ← ${f}${o ? ` (${o.summary.totalPieces ?? 0} pzs guardadas)` : ''}`)
      }
    }
  }
  console.log(`\nDocumentos a BORRAR (quedan sin registros propios): ${toDelete.length}`)
  for (const d of toDelete) console.log(`   ✗ ${d.id}  (${d.totalPieces ?? 0} pzs)`)

  console.log(`\nResumen: ${plan.length} turnos resultantes · ${cambios} con cambios · ${toDelete.length} a borrar`)

  // Invariante crítico: el re-proceso REATRIBUYE, no crea ni destruye piezas.
  // Se compara contra los registros crudos (no contra totalPieces de los docs,
  // que es justamente el número que puede estar mal).
  const antes = crudosPorLinea.length
  const despues = plan.reduce(
    (s, p) => s + p.segment.pieceRecords.length, 0)
  const piezasAntes = crudosPorLinea.reduce((s, r) => s + (r.pieces || 0), 0)
  const piezasDespues = plan.reduce(
    (s, p) => s + p.segment.pieceRecords.reduce((a, r) => a + (r.pieces || 0), 0), 0)
  console.log(`\nControl de integridad:`)
  console.log(`  registros: ${antes} → ${despues}  ${antes === despues ? 'OK' : '*** DESCUADRE ***'}`)
  console.log(`  piezas   : ${piezasAntes} → ${piezasDespues}  ${piezasAntes === piezasDespues ? 'OK' : '*** DESCUADRE ***'}`)
  if (antes !== despues || piezasAntes !== piezasDespues) {
    console.log('\nABORTA: el re-proceso no conserva los registros. No se escribe nada.')
    process.exit(1)
  }

  if (!APPLY) {
    console.log('\n[DRY-RUN] No se escribió nada. Correr con --apply para aplicar.')
    process.exit(0)
  }

  // 5. Aplicar
  console.log('\n═══ APLICANDO ═══')
  for (const p of plan) {
    const sum = core.computeShiftSummary(p.segment, 'reprocess', p.sources, 'reprocess-script')
    sum.id = p.targetId
    if (p.plantLineId && p.plantLineId !== DEFAULT_LINE) sum.plantLineId = p.plantLineId
    const clean = JSON.parse(JSON.stringify(sum, (k, v) => (v === undefined ? null : v)))
    await db.collection(SUMMARIES).doc(p.targetId).set(clean, { merge: true })

    // Mover pieceRecords al doc destino (dedupe por dedupeKey)
    const destCol = db.collection(SUMMARIES).doc(p.targetId).collection(PIECE_SUB)
    const existing = new Set((await destCol.get()).docs.map((d) => d.data().dedupeKey))
    const nuevos = p.segment.pieceRecords.filter((r) => !existing.has(r.dedupeKey))
    for (let i = 0; i < nuevos.length; i += 400) {
      const batch = db.batch()
      for (const r of nuevos.slice(i, i + 400)) batch.set(destCol.doc(), r)
      await batch.commit()
    }
    console.log(`  ✓ ${p.targetId} · ${p.segment.pieceRecords.length} pzs (${nuevos.length} escritos)`)
  }

  for (const d of toDelete) {
    const sub = db.collection(SUMMARIES).doc(d.id).collection(PIECE_SUB)
    const docs = (await sub.get()).docs
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch()
      for (const x of docs.slice(i, i + 400)) batch.delete(x.ref)
      await batch.commit()
    }
    // meta/*
    for (const c of await db.collection(SUMMARIES).doc(d.id).listCollections()) {
      for (const x of (await c.get()).docs) await x.ref.delete()
    }
    await db.collection(SUMMARIES).doc(d.id).delete()
    console.log(`  ✗ borrado ${d.id} (+${docs.length} registros)`)
  }

  console.log('\nListo.')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
