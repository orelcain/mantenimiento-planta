#!/usr/bin/env node
/**
 * Borra del historial de configuración del Grader los registros que quedaron
 * ilegibles: los que tienen un lado vacío y la pantalla pinta como "0,5 → —".
 *
 * POR QUÉ
 * -------
 * `diffPhysicalConfig` registraba también cuando uno de los dos lados era
 * `undefined` — la config todavía sin cargar, o un objeto parcial. Como
 * `undefined` no sobrevive a la limpieza del payload, el documento se guardaba
 * sin `nextValue` (o sin `prevValue`) y ya no se puede saber a qué cambió.
 *
 * Eran **2.538 de 3.953** (64%), y **35 de las últimas 50** — o sea, de las 50
 * líneas que alcanza a ver el usuario, 15 eran cambios de verdad.
 *
 * El código ya no los escribe (PR #771). Esto limpia lo que quedó.
 *
 * ⚠️ BORRA DATOS. Corre en simulación por defecto; hay que pasar --write.
 *
 * USO
 *   node scripts/purgar-cambios-config-ilegibles.js
 *   node scripts/purgar-cambios-config-ilegibles.js --write
 */
const admin = require('firebase-admin')
const path = require('path')

const ESCRIBIR = process.argv.includes('--write')

function ilegible(x) {
  return !('prevValue' in x) || !('nextValue' in x)
}

async function main() {
  admin.initializeApp({
    credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))),
  })
  const db = admin.firestore()
  const snap = await db.collection('graderConfigChangeLog').get()

  const aBorrar = []
  const porCampo = {}
  let legibles = 0
  for (const doc of snap.docs) {
    const x = doc.data()
    if (!ilegible(x)) { legibles++; continue }
    porCampo[x.field] = (porCampo[x.field] || 0) + 1
    aBorrar.push(doc.ref)
  }

  console.log(`registros: ${snap.size}`)
  console.log(`legibles (se quedan): ${legibles}`)
  console.log(`${ESCRIBIR ? 'borrados' : 'se borrarían'}: ${aBorrar.length}`)
  console.log('por campo:', JSON.stringify(
    Object.entries(porCampo).sort((a, b) => b[1] - a[1]).slice(0, 8),
  ))

  if (!ESCRIBIR) {
    console.log('Simulación: nada se borró. Usar --write.')
    process.exit(0)
  }

  const TOPE = 400
  for (let i = 0; i < aBorrar.length; i += TOPE) {
    const batch = db.batch()
    aBorrar.slice(i, i + TOPE).forEach((ref) => batch.delete(ref))
    await batch.commit()
    console.log(`  borrados ${Math.min(i + TOPE, aBorrar.length)}/${aBorrar.length}`)
  }
  console.log('ESCRITO.')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
