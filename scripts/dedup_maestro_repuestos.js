#!/usr/bin/env node
/**
 * dedup_maestro_repuestos.js
 *
 * Post-import: elimina duplicados generados por la migración del Excel.
 * Estrategia:
 *   - Agrupa repuestos por codigoFabricante dentro de cada máquina
 *   - Si hay duplicados:
 *       → CONSERVA el más antiguo (tiene fotos, vínculos, etc.)
 *       → ENRIQUECE al antiguo con campos que solo tiene el Excel (tipo, seccion, stock, etc.)
 *       → ELIMINA el recién creado por el import
 *   - Repuestos únicos: los deja intactos
 *
 * Uso:
 *   node scripts/dedup_maestro_repuestos.js            → dry-run (solo reporta)
 *   node scripts/dedup_maestro_repuestos.js --execute  → aplica cambios
 */

const admin = require('firebase-admin')
const path  = require('path')

const sa = require(path.resolve(__dirname, '..', 'serviceAccountKey.json'))
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const DRY_RUN  = !process.argv.includes('--execute')
const MACHINES = [
  'baader-142', 'baader-200', 'detector-metales', 'fishken',
  'gea-v2', 'garibaldi', 'grader', 'impresora-videojet',
  'knuro', 'marel-eviscerado', 'marel-filete',
]

// Campos que el Excel aporta y que vale la pena copiar al original si están vacíos
const ENRICH_FIELDS = ['tipo', 'seccion', 'numeroSerie', 'ubicacionEnPlanta', 'valorUnitario', 'cantidadPorMaquina', 'codigoSAP', 'textoBreve', 'descripcion']

function toDate(v) {
  if (!v) return new Date(0)
  if (v.toDate) return v.toDate()
  if (v instanceof Date) return v
  return new Date(v)
}

// Puntaje de "riqueza" de un doc (cuántos campos útiles tiene llenos)
function richness(data) {
  let score = 0
  if (data.imagenesManual?.length)   score += 10
  if (data.fotosReales?.length)      score += 10
  if (data.vinculosManual?.length)   score += 5
  if (data.technicalSpecs)           score += 5
  if (data.gallery?.length)          score += 3
  if (data.observaciones)            score += 2
  if (data.codigoSAP)                score += 1
  if (data.textoBreve)               score += 1
  if (data.tipo)                     score += 1
  if (data.seccion)                  score += 1
  return score
}

async function processMachine(machineId) {
  const snap = await db.collection(`machines/${machineId}/repuestos`).get()
  if (snap.empty) return { kept: 0, deleted: 0, enriched: 0 }

  const docs = snap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() }))

  // Agrupar por codigoFabricante (ignorar los que no tienen código)
  const byCod = new Map()
  const sinCod = []

  for (const doc of docs) {
    const cod = (doc.data.codigoFabricante || '').trim()
    if (!cod) { sinCod.push(doc); continue }
    if (!byCod.has(cod)) byCod.set(cod, [])
    byCod.get(cod).push(doc)
  }

  let deleted = 0
  let enriched = 0
  const batch = db.batch()
  let batchCount = 0

  for (const [cod, group] of byCod) {
    if (group.length <= 1) continue  // sin duplicado, nada que hacer

    // Ordenar: mayor riqueza primero; en empate, más antiguo primero
    group.sort((a, b) => {
      const rDiff = richness(b.data) - richness(a.data)
      if (rDiff !== 0) return rDiff
      return toDate(a.data.createdAt) - toDate(b.data.createdAt)
    })

    const winner   = group[0]   // el que se conserva
    const losers   = group.slice(1)  // los que se eliminan

    // Enriquecer al winner con campos que tengan los losers y él no
    const enrichUpdates = {}
    for (const loser of losers) {
      for (const field of ENRICH_FIELDS) {
        const winVal  = winner.data[field]
        const loseVal = loser.data[field]
        // Solo copiar si el winner no tiene valor y el loser sí
        const winEmpty  = winVal === undefined || winVal === null || winVal === '' || winVal === 0
        const loseEmpty = loseVal === undefined || loseVal === null || loseVal === '' || loseVal === 0
        if (winEmpty && !loseEmpty && !(field in enrichUpdates)) {
          enrichUpdates[field] = loseVal
        }
      }
    }

    if (!DRY_RUN) {
      // Aplicar enriquecimiento al winner
      if (Object.keys(enrichUpdates).length > 0) {
        batch.update(winner.ref, {
          ...enrichUpdates,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        batchCount++
        enriched++
      }

      // Eliminar los losers
      for (const loser of losers) {
        batch.delete(loser.ref)
        batchCount++
        deleted++
      }
    } else {
      // Dry-run: solo contabilizar
      if (Object.keys(enrichUpdates).length > 0) enriched++
      deleted += losers.length
    }

    // Flush batch si se acerca al límite
    if (!DRY_RUN && batchCount >= 400) {
      await batch.commit()
      batchCount = 0
    }
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit()
  }

  return {
    total:    docs.length,
    unique:   byCod.size,
    sinCod:   sinCod.length,
    deleted,
    enriched,
  }
}

async function main() {
  console.log('\n' + '═'.repeat(60))
  console.log('  🧹  Deduplicar repuestos post-import Excel')
  console.log('═'.repeat(60))
  if (DRY_RUN) console.log('  ⚠️   DRY-RUN — usa --execute para aplicar\n')

  let totalDocs = 0
  let totalDeleted = 0
  let totalEnriched = 0

  for (const machineId of MACHINES) {
    const r = await processMachine(machineId)
    totalDocs    += r.total    || 0
    totalDeleted += r.deleted  || 0
    totalEnriched+= r.enriched || 0

    const dups = r.deleted || 0
    const enr  = r.enriched || 0
    const flag  = dups > 0 ? ' ⚠️' : ''
    console.log(
      `  ${machineId.padEnd(25)} total:${String(r.total||0).padStart(5)}  dups:${String(dups).padStart(4)}  enriq:${String(enr).padStart(3)}${flag}`
    )
  }

  console.log('\n' + '─'.repeat(60))
  console.log(`  Total docs revisados : ${totalDocs}`)
  console.log(`  Duplicados a eliminar: ${totalDeleted}`)
  console.log(`  Originales a enriquecer: ${totalEnriched}`)
  if (DRY_RUN && totalDeleted > 0) {
    console.log('\n  ▶  Ejecuta con --execute para aplicar los cambios.')
  } else if (!DRY_RUN) {
    console.log('\n  ✅ Deduplicación completada.')
  } else {
    console.log('\n  ✅ Sin duplicados detectados.')
  }
  console.log('═'.repeat(60))
}

main().catch(console.error).finally(() => process.exit())
