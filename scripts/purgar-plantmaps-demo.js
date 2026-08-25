#!/usr/bin/env node
/**
 * Borra los mapas de planta de demostración que quedaron huérfanos.
 *
 * POR QUÉ
 * -------
 * `plantMaps` tiene 3 documentos (Acopio, Chonchi, Yal) con **95 marcadores**
 * entre los tres, todos apuntando a `assetId: "asset-720000000"` y con
 * `imageUrl: /images/maps/planta-*.png` — **las tres imágenes dan 404** y esa
 * carpeta no existe en el repo. Es data sembrada para una demo.
 *
 * Ninguna pantalla los muestra: el mapa vivo es el de Leaflet/DXF
 * (`MapaPlantaPage`), que guarda en localStorage. El único código que toca esta
 * colección es `usePlantMapAreas`, un hook que lee la subcolección `areas`… y
 * que no tiene ningún consumidor.
 *
 * Antes de borrar comprueba que las subcolecciones estén vacías: si alguien
 * llegó a cargar áreas de verdad, se detiene.
 *
 * ⚠️ BORRA DATOS. Corre en simulación por defecto; hay que pasar --write.
 *
 * USO
 *   node scripts/purgar-plantmaps-demo.js
 *   node scripts/purgar-plantmaps-demo.js --write
 */
const admin = require('firebase-admin')
const path = require('path')

const ESCRIBIR = process.argv.includes('--write')

async function main() {
  admin.initializeApp({
    credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))),
  })
  const db = admin.firestore()
  const snap = await db.collection('plantMaps').get()

  const aBorrar = []
  let bloqueado = false

  for (const doc of snap.docs) {
    const x = doc.data()
    const subs = await doc.ref.listCollections()
    const conDatos = []
    for (const sub of subs) {
      const n = (await sub.count().get()).data().count
      if (n > 0) conDatos.push(`${sub.id}=${n}`)
    }
    const marcadores = (x.marcadores || []).length
    console.log(`${doc.id} · "${x.nombre}" · ${marcadores} marcadores · imagen ${x.imageUrl} · subcolecciones: ${conDatos.length ? conDatos.join(', ') : 'vacías'}`)

    if (conDatos.length > 0) {
      console.log('   ⚠ tiene datos abajo: NO se borra.')
      bloqueado = true
      continue
    }
    aBorrar.push(doc.ref)
  }

  console.log(`\n${ESCRIBIR ? 'borrados' : 'se borrarían'}: ${aBorrar.length} de ${snap.size}`)
  if (bloqueado) console.log('Alguno quedó fuera por tener datos: revisar a mano.')

  if (!ESCRIBIR) {
    console.log('Simulación: nada se borró. Usar --write.')
    process.exit(0)
  }

  for (const ref of aBorrar) await ref.delete()
  console.log('ESCRITO.')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
