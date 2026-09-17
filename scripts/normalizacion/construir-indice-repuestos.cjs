// Construye (o reconstruye) el índice liviano del maestro de repuestos para la
// bitácora: `repuestosIndice/sap` = { m: { [codigoSAP]: [nombreSAP, nombreComun] } }.
// Después lo mantiene la función `onRepuestoEscritoIndice` entrada por entrada.
// Uso (desde la raíz del repo, con serviceAccountKey.json):
//   node scripts/normalizacion/construir-indice-repuestos.cjs
const path = require('path')
const admin = require('firebase-admin')
const { COLECCION, DOC, construirIndice } = require('../../functions/repuestosIndice')

admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', '..', 'serviceAccountKey.json'))) })
const db = admin.firestore()

;(async () => {
  const snap = await db.collection('repuestos').where('tieneSap', '==', true).get()
  const m = construirIndice(snap.docs.map((d) => d.data()))
  const kb = Math.round(JSON.stringify(m).length / 1024)
  await db.collection(COLECCION).doc(DOC).set({ m, entradas: Object.keys(m).length, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() })
  console.log(`índice escrito: ${Object.keys(m).length} entradas · ~${kb} KB (de ${snap.size} docs con SAP)`)
})().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
