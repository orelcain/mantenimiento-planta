#!/usr/bin/env node
/**
 * Normaliza las fechas de las tareas del Gantt que quedaron guardadas como
 * MAPAS PLANOS en vez de Timestamp.
 *
 * QUÉ PASÓ
 * --------
 * `stripUndefinedDeep` (apps/pwa/src/services/gantt.ts) reconstruía cada objeto
 * del payload campo por campo. Un `Timestamp` del SDK tiene `seconds` y
 * `nanoseconds` públicos, así que salía de ahí convertido en
 * `{seconds, nanoseconds}` —un mapa cualquiera— y así lo guardaba Firestore.
 * Lo mismo con `serverTimestamp()`, que quedaba como
 * `{_methodName: 'serverTimestamp'}`.
 *
 * Al leer, `asDate` no entendía ese mapa y devolvía `new Date()`: 604 de las
 * 609 tareas se dibujaban con la fecha de HOY en vez de la suya. Y en Firestore
 * un mapa no ordena junto a los timestamps, así que `orderBy('startDate')` las
 * deja aparte.
 *
 * El código ya está arreglado (el objeto se deja intacto al escribir, y `asDate`
 * entiende el mapa al leer). Este script limpia lo que quedó escrito.
 *
 * QUÉ HACE
 * --------
 * Convierte `startDate`/`endDate`/`baselineStartDate`/`baselineEndDate` de mapa
 * a Timestamp con EXACTAMENTE el mismo instante. No inventa ni corre fechas.
 *
 * Los `createdAt`/`updatedAt` que quedaron con el sentinel sin resolver no se
 * tocan por defecto: ese instante no se puede recuperar y ninguna pantalla los
 * muestra. Con `--limpiar-sentinels` se borra el campo (queda ausente, que es
 * más honesto que un objeto basura).
 *
 * USO
 *   node scripts/fix-gantt-fechas-planas.js                       # simulación
 *   node scripts/fix-gantt-fechas-planas.js --write
 *   node scripts/fix-gantt-fechas-planas.js --write --limpiar-sentinels
 */
const admin = require('firebase-admin')
const path = require('path')

const ESCRIBIR = process.argv.includes('--write')
const LIMPIAR_SENTINELS = process.argv.includes('--limpiar-sentinels')

const CAMPOS_FECHA = ['startDate', 'endDate', 'baselineStartDate', 'baselineEndDate']
const CAMPOS_SELLO = ['createdAt', 'updatedAt']

/** Un Timestamp que perdió su clase: mapa con seconds/nanoseconds y nada más. */
function esMapaDeFecha(valor) {
  if (!valor || typeof valor !== 'object') return false
  if (valor instanceof admin.firestore.Timestamp) return false
  const segundos = typeof valor.seconds === 'number' ? valor.seconds
    : (typeof valor._seconds === 'number' ? valor._seconds : null)
  return segundos !== null
}

function aTimestamp(valor) {
  const segundos = typeof valor.seconds === 'number' ? valor.seconds : valor._seconds
  const nanos = typeof valor.nanoseconds === 'number' ? valor.nanoseconds
    : (typeof valor._nanoseconds === 'number' ? valor._nanoseconds : 0)
  return new admin.firestore.Timestamp(segundos, nanos)
}

function esSentinel(valor) {
  return Boolean(valor && typeof valor === 'object' && valor._methodName)
}

async function main() {
  admin.initializeApp({
    credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))),
  })
  const db = admin.firestore()
  const snap = await db.collection('ganttTasks').get()

  let conMapa = 0
  let conSentinel = 0
  const porCampo = {}
  const lote = []

  for (const doc of snap.docs) {
    const x = doc.data()
    const patch = {}

    for (const campo of CAMPOS_FECHA) {
      if (esMapaDeFecha(x[campo])) {
        patch[campo] = aTimestamp(x[campo])
        porCampo[campo] = (porCampo[campo] || 0) + 1
      }
    }
    const tocaFechas = Object.keys(patch).length > 0
    if (tocaFechas) conMapa++

    let tocaSellos = false
    for (const campo of CAMPOS_SELLO) {
      if (esSentinel(x[campo])) {
        tocaSellos = true
        if (LIMPIAR_SENTINELS) patch[campo] = admin.firestore.FieldValue.delete()
      }
    }
    if (tocaSellos) conSentinel++

    if (Object.keys(patch).length === 0) continue
    lote.push({ ref: doc.ref, patch })
    if (tocaFechas && lote.length <= 3) {
      const antes = x.startDate
      console.log(`  ${doc.id} "${String(x.titulo || '').slice(0, 40)}"`)
      console.log(`     startDate ${JSON.stringify(antes)} -> ${patch.startDate ? patch.startDate.toDate().toISOString() : '(sin cambio)'}`)
    }
  }

  console.log(`\ntareas: ${snap.size}`)
  console.log(`con fecha guardada como mapa: ${conMapa} ${JSON.stringify(porCampo)}`)
  console.log(`con sello serverTimestamp sin resolver: ${conSentinel}${LIMPIAR_SENTINELS ? ' (se borran)' : ' (se dejan: usar --limpiar-sentinels)'}`)
  console.log(`documentos a escribir: ${lote.length}`)

  if (!ESCRIBIR) {
    console.log('Simulación: nada se escribió. Usar --write.')
    process.exit(0)
  }

  const TOPE = 400
  for (let i = 0; i < lote.length; i += TOPE) {
    const batch = db.batch()
    for (const { ref, patch } of lote.slice(i, i + TOPE)) batch.update(ref, patch)
    await batch.commit()
    console.log(`  escritos ${Math.min(i + TOPE, lote.length)}/${lote.length}`)
  }
  console.log('ESCRITO.')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
