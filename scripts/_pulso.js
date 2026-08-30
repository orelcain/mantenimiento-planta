const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
async function main(){
  const m = (await db.collection('publicShiftMonitors').doc('10e3596b-7837-4e28-8bac-d9c9ee1a744c').get()).data()
  const ahora = new Date()
  console.log('AHORA planta:', new Date(Date.now()-4*3600e3).toISOString().slice(11,19))
  if (!m.pulse) { console.log('\n⚠ el pulso todavía no escribe (la función corre en el próximo minuto)'); return }
  const p = m.pulse
  console.log('\n── PULSO ──')
  console.log('última lectura :', p.at?.slice(11,19), 'UTC  →  hace', ((ahora - new Date(p.at))/1000).toFixed(0), 'seg')
  console.log('acumulado      :', p.totalCycles, 'pz')
  console.log('ritmo instantáneo:', p.cpm != null ? p.cpm.toFixed(1) + ' pz/min' : '(falta la 2ª lectura)')
  console.log('lecturas guardadas:', (p.lecturas||[]).length)
  for (const l of (p.lecturas||[]).slice(-5)) console.log(`   ${l.at.slice(11,19)}  ${l.totalCycles} pz`)
  console.log('\ncomparación: los buckets de 5 min van en', m.live?.totalPieces, 'pz')
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})
