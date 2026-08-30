/**
 * Vigila que la data del turno noche siga entrando. 8 chequeos cada 5 min.
 * Marca ⚠ cuando: el sync se atrasa >12 min, o la línea dice "produciendo"
 * pero no llegaron piezas nuevas entre dos chequeos.
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const D = (t) => t?.toDate ? t.toDate() : (t?._seconds ? new Date(t._seconds*1000) : (t ? new Date(t) : null))
const hm = (d) => d && !isNaN(d) ? d.toISOString().slice(11,16) : '--:--'
const dormir = (ms) => new Promise(r => setTimeout(r, ms))

async function chequeo() {
  const ahoraUTC = new Date(), ahoraPlanta = new Date(Date.now() - 4*3600e3)
  const ref = db.collection('shoplogix').doc('filete').collection('shifts').doc('2026-08-17_Turno Noche')
  const snap = await ref.get()
  if (!snap.exists) return { err: 'el doc del turno desapareció' }
  const v = snap.data()
  const m = (await db.collection('publicShiftMonitors').doc('10e3596b-7837-4e28-8bac-d9c9ee1a744c').get()).data()
  return {
    hora: hm(ahoraPlanta),
    turno: m.live?.shiftName,
    apunta: m.shiftDocId,
    piezas: m.live?.totalPieces ?? 0,
    estado: m.live?.status,
    datosHasta: hm(D(m.live?.effectiveEnd)),
    atrasoMin: +((ahoraPlanta - D(m.live?.effectiveEnd))/60000).toFixed(1),
    syncHaceMin: +((ahoraUTC - D(v.lastSyncAt))/60000).toFixed(1),
    cierreEst: hm(D(m.live?.plannedEnd)),
  }
}

async function main() {
  const filas = []
  let previo = null
  for (let i = 1; i <= 8; i++) {
    const c = await chequeo()
    if (c.err) { console.log(`[${i}] ⚠ ${c.err}`); break }
    const avisos = []
    if (c.syncHaceMin > 12) avisos.push(`SYNC ATRASADO ${c.syncHaceMin}min`)
    if (c.atrasoMin > 15) avisos.push(`DATOS VIEJOS ${c.atrasoMin}min`)
    if (previo && c.estado === 'produciendo' && c.piezas === previo.piezas)
      avisos.push('PRODUCIENDO SIN PIEZAS NUEVAS')
    if (c.apunta !== '2026-08-17_Turno Noche') avisos.push(`CAMBIÓ DE TURNO → ${c.apunta}`)
    console.log(`[${i}] ${c.hora} · ${String(c.piezas).padStart(5)} pz · ${c.estado.padEnd(11)}` +
      ` · datos hasta ${c.datosHasta} (${c.atrasoMin} min) · sync hace ${c.syncHaceMin} min` +
      (avisos.length ? `  ⚠ ${avisos.join(' | ')}` : '  ok'))
    filas.push(c); previo = c
    if (i < 8) await dormir(5*60*1000)
  }
  const pri = filas[0], ult = filas[filas.length-1]
  if (pri && ult) {
    console.log(`\nRESUMEN: de ${pri.hora} a ${ult.hora} · ${pri.piezas} → ${ult.piezas} pz` +
      ` (+${ult.piezas - pri.piezas}) · cierre estimado ${ult.cierreEst}`)
    const atrasos = filas.map(f => f.atrasoMin)
    console.log(`atraso de los datos: min ${Math.min(...atrasos)} · máx ${Math.max(...atrasos)} min`)
  }
}
main().then(()=>process.exit(0)).catch(e=>{ console.error('ERROR', e.message); process.exit(1) })
