/**
 * Cleanup de registros erróneos del Grader:
 *  1. Upload duplicado mal etiquetado (Feb 6 2026 → en realidad jul 2025)
 *  2. 7 ghost records de jul 2025 con 0-3 piezas y >24h de duración
 *  3. 3 registros gigantes (>30k piezas, ~20h duración) probable fusión cross-day
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
const bucket = admin.storage().bucket()

// IDs a eliminar — extraídos de la inspección previa
const BAD_UPLOAD_ID = '2026-02-06__noche__PIEZA_PIEZA__Pieza_pieza_Grader_STATICGRADER1__20250701_000000_'
const BAD_UPLOAD_STORAGE_PATH = 'graderUploads/2026-02-06__noche__PIEZA_PIEZA__Pieza_pieza_Grader_STATICGRADER1__20250701_000000_/1775913270102_Pieza_pieza_Grader_STATICGRADER1__20250701_000000_-_20250801_000000_.xlsx'

const GHOST_SUMMARY_IDS = [
  '2025-07-01__Turno noche',
  '2025-07-02__Turno noche',
  '2025-07-03__Turno noche',
  '2025-07-07__Turno noche',
  '2025-07-08__Turno noche',
  '2025-07-09__Turno noche',
  '2025-07-10__Turno noche',
]

const GIANT_SUMMARY_IDS = [
  '2026-01-13__Turno día',
  '2025-10-14__Turno noche',
  '2025-07-21__Turno día',
]

async function deleteUpload() {
  console.log('=== 1. UPLOAD DUPLICADO MAL ETIQUETADO ===\n')
  const ref = db.collection('graderUploads').doc(BAD_UPLOAD_ID)
  const snap = await ref.get()
  if (!snap.exists) {
    console.log(`  [skip] no existe: ${BAD_UPLOAD_ID}`)
    return
  }
  await ref.delete()
  console.log(`  ✓ Borrado doc Firestore: ${BAD_UPLOAD_ID}`)

  // Borrar también del Storage
  try {
    await bucket.file(BAD_UPLOAD_STORAGE_PATH).delete()
    console.log(`  ✓ Borrado del Storage: ${BAD_UPLOAD_STORAGE_PATH}`)
  } catch (err) {
    console.log(`  [warn] no se pudo borrar del Storage: ${err.message}`)
  }
}

async function deleteSummaries(label, ids) {
  console.log(`\n=== ${label} ===\n`)
  let deleted = 0
  for (const id of ids) {
    const ref = db.collection('graderDailySummaries').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      console.log(`  [skip] no existe: ${id}`)
      continue
    }
    const data = snap.data()
    await ref.delete()
    console.log(`  ✓ Borrado: ${id} (${data.totalPieces?.toLocaleString('es-CL')} pz, ${data.durationMinutes}min)`)
    deleted += 1
  }
  console.log(`\n  Total borrados: ${deleted}/${ids.length}`)
}

async function main() {
  await deleteUpload()
  await deleteSummaries('2. GHOST RECORDS jul 2025 (0-3 pz, >24h)', GHOST_SUMMARY_IDS)
  await deleteSummaries('3. GIANT RECORDS (>30k pz, ~20h dur)', GIANT_SUMMARY_IDS)

  console.log('\n=== DONE ===')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERROR:', err)
    process.exit(1)
  })
