#!/usr/bin/env node
/**
 * Validación post-backfill: lee 3 turnos distintos (inicio/mitad/fin de
 * temporada) y verifica que su meta/pauses quedó bien poblado + que los
 * agregados del summary coinciden con la suma del detalle.
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) })
}
const db = admin.firestore()

const SAMPLES = [
  '2025-08-27__Turno noche',  // caso del fix: colación tardía (02:31-03:39)
  '2025-12-15__Turno día',    // turno super fragmentado (10 pausas)
  '2026-02-26__Turno noche',  // otro caso del fix
]

async function inspectShift(id) {
  console.log(`\n━━━ ${id} ━━━`)
  const summaryRef = db.doc(`graderDailySummaries/${id}`)
  const summary = (await summaryRef.get()).data()
  if (!summary) { console.log('  ❌ summary no existe'); return }

  console.log(`  summary.totalDeadTimeSec:       ${summary.totalDeadTimeSec ?? 'MISSING'} (${Math.round((summary.totalDeadTimeSec ?? 0) / 60)} min)`)
  console.log(`  summary.microDetentionsCount:   ${summary.microDetentionsCount ?? 'MISSING'}`)
  console.log(`  summary.microDetentionsTotalSec:${summary.microDetentionsTotalSec ?? 'MISSING'}`)
  console.log(`  summary.pausesCount:            ${summary.pausesCount ?? 'MISSING'}`)

  const pausesRef = summaryRef.collection('meta').doc('pauses')
  const pausesDoc = await pausesRef.get()
  if (!pausesDoc.exists) { console.log('  ❌ meta/pauses no existe'); return }
  const data = pausesDoc.data()
  const pauses = data.pauses ?? []
  const micro = data.microDetentions ?? {}

  console.log(`  meta/pauses.pauses.length:      ${pauses.length}`)
  console.log(`  meta/pauses.microDet.count:     ${micro.count}`)
  console.log(`  meta/pauses.schemaVersion:      ${data.schemaVersion}`)

  // Consistencia
  const pausesSumSec = pauses.reduce((s, p) => s + (p.durationSec ?? 0), 0)
  const totalFromDetail = pausesSumSec + (micro.totalSec ?? 0)
  const matchDead = Math.abs(totalFromDetail - (summary.totalDeadTimeSec ?? 0)) < 2
  const matchCount = (summary.pausesCount ?? -1) === pauses.length
  const matchMicro = (summary.microDetentionsCount ?? -1) === (micro.count ?? 0)

  console.log(`  consistencia dead time:         ${matchDead ? '✅' : '❌'} (detail=${totalFromDetail}s vs summary=${summary.totalDeadTimeSec}s)`)
  console.log(`  consistencia pausesCount:       ${matchCount ? '✅' : '❌'}`)
  console.log(`  consistencia microCount:        ${matchMicro ? '✅' : '❌'}`)

  const colacionCount = pauses.filter(p => p.autoTag === 'colacion').length
  console.log(`  colaciones auto-detectadas:     ${colacionCount}`)
  for (const p of pauses) {
    const startHM = p.startAt.slice(11, 16)
    const endHM = p.endAt.slice(11, 16)
    const durMin = Math.round(p.durationSec / 60)
    const mark = p.autoTag === 'colacion' ? '🍽️ ' : '   '
    console.log(`    ${mark}${p.tier.padEnd(7)} ${startHM}-${endHM} (${durMin}min)  id=${p.id}`)
  }
}

async function main() {
  console.log('=== VALIDACIÓN POST-BACKFILL ===')
  for (const id of SAMPLES) {
    await inspectShift(id)
  }
  console.log('')
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1) })
