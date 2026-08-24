/**
 * Sube un plano extraído en scripts/planos/_staging/<slug>/ a Firebase Storage,
 * gzipeado (Storage sirve Content-Encoding: gzip y el navegador lo infla solo:
 * ~2,5 MB de SVG viajan como ~150 KB).
 *
 * Uso:  node scripts/planos/subir_storage.mjs <slug>
 *
 * Requiere serviceAccountKey.json en la raíz del repo (no está en git).
 * La lectura pública la da storage.rules (match /planos/** allow read).
 */
import { createRequire } from 'node:module'
import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const admin = require('firebase-admin')

const slug = process.argv[2]
const soloIndice = process.argv[3] === 'indice'
if (!slug) {
  console.error('Uso: node scripts/planos/subir_storage.mjs <slug>')
  process.exit(1)
}

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const staging = join(dirname(fileURLToPath(import.meta.url)), '_staging', slug)
// la credencial vive en el arbol principal (no en los worktrees)
const rutasCred = [
  join(raiz, 'serviceAccountKey.json'),
  'D:/a/APP leventamiento de insidencias en planta/serviceAccountKey.json',
]
const rutaCred = rutasCred.find((r) => { try { readFileSync(r); return true } catch { return false } })
if (!rutaCred) { console.error('No encuentro serviceAccountKey.json'); process.exit(1) }
const cred = JSON.parse(readFileSync(rutaCred, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(cred),
  storageBucket: 'mantenimiento-planta-771a3.firebasestorage.app',
})
const bucket = admin.storage().bucket()

const archivos = readdirSync(staging)
  .filter((f) => f.endsWith('.svg') || f.endsWith('.json'))
  // El modo rapido sube el indice Y su `busqueda.json`: los dos se generan
  // juntos y se leen juntos, pero antes solo viajaba el primero. Trampa
  // gemela de la de las anclas (que viven en los hoja-NN.json y este modo
  // TAMPOCO lleva — si tocaste el OCR, sube todo).
  .filter((f) => !soloIndice || f === 'indice.json' || f === 'busqueda.json')
console.log(`${archivos.length} archivos de ${staging}`)

let subidos = 0, bytes = 0
for (const nombre of archivos) {
  const crudo = readFileSync(join(staging, nombre))
  const gz = gzipSync(crudo, { level: 9 })
  bytes += gz.length
  await bucket.file(`planos/${slug}/${nombre}`).save(gz, {
    resumable: false,
    metadata: {
      contentType: nombre.endsWith('.svg') ? 'image/svg+xml' : 'application/json',
      contentEncoding: 'gzip',
      // el indice cambia (titulos, capas nuevas); las hojas SVG son inmutables
      cacheControl: nombre === 'indice.json' ? 'public, max-age=300' : 'public, max-age=86400',
    },
  })
  subidos++
  if (subidos % 25 === 0) console.log(`  ${subidos}/${archivos.length}…`)
}
console.log(`OK ${subidos} archivos, ${(bytes / 1024 / 1024).toFixed(1)} MB gzip en planos/${slug}/`)
process.exit(0)
