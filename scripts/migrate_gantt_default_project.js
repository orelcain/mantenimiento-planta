/**
 * Migración: asigna proyecto por defecto a tareas Gantt legacy sin projectId.
 *
 * Uso:
 *   node scripts/migrate_gantt_default_project.js --dry-run
 *   node scripts/migrate_gantt_default_project.js --apply
 */

const admin = require('firebase-admin')
const serviceAccount = require('../serviceAccountKey.json')

const DEFAULT_PROJECT_ID = 'project-temporada-baja-antarfood-2026'
const DEFAULT_PROJECT_NAME = 'Temporada baja antarfood 2026'
const GANTT_TASKS_COLLECTION = 'ganttTasks'
const GANTT_PROJECTS_COLLECTION = 'ganttProjects'

const isApplyMode = process.argv.includes('--apply')

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}

const db = admin.firestore()

function hasProject(taskData) {
  if (!taskData) return false
  const projectId = typeof taskData.projectId === 'string' ? taskData.projectId.trim() : ''
  return projectId.length > 0
}

async function ensureDefaultProject() {
  const ref = db.collection(GANTT_PROJECTS_COLLECTION).doc(DEFAULT_PROJECT_ID)
  const snap = await ref.get()

  if (snap.exists) {
    console.log(`ℹ️ Proyecto base ya existe: ${DEFAULT_PROJECT_ID}`)
    return
  }

  const payload = {
    name: DEFAULT_PROJECT_NAME,
    active: true,
    description: 'Proyecto base creado por migración de tareas legacy.',
    createdBy: 'system-migration',
    createdByName: 'Migración automática',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }

  if (!isApplyMode) {
    console.log(`🧪 [dry-run] Se crearía proyecto base: ${DEFAULT_PROJECT_ID}`)
    return
  }

  await ref.set(payload, { merge: true })
  console.log(`✅ Proyecto base creado: ${DEFAULT_PROJECT_ID}`)
}

async function migrateTasks() {
  console.log('🔎 Leyendo tareas Gantt...')
  const snapshot = await db.collection(GANTT_TASKS_COLLECTION).get()

  const allDocs = snapshot.docs
  const legacyDocs = allDocs.filter((doc) => !hasProject(doc.data()))

  console.log(`📊 Total tareas: ${allDocs.length}`)
  console.log(`📌 Tareas sin proyecto: ${legacyDocs.length}`)

  if (legacyDocs.length === 0) {
    console.log('✅ No hay tareas legacy por migrar.')
    return
  }

  if (!isApplyMode) {
    console.log('🧪 Modo dry-run: no se aplicaron cambios.')
    return
  }

  const BATCH_SIZE = 400
  let updated = 0

  for (let index = 0; index < legacyDocs.length; index += BATCH_SIZE) {
    const batch = db.batch()
    const chunk = legacyDocs.slice(index, index + BATCH_SIZE)

    chunk.forEach((taskDoc) => {
      batch.update(taskDoc.ref, {
        projectId: DEFAULT_PROJECT_ID,
        projectName: DEFAULT_PROJECT_NAME,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })

    await batch.commit()
    updated += chunk.length
    console.log(`✅ Lote aplicado: ${updated}/${legacyDocs.length}`)
  }

  console.log(`🎉 Migración completada. Tareas actualizadas: ${updated}`)
}

async function main() {
  console.log('==============================================')
  console.log('MIGRACIÓN GANTT: PROYECTO BASE LEGACY')
  console.log(`Modo: ${isApplyMode ? 'APPLY' : 'DRY-RUN'}`)
  console.log('==============================================')

  await ensureDefaultProject()
  await migrateTasks()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error en migración:', error)
    process.exit(1)
  })
