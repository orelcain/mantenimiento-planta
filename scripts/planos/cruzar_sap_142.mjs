/**
 * Cruza los códigos de fabricante de un despiece BAADER con el maestro
 * `repuestos` de Firestore (docId = SAP, campo codigoFabricante) y deja un
 * índice estático nr→SAP para la ficha de pieza.
 *
 * Solo LECTURA de Firestore. Salida:
 *   _staging/baader-<ID>-despiece-trabajo/maestro-<ID>.json  (export slim)
 *
 * Uso:  DESPIECE=200 node scripts/planos/cruzar_sap_142.mjs   (por defecto 142)
 *   imprime cobertura (cuántos códigos del despiece resuelven a SAP)
 *
 * Re-correr cuando cambie el maestro (nuevos SAP asignados) y re-subir el
 * indice del despiece (`extraer_despiece_142.py indice` + subir_storage).
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const admin = require('firebase-admin')

const aca = dirname(fileURLToPath(import.meta.url))
// Los codigos de equipo salen de la coleccion `equipment` (NO `equipos`).
// OJO: cada evisceradora 142 aparece DUPLICADA con dos codigos distintos
// (720004441 y 720004247, etc.) — verificado que ambos apuntan a los MISMOS
// documentos de repuestos, asi que basta con una terna.
const EQUIPOS = {
  '142': ['720004441', '720004447', '720004453'],
  '200': ['720004417', '720004422'], // la maquina y su tablero
}
const ID = (process.env.DESPIECE || '142').trim()
const cods = EQUIPOS[ID]
if (!cods) {
  console.error(`No conozco los codigos de equipo del despiece ${ID}. Agregalos a EQUIPOS.`)
  process.exit(1)
}
const trabajo = join(aca, '_staging', `baader-${ID}-despiece-trabajo`)
const rutasCred = [
  join(aca, '..', '..', 'serviceAccountKey.json'),
  'D:/a/APP leventamiento de insidencias en planta/serviceAccountKey.json',
]
const rutaCred = rutasCred.find((r) => { try { readFileSync(r); return true } catch { return false } })
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(rutaCred, 'utf8'))) })
const db = admin.firestore()

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const snap = await db.collection('repuestos')
  .where('equiposCodigos', 'array-contains-any', cods)
  .get()
const maestro = []
snap.forEach((d) => {
  const x = d.data()
  const fab = norm(x.codigoFabricante)
  if (!fab) return
  maestro.push({
    sap: d.id,
    fab,
    nombre: x.alias || x.descripcion || x.textoBreve || '',
    ubicacion: x.ubicacionEnPlanta || '',
  })
})
console.log(`maestro ${ID}: ${snap.size} docs, ${maestro.length} con codigoFabricante`)
writeFileSync(join(trabajo, `maestro-${ID}.json`), JSON.stringify(maestro), 'utf8')

// cobertura contra los codigos del despiece
const figs = JSON.parse(readFileSync(join(trabajo, 'figuras.json'), 'utf8')).figuras
const codigos = new Set()
for (const f of figs) for (const x of f.filas) if (x.nr) codigos.add(norm(x.nr))
const porFab = new Map(maestro.map((m) => [m.fab, m]))
let exactos = 0
// De los que matchean, cuantos tienen un SAP DE VERDAD: el maestro trae
// muchos repuestos creados desde la maquina cuyo docId es sintetico
// (`baader-200-121427`), no un codigo SAP. El indice solo publica los
// numericos, asi que informar el total inflado hace creer que se perdieron
// mil codigos por el camino — me paso a mi leyendo este mismo mensaje.
let conSapReal = 0
const contenidos = []
for (const c of codigos) {
  if (porFab.has(c)) {
    exactos++
    if (/^\d+$/.test(String(porFab.get(c).sap))) conSapReal++
  }
  else {
    const m = maestro.find((mm) => mm.fab.includes(c) || c.includes(mm.fab))
    if (m) contenidos.push([c, m.fab, m.sap])
  }
}
console.log(`codigos del despiece: ${codigos.size} · match exacto en el maestro: ${exactos}`)
console.log(`  de esos, con SAP REAL (numerico, lo unico que se publica): ${conSapReal}`)
console.log(`  sin SAP asignado en el maestro: ${exactos - conSapReal} · por contención: ${contenidos.length}`)
console.log('ejemplos contención:', contenidos.slice(0, 5))
process.exit(0)
