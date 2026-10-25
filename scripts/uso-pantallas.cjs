#!/usr/bin/env node
/**
 * Reporte de uso de pantallas (SOLO LECTURA). No escribe nada.
 *
 *   node scripts/uso-pantallas.cjs            (últimos 14 días)
 *   node scripts/uso-pantallas.cjs --dias 7
 *
 * (a) Tabla pantalla × vista desde `pantallaUsos` (la escribe registrarVista en
 *     la PWA): vistas, usuarios distintos y días con uso.
 * (b) Resumen del mismo período de `publicShiftMonitorStats` (aperturas anónimas
 *     del monitor público): aperturas, horas y dispositivos por token, con la
 *     línea leída de `publicShiftMonitors/{token}` si existe.
 *
 * Requiere `serviceAccountKey.json` en la raíz del repo.
 * Nota: `publicShiftMonitorStats.byDay` guarda como máximo 14 días de historial,
 * así que (b) no puede cubrir más que eso aunque se pida --dias mayor.
 */
const path = require('node:path')
const admin = require('firebase-admin')

const TZ = 'America/Santiago'
const MAX_DIAS_BYDAY = 14

function leerDias() {
  const i = process.argv.indexOf('--dias')
  if (i === -1) return 14
  const n = Number(process.argv[i + 1])
  if (!Number.isInteger(n) || n < 1 || n > 365) {
    console.error('Uso: node scripts/uso-pantallas.cjs [--dias N]   (N entero entre 1 y 365)')
    process.exit(1)
  }
  return n
}

/** YYYY-MM-DD en hora de Santiago. */
function diaSantiago(fecha) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(fecha)
}

function tabla(filas, cols) {
  const ancho = cols.map((c) => Math.max(c.length, ...filas.map((f) => String(f[c]).length)))
  const linea = (f) => cols.map((c, i) => String(f[c]).padEnd(ancho[i])).join('  ')
  console.log(linea(Object.fromEntries(cols.map((c) => [c, c]))))
  console.log(ancho.map((a) => '-'.repeat(a)).join('  '))
  filas.forEach((f) => console.log(linea(f)))
}

async function main() {
  const dias = leerDias()
  const desde = diaSantiago(new Date(Date.now() - (dias - 1) * 86_400_000))
  const hasta = diaSantiago(new Date())
  const cred = admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json')))
  admin.initializeApp({ credential: cred })
  const db = admin.firestore()

  console.log(`Uso de pantallas ${desde} a ${hasta} (${dias} días, hora de Santiago)\n`)

  // (a) pantallaUsos — un solo filtro de rango sobre `dia`, no pide índice.
  const snap = await db.collection('pantallaUsos').where('dia', '>=', desde).get()
  console.log(`(a) Vistas registradas (pantallaUsos): ${snap.size} documentos`)
  const grupos = new Map()
  for (const d of snap.docs) {
    const x = d.data()
    const k = `${x.pantalla}\u0000${x.vista}`
    const g = grupos.get(k) ?? { pantalla: x.pantalla, vista: x.vista, vistas: 0, uids: new Set(), dias: new Set() }
    g.vistas += 1
    g.uids.add(x.uid)
    g.dias.add(x.dia)
    grupos.set(k, g)
  }
  if (grupos.size === 0) {
    console.log('    (sin registros todavía)\n')
  } else {
    const filas = [...grupos.values()]
      .sort((a, b) => a.pantalla.localeCompare(b.pantalla) || b.vistas - a.vistas)
      .map((g) => ({ pantalla: g.pantalla, vista: g.vista, vistas: g.vistas, usuarios: g.uids.size, 'días con uso': g.dias.size }))
    tabla(filas, ['pantalla', 'vista', 'vistas', 'usuarios', 'días con uso'])
    console.log('')
  }

  // (b) publicShiftMonitorStats — aperturas anónimas del período.
  if (dias > MAX_DIAS_BYDAY) {
    console.log(`    Aviso: byDay conserva solo ${MAX_DIAS_BYDAY} días; el resumen (b) cubre como máximo ese tramo.`)
  }
  const stats = await db.collection('publicShiftMonitorStats').get()
  console.log(`(b) Monitor público (publicShiftMonitorStats): ${stats.size} tokens`)
  const filasB = []
  for (const s of stats.docs) {
    const byDay = s.data().byDay || {}
    let aperturas = 0
    let segs = 0
    const disp = new Set()
    for (const [dia, v] of Object.entries(byDay)) {
      if (dia < desde || dia > hasta) continue
      aperturas += v.opens || 0
      segs += v.secs || 0
      for (const id of v.viewers || []) disp.add(id)
    }
    if (aperturas === 0 && segs === 0 && disp.size === 0) continue
    const m = await db.collection('publicShiftMonitors').doc(s.id).get()
    const md = m.exists ? m.data() : null
    filasB.push({
      token: `${s.id.slice(0, 8)}…`,
      línea: md ? (md.plantLineId || md.plantSlug || '?') : '(sin doc)',
      aperturas,
      horas: (segs / 3600).toFixed(1),
      dispositivos: disp.size,
    })
  }
  if (filasB.length === 0) {
    console.log('    (sin actividad en el período)')
  } else {
    filasB.sort((a, b) => b.aperturas - a.aperturas)
    tabla(filasB, ['token', 'línea', 'aperturas', 'horas', 'dispositivos'])
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
