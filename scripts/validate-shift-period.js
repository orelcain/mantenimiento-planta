/**
 * Validación SOLO LECTURA del hook useGraderShiftPeriod contra datos reales.
 *
 * No verifica que el código "corra": verifica que las ASUNCIONES sobre la forma
 * de los datos sean ciertas. Cada asunción falsa es un bug que no aparecería
 * hasta que alguien abra la vista en producción.
 *
 * Uso: node validar-hook.js
 */
const admin = require('firebase-admin')
const sa = require('D:/a/APP leventamiento de insidencias en planta/serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const toDate = (ts) => {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate()
  if (ts._seconds != null) return new Date(ts._seconds * 1000)
  if (ts instanceof Date) return ts
  return null
}
const dk = (d) => (d ? d.toISOString().slice(0, 10) : null)
const hhmm = (d) => (d ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : '—')

async function parentsForMonth(plant, prefix) {
  const ref = db.collection('shoplogix').doc(plant).collection('shifts')
  const snap = await ref
    .where(admin.firestore.FieldPath.documentId(), '>=', `${prefix}-01_`)
    .where(admin.firestore.FieldPath.documentId(), '<=', `${prefix}-31_\uf8ff`)
    .get()
  return snap.docs.map((d) => {
    const x = d.data()
    const m = d.id.match(/^(\d{4}-\d{2}-\d{2})_(.+)$/)
    const machines = Array.isArray(x.machines) ? x.machines : []
    return {
      docId: d.id,
      dateKey: m ? m[1] : d.id.slice(0, 10),
      shiftId: m ? m[2] : '?',
      scheduledStart: toDate(x.scheduledStart), scheduledEnd: toDate(x.scheduledEnd),
      effectiveStart: toDate(x.effectiveStart), effectiveEnd: toDate(x.effectiveEnd),
      officialStart:  toDate(x.officialStart),  officialEnd:  toDate(x.officialEnd),
      machines,
      hasAggregates: machines.length > 0 && machines.some((mm) => mm.totalCycles != null),
      cycles: machines.reduce((a, mm) => a + (Number(mm.totalCycles) || 0), 0),
    }
  })
}

async function summariesForMonth(prefix) {
  const snap = await db.collection('graderDailySummaries')
    .where('dateKey', '>=', `${prefix}-01`)
    .where('dateKey', '<=', `${prefix}-31`)
    .get()
  return snap.docs.map((d) => d.data())
}

function windowOf(p) {
  if (p.effectiveStart && p.effectiveEnd) return { s: p.effectiveStart, e: p.effectiveEnd, src: 'effective' }
  if (p.officialStart && p.officialEnd)   return { s: p.officialStart,  e: p.officialEnd,  src: 'official' }
  if (p.scheduledStart && p.scheduledEnd) return { s: p.scheduledStart, e: p.scheduledEnd, src: 'scheduled' }
  return { s: null, e: null, src: 'none' }
}

async function auditar(plant, prefix, plantLineId) {
  const [parents, allSummaries] = await Promise.all([
    parentsForMonth(plant, prefix), summariesForMonth(prefix),
  ])
  const summaries = allSummaries.filter((s) =>
    plantLineId === 'chonchi-eviscerado'
      ? (!s.plantLineId || s.plantLineId === 'chonchi-eviscerado')
      : s.plantLineId === plantLineId)

  if (parents.length === 0 && summaries.length === 0) return null

  const NOISE = 50
  const conDatos = parents.filter((p) => p.cycles >= NOISE)
  const shiftIds = [...new Set(conDatos.map((p) => p.shiftId))]
  const srcCount = {}
  let cruzan = 0, anclaOk = 0, anclaMal = 0
  const ejemplosCruce = [], anomalias = []

  for (const p of conDatos) {
    const w = windowOf(p)
    srcCount[w.src] = (srcCount[w.src] || 0) + 1
    if (w.s) {
      // ASUNCIÓN: dateKey del doc == día calendario en que ARRANCA el turno
      if (dk(w.s) === p.dateKey) anclaOk++
      else { anclaMal++; anomalias.push(`${p.docId} arranca ${dk(w.s)} pero su dateKey es ${p.dateKey}`) }
    }
    if (w.s && w.e && dk(w.s) !== dk(w.e)) {
      cruzan++
      if (ejemplosCruce.length < 4) {
        ejemplosCruce.push(`${p.dateKey} ${p.shiftId}: ${hhmm(w.s)} → ${hhmm(w.e)} (${dk(w.e)}) · ${p.cycles} cic`)
      }
    }
  }

  // ASUNCIÓN: el summary del Grader puede estar bajo OTRO shiftId que el padre
  const parentKeys = new Set(conDatos.map((p) => `${p.dateKey}__${p.shiftId}`))
  const sumKeys = summaries.map((s) => `${s.dateKey}__${s.shiftId}`)
  const sumSinPadre = sumKeys.filter((k) => !parentKeys.has(k))
  const sinAgregados = parents.filter((p) => p.cycles >= NOISE && !p.hasAggregates).length

  return {
    plant, prefix, plantLineId,
    parents: parents.length, conDatos: conDatos.length, ruido: parents.length - conDatos.length,
    shiftIds, srcCount, cruzan, anclaOk, anclaMal, anomalias,
    ejemplosCruce, summaries: summaries.length, sumSinPadre, sinAgregados,
    maxPorDia: Math.max(0, ...Object.values(conDatos.reduce((acc, p) => {
      acc[p.dateKey] = (acc[p.dateKey] || 0) + 1; return acc
    }, {}))),
  }
}

;(async () => {
  const objetivos = [
    ['yal', 'yal-eviscerado'],
    ['chonchi', 'chonchi-eviscerado'],
    ['filete', 'filete-linea1'],
  ]
  const meses = ['2026-05', '2026-06', '2026-07', '2026-08']
  const resultados = []

  for (const [plant, lineId] of objetivos) {
    for (const mes of meses) {
      const r = await auditar(plant, mes, lineId).catch((e) => ({ plant, prefix: mes, err: e.message }))
      if (r) resultados.push(r)
    }
  }

  console.log('\n================ VALIDACIÓN DEL HOOK vs DATOS REALES ================\n')
  for (const r of resultados) {
    if (r.err) { console.log(`${r.plant} ${r.prefix}: ERROR ${r.err}\n`); continue }
    console.log(`── ${r.plant.toUpperCase()} · ${r.prefix} ─────────────────────────────`)
    console.log(`   turnos: ${r.conDatos} con datos (+${r.ruido} ruido <50 cic) · máx ${r.maxPorDia}/día`)
    console.log(`   shiftIds distintos (= FILAS de la matriz): ${r.shiftIds.length} → ${r.shiftIds.join(', ')}`)
    console.log(`   ventana usada: ${JSON.stringify(r.srcCount)}`)
    console.log(`   CRUZAN MEDIANOCHE: ${r.cruzan} de ${r.conDatos}`)
    r.ejemplosCruce.forEach((e) => console.log(`      · ${e}`))
    console.log(`   ancla dateKey==día de inicio: ${r.anclaOk} ok / ${r.anclaMal} mal`)
    r.anomalias.slice(0, 3).forEach((a) => console.log(`      ⚠ ${a}`))
    console.log(`   grader summaries: ${r.summaries} · sin padre exacto (→ alias): ${r.sumSinPadre.length}`)
    r.sumSinPadre.slice(0, 3).forEach((k) => console.log(`      · ${k}`))
    if (r.sinAgregados > 0) console.log(`   ⚠ padres con ciclos pero SIN agregados: ${r.sinAgregados}`)
    console.log('')
  }
  process.exit(0)
})()
