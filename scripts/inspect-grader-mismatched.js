/**
 * Detecta uploads del Grader donde sessionDate no coincide con inferred.startAt
 * (típicamente files de bulk import mal etiquetados).
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

function dateKeyFromIso(iso) {
  if (!iso) return null
  return iso.slice(0, 10)
}

function spanInDays(startIso, endIso) {
  if (!startIso || !endIso) return null
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24) * 10) / 10
}

async function main() {
  const snap = await db.collection('graderUploads').get()
  console.log(`Total uploads: ${snap.size}\n`)

  const issues = []
  const longSpan = []
  snap.docs.forEach((d) => {
    const u = d.data()
    const startKey = dateKeyFromIso(u.inferred?.startAt)
    const endKey = dateKeyFromIso(u.inferred?.endAt)
    const span = spanInDays(u.inferred?.startAt, u.inferred?.endAt)

    // Caso 1: sessionDate no coincide con la fecha real del archivo
    if (u.sessionDate && startKey && u.sessionDate !== startKey) {
      issues.push({
        id: u.id,
        sessionDate: u.sessionDate,
        shiftId: u.shiftId,
        startKey,
        endKey,
        span,
        fileName: u.fileMeta?.name,
        kind: u.fileMeta?.kind,
      })
    }

    // Caso 2: archivo cubre más de 1 día
    if (span !== null && span > 1) {
      longSpan.push({
        id: u.id,
        sessionDate: u.sessionDate,
        shiftId: u.shiftId,
        startKey,
        endKey,
        spanDays: span,
        fileName: u.fileMeta?.name,
        kind: u.fileMeta?.kind,
      })
    }
  })

  console.log(`\n=== UPLOADS CON sessionDate ≠ fecha real (${issues.length}) ===\n`)
  issues.forEach((i, idx) => {
    console.log(`[${idx + 1}] sessionDate=${i.sessionDate} ${i.shiftId || '(?)'}`)
    console.log(`    fechas reales: ${i.startKey} → ${i.endKey} (${i.span} días)`)
    console.log(`    file: ${i.fileName} (${i.kind})`)
    console.log(`    id: ${i.id}`)
    console.log('')
  })

  console.log(`\n=== UPLOADS QUE CUBREN > 1 DÍA (${longSpan.length}) ===\n`)
  longSpan.forEach((i, idx) => {
    console.log(`[${idx + 1}] ${i.sessionDate} ${i.shiftId || '(?)'} | ${i.spanDays} días | ${i.kind}`)
    console.log(`    real: ${i.startKey} → ${i.endKey}`)
    console.log(`    file: ${i.fileName}`)
    console.log('')
  })

  console.log('\n=== RESUMEN ===')
  console.log(`Total uploads:                 ${snap.size}`)
  console.log(`Con sessionDate erróneo:       ${issues.length}`)
  console.log(`Cubriendo >1 día (multi-day):  ${longSpan.length}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERROR:', err)
    process.exit(1)
  })
