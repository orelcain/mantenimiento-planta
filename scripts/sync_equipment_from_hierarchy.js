/*
  Sync de Equipos desde Jerarquía

  Objetivo:
  - Tomar todos los nodos de Firestore /hierarchy con nivel >= 5 (Sub-sistema en adelante)
  - Crear/actualizar documentos en /equipment con el mismo ID del nodo
  - Mantener estado/criticidad existentes (no sobreescribirlos)

  Requisitos:
  - Credenciales de servicio (recomendado):
      $env:GOOGLE_APPLICATION_CREDENTIALS="C:\ruta\service-account.json"

  Uso:
    node scripts/sync_equipment_from_hierarchy.js

  Flags:
    --dry-run        (no escribe, solo reporta)
    --include-inactive (incluye nodos inactivos)
    --help
*/

const admin = require('firebase-admin')

const HIERARCHY_COLLECTION = 'hierarchy'
const EQUIPMENT_COLLECTION = 'equipment'
// Según lo acordado: desde Sub-sistema (nivel 5) en adelante
const MIN_EQUIPMENT_LEVEL = 5

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)

    // flags sin valor
    if (key === 'dry-run' || key === 'include-inactive' || key === 'help') {
      args[key] = true
      continue
    }

    const value = argv[i + 1]
    if (value == null || value.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = value
    i++
  }
  return args
}

function printHelp() {
  console.log('=== sync_equipment_from_hierarchy ===')
  console.log('Crea/actualiza /equipment desde /hierarchy (nivel >= 5: Sub-sistema en adelante)')
  console.log('')
  console.log('Uso:')
  console.log('  node scripts/sync_equipment_from_hierarchy.js')
  console.log('')
  console.log('Flags:')
  console.log('  --dry-run          No escribe, solo muestra conteos')
  console.log('  --include-inactive Incluye nodos inactivos')
  console.log('')
  console.log('Ejemplo (PowerShell):')
  console.log('  $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\ruta\\service-account.json"')
  console.log('  node scripts/sync_equipment_from_hierarchy.js --dry-run')
}

function computeHierarchyPath(nodeId, nodeMap) {
  const names = []
  const seen = new Set()
  let currentId = nodeId

  while (currentId) {
    if (seen.has(currentId)) break
    seen.add(currentId)

    const node = nodeMap.get(currentId)
    if (!node) break

    if (node.nombre) names.push(String(node.nombre))
    currentId = node.parentId ? String(node.parentId) : ''
  }

  return names.reverse().join(' > ')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printHelp()
    process.exit(0)
  }

  const dryRun = Boolean(args['dry-run'])
  const includeInactive = Boolean(args['include-inactive'])

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn('[sync_equipment_from_hierarchy] Aviso: GOOGLE_APPLICATION_CREDENTIALS no está definido. Si esto falla, configura la variable con tu service-account.json')
  }

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    })
  }

  const db = admin.firestore()

  console.log('[sync_equipment_from_hierarchy] Cargando jerarquía...')
  const hierarchySnap = await db.collection(HIERARCHY_COLLECTION).get()

  const nodeMap = new Map()
  const equipmentNodes = []

  hierarchySnap.forEach((doc) => {
    const data = doc.data() || {}
    const node = {
      id: doc.id,
      codigo: data.codigo,
      nombre: data.nombre,
      parentId: data.parentId,
      nivel: data.nivel,
      activo: data.activo,
    }

    nodeMap.set(doc.id, node)

    const isEquipmentLevel = Number(node.nivel) >= MIN_EQUIPMENT_LEVEL
    const isActiveOk = includeInactive ? true : Boolean(node.activo)
    const hasCodigo = typeof node.codigo === 'string' && node.codigo.trim().length > 0
    const hasNombre = typeof node.nombre === 'string' && node.nombre.trim().length > 0

    if (isEquipmentLevel && isActiveOk && hasCodigo && hasNombre) {
      equipmentNodes.push(node)
    }
  })

  console.log('[sync_equipment_from_hierarchy] Nodos candidatos:', equipmentNodes.length)

  console.log('[sync_equipment_from_hierarchy] Cargando equipos existentes...')
  const existingEquipSnap = await db.collection(EQUIPMENT_COLLECTION).get()
  const existingById = new Map()
  existingEquipSnap.forEach((doc) => existingById.set(doc.id, doc.data() || {}))

  let toCreate = 0
  let toUpdate = 0
  let skipped = 0

  // Preparar escrituras por lotes (máx 500)
  const batches = []
  let batch = db.batch()
  let batchCount = 0

  const now = admin.firestore.FieldValue.serverTimestamp()

  for (const node of equipmentNodes) {
    const equipmentId = node.id
    const ref = db.collection(EQUIPMENT_COLLECTION).doc(equipmentId)

    const hierarchyPath = computeHierarchyPath(node.id, nodeMap)

    const existing = existingById.get(equipmentId)
    if (existing && (existing.syncExcluded === true || existing.deleted === true)) {
      skipped++
      continue
    }

    if (!existing) {
      toCreate++
      if (!dryRun) {
        batch.set(
          ref,
          {
            codigo: String(node.codigo),
            nombre: String(node.nombre),
            hierarchyNodeId: equipmentId,
            hierarchyPath: hierarchyPath || undefined,
            criticidad: 'media',
            estado: 'operativo',
            createdAt: now,
            updatedAt: now,
          },
          { merge: false },
        )
      }
    } else {
      toUpdate++
      if (!dryRun) {
        batch.set(
          ref,
          {
            codigo: String(node.codigo),
            nombre: String(node.nombre),
            hierarchyNodeId: equipmentId,
            hierarchyPath: hierarchyPath || undefined,
            updatedAt: now,
          },
          { merge: true },
        )
      }
    }

    if (!dryRun) {
      batchCount++
      if (batchCount >= 450) {
        batches.push(batch)
        batch = db.batch()
        batchCount = 0
      }
    }
  }

  if (!dryRun && batchCount > 0) {
    batches.push(batch)
  }

  console.log('[sync_equipment_from_hierarchy] Resumen:')
  console.log('  Crear:', toCreate)
  console.log('  Actualizar:', toUpdate)
  console.log('  Omitidos (excluidos/eliminados):', skipped)
  console.log('  Dry-run:', dryRun)

  if (dryRun) {
    console.log('[sync_equipment_from_hierarchy] Dry-run activo: no se realizaron escrituras.')
    return
  }

  console.log('[sync_equipment_from_hierarchy] Escribiendo lotes:', batches.length)
  for (let i = 0; i < batches.length; i++) {
    await batches[i].commit()
    console.log(`  - Lote ${i + 1}/${batches.length} OK`)
  }

  console.log('[sync_equipment_from_hierarchy] Sync completado OK')
}

main().catch((err) => {
  console.error('[sync_equipment_from_hierarchy] Error:', err)
  process.exit(1)
})
