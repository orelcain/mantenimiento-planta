#!/usr/bin/env node
/**
 * Backfill del campo `jackKnife` en los docs padre de turno de Shoplogix.
 *
 * Recorre `shoplogix/{planta}/shifts/*`, lee los docs de `machines/` de cada
 * turno, calcula el resumen con `functions/shoplogix/jackKnife.js` y escribe
 * SOLO el campo `jackKnife` con merge. No toca ningún otro campo.
 *
 * Idempotente: si el turno ya tiene el mismo `jackKnife`, no escribe.
 *
 * Por defecto es DRY-RUN: lee, calcula e imprime totales, sin escribir.
 * Escribir en producción exige `--write` explícito.
 *
 * Uso:
 *   node scripts/backfill-jackknife.js                              # dry-run, ambas plantas
 *   node scripts/backfill-jackknife.js --plant=chonchi --desde=2026-08-09 --hasta=2026-11-06
 *   node scripts/backfill-jackknife.js --write                      # escribe (solo con OK de Orel)
 */
const fs = require('node:fs')
const path = require('node:path')
const admin = require('firebase-admin')
const { PLANT_MACHINES } = require('../functions/shoplogix/machines')
const { resumenJackKnifeTurno, debeResumirse } = require('../functions/shoplogix/jackKnife')

const CLON_PRINCIPAL = 'D:\\a\\APP leventamiento de insidencias en planta'
const PLANTAS_DEFAULT = ['chonchi', 'yal']
const LOTE = 8

// La credencial es gitignored: vive en el clon principal, no en los worktrees.
function credencial() {
  for (const base of [path.join(__dirname, '..'), CLON_PRINCIPAL]) {
    const p = path.join(base, 'serviceAccountKey.json')
    if (fs.existsSync(p)) return require(p)
  }
  throw new Error('No encontré serviceAccountKey.json ni en este repo ni en el clon principal')
}

function leerArgs(argv) {
  const get = (nombre) => {
    const hit = argv.find((a) => a.startsWith(`--${nombre}=`))
    return hit ? hit.slice(nombre.length + 3) : null
  }
  const write = argv.includes('--write')
  const dry = argv.includes('--dry-run')
  if (write && dry) throw new Error('Usa --write o --dry-run, no los dos')
  const plant = get('plant')
  return {
    escribir: write,
    plantas: plant ? [plant] : PLANTAS_DEFAULT,
    desde: get('desde'),
    hasta: get('hasta'),
  }
}

const redondear1 = (n) => Math.round(n * 10) / 10

async function main() {
  const opts = leerArgs(process.argv.slice(2))
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(credencial()) })
  }
  const db = admin.firestore()
  console.log(`Modo: ${opts.escribir ? 'WRITE (escribe jackKnife)' : 'DRY-RUN (no escribe)'}`)
  if (opts.desde || opts.hasta) console.log(`Rango de turnos: ${opts.desde ?? '…'} a ${opts.hasta ?? '…'}`)

  for (const planta of opts.plantas) {
    const nombres = Object.fromEntries((PLANT_MACHINES[planta] || []).map((m) => [m.machineid, m.name]))
    const shiftsRef = db.collection(`shoplogix/${planta}/shifts`)
    // Solo el campo que comparamos (idempotencia) y el id: el resto del doc no hace falta.
    const padres = await shiftsRef.select('jackKnife').get()
    const turnos = padres.docs
      .map((d) => ({ id: d.id, ref: d.ref, previo: d.get('jackKnife') ?? null, dateKey: d.id.slice(0, 10) }))
      .filter((t) => (!opts.desde || t.dateKey >= opts.desde) && (!opts.hasta || t.dateKey <= opts.hasta))
      // Unscheduled repite states de los turnos: no se resume (ver jackKnife.debeResumirse).
      .filter((t) => debeResumirse(t.id.slice(11)))
      .sort((a, b) => (a.id < b.id ? -1 : 1))

    const tot = {
      turnos: turnos.length, sinMaquinas: 0, conResumen: 0, sinCambios: 0, aEscribir: 0, escritos: 0,
      uptimeCero: 0, eventos: 0, minMantencion: 0, sinImputarEv: 0, minSinImputar: 0, sinImputarLineaEv: 0,
      comentarios: 0, bytesTotal: 0, bytesMax: 0, maxId: null,
    }

    for (let i = 0; i < turnos.length; i += LOTE) {
      const lote = turnos.slice(i, i + LOTE)
      await Promise.all(lote.map(async (t) => {
        const maq = await t.ref.collection('machines').get()
        const docs = maq.docs.map((m) => ({
          machineName: nombres[m.id] || m.id,
          states: m.get('states') || [],
          comments: m.get('comments') || [],
        }))
        if (docs.length === 0) { tot.sinMaquinas++; return }
        const jk = resumenJackKnifeTurno(docs)
        tot.conResumen++
        if (jk.uptimeMin === 0) tot.uptimeCero++
        tot.eventos += jk.eventos.length
        tot.minMantencion += jk.eventos.reduce((s, e) => s + e[2], 0)
        tot.sinImputarEv += jk.sinImputar.length
        tot.minSinImputar += jk.sinImputar.reduce((s, e) => s + e[2], 0)
        tot.sinImputarLineaEv += jk.sinImputarLinea.length
        tot.comentarios += jk.comentarios.length
        const bytes = Buffer.byteLength(JSON.stringify(jk), 'utf8')
        tot.bytesTotal += bytes
        if (bytes > tot.bytesMax) { tot.bytesMax = bytes; tot.maxId = t.id }

        if (JSON.stringify(t.previo) === JSON.stringify(jk)) { tot.sinCambios++; return }
        tot.aEscribir++
        if (opts.escribir) {
          await t.ref.set({ jackKnife: jk }, { merge: true })
          tot.escritos++
        }
      }))
    }

    const conR = tot.conResumen || 1
    console.log(`\n── ${planta} ──`)
    console.log(`turnos en rango:        ${tot.turnos}`)
    console.log(`sin docs de máquina:    ${tot.sinMaquinas}`)
    console.log(`con resumen calculado:  ${tot.conResumen}  (uptime 0: ${tot.uptimeCero})`)
    console.log(`eventos de Mantención:  ${tot.eventos}`)
    console.log(`horas de Mantención:    ${(tot.minMantencion / 60).toFixed(1)} h`)
    console.log(`sin imputar (máquina):  ${tot.sinImputarEv} tramos, ${(tot.minSinImputar / 60).toFixed(1)} h`)
    console.log(`sin imputar (línea):    ${tot.sinImputarLineaEv} tramos`)
    console.log(`comentarios:            ${tot.comentarios}`)
    console.log(`tamaño jackKnife JSON:  promedio ${Math.round(tot.bytesTotal / conR)} B, máximo ${tot.bytesMax} B (${tot.maxId ?? '-'})`)
    console.log(`sin cambios:            ${tot.sinCambios}`)
    console.log(opts.escribir
      ? `escritos:               ${tot.escritos}`
      : `pendientes de escribir: ${tot.aEscribir}  (dry-run: no se escribió nada)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
