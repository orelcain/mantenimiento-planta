#!/usr/bin/env node
/**
 * firestore-snapshot — red de seguridad antes de escribir en masa a Firestore de PRODUCCIÓN.
 *
 * Por qué existe: el 2026-07-25 una escritura accidental (un click que cayó sobre "Guardar")
 * dejó datos basura en `learningContent/grader/components` y se pilló de suerte leyendo el doc
 * con un script. Sin snapshot previo no había forma de volver atrás: esta base no tiene
 * versionado ni papelera.
 *
 * REGLA: antes de correr cualquier script que escriba en masa (seed-*, backfill-*, cleanup-*,
 * dedup-*), tomar el snapshot de la colección afectada.
 *
 * Uso:
 *   node scripts/firestore-snapshot.js --list
 *      Lista las colecciones raíz (para saber qué existe).
 *
 *   node scripts/firestore-snapshot.js --dump learningContent/grader/components
 *   node scripts/firestore-snapshot.js --dump repuestos
 *      Guarda la colección en _snapshots/<ruta>__<timestamp>.json. SOLO LECTURA, siempre seguro.
 *
 *   node scripts/firestore-snapshot.js --restore _snapshots/<archivo>.json
 *      Muestra qué haría y NO escribe (dry-run por defecto).
 *
 *   node scripts/firestore-snapshot.js --restore _snapshots/<archivo>.json --confirm
 *      Restaura de verdad. Reescribe los docs del snapshot a su estado guardado.
 *      NO borra documentos creados después del snapshot (para eso, --prune, que pide su
 *      propia confirmación).
 */

'use strict'
const admin = require('firebase-admin')
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const has = flag => args.includes(flag)
const valueOf = flag => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : null
}

const SNAP_DIR = path.join(__dirname, '..', '_snapshots')

function db() {
  if (!admin.apps.length) {
    const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json')
    if (!fs.existsSync(keyPath)) {
      console.error('No se encontró serviceAccountKey.json en la raíz del repo.')
      process.exit(1)
    }
    admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  }
  return admin.firestore()
}

/** Firestore alterna colección/documento: una ruta con nº IMPAR de segmentos es una colección. */
function assertCollectionPath(p) {
  const segments = p.split('/').filter(Boolean)
  if (segments.length % 2 === 0) {
    console.error(`"${p}" apunta a un DOCUMENTO, no a una colección.`)
    console.error('Las rutas de colección tienen un número impar de segmentos.')
    console.error('  ok:  repuestos            ·  learningContent/grader/components')
    console.error('  no:  repuestos/3300100752 ·  learningContent/grader')
    process.exit(1)
  }
  return segments.join('/')
}

function safeFileName(p) {
  return p.replace(/\//g, '__')
}

async function listCollections() {
  const cols = await db().listCollections()
  console.log(`Colecciones raíz (${cols.length}):`)
  for (const c of cols) console.log(`  · ${c.id}`)
  console.log('\nPara subcolecciones, pasá la ruta completa, ej:')
  console.log('  node scripts/firestore-snapshot.js --dump learningContent/grader/components')
}

async function dump(rawPath) {
  const colPath = assertCollectionPath(rawPath)
  const snap = await db().collection(colPath).get()

  if (snap.empty) {
    console.log(`⚠ "${colPath}" está vacía o no existe — no se genera archivo.`)
    return
  }

  const docs = {}
  snap.forEach(d => { docs[d.id] = d.data() })

  if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(SNAP_DIR, `${safeFileName(colPath)}__${stamp}.json`)

  const payload = {
    collectionPath: colPath,
    takenAt: new Date().toISOString(),
    docCount: snap.size,
    docs,
  }
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  console.log(`✓ Snapshot de "${colPath}": ${snap.size} docs`)
  console.log(`  → ${path.relative(path.join(__dirname, '..'), file)}`)
  console.log('\nPara volver atrás si algo sale mal:')
  console.log(`  node scripts/firestore-snapshot.js --restore "${path.relative(path.join(__dirname, '..'), file)}"`)
}

async function restore(file, { confirm, prune }) {
  const abs = path.isAbsolute(file) ? file : path.join(__dirname, '..', file)
  if (!fs.existsSync(abs)) {
    console.error(`No existe el archivo: ${abs}`)
    process.exit(1)
  }

  const payload = JSON.parse(fs.readFileSync(abs, 'utf8'))
  const { collectionPath, takenAt, docs } = payload
  const ids = Object.keys(docs || {})
  if (!collectionPath || ids.length === 0) {
    console.error('El snapshot no tiene collectionPath o está vacío.')
    process.exit(1)
  }

  const col = db().collection(collectionPath)
  const current = await col.get()
  const currentIds = new Set()
  current.forEach(d => currentIds.add(d.id))
  const extras = [...currentIds].filter(id => !ids.includes(id))

  console.log(`Snapshot: "${collectionPath}" tomado el ${takenAt}`)
  console.log(`  docs en el snapshot : ${ids.length}`)
  console.log(`  docs en prod ahora  : ${currentIds.size}`)
  console.log(`  se reescribirían    : ${ids.length}`)
  if (extras.length > 0) {
    console.log(`  creados DESPUÉS del snapshot (${extras.length}): ${extras.join(', ')}`)
    console.log(prune
      ? '  → --prune activo: se BORRARÍAN.'
      : '  → se DEJAN intactos (usá --prune solo si de verdad querés borrarlos).')
  }

  if (!confirm) {
    console.log('\n[DRY-RUN] Nada se escribió. Agregá --confirm para restaurar de verdad.')
    return
  }
  if (prune && !has('--confirm-prune')) {
    console.error('\n--prune borra documentos. Requiere además --confirm-prune.')
    process.exit(1)
  }

  // Firestore permite 500 operaciones por batch.
  let batch = db().batch()
  let ops = 0
  const flush = async () => {
    if (ops > 0) { await batch.commit(); batch = db().batch(); ops = 0 }
  }

  for (const id of ids) {
    batch.set(col.doc(id), docs[id])
    if (++ops >= 450) await flush()
  }
  if (prune) {
    for (const id of extras) {
      batch.delete(col.doc(id))
      if (++ops >= 450) await flush()
    }
  }
  await flush()

  console.log(`\n✓ Restaurados ${ids.length} docs en "${collectionPath}"${prune ? ` y borrados ${extras.length}` : ''}.`)
}

async function main() {
  if (has('--list')) return listCollections()

  const dumpPath = valueOf('--dump')
  if (dumpPath) return dump(dumpPath)

  const restoreFile = valueOf('--restore')
  if (restoreFile) return restore(restoreFile, { confirm: has('--confirm'), prune: has('--prune') })

  // Sin argumentos válidos: ayuda, y NO tocar nada.
  const header = fs.readFileSync(__filename, 'utf8').split('*/')[0]
  console.log(header.split('\n').slice(2).map(l => l.replace(/^ \* ?/, '')).join('\n'))
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
