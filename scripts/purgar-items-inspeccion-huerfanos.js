#!/usr/bin/env node
/**
 * Borra los ítems de inspección que quedaron colgando de inspecciones que ya
 * no existen.
 *
 * POR QUÉ
 * -------
 * `deleteInspection` borraba solo el documento de la inspección. Resultado:
 * **110 de los 173 `inspectionItems` (64%)** apuntan a cuatro inspecciones
 * borradas. Son invisibles para la app —solo se listan filtrando por
 * `inspectionId`— y no hay forma de llegar a ellos desde la interfaz.
 *
 * El código ya borra los ítems junto con su inspección. Esto limpia lo viejo.
 *
 * Las fotos de esos ítems, si las tienen, se borran también de Storage: son
 * archivos que ninguna pantalla puede volver a mostrar.
 *
 * ⚠️ BORRA DATOS. Corre en simulación por defecto; hay que pasar --write.
 *
 * USO
 *   node scripts/purgar-items-inspeccion-huerfanos.js
 *   node scripts/purgar-items-inspeccion-huerfanos.js --write
 */
const admin = require('firebase-admin')
const path = require('path')

const ESCRIBIR = process.argv.includes('--write')

async function main() {
  const cred = require(path.join(__dirname, '..', 'serviceAccountKey.json'))
  admin.initializeApp({
    credential: admin.credential.cert(cred),
    storageBucket: `${cred.project_id}.firebasestorage.app`,
  })
  const db = admin.firestore()

  const [inspecciones, items] = await Promise.all([
    db.collection('inspections').get(),
    db.collection('inspectionItems').get(),
  ])
  const vivas = new Set(inspecciones.docs.map((d) => d.id))

  const huerfanos = []
  const porPadre = {}
  const fotos = []
  for (const doc of items.docs) {
    const x = doc.data()
    if (vivas.has(x.inspectionId)) continue
    huerfanos.push(doc.ref)
    porPadre[x.inspectionId] = (porPadre[x.inspectionId] || 0) + 1
    for (const f of x.fotos || []) {
      // Las fotos se guardan como URL de descarga, no como ruta: hay que
      // sacarle la ruta al link (…/o/<ruta%2Fcodificada>?alt=media).
      const url = typeof f === 'string' ? f : (f.url || f.path || f.storagePath || '')
      const m = /\/o\/([^?]+)/.exec(url)
      if (m) fotos.push(decodeURIComponent(m[1]))
      else if (url) console.log(`  foto sin ruta reconocible: ${url.slice(0, 60)}`)
    }
  }

  console.log(`inspecciones vivas: ${inspecciones.size}`)
  console.log(`ítems: ${items.size} · huérfanos: ${huerfanos.length} (${Math.round(huerfanos.length / items.size * 100)}%)`)
  console.log('padres inexistentes:', JSON.stringify(porPadre))
  console.log(`fotos en Storage de esos ítems: ${fotos.length}`)

  if (!ESCRIBIR) {
    console.log('Simulación: nada se borró. Usar --write.')
    process.exit(0)
  }

  const TOPE = 400
  for (let i = 0; i < huerfanos.length; i += TOPE) {
    const batch = db.batch()
    huerfanos.slice(i, i + TOPE).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }
  console.log(`ítems borrados: ${huerfanos.length}`)

  let fotosBorradas = 0
  for (const ruta of fotos) {
    try {
      await admin.storage().bucket().file(ruta).delete()
      fotosBorradas++
    } catch (e) {
      console.log(`  no se pudo borrar ${ruta}: ${String(e).slice(0, 60)}`)
    }
  }
  console.log(`fotos borradas: ${fotosBorradas}/${fotos.length}`)
  console.log('ESCRITO.')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
