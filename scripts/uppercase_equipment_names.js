#!/usr/bin/env node
/**
 * uppercase_equipment_names.js
 *
 * Convierte todos los nombres de equipos (nodos con código numérico o vacío)
 * en la colección hierarchy a UPPERCASE.
 *
 * Uso:
 *   node scripts/uppercase_equipment_names.js            → dry-run
 *   node scripts/uppercase_equipment_names.js --execute  → aplica cambios
 */

const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require('../serviceAccountKey.json')),
  })
}

const db = admin.firestore()
const execute = process.argv.includes('--execute')

async function main() {
  const snap = await db.collection('hierarchy').where('activo', '==', true).get()
  console.log(`Total nodos activos: ${snap.size}`)

  const toUpdate = []

  snap.forEach(doc => {
    const data = doc.data()
    const codigo = data.codigo || ''
    // Solo equipos: código numérico o vacío
    const isEquipment = /^\d+$/.test(codigo) || !codigo
    if (!isEquipment) return

    const nombre = data.nombre || ''
    const upper = nombre.toUpperCase()
    if (nombre !== upper) {
      toUpdate.push({ id: doc.id, nombre, upper })
    }

    // También alias si existe
    if (data.alias) {
      const aliasUpper = data.alias.toUpperCase()
      if (data.alias !== aliasUpper) {
        const existing = toUpdate.find(u => u.id === doc.id)
        if (existing) {
          existing.alias = data.alias
          existing.aliasUpper = aliasUpper
        }
      }
    }
  })

  console.log(`\nEquipos que necesitan UPPERCASE: ${toUpdate.length}`)
  toUpdate.forEach(u => {
    console.log(`  ${u.id}: "${u.nombre}" → "${u.upper}"${u.alias ? ` | alias: "${u.alias}" → "${u.aliasUpper}"` : ''}`)
  })

  if (!execute) {
    console.log('\n🔍 DRY-RUN. Usa --execute para aplicar.')
    return
  }

  const batch = db.batch()
  for (const u of toUpdate) {
    const ref = db.collection('hierarchy').doc(u.id)
    const update = { nombre: u.upper, actualizadoEn: admin.firestore.Timestamp.now() }
    if (u.aliasUpper) update.alias = u.aliasUpper
    batch.update(ref, update)
  }
  await batch.commit()
  console.log(`\n✅ ${toUpdate.length} equipos actualizados a UPPERCASE.`)
}

main().catch(console.error)
