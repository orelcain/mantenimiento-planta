#!/usr/bin/env node
/**
 * cleanup_machines.js
 *
 * Limpieza de la colección machines:
 *   1. Normaliza hierarchyNodeId uppercase → lowercase
 *   2. Elimina duplicados conocidos (conserva el doc con ID legible)
 *   3. Limpia nodeId="none" → null
 *
 * Uso:
 *   node scripts/cleanup_machines.js            → dry-run
 *   node scripts/cleanup_machines.js --execute  → aplica cambios
 */

const admin = require('firebase-admin')
const path  = require('path')

const sa = require(path.resolve(__dirname, '..', 'serviceAccountKey.json'))
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const DRY_RUN = !process.argv.includes('--execute')

// IDs a eliminar (duplicados con IDs auto-generados, conservamos el legible)
// key=ID a eliminar, value=razón
const DELETE_IDS = {
  'SW2RNI1RCdqSQbslwnKZ': 'Duplicado de fishken (Fishken)',
  'multivac':             'Duplicado de gea-v2 (GEA → GEA V2)',
  'sin-asignar':          'Máquina placeholder sin datos reales',
}

async function main() {
  console.log('\n' + '═'.repeat(60))
  console.log('  🧹  Limpieza colección machines')
  if (DRY_RUN) console.log('  ⚠️   DRY-RUN — usa --execute para aplicar')
  console.log('═'.repeat(60))

  const snap = await db.collection('machines').get()
  const docs = snap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() }))

  const batch = db.batch()
  let updates = 0
  let deletes = 0

  for (const { id, ref, data } of docs) {
    // 1. Eliminar duplicados conocidos
    if (DELETE_IDS[id]) {
      console.log(`  🗑  DELETE  ${id.padEnd(35)} — ${DELETE_IDS[id]}`)
      if (!DRY_RUN) batch.delete(ref)
      deletes++
      continue
    }

    const changes = {}

    // 2. Normalizar hierarchyNodeId uppercase → lowercase
    if (data.hierarchyNodeId && data.hierarchyNodeId !== data.hierarchyNodeId.toLowerCase()) {
      const newNodeId = data.hierarchyNodeId.toLowerCase()
      console.log(`  🔧  UPDATE  ${id.padEnd(35)} nodeId: ${data.hierarchyNodeId} → ${newNodeId}`)
      changes.hierarchyNodeId = newNodeId
    }

    // 3. Limpiar nodeId="none" → null
    if (data.hierarchyNodeId === 'none') {
      console.log(`  🔧  UPDATE  ${id.padEnd(35)} nodeId: "none" → null`)
      changes.hierarchyNodeId = null
    }

    if (Object.keys(changes).length > 0) {
      if (!DRY_RUN) batch.update(ref, { ...changes, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
      updates++
    }
  }

  console.log('\n' + '─'.repeat(60))
  console.log(`  Actualizaciones: ${updates}`)
  console.log(`  Eliminaciones:   ${deletes}`)

  if (!DRY_RUN && (updates + deletes) > 0) {
    await batch.commit()
    console.log('\n  ✅ Limpieza completada.')
  } else if (DRY_RUN) {
    console.log('\n  ▶  Ejecuta con --execute para aplicar.')
  } else {
    console.log('\n  ✅ Sin cambios necesarios.')
  }
  console.log('═'.repeat(60))
}

main().catch(console.error).finally(() => process.exit())
