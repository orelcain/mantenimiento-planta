#!/usr/bin/env node
/**
 * list_hierarchy_equipment.js
 *
 * Diagnóstico: lista los nodos con código numérico (equipos SAP) bajo cada área
 * de proceso y los cruza con las máquinas manuales existentes.
 *
 * Uso: node scripts/list_hierarchy_equipment.js
 */

const admin = require('firebase-admin')
const path  = require('path')

const sa = require(path.resolve(__dirname, '..', 'serviceAccountKey.json'))
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const SEP = '='.repeat(70)
const sep = '-'.repeat(70)

/** Código numérico = equipo SAP */
function isEquipmentCode(codigo) {
  return /^\d+$/.test(String(codigo || ''))
}

async function main() {
  console.log('\n' + SEP)
  console.log('  Diagnóstico: Equipos SAP en jerarquía vs máquinas manuales')
  console.log(SEP)

  // 1. Cargar toda la jerarquía
  const hierSnap = await db.collection('hierarchy').get()
  const nodes = new Map()
  hierSnap.docs.forEach(d => {
    nodes.set(d.id, { id: d.id, ...d.data() })
  })
  console.log(`\n  Nodos en hierarchy: ${nodes.size}`)

  // 2. Cargar máquinas manuales
  const machSnap = await db.collection('machines').get()
  const machines = machSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(m => m.activa !== false)
  console.log(`  Máquinas activas: ${machines.length}`)

  // 3. Áreas de interés (nivel 4 = SISTEMA en proceso)
  const AREAS = [
    'aq-in-cho-pcho-proc-evis',  // Eviscerado
    'aq-in-cho-pcho-proc-file',  // Filete
    'aq-in-cho-pcho-proc-empa',  // Emparrillado
    'aq-in-cho-pcho-proc-empq',  // Empaque
    'aq-in-cho-acop-caam',       // Caseta Agua Mar
    'aq-in-cho-acop',            // Acopio (raíz)
  ]

  // 4. Función recursiva: encontrar todos los descendientes de un nodo
  function getDescendants(parentId, depth = 0) {
    const result = []
    for (const [id, node] of nodes) {
      if (node.parentId === parentId) {
        result.push({ ...node, depth })
        result.push(...getDescendants(id, depth + 1))
      }
    }
    return result
  }

  // 5. Para cada área, mostrar equipos (código numérico) y sub-áreas
  console.log('\n' + SEP)
  console.log('  EQUIPOS SAP POR ÁREA')
  console.log(SEP)

  const allEquipmentIds = new Set()

  for (const areaId of AREAS) {
    const area = nodes.get(areaId)
    if (!area) {
      console.log(`\n  [!] ${areaId} — NO EXISTE en hierarchy`)
      continue
    }

    const descendants = getDescendants(areaId)
    const equipment = descendants.filter(d => isEquipmentCode(d.codigo))
    const areas = descendants.filter(d => !isEquipmentCode(d.codigo))

    console.log(`\n  ${area.nombre} (${areaId})`)
    console.log(`  Sub-áreas: ${areas.length} | Equipos SAP: ${equipment.length}`)
    console.log(sep)

    if (equipment.length === 0) {
      console.log('    (sin equipos SAP)')
    } else {
      for (const eq of equipment) {
        const indent = '  '.repeat(eq.depth)
        const parentNode = nodes.get(eq.parentId)
        const parentName = parentNode ? parentNode.nombre : '?'
        console.log(`    ${indent}${eq.codigo.padEnd(12)} ${eq.nombre.padEnd(40)} [padre: ${parentName}] nivel=${eq.nivel}`)
        allEquipmentIds.add(eq.id)
      }
    }
  }

  // 6. Buscar equipos SAP en TODA la jerarquía (no solo las áreas listadas)
  console.log('\n' + SEP)
  console.log('  TODOS LOS NODOS CON CÓDIGO NUMÉRICO (equipos SAP)')
  console.log(SEP)

  const allEquipment = []
  for (const [id, node] of nodes) {
    if (isEquipmentCode(node.codigo)) {
      allEquipment.push(node)
    }
  }
  console.log(`\n  Total equipos SAP en hierarchy: ${allEquipment.length}`)

  // Agrupar por parent
  const byParent = new Map()
  for (const eq of allEquipment) {
    const parent = nodes.get(eq.parentId)
    const key = parent ? `${parent.nombre} (${eq.parentId})` : `??? (${eq.parentId})`
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(eq)
  }

  for (const [parentLabel, eqs] of [...byParent.entries()].sort()) {
    console.log(`\n  ${parentLabel}:`)
    for (const eq of eqs.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)))) {
      console.log(`    ${String(eq.codigo).padEnd(12)} ${eq.nombre}`)
    }
  }

  // 7. Cruce con máquinas manuales
  console.log('\n' + SEP)
  console.log('  MÁQUINAS MANUALES — candidatos a vincular')
  console.log(SEP)

  for (const m of machines.sort((a, b) => a.id.localeCompare(b.id))) {
    const areaNode = m.hierarchyNodeId ? nodes.get(m.hierarchyNodeId) : null
    const areaName = areaNode ? areaNode.nombre : '(sin área)'

    // Buscar posible match en equipos SAP por nombre similar
    let bestMatch = null
    const mName = (m.nombre || m.id).toLowerCase()
    for (const eq of allEquipment) {
      const eqName = (eq.nombre || '').toLowerCase()
      if (eqName.includes(mName) || mName.includes(eqName.split(' ')[0])) {
        bestMatch = eq
        break
      }
    }

    console.log(`\n  ${m.id.padEnd(28)} "${m.nombre || m.id}"`)
    console.log(`    Área actual: ${areaName} (${m.hierarchyNodeId || 'null'})`)
    if (bestMatch) {
      console.log(`    Posible match SAP: ${bestMatch.codigo} — "${bestMatch.nombre}" (${bestMatch.id})`)
    } else {
      console.log(`    Posible match SAP: ninguno encontrado`)
    }
  }

  console.log('\n' + SEP + '\n')
}

main().catch(console.error).finally(() => process.exit())
