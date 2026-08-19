/**
 * Ensayo del informe post-turno: lo genera para turnos ya cerrados SIN enviar
 * nada a Telegram y sin escribir en Firestore.
 *
 * Es la verificación previa a prender la feature, y sirve igual después: cuando
 * se toque el cálculo o los textos, correr esto contra los mismos turnos y
 * comparar. Solo lee.
 *
 * Uso:
 *   node scripts/dry-run-informe-turno.js <salida> [turnos-por-planta] [plantas]
 *
 *   node scripts/dry-run-informe-turno.js ./out 6 chonchi,yal
 *
 * Necesita `serviceAccountKey.json` (por defecto el del repo de la PWA; se
 * puede apuntar con SERVICE_ACCOUNT_KEY).
 *
 * Además de generar los PDF, revisa cada informe contra una lista de defectos
 * que NO se ven leyendo el código y sí arruinan una reunión: un "undefined" en
 * el texto, dos cifras distintas de producción, un veredicto emitido con dos
 * turnos, un texto tan largo que se sale de la lámina.
 */

const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')

const { cotejarTurnos } = require('../shoplogix/cotejoTurnos')
const { construirDatosInforme } = require('../shoplogix/informeTurno')
const { generarInformeTurno } = require('../shoplogix/turnoDefensaPdf')
const { AREA_LABEL, caption, nombreArchivo } = require('../shoplogix/enviarInforme')

const SALIDA = process.argv[2] || './out-informes'
const POR_PLANTA = Number(process.argv[3] || 6)
const PLANTAS = (process.argv[4] || 'chonchi,yal').split(',')
const KEY = process.env.SERVICE_ACCOUNT_KEY
  || 'D:/a/APP leventamiento de insidencias en planta/serviceAccountKey.json'

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(require(KEY)) })
}
const db = admin.firestore()

/** Defectos que se pueden detectar sin mirar el PDF. */
function revisar({ datos, pdf, plant, docId }) {
  const problemas = []
  const t = datos.textos
  const textos = [t.veredictoTitulo, t.veredictoDetalle, t.parrafoReunion,
    t.notaLamina1, t.notaLamina2, t.notaLamina3, t.notaLamina4, t.notaLamina5, ...t.pendientes]

  for (const s of textos) {
    if (/undefined|NaN|\[object Object\]|null/.test(String(s))) problemas.push(`texto con basura: "${String(s).slice(0, 90)}"`)
  }
  // Un texto muy largo se sale de la lámina: el ancho útil son ~265 mm y el
  // cuerpo va a 8,5 pt, o sea unos 1.100 caracteres antes de invadir la nota
  // siguiente.
  for (const s of [t.veredictoDetalle, t.parrafoReunion, t.notaLamina4]) {
    if (String(s).length > 1100) problemas.push(`texto probablemente desbordado (${String(s).length} car.)`)
  }
  for (const p of t.pendientes) {
    if (String(p).length > 320) problemas.push(`pendiente muy largo (${String(p).length} car.)`)
  }

  // Una sola cifra de producción en todo el documento.
  const ref = (datos.cotejo.filas || []).find((f) => f.esReferencia)
  if (ref && ref.ciclos !== datos.resumen.ciclos) {
    problemas.push(`produccion inconsistente: lamina 1 ${datos.resumen.ciclos} vs cotejo ${ref.ciclos}`)
  }
  // Un veredicto sacado de dos turnos no se sostiene.
  if (datos.cotejo.veredicto !== 'sin-comparables' && datos.cotejo.comparados < 3) {
    problemas.push(`veredicto "${datos.cotejo.veredicto}" con solo ${datos.cotejo.comparados} comparables`)
  }
  // No es un defecto, pero si un informe degradado: sale sin lamina de cotejo.
  // Se lista para que se vea cuantos turnos quedan sin veredicto y por que.
  if (datos.cotejo.veredicto === 'sin-comparables') {
    problemas.push(`sin veredicto comparativo (${datos.cotejo.comparados} comparables)`)
  }
  for (const e of (datos.reparto && datos.reparto.eventos) || []) {
    if (e.minReenganche > (datos.reparto.maxReengancheMin || 30)) {
      problemas.push(`reenganche de ${e.minReenganche} min: pasa el tope y deberia caer en degradado`)
    }
  }
  if (datos.tramos.length > 12) problemas.push(`${datos.tramos.length} tramos: la tabla no cabe`)
  if (datos.eventosPorMaquina.length > 6) problemas.push(`${datos.eventosPorMaquina.length} pistas en la cronologia`)
  if (!datos.resumen.ritmoNormal && datos.bloques.length > 20) {
    problemas.push('sin ritmo normal pese a tener bloques: revisar el criterio de bloque limpio')
  }
  // El PDF mismo.
  const cabecera = pdf.slice(0, 5).toString()
  if (cabecera !== '%PDF-') problemas.push('el archivo no es un PDF')
  const paginas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
  if (paginas !== 6) problemas.push(`${paginas} paginas en vez de 6`)
  if (pdf.length > 400_000) problemas.push(`PDF muy pesado (${Math.round(pdf.length / 1024)} KB)`)
  const cap = caption({ meta: datos.meta, datos })
  if (cap.length > 1024) problemas.push(`caption de ${cap.length} car.: Telegram corta en 1024`)

  return { problemas, paginas, plant, docId }
}

/**
 * Los turnos ya cerrados, del más reciente hacia atrás.
 *
 * Se ordena en memoria a propósito: `orderBy('__name__', 'desc')` sobre esta
 * subcolección exige un índice compuesto, y no vale crear un índice en
 * producción para una herramienta de ensayo. La colección son unos cientos de
 * docs por planta y acá solo se piden los ids.
 */
async function turnosCerrados(plant, n) {
  const col = db.collection('shoplogix').doc(plant).collection('shifts')
  const snap = await col.select('endBriefSentAt').get()
  return snap.docs
    .filter((d) => !/_Unscheduled$/.test(d.id))
    .filter((d) => d.data().endBriefSentAt)   // turno cerrado del todo
    .map((d) => d.id)
    .sort()
    .reverse()
    .slice(0, n)
}

;(async () => {
  fs.mkdirSync(SALIDA, { recursive: true })
  const revisiones = []

  for (const plant of PLANTAS) {
    const ids = await turnosCerrados(plant, POR_PLANTA)
    console.log(`\n=== ${plant.toUpperCase()} — ${ids.length} turnos cerrados ===`)

    for (const docId of ids) {
      try {
        const ref = db.collection('shoplogix').doc(plant).collection('shifts').doc(docId)
        const padre = (await ref.get()).data() || {}
        const snap = await ref.collection('machines').get()
        if (snap.empty) { console.log(`  ${docId.padEnd(28)} SIN MAQUINAS`); continue }

        const machines = snap.docs.map((d) => {
          const x = d.data()
          return {
            machineName: x.machineName || d.id,
            states: x.states || [],
            intervals: x.intervals || [],
            totalCycles: x.totalCycles || 0,
          }
        }).sort((a, b) => a.machineName.localeCompare(b.machineName, 'es'))

        const ciclos = machines.reduce((a, m) => a + m.totalCycles, 0)
        if (ciclos < 50) { console.log(`  ${docId.padEnd(28)} sin produccion (${ciclos}) — se omitiria`); continue }

        const cotejo = await cotejarTurnos({ db, plant, shiftDocId: docId }).catch(() => null)
        const datos = construirDatosInforme({
          machines,
          windowStart: snap.docs[0].data().shiftStart,
          windowEnd: snap.docs[0].data().shiftEnd,
          cotejo,
          meta: {
            planta: plant,
            areaLabel: AREA_LABEL[plant] || plant,
            turnoLabel: padre.shiftId || docId.split('_').slice(1).join('_'),
            fechaLabel: docId.slice(0, 10),
          },
        })
        const pdf = generarInformeTurno(datos)
        fs.writeFileSync(path.join(SALIDA, nombreArchivo(plant, docId)), pdf)

        const rev = revisar({ datos, pdf, plant, docId })
        revisiones.push(rev)
        const marca = rev.problemas.length ? 'REVISAR' : 'ok     '
        const rp = datos.reparto || { totalPz: 0 }
        const pc = (v) => (rp.totalPz ? `${String(Math.round((v / rp.totalPz) * 100)).padStart(3)}%` : '  --')
        console.log(`  ${docId.padEnd(28)} ${marca} ${String(ciclos).padStart(6)} pz  `
          + `${String(datos.cotejo.veredicto).padEnd(18)} ritmo ${String(datos.resumen.ritmoNormal ? datos.resumen.ritmoNormal.toFixed(1) : '--').padStart(5)}  `
          + `parada ${pc(rp.paradoPz)} reeng ${pc(rp.reenganchePz)} degrad ${pc(rp.degradadoPz)}  `
          + `${datos.tramos.length} tramos ${Math.round(pdf.length / 1024)} KB`)
        rev.problemas.forEach((p) => console.log(`      - ${p}`))
      } catch (e) {
        revisiones.push({ plant, docId, problemas: [`EXCEPCION: ${e.message}`] })
        console.log(`  ${docId.padEnd(28)} EXCEPCION ${e.message}`)
      }
    }
  }

  const conProblemas = revisiones.filter((r) => r.problemas.length)
  console.log(`\n=== ${revisiones.length} informes generados, ${conProblemas.length} con observaciones ===`)
  console.log(`PDFs en: ${path.resolve(SALIDA)}`)
  process.exit(conProblemas.length ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
