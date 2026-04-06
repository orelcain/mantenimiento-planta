/**
 * Script: Asignar alias a repuestos por código SAP + crear listas de favoritos
 * Máquina: baader-142
 *
 * Uso:
 *   node scripts/set_alias_and_fav_lists.js --preview     (ver sin cambiar)
 *   node scripts/set_alias_and_fav_lists.js --execute      (aplicar cambios)
 *   node scripts/set_alias_and_fav_lists.js --execute --user=USER_ID  (crear listas fav)
 */

const admin = require('firebase-admin')
if (!admin.apps.length) admin.initializeApp()
const db = admin.firestore()

const DRY_RUN = !process.argv.includes('--execute')
const USER_ID = (() => {
  const arg = process.argv.find(a => a.startsWith('--user='))
  return arg ? arg.split('=')[1] : null
})()

const MACHINE_ID = 'baader-142'
const COL = `machines/${MACHINE_ID}/repuestos`

// ── Datos del Excel: SAP → alias (nombre común del técnico) ──
const ALIAS_MAP = {
  // RESORTES
  '3300126381': 'Resorte chapaleta de entrada',
  '3300111948': 'Resorte de tracción (herramienta C)',
  '3300012407': 'Resorte medidor largo',
  '3300012430': 'Resorte de medidor de altura y centrador',
  '3300011875': 'Resorte carros (abrazadera/mordaza)',
  '3300106055': 'Resorte carros (abrazadera/mordaza)',
  '3300048553': 'Resorte dedos palpadores',
  // CORREAS
  '3300084243': 'Correa 800 5M',
  '3300035280': 'Correa 835 5M',
  '3300012306': 'Correa registrador N° revoluciones (encoder)',
  '3300106148': 'Correa circular sin fin verde',
  '3300011872': 'Correa cuchilla circular',
  // CUCHILLOS
  '3300011880': 'Cuchilla membrana (aspirador)',
  '3300012256': 'Cuchilla guillotina / hoja móvil',
  '3300012257': 'Cuchillo circular',
  '3300105943': 'Cuchillo excavador A',
  // REPUESTOS GENERALES
  '3300035316': 'Eslabón cadena cinta prisma',
  '3300115674': 'Soporte empujador',
  '3300074792': 'Pasador y perno expulsador',
  '3300035285': 'Bujes de expulsador',
  '3300058572': 'Casquillo (polea superior cinta salida)',
  '3300027307': 'Punto de engrase (ancho)',
  // SENSORES
  '3300098470': 'Sensor herramienta C',
  '3300012350': 'Sensor inductivo con cable',
  '3300128967': 'Sensor sonda nivel tolva repaso',
  '3300103402': 'Sensor flujo capacitivo IFM SI5004 (cable)',
  // BOMBA SOPLADORA
  '3300083785': 'Bomba de vacío sopladora SB 1100D0',
}

// ── Listas de favoritos por tipo ──
const FAV_LISTS = [
  { name: 'Resortes', saps: ['3300126381','3300111948','3300012407','3300012430','3300011875','3300106055','3300048553'] },
  { name: 'Correas', saps: ['3300084243','3300035280','3300012306','3300106148','3300011872'] },
  { name: 'Cuchillos', saps: ['3300011880','3300012256','3300012257','3300105943'] },
  { name: 'Repuestos clave', saps: ['3300035316','3300115674','3300074792','3300035285','3300058572','3300027307'] },
  { name: 'Sensores', saps: ['3300098470','3300012350','3300128967','3300103402'] },
  { name: 'Bomba sopladora', saps: ['3300083785'] },
]

async function main() {
  console.log(`\n${DRY_RUN ? '🔍 PREVIEW' : '🚀 EJECUTANDO'} — Alias + Listas favoritos para ${MACHINE_ID}\n`)

  // 1. Cargar todos los repuestos de la máquina
  const snap = await db.collection(COL).get()
  console.log(`📦 ${snap.size} repuestos en ${MACHINE_ID}\n`)

  // Crear mapa SAP → docId
  const sapToDoc = new Map()
  for (const doc of snap.docs) {
    const sap = (doc.data().codigoSAP || '').trim()
    if (sap) sapToDoc.set(sap, { id: doc.id, data: doc.data() })
  }

  // 2. Asignar alias
  let aliasCount = 0
  for (const [sap, alias] of Object.entries(ALIAS_MAP)) {
    const doc = sapToDoc.get(sap)
    if (!doc) {
      console.log(`  ⚠ SAP ${sap} no encontrado — "${alias}"`)
      continue
    }
    const current = doc.data.alias || ''
    if (current === alias) {
      console.log(`  ✓ SAP ${sap} ya tiene alias: "${alias}"`)
      continue
    }
    console.log(`  → SAP ${sap}: alias "${current || '(vacío)'}" → "${alias}"`)
    if (!DRY_RUN) {
      await db.doc(`${COL}/${doc.id}`).update({ alias, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
    }
    aliasCount++
  }
  console.log(`\n✏️  ${aliasCount} alias ${DRY_RUN ? 'por asignar' : 'asignados'}\n`)

  // 3. Crear listas de favoritos (solo si --user=...)
  if (!USER_ID) {
    console.log('ℹ️  Para crear listas de favoritos, usa --user=USER_ID')
    console.log('   Ejemplo: node scripts/set_alias_and_fav_lists.js --execute --user=abc123\n')
  } else {
    // Buscar equipmentId (nodeId del hierarchy) para baader-142
    const hierSnap = await db.collection('hierarchy').where('activo', '==', true).get()
    const b142Nodes = []
    for (const doc of hierSnap.docs) {
      if (doc.data().linkedMachineId === MACHINE_ID) {
        b142Nodes.push({ id: doc.id, nombre: doc.data().nombre })
      }
    }

    if (b142Nodes.length === 0) {
      console.log('⚠ No se encontró nodo de jerarquía vinculado a baader-142')
    } else {
      for (const node of b142Nodes) {
        console.log(`📋 Creando listas para nodo "${node.nombre}" (${node.id})`)

        const lists = FAV_LISTS.map(fl => {
          const repIds = fl.saps
            .map(sap => sapToDoc.get(sap)?.id)
            .filter(Boolean)
          console.log(`   ★ ${fl.name}: ${repIds.length}/${fl.saps.length} repuestos encontrados`)
          return { name: fl.name, repuestoIds: repIds }
        }).filter(l => l.repuestoIds.length > 0)

        if (!DRY_RUN) {
          const prefsRef = db.doc(`user_preferences/${USER_ID}`)
          const prefsSnap = await prefsRef.get()
          const existing = prefsSnap.exists ? (prefsSnap.data().repuestoFavLists || {}) : {}
          existing[node.id] = lists
          await prefsRef.set({ repuestoFavLists: existing, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
          console.log(`   ✅ ${lists.length} listas guardadas en user_preferences/${USER_ID}`)
        } else {
          console.log(`   (preview — ${lists.length} listas por crear)`)
        }
      }
    }
  }

  console.log('\n✅ Listo\n')
}

main().then(() => process.exit(0)).catch(err => { console.error('❌', err.message); process.exit(1) })
