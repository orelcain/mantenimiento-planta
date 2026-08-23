/**
 * Cruza los códigos de fabricante del despiece BAADER 142 con el maestro
 * `repuestos` de Firestore (docId = SAP, campo codigoFabricante) y deja un
 * índice estático nr→SAP para la ficha de pieza.
 *
 * Solo LECTURA de Firestore. Salida:
 *   _staging/baader-142-despiece-trabajo/maestro-142.json  (export slim)
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
const trabajo = join(aca, '_staging', 'baader-142-despiece-trabajo')
const rutasCred = [
  join(aca, '..', '..', 'serviceAccountKey.json'),
  'D:/a/APP leventamiento de insidencias en planta/serviceAccountKey.json',
]
const rutaCred = rutasCred.find((r) => { try { readFileSync(r); return true } catch { return false } })
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(rutaCred, 'utf8'))) })
const db = admin.firestore()

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const snap = await db.collection('repuestos')
  .where('equiposCodigos', 'array-contains-any', ['720004441', '720004447', '720004453'])
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
console.log(`maestro 142: ${snap.size} docs, ${maestro.length} con codigoFabricante`)
writeFileSync(join(trabajo, 'maestro-142.json'), JSON.stringify(maestro), 'utf8')

// cobertura contra los codigos del despiece
const figs = JSON.parse(readFileSync(join(trabajo, 'figuras.json'), 'utf8')).figuras
const codigos = new Set()
for (const f of figs) for (const x of f.filas) if (x.nr) codigos.add(norm(x.nr))
const porFab = new Map(maestro.map((m) => [m.fab, m]))
let exactos = 0
const contenidos = []
for (const c of codigos) {
  if (porFab.has(c)) exactos++
  else {
    const m = maestro.find((mm) => mm.fab.includes(c) || c.includes(mm.fab))
    if (m) contenidos.push([c, m.fab, m.sap])
  }
}
console.log(`codigos del despiece: ${codigos.size} · match EXACTO a SAP: ${exactos} · por contención: ${contenidos.length}`)
console.log('ejemplos contención:', contenidos.slice(0, 5))
process.exit(0)
