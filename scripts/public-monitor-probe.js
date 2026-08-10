/**
 * Probe del monitor público de turno (solo lectura por defecto).
 *
 *   node scripts/public-monitor-probe.js filete            → lista turnos y compone el payload del último
 *   node scripts/public-monitor-probe.js filete <shiftDoc> → compone el payload de ese turno
 *   node scripts/public-monitor-probe.js filete <shiftDoc> --write  → además crea un monitor de prueba
 *   node scripts/public-monitor-probe.js --revoke <token>  → borra un monitor de prueba
 *
 * Sirve para verificar los números ANTES de exponerlos en un link público.
 */

const admin = require('firebase-admin')
const serviceAccount = require('../serviceAccountKey.json')
const { randomUUID } = require('crypto')

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

const { buildMonitorLive, COLLECTION } = require('../functions/publicMonitor')

async function main() {
  const args = process.argv.slice(2)

  if (args[0] === '--revoke') {
    await db.collection(COLLECTION).doc(args[1]).delete()
    console.log('Monitor borrado:', args[1])
    return
  }

  const plantSlug = args[0] || 'filete'
  let shiftDocId = args[1] && !args[1].startsWith('--') ? args[1] : null
  const write = args.includes('--write')

  if (!shiftDocId) {
    // listDocuments + orden en memoria: `orderBy(documentId)` sobre esta
    // subcolección pide un índice que no existe y no vale crear para un probe.
    const refs = await db.collection(`shoplogix/${plantSlug}/shifts`).listDocuments()
    const ids = refs.map(r => r.id).sort().slice(-8).reverse()
    console.log(`\nÚltimos turnos de ${plantSlug} (${refs.length} en total):`)
    for (const id of ids) {
      const x = (await db.doc(`shoplogix/${plantSlug}/shifts/${id}`).get()).data() || {}
      const pz = (x.machines || []).reduce((a, m) => a + (m.totalCycles || 0), 0)
      console.log(`  ${id.padEnd(30)} ${String(pz).padStart(7)} pz  lastSync=${x.lastSyncAt?.toDate?.().toISOString() ?? '—'}`)
    }
    shiftDocId = ids[0]
    if (!shiftDocId) { console.log('sin turnos'); return }
  }

  console.log(`\n── Payload para ${plantSlug} / ${shiftDocId} ──`)
  const live = await buildMonitorLive(db, plantSlug, shiftDocId)
  if (!live) { console.log('SIN DATOS (subcolección machines vacía)'); return }

  const { series, machines, ...rest } = live
  console.log(JSON.stringify(rest, null, 2))
  console.log('máquinas:', JSON.stringify(machines, null, 2))
  console.log(`serie: ${series.length} tramos de 5 min`,
    series.slice(-6).map(p => `${p.t.slice(11, 16)}=${p.pieces}`).join(' '))

  if (write) {
    const token = randomUUID()
    const now = new Date()
    await db.collection(COLLECTION).doc(token).set({
      token, plantSlug,
      dateKey: shiftDocId.slice(0, 10),
      shiftId: shiftDocId.slice(11),
      shiftDocId,
      scope: `${plantSlug}|${shiftDocId}`,
      plantLineId: 'chonchi-filete',
      areaLabel: 'Filete',
      lineLabel: 'P. Principal',
      machineKindLong: 'Baader 200 · Línea 1 de Filete',
      targetPieces: 5000,
      createdBy: 'PROBE (verificación)',
      createdByUid: 'probe',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3 * 3600 * 1000).toISOString(),
      ttlHours: 3,
      live,
    })
    console.log(`\n✅ Monitor de prueba creado (vence en 3 h):\n   /monitor/${token}`)
    console.log(`   borrar con: node scripts/public-monitor-probe.js --revoke ${token}`)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
