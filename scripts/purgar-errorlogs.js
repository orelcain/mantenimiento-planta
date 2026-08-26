#!/usr/bin/env node
/**
 * Purga el historial viejo de `errorLogs`.
 *
 * POR QUÉ
 * -------
 * `errorLogs` es la colección más grande del proyecto: 147.824 documentos,
 * 20 veces más que la segunda (`repuestos`, 7.672). De esos, **143.623 son la
 * misma línea**: "Error fetching isometric maps · Missing or insufficient
 * permissions", escrita desde `/map` entre febrero y marzo de 2026 (un solo día
 * dejó 1.101 copias). Esa falla ya no ocurre: de julio a hoy hay 80 errores en
 * total, de todos los tipos.
 *
 * Ninguna pantalla de la app lee esta colección: solo la escribe `lib/logger.ts`
 * y las reglas la dejan leer a admin. O sea, 143.623 documentos que nadie mira.
 *
 * El código ya tiene freno (`lib/errorLogThrottle.ts`): la primera aparición de
 * cada error se escribe, las repeticiones dentro de 5 minutos se callan y se
 * cuentan. Esto limpia lo que quedó.
 *
 * QUÉ HACE
 * --------
 * Borra los documentos ANTERIORES a la fecha de corte (por defecto, 90 días
 * atrás). Lo reciente no se toca: es lo único que sirve para diagnosticar.
 *
 * ⚠️ BORRA DATOS. Corre en simulación por defecto; hay que pasar --write.
 *
 * USO
 *   node scripts/purgar-errorlogs.js                          # simulación
 *   node scripts/purgar-errorlogs.js --dias 90 --write
 *   node scripts/purgar-errorlogs.js --mensaje "Error fetching isometric maps" --write
 */
const admin = require('firebase-admin')
const path = require('path')

const ESCRIBIR = process.argv.includes('--write')
const idxDias = process.argv.indexOf('--dias')
const DIAS = idxDias >= 0 ? Number(process.argv[idxDias + 1]) : 90
const idxMsg = process.argv.indexOf('--mensaje')
const MENSAJE = idxMsg >= 0 ? process.argv[idxMsg + 1] : null

async function main() {
  admin.initializeApp({
    credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))),
  })
  const db = admin.firestore()
  const corte = new Date(Date.now() - DIAS * 24 * 3600 * 1000)
  console.log(`corte: ${corte.toISOString().slice(0, 10)} (${DIAS} días)`)
  if (MENSAJE) console.log(`solo el mensaje: "${MENSAJE}"`)

  const col = db.collection('errorLogs')
  const total = (await col.count().get()).data().count
  console.log(`errorLogs en total: ${total}`)

  let borrados = 0
  let revisados = 0
  const porMensaje = {}
  let ultimo = null

  // Paginado por timestamp ascendente: los viejos primero.
  for (;;) {
    let q = col.orderBy('timestamp', 'asc').limit(500)
    if (ultimo) q = q.startAfter(ultimo)
    const snap = await q.get()
    if (snap.empty) break
    ultimo = snap.docs[snap.docs.length - 1]

    const aBorrar = []
    for (const doc of snap.docs) {
      revisados++
      const x = doc.data()
      const ts = x.timestamp && x.timestamp.toDate ? x.timestamp.toDate() : null
      if (!ts || ts >= corte) return await cerrar()
      if (MENSAJE && x.message !== MENSAJE) continue
      porMensaje[x.message] = (porMensaje[x.message] || 0) + 1
      aBorrar.push(doc.ref)
    }

    if (ESCRIBIR && aBorrar.length > 0) {
      const batch = db.batch()
      aBorrar.forEach((ref) => batch.delete(ref))
      await batch.commit()
    }
    borrados += aBorrar.length
    if (borrados % 5000 < 500) console.log(`  ${ESCRIBIR ? 'borrados' : 'marcados'}: ${borrados}`)
  }

  await cerrar()

  async function cerrar() {
    console.log(`\nrevisados: ${revisados}`)
    console.log(`${ESCRIBIR ? 'borrados' : 'se borrarían'}: ${borrados}`)
    console.log('por mensaje:', JSON.stringify(
      Object.entries(porMensaje).sort((a, b) => b[1] - a[1]).slice(0, 8),
    ))
    console.log(`quedarían: ${total - borrados}`)
    if (!ESCRIBIR) console.log('Simulación: nada se borró. Usar --write.')
    process.exit(0)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
