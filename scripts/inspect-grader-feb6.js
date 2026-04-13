/**
 * Inspecciona uploads y summaries del Grader para 2026-02-06
 * para entender qué archivos hay y qué data contienen.
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    storageBucket: `${sa.project_id}.appspot.com`,
  })
}

const db = admin.firestore()

async function main() {
  console.log('=== UPLOADS para 2026-02-06 ===\n')
  const uploadsSnap = await db.collection('graderUploads')
    .where('sessionDate', '==', '2026-02-06')
    .get()

  console.log(`Encontrados ${uploadsSnap.size} uploads con sessionDate=2026-02-06\n`)
  uploadsSnap.docs.forEach((d, i) => {
    const u = d.data()
    console.log(`[${i + 1}] id: ${u.id}`)
    console.log(`    shiftId: ${u.shiftId || '(no shift)'}`)
    console.log(`    fileMeta.name: ${u.fileMeta?.name}`)
    console.log(`    fileMeta.kind: ${u.fileMeta?.kind}`)
    console.log(`    fileMeta.storagePath: ${u.fileMeta?.storagePath}`)
    console.log(`    inferred.startAt: ${u.inferred?.startAt}`)
    console.log(`    inferred.endAt: ${u.inferred?.endAt}`)
    console.log(`    fileMeta.parsedAt: ${u.fileMeta?.parsedAt}`)
    console.log('')
  })

  console.log('\n=== SUMMARIES para 2026-02-06 ===\n')
  const summariesSnap = await db.collection('graderDailySummaries')
    .where('dateKey', '==', '2026-02-06')
    .get()

  console.log(`Encontrados ${summariesSnap.size} summaries\n`)
  summariesSnap.docs.forEach((d, i) => {
    const s = d.data()
    console.log(`[${i + 1}] id: ${s.id}`)
    console.log(`    shiftId: ${s.shiftId}`)
    console.log(`    totalPieces: ${s.totalPieces?.toLocaleString('es-CL')}`)
    console.log(`    pointZeroPieces: ${s.pointZeroPieces?.toLocaleString('es-CL')}`)
    console.log(`    pointZeroPct: ${s.pointZeroPct}%`)
    console.log(`    durationMinutes: ${s.durationMinutes}`)
    console.log(`    startAt: ${s.startAt}`)
    console.log(`    endAt: ${s.endAt}`)
    console.log('')
  })

  // También buscar uploads cercanos (días vecinos) cuyo timestamp pueda contener noche del 6
  console.log('\n=== UPLOADS para 2026-02-05, 2026-02-06, 2026-02-07 (todos) ===\n')
  for (const date of ['2026-02-05', '2026-02-06', '2026-02-07']) {
    const snap = await db.collection('graderUploads')
      .where('sessionDate', '==', date)
      .get()
    snap.docs.forEach((d) => {
      const u = d.data()
      console.log(`[${date}] ${u.shiftId || '(?)'} | start=${u.inferred?.startAt} end=${u.inferred?.endAt} | ${u.fileMeta?.name} (${u.fileMeta?.kind})`)
    })
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERROR:', err)
    process.exit(1)
  })
