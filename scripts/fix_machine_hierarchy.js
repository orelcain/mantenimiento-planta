#!/usr/bin/env node
/**
 * fix_machine_hierarchy.js
 *
 * Diagnóstica y corrige la asignación de hierarchyNodeId en la colección machines.
 *
 * Modo:
 *   node scripts/fix_machine_hierarchy.js            → solo diagnóstico (dry-run)
 *   node scripts/fix_machine_hierarchy.js --execute  → aplica los cambios
 *
 * Reglas de asignación (basadas en función de cada máquina en la planta):
 *
 *   Eviscerado  (aq-in-cho-pcho-proc-evis): marel-eviscerado, knuro
 *   Filete      (aq-in-cho-pcho-proc-file): baader-142, baader-200, marel-filete,
 *                                            gea-v2, garibaldi, grader
 *   Emparrillado(aq-in-cho-pcho-proc-empa): fishken, cinta-fishken
 *   Empaque     (aq-in-cho-pcho-proc-empq): detector-metales, impresora-videojet
 */

const admin = require('firebase-admin')
const path  = require('path')

const sa = require(path.resolve(__dirname, '..', 'serviceAccountKey.json'))
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const DRY_RUN = !process.argv.includes('--execute')

// ─── Mapeo deseado: machineId → hierarchyNodeId ──────────────────────────────
const DESIRED_HIERARCHY = {
  // Eviscerado
  'marel-eviscerado': 'aq-in-cho-pcho-proc-evis',
  'knuro':            'aq-in-cho-pcho-proc-evis',

  // Filete
  'baader-142':       'aq-in-cho-pcho-proc-file',
  'baader-200':       'aq-in-cho-pcho-proc-file',
  'marel-filete':     'aq-in-cho-pcho-proc-file',
  'gea-v2':           'aq-in-cho-pcho-proc-file',
  'garibaldi':        'aq-in-cho-pcho-proc-file',
  'grader':           'aq-in-cho-pcho-proc-file',

  // Emparrillado
  'fishken':          'aq-in-cho-pcho-proc-empa',
  'cinta-fishken':    'aq-in-cho-pcho-proc-empa',

  // Empaque
  'detector-metales': 'aq-in-cho-pcho-proc-empq',
  'impresora-videojet': 'aq-in-cho-pcho-proc-empq',
}

// Nombres legibles para el reporte
const AREA_NAMES = {
  'aq-in-cho-pcho-proc-evis': 'Eviscerado',
  'aq-in-cho-pcho-proc-file': 'Filete',
  'aq-in-cho-pcho-proc-empa': 'Emparrillado',
  'aq-in-cho-pcho-proc-empq': 'Empaque',
}

const SEP = '═'.repeat(70)
const sep = '─'.repeat(70)

async function main() {
  console.log('\n' + SEP)
  console.log('  🔍  Diagnóstico de asignación de áreas — colección machines')
  if (DRY_RUN) console.log('  ⚠️   DRY-RUN — usa --execute para aplicar cambios')
  console.log(SEP)

  const snap = await db.collection('machines').get()
  const docs = snap.docs.map(d => ({
    id: d.id,
    ref: d.ref,
    nombre: d.data().nombre || d.id,
    hierarchyNodeId: d.data().hierarchyNodeId || null,
    activa: d.data().activa !== false,
  }))

  // ── Sección 1: Estado actual ──────────────────────────────────────────────
  console.log('\n📋  ESTADO ACTUAL\n' + sep)
  for (const m of docs.sort((a, b) => a.id.localeCompare(b.id))) {
    const nodeId  = m.hierarchyNodeId
    const areaLabel = nodeId
      ? (AREA_NAMES[nodeId] || nodeId)
      : '⚠️  Sin área'
    const archivado = !m.activa ? ' [archivada]' : ''
    console.log(`  ${m.id.padEnd(28)} → ${areaLabel}${archivado}`)
  }

  // ── Sección 2: Cambios necesarios ─────────────────────────────────────────
  console.log('\n\n🔧  CAMBIOS NECESARIOS\n' + sep)

  const batch  = db.batch()
  let updates  = 0
  let noChange = 0
  let unknown  = 0

  for (const m of docs) {
    const desired = DESIRED_HIERARCHY[m.id]

    if (!desired) {
      // Máquina no está en el mapa → reportar como "desconocida"
      if (m.hierarchyNodeId) {
        console.log(`  ℹ️   ${m.id.padEnd(28)} ya tiene ${AREA_NAMES[m.hierarchyNodeId] || m.hierarchyNodeId} (sin cambio, no está en el mapa)`)
      } else {
        console.log(`  ❓  ${m.id.padEnd(28)} sin área Y no está en el mapa de asignaciones`)
        unknown++
      }
      continue
    }

    const current = m.hierarchyNodeId

    if (current === desired) {
      console.log(`  ✅  ${m.id.padEnd(28)} ya correcta → ${AREA_NAMES[desired]}`)
      noChange++
      continue
    }

    const from = current ? (AREA_NAMES[current] || current) : '(sin área)'
    const to   = AREA_NAMES[desired]
    console.log(`  🔄  ${m.id.padEnd(28)} ${from.padEnd(20)} → ${to}`)

    if (!DRY_RUN) {
      batch.update(m.ref, {
        hierarchyNodeId: desired,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
    updates++
  }

  // ── Sección 3: Resumen ────────────────────────────────────────────────────
  console.log('\n' + sep)
  console.log(`  Total máquinas   : ${docs.length}`)
  console.log(`  Ya correctas     : ${noChange}`)
  console.log(`  A actualizar     : ${updates}`)
  console.log(`  Sin asignación   : ${unknown}`)

  if (!DRY_RUN && updates > 0) {
    await batch.commit()
    console.log('\n  ✅  Cambios aplicados correctamente.')
  } else if (DRY_RUN && updates > 0) {
    console.log('\n  ▶   Ejecuta con --execute para aplicar los cambios.')
  } else {
    console.log('\n  ✅  Sin cambios necesarios.')
  }

  console.log(SEP + '\n')
}

main().catch(console.error).finally(() => process.exit())
