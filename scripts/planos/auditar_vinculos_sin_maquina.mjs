/**
 * Auditoría de SOLO LECTURA: lista los docs de `planoVinculos` del plano 888 (N2 y N3) que no
 * tienen `maquina`.
 *
 * Contexto: desde la confirmación por máquina, el 888 guarda `<slug>__<aparato>__<maquina>` con el
 * campo `maquina`. Los docs anteriores (`baader-142-888__<aparato>`, sin máquina) no se sabe de
 * cuál máquina eran: la app los muestra como «Confirmación anterior (sin máquina)» y NO los cuenta.
 * Este script dice cuántos son, quién los hizo y qué decían, para que alguien decida si se vuelven
 * a confirmar en terreno o se asignan a mano a una máquina.
 *
 * No escribe nada (ni siquiera tiene modo --write). Requiere serviceAccountKey.json en la raíz
 * del repo (no está en git).
 *
 * Uso:  node scripts/planos/auditar_vinculos_sin_maquina.mjs [slug]      (por defecto baader-142-888)
 */
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const admin = require('firebase-admin')
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

admin.initializeApp({ credential: admin.credential.cert(require(join(raiz, 'serviceAccountKey.json'))) })
const db = admin.firestore()

const slug = process.argv[2] || 'baader-142-888'

const snap = await db.collection('planoVinculos').where('planoSlug', '==', slug).get()
const sinMaquina = []
let conMaquina = 0
snap.forEach((d) => {
  const v = d.data()
  if (v.maquina) conMaquina++
  else sinMaquina.push({ id: d.id, ...v })
})

console.log(`Plano ${slug}: ${snap.size} docs · ${conMaquina} con máquina · ${sinMaquina.length} SIN máquina`)
sinMaquina
  .sort((a, b) => a.aparato.localeCompare(b.aparato, 'es', { numeric: true }))
  .forEach((v) => {
    const cuando = v.actualizado?.toDate ? v.actualizado.toDate().toISOString().slice(0, 10) : '—'
    console.log(
      [v.aparato.padEnd(8), v.estado.padEnd(10), (v.codigo ?? '—').padEnd(14), v.confirmadoPorNombre || v.confirmadoPor, cuando].join(' · '),
    )
  })
if (sinMaquina.length) {
  console.log('\nEstos docs no cuentan en ninguna máquina. Decidir: reconfirmar en terreno, o asignarlos a mano.')
}
process.exit(0)
