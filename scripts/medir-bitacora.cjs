#!/usr/bin/env node
/**
 * Mide cómo se está usando la bitácora, turno por turno (SOLO LECTURA).
 *
 *   node scripts/medir-bitacora.cjs                       (los últimos 7 días)
 *   node scripts/medir-bitacora.cjs 2026-09-21            (desde esa fecha)
 *   node scripts/medir-bitacora.cjs 2026-09-16 2026-09-17 (rango, ambos incluidos)
 *
 * Responde lo que las rondas 48-55 dejaron abierto, con los mismos cortes que se midieron a mano:
 * ¿se contesta el impacto? ¿las paradas quedan con minutos? ¿se registra en vivo o al final del
 * turno? ¿cuántos eventos se cargan con su turno ya cerrado? Sirve para verificar «Terminó ahora» y
 * «¿Cuánto duró?» (#1106, #1107) con el primer turno real, y como cifra de uso para presentar.
 */
const fs = require('node:fs')
const path = require('node:path')
const admin = require('firebase-admin')

const PLANTA = 'chonchi'
const CLON_PRINCIPAL = 'D:\\a\\APP leventamiento de insidencias en planta'
const INICIO_BANDA = { noche: 0, dia: 8, tarde: 16 }

// La credencial es gitignored: vive en el clon principal, no en los worktrees.
function credencial() {
  for (const base of [path.join(__dirname, '..'), CLON_PRINCIPAL]) {
    const p = path.join(base, 'serviceAccountKey.json')
    if (fs.existsSync(p)) return require(p)
  }
  throw new Error('No encontré serviceAccountKey.json ni en este repo ni en el clon principal')
}

/** Desfase de Chile respecto de UTC en esa fecha (-3 en horario de verano, -4 en invierno). */
function desfaseChile(fecha) {
  const t = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(`${fecha}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName').value // «GMT-3»
  return Number(t.replace('GMT', '')) || 0
}
/** Milisegundos UTC de una fecha + HH:mm de Chile. */
function msChile(fecha, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return Date.UTC(...fecha.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))), h, m) - desfaseChile(fecha) * 3600e3
}
const mediana = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—')
const minutosEntre = (a, b) => {
  const [ha, ma] = a.split(':').map(Number)
  const [hb, mb] = b.split(':').map(Number)
  return (hb * 60 + mb - (ha * 60 + ma) + 1440) % 1440
}

async function main() {
  const hoy = new Date().toISOString().slice(0, 10)
  const desde = process.argv[2] || new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10)
  const hasta = process.argv[3] || hoy
  admin.initializeApp({ credential: admin.credential.cert(credencial()) })
  const snap = await admin.firestore().collection('bitacoraEventos').where('plantId', '==', PLANTA).get()

  const eventos = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => typeof e.turnoId === 'string' && e.turnoId.slice(0, 10) >= desde && e.turnoId.slice(0, 10) <= hasta)
  if (!eventos.length) {
    console.log(`Sin eventos entre ${desde} y ${hasta}.`)
    return
  }

  const porTurno = new Map()
  for (const e of eventos) {
    if (!porTurno.has(e.turnoId)) porTurno.set(e.turnoId, [])
    porTurno.get(e.turnoId).push(e)
  }

  const filas = []
  const total = { eventos: 0, borradores: 0, conInicio: 0, conTermino: 0, tarde: 0, fuera: 0, paradas: 0, paradasConMin: 0, desfases: [], impactos: {}, tipos: {} }
  for (const [turnoId, lista] of [...porTurno].sort(([a], [b]) => a.localeCompare(b))) {
    const [fecha, banda] = turnoId.split('_')
    const finTurno = msChile(fecha, `${String(INICIO_BANDA[banda]).padStart(2, '0')}:00`) + 8 * 3600e3
    const t = { eventos: 0, borradores: 0, conInicio: 0, conTermino: 0, tarde: 0, fuera: 0, paradas: 0, paradasConMin: 0, desfases: [] }
    for (const e of lista) {
      if (e.estado === 'borrador') {
        t.borradores++
        continue
      }
      t.eventos++
      total.impactos[e.impacto || '(sin)'] = (total.impactos[e.impacto || '(sin)'] || 0) + 1
      total.tipos[e.tipo || '(sin)'] = (total.tipos[e.tipo || '(sin)'] || 0) + 1
      const creado = e.createdAt?.toMillis?.()
      if (e.horaInicio) {
        t.conInicio++
        if (e.horaTermino) t.conTermino++
        if (creado) {
          const desfase = Math.round((creado - msChile(fecha, e.horaInicio)) / 60000)
          t.desfases.push(desfase)
          if (desfase > 120) t.tarde++
        }
      }
      if (creado && creado > finTurno) t.fuera++
      if (e.impacto === 'con-parada') {
        t.paradas++
        const min = e.minutosParada != null ? e.minutosParada : e.horaInicio && e.horaTermino ? minutosEntre(e.horaInicio, e.horaTermino) : null
        if (min != null) t.paradasConMin++
      }
    }
    for (const k of Object.keys(t)) total[k] = k === 'desfases' ? total.desfases.concat(t.desfases) : total[k] + t[k]
    filas.push({ turnoId, ...t })
  }

  const linea = (nombre, t) =>
    [
      nombre.padEnd(18),
      String(t.eventos).padStart(4),
      String(t.borradores).padStart(5),
      `${t.conTermino}/${t.conInicio}`.padStart(8),
      String(mediana(t.desfases) ?? '—').padStart(8),
      `${t.tarde}`.padStart(7),
      `${t.fuera}`.padStart(7),
      `${t.paradasConMin}/${t.paradas}`.padStart(9),
    ].join(' ')

  console.log(`Bitácora de ${PLANTA} · ${desde} a ${hasta}\n`)
  console.log(['turno'.padEnd(18), 'evts', 'borr.', 'término', 'desfase', '>2 h', 'fuera', 'paradas'].join(' '))
  console.log(['', '', '', 'c/inicio', 'mediana', '', 'turno', 'c/min'].map((s, i) => s.padStart([18, 4, 5, 8, 8, 7, 7, 9][i])).join(' '))
  for (const f of filas) console.log(linea(f.turnoId, f))
  console.log(linea('TOTAL', total))
  console.log(`\nImpacto: ${Object.entries(total.impactos).map(([k, v]) => `${k} ${v} (${pct(v, total.eventos)})`).join(' · ')}`)
  console.log(`Tipo:    ${Object.entries(total.tipos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  console.log(
    `\nLectura: término cargado en ${pct(total.conTermino, total.conInicio)} de los eventos con hora; ` +
      `${pct(total.tarde, total.conInicio)} se registró más de 2 h después de empezar; ` +
      `${pct(total.fuera, total.eventos)} se cargó con su turno ya cerrado; ` +
      `${total.paradasConMin} de ${total.paradas} paradas tienen minutos (sin minutos no entran al MTTR).`,
  )
  console.log('Desfase = minutos entre la hora de inicio declarada y el momento en que se creó el evento.')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
