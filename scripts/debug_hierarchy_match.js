#!/usr/bin/env node
/**
 * debug_hierarchy_match.js
 *
 * Verifica si los hierarchyNodeId de las máquinas coinciden con los
 * document IDs reales en la colección 'hierarchy' de Firestore.
 *
 * Uso: node scripts/debug_hierarchy_match.js
 */

const admin = require('firebase-admin')
const path  = require('path')

const sa = require(path.resolve(__dirname, '..', 'serviceAccountKey.json'))
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const SEP = '═'.repeat(70)
const sep = '─'.repeat(70)

async function main() {
  console.log('\n' + SEP)
  console.log('  🔎  Diagnóstico de coincidencia jerarquía ↔ máquinas')
  console.log(SEP)

  // Leer todos los nodos del árbol de jerarquía
  const hierarchySnap = await db.collection('hierarchy').get()
  const hierarchyIds  = new Set(hierarchySnap.docs.map(d => d.id))
  const hierarchyById = new Map(hierarchySnap.docs.map(d => [d.id, d.data()]))

  console.log(`\n  Nodos en colección 'hierarchy': ${hierarchyIds.size}`)

  // Leer todas las máquinas activas
  const machinesSnap = await db.collection('machines').get()
  const machines = machinesSnap.docs.map(d => ({
    id: d.id,
    nombre: d.data().nombre || d.id,
    hierarchyNodeId: d.data().hierarchyNodeId || null,
    activa: d.data().activa !== false,
  })).filter(m => m.activa)

  console.log(`  Máquinas activas: ${machines.length}`)

  // Nodos de interés (proceso)
  const AREAS_INTERES = [
    'aq-in-cho-pcho-proc-evis',
    'aq-in-cho-pcho-proc-file',
    'aq-in-cho-pcho-proc-empa',
    'aq-in-cho-pcho-proc-empq',
  ]

  console.log('\n' + sep)
  console.log('  📍  Nodos de proceso — ¿existen en hierarchy?\n')
  for (const id of AREAS_INTERES) {
    const exists = hierarchyIds.has(id)
    const node   = hierarchyById.get(id)
    if (exists) {
      console.log(`  ✅  ${id.padEnd(35)} → "${node?.nombre}" (nivel ${node?.nivel})`)
    } else {
      console.log(`  ❌  ${id.padEnd(35)} → NO EXISTE en la colección hierarchy`)
    }
  }

  // Agrupar máquinas por hierarchyNodeId
  console.log('\n' + sep)
  console.log('  🤝  Coincidencia máquinas ↔ nodo de jerarquía\n')

  const grouped = new Map()
  for (const m of machines) {
    const key = m.hierarchyNodeId || '__none__'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(m)
  }

  for (const [nodeId, mList] of [...grouped.entries()].sort()) {
    const inTree = nodeId === '__none__' ? false : hierarchyIds.has(nodeId)
    const nodeData = hierarchyById.get(nodeId)
    const status   = nodeId === '__none__' ? '⚠️  sin área'
                   : inTree ? `✅  "${nodeData?.nombre}"`
                   : `❌  ID no existe en hierarchy`

    console.log(`\n  ${nodeId.padEnd(35)} ${status}`)
    for (const m of mList) {
      console.log(`      • ${m.id.padEnd(28)} ${m.nombre}`)
    }
  }

  console.log('\n' + SEP + '\n')
}

main().catch(console.error).finally(() => process.exit())
