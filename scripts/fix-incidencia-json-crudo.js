#!/usr/bin/env node
/**
 * Limpia incidencias cuyo título/descripción quedaron con un pedazo de JSON
 * crudo del análisis de foto de ARIA.
 *
 * QUÉ PASÓ
 * --------
 * Cuando el modelo de visión devolvía un JSON truncado, el último fallback de
 * `ariaGroqVision` era `descripcion: raw.trim()` — el texto tal cual. Esa
 * descripción se concatenaba con el pie de foto del usuario y se guardaba como
 * título de la incidencia. En la lista se leía:
 *
 *   correa dañada en el ventilador — { "descripcion": "Se
 *
 * El código ya está arreglado (rescate por regex antes de degradar a texto
 * crudo, `functions/index.js`), pero el documento quedó así en producción
 * desde el 04-07 y es la segunda fila de una lista de 13.
 *
 * QUÉ HACE
 * --------
 * Se queda con lo que escribió la PERSONA —todo lo anterior al `{`— y descarta
 * el fragmento de JSON. No inventa texto: si al cortar no queda nada legible,
 * no toca el documento y lo reporta para revisarlo a mano.
 *
 * USO
 *   node scripts/fix-incidencia-json-crudo.js            # simulación
 *   node scripts/fix-incidencia-json-crudo.js --write
 */
const admin = require('firebase-admin')
const path = require('path')

const ESCRIBIR = process.argv.includes('--write')

/** El corte: el título humano termina donde empieza el volcado del modelo. */
const MARCA_JSON = /\s*[—-]?\s*\{[\s\S]*$/

function textoHumano(valor) {
  if (typeof valor !== 'string') return null
  if (!valor.includes('{')) return null
  const limpio = valor.replace(MARCA_JSON, '').trim()
  // Menos de 4 caracteres no es una incidencia: es basura y hay que mirarla.
  return limpio.length >= 4 ? limpio : null
}

async function main() {
  admin.initializeApp({
    credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))),
  })
  const db = admin.firestore()
  const snap = await db.collection('incidents').get()

  let tocadas = 0
  let aMano = 0
  for (const doc of snap.docs) {
    const x = doc.data()
    const titulo = textoHumano(x.titulo)
    const descripcion = textoHumano(x.descripcion)
    if (!titulo && !descripcion) {
      if (String(x.titulo || '').includes('{') || String(x.descripcion || '').includes('{')) {
        aMano++
        console.log(`REVISAR A MANO ${doc.id}: al sacar el JSON no queda texto`)
      }
      continue
    }
    tocadas++
    console.log(`${doc.id}`)
    if (titulo) console.log(`   título: ${JSON.stringify(x.titulo)}\n        -> ${JSON.stringify(titulo)}`)
    if (descripcion) console.log(`   descr.: ${JSON.stringify(x.descripcion).slice(0, 80)}\n        -> ${JSON.stringify(descripcion)}`)
    if (ESCRIBIR) {
      const patch = { updatedAt: admin.firestore.FieldValue.serverTimestamp() }
      if (titulo) patch.titulo = titulo
      if (descripcion) patch.descripcion = descripcion
      await doc.ref.update(patch)
    }
  }

  console.log(`\nincidencias: ${snap.size} · con JSON crudo: ${tocadas} · para revisar a mano: ${aMano}`)
  console.log(ESCRIBIR ? 'ESCRITO.' : 'Simulación: nada se escribió. Usar --write.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
