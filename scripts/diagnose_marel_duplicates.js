/**
 * diagnose_marel_duplicates.js
 *
 * Diagnóstico de las dos máquinas Marel en Eviscerado:
 *  - marel-eviscerado (126 rep.)
 *  - marel-pendiente (26 rep.)
 *
 * Muestra repuestos de cada una, detecta duplicados por codigoSAP,
 * codigoFabricante y textoBreve normalizado.
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function normalize(str) {
  return (str || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

async function diagnose() {
  const machineIds = ['marel-eviscerado', 'marel-pendiente']

  const allRepuestos = {}

  for (const machineId of machineIds) {
    const machineDoc = await db.collection('machines').doc(machineId).get()
    if (!machineDoc.exists) {
      console.log(`\n❌ Máquina "${machineId}" NO EXISTE`)
      continue
    }
    const data = machineDoc.data()
    console.log(`\n══════════════════════════════════════════`)
    console.log(`📦 ${machineId}`)
    console.log(`   nombre: ${data.nombre}`)
    console.log(`   marca: ${data.marca || '-'}`)
    console.log(`   modelo: ${data.modelo || '-'}`)
    console.log(`   activa: ${data.activa}`)
    console.log(`   hierarchyNodeId: ${data.hierarchyNodeId || '-'}`)

    const repSnap = await db.collection(`machines/${machineId}/repuestos`).get()
    console.log(`   repuestos: ${repSnap.size}`)

    allRepuestos[machineId] = []
    for (const doc of repSnap.docs) {
      const r = doc.data()
      allRepuestos[machineId].push({
        docId: doc.id,
        codigoSAP: r.codigoSAP || '',
        codigoFabricante: r.codigoFabricante || r.codigoBaader || '',
        textoBreve: r.textoBreve || '',
        descripcion: r.descripcion || '',
        valorUnitario: r.valorUnitario || 0,
      })
    }
  }

  // Análisis de duplicados
  const repA = allRepuestos['marel-eviscerado'] || [] || []
  const repB = allRepuestos['marel-pendiente'] || []

  if (!repA.length || !repB.length) {
    console.log('\n⚠️  Una de las máquinas no tiene repuestos, no hay análisis de duplicados.')
    return
  }

  console.log(`\n══════════════════════════════════════════`)
  console.log(`🔍 ANÁLISIS DE DUPLICADOS`)
  console.log(`══════════════════════════════════════════`)

  // Indexar repA por codigoSAP y textoBreve normalizado
  const sapIndexA = new Map()
  const fabIndexA = new Map()
  const textoIndexA = new Map()

  for (const r of repA) {
    if (r.codigoSAP && r.codigoSAP !== 'pendiente' && r.codigoSAP !== 'N/A') {
      sapIndexA.set(r.codigoSAP, r)
    }
    if (r.codigoFabricante && r.codigoFabricante !== 'pendiente' && r.codigoFabricante !== 'N/A') {
      fabIndexA.set(normalize(r.codigoFabricante), r)
    }
    const key = normalize(r.textoBreve)
    if (key) textoIndexA.set(key, r)
  }

  const duplicados = []
  const soloEnHG = []

  for (const r of repB) {
    let match = null
    let matchType = ''

    // Match por codigoSAP
    if (r.codigoSAP && r.codigoSAP !== 'pendiente' && r.codigoSAP !== 'N/A') {
      if (sapIndexA.has(r.codigoSAP)) {
        match = sapIndexA.get(r.codigoSAP)
        matchType = 'SAP'
      }
    }

    // Match por codigoFabricante
    if (!match && r.codigoFabricante && r.codigoFabricante !== 'pendiente' && r.codigoFabricante !== 'N/A') {
      const normFab = normalize(r.codigoFabricante)
      if (fabIndexA.has(normFab)) {
        match = fabIndexA.get(normFab)
        matchType = 'FAB'
      }
    }

    // Match por textoBreve
    if (!match) {
      const normTexto = normalize(r.textoBreve)
      if (normTexto && textoIndexA.has(normTexto)) {
        match = textoIndexA.get(normTexto)
        matchType = 'TEXTO'
      }
    }

    if (match) {
      duplicados.push({ hg: r, evis: match, matchType })
    } else {
      soloEnHG.push(r)
    }
  }

  console.log(`\n📊 Resumen:`)
  console.log(`   marel-eviscerado: ${repA.length} repuestos`)
  console.log(`   marel-pendiente:         ${repB.length} repuestos`)
  console.log(`   ─────────────────────────────────`)
  console.log(`   Duplicados encontrados: ${duplicados.length}`)
  console.log(`   Solo en marel-pendiente (únicos): ${soloEnHG.length}`)
  console.log(`   Total tras fusión: ${repA.length + soloEnHG.length}`)

  if (duplicados.length > 0) {
    console.log(`\n🔴 DUPLICADOS (${duplicados.length}):`)
    for (const d of duplicados) {
      console.log(`   [${d.matchType}] SAP:${d.hg.codigoSAP || '-'} FAB:${d.hg.codigoFabricante || '-'}`)
      console.log(`      HG:   ${d.hg.textoBreve}`)
      console.log(`      EVIS: ${d.evis.textoBreve}`)
    }
  }

  if (soloEnHG.length > 0) {
    console.log(`\n🟢 SOLO EN marel-pendiente — se moverán a marel-eviscerado (${soloEnHG.length}):`)
    for (const r of soloEnHG) {
      console.log(`   • SAP:${r.codigoSAP || '-'} FAB:${r.codigoFabricante || '-'} | ${r.textoBreve}`)
    }
  }
}

diagnose().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
