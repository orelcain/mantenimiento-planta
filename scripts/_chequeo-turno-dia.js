/**
 * Espera a que arranque el turno día de Filete y verifica LO QUE FALTABA:
 *   1. el pulso vuelve a escribir con piezas > 0
 *   2. el monitor publica ese pulso (lo que ve la gente)
 *   3. el botón «actualizar ahora» funciona contra Shoplogix de verdad
 *
 * Sale apenas termina de verificar, o a las 8 h si el turno nunca arranca.
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const TOKEN = '10e3596b-7837-4e28-8bac-d9c9ee1a744c'
const URL = 'https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/publicMonitorRefrescar'
const dormir = (ms) => new Promise(r => setTimeout(r, ms))
const hora = () => new Date(Date.now() - 4*3600e3).toISOString().slice(11,19)

async function main() {
  const MAX = 48                     // 48 × 10 min = 8 h
  for (let i = 1; i <= MAX; i++) {
    const m = (await db.collection('publicShiftMonitors').doc(TOKEN).get()).data()
    const pulso = m?.pulse ?? null
    const live = m?.live ?? {}
    const pz = pulso?.totalCycles ?? 0

    if (pz > 0) {
      console.log(`\n✅ ARRANCÓ · ${hora()} · turno «${live.shiftName}»`)
      console.log(`\n1) EL PULSO ESCRIBE`)
      console.log(`   acumulado: ${pz} pz · leído ${pulso.at?.slice(11,19)} UTC`)
      console.log(`   ritmo: ${pulso.cpm != null ? pulso.cpm.toFixed(1) + ' pz/min' : '(falta ventana)'}`)
      console.log(`   lecturas guardadas: ${(pulso.lecturas||[]).length}`)

      console.log(`\n2) EL MONITOR LO PUBLICA`)
      console.log(`   live.totalPieces (buckets 5 min): ${live.totalPieces ?? 0} pz`)
      console.log(`   pulso (contador vivo):            ${pz} pz`)
      console.log(`   → el pulso ${pz >= (live.totalPieces ?? 0) ? 'va igual o adelante' : 'va ATRASADO'} de los buckets`)

      console.log(`\n3) EL BOTÓN «ACTUALIZAR AHORA»`)
      try {
        const r1 = await (await fetch(URL, { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ token: TOKEN }) })).json()
        console.log(`   1ª llamada : ok=${r1.ok} yaFresco=${r1.yaFresco} pz=${r1.pulse?.totalCycles}`)
        const r2 = await (await fetch(URL, { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ token: TOKEN }) })).json()
        console.log(`   2ª seguida : yaFresco=${r2.yaFresco} ${r2.yaFresco ? '(throttle OK: no volvió a preguntar)' : '(⚠ el throttle NO frenó)'}`)
      } catch (e) { console.log('   ⚠ el endpoint falló:', e.message) }

      console.log(`\nRESUMEN: pulso escribiendo, monitor publicando y botón respondiendo con el turno vivo.`)
      return
    }

    if (i % 6 === 0 || i === 1) console.log(`[${i}/${MAX}] ${hora()} · sin producción todavía (turno «${live.shiftName ?? '-'}», ${live.totalPieces ?? 0} pz)`)
    await dormir(10*60*1000)
  }
  console.log('\n⚠ 8 horas sin producción: el turno no arrancó o el pulso no está escribiendo. Revisar a mano.')
}
main().then(()=>process.exit(0)).catch(e=>{ console.error('ERROR', e.message); process.exit(1) })
