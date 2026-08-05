/**
 * Exporta turnos REALES de Shoplogix a un fixture, para que los tests de
 * `graderShiftPeriod` corran contra datos de producción y no solo contra casos
 * escritos a mano.
 *
 * Por qué: la primera versión del servicio pasaba 16/16 tests inventados y aun
 * así tenía un bug — el turno cuya ventana efectiva cae entera en el día
 * siguiente a su dateKey (`2026-07-31_Turno 1`). Ningún caso imaginado lo
 * cubría; el dato real sí.
 *
 * Solo lectura. Uso:
 *   node scripts/export-shift-period-fixture.js
 */
const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const toIso = (ts) => {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString()
  if (ts._seconds != null) return new Date(ts._seconds * 1000).toISOString()
  if (ts instanceof Date) return ts.toISOString()
  return null
}

/** Solo los campos que consume `buildPeriodShifts`. */
async function exportMonth(plant, prefix) {
  const snap = await db.collection('shoplogix').doc(plant).collection('shifts')
    .where(admin.firestore.FieldPath.documentId(), '>=', `${prefix}-01_`)
    .where(admin.firestore.FieldPath.documentId(), '<=', `${prefix}-31_`)
    .get()

  return snap.docs.map((d) => {
    const x = d.data()
    const m = d.id.match(/^(\d{4}-\d{2}-\d{2})_(.+)$/)
    const machines = (Array.isArray(x.machines) ? x.machines : []).map((mm) => ({
      machineid: String(mm.machineid ?? ''),
      name: String(mm.name ?? ''),
      totalCycles: Number(mm.totalCycles ?? 0),
      uptimeSec: Number(mm.uptimeSec ?? 0),
      shiftRuntime: Number(mm.shiftRuntime ?? 0),
      overallRatio: Number(mm.overallRatio ?? 0),
      expectedTotalCycles: Number(mm.expectedTotalCycles ?? 0),
      breakdown: null,
    }))
    return {
      dateKey: m ? m[1] : d.id.slice(0, 10),
      shiftId: m ? m[2] : '?',
      scheduledStart: toIso(x.scheduledStart), scheduledEnd: toIso(x.scheduledEnd),
      effectiveStart: toIso(x.effectiveStart), effectiveEnd: toIso(x.effectiveEnd),
      officialStart: toIso(x.officialStart), officialEnd: toIso(x.officialEnd),
      lastSyncAt: null,
      parentSchemaVersion: Number(x.parentSchemaVersion ?? 1),
      correctionDetected: !!x.correctionDetected,
      reconciliationNote: x.reconciliationNote ?? null,
      hasAggregates: machines.length > 0,
      machines,
    }
  })
}

async function exportSummaries(prefix) {
  const snap = await db.collection('graderDailySummaries')
    .where('dateKey', '>=', `${prefix}-01`).where('dateKey', '<=', `${prefix}-31`).get()
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id, dateKey: x.dateKey, shiftId: x.shiftId, plantLineId: x.plantLineId ?? undefined,
      totalPieces: Number(x.totalPieces ?? 0),
      pointZeroPieces: Number(x.pointZeroPieces ?? 0),
      pointZeroPct: Number(x.pointZeroPct ?? 0),
      startAt: x.startAt ?? undefined, endAt: x.endAt ?? undefined,
      updatedBy: 'fixture', updatedAt: x.updatedAt ?? '',
    }
  })
}

;(async () => {
  const out = {
    _nota: 'Datos REALES de produccion. Generado por scripts/export-shift-period-fixture.js — no editar a mano.',
    yal_2026_07: { parents: await exportMonth('yal', '2026-07'), summaries: [] },
    chonchi_2026_07: { parents: await exportMonth('chonchi', '2026-07'), summaries: [] },
  }
  const sumJul = await exportSummaries('2026-07')
  out.yal_2026_07.summaries = sumJul.filter((s) => s.plantLineId === 'yal-eviscerado')
  out.chonchi_2026_07.summaries = sumJul.filter((s) => !s.plantLineId || s.plantLineId === 'chonchi-eviscerado')

  const dest = path.join(__dirname, '..', 'apps', 'pwa', 'src', 'services', 'grader',
    '__tests__', 'fixtures', 'shiftPeriod.real.json')
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, JSON.stringify(out, null, 1))
  console.log(`escrito ${dest}`)
  console.log(`  yal 2026-07     : ${out.yal_2026_07.parents.length} padres, ${out.yal_2026_07.summaries.length} summaries`)
  console.log(`  chonchi 2026-07 : ${out.chonchi_2026_07.parents.length} padres, ${out.chonchi_2026_07.summaries.length} summaries`)
  process.exit(0)
})()
