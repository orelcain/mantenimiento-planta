/**
 * jackKnife — resumen por turno del Diagrama Jack-Knife de Mantención.
 *
 * PURO (sin Firestore ni fetch). Quien llama pasa los docs de máquina del
 * turno: `{ machineName, states[], comments[] }`. Devuelve un resumen chico que
 * el sync guarda en el doc padre del turno (campo `jackKnife`) y que la PWA
 * suma por ventana sin leer las subcolecciones.
 *
 * Reglas:
 *  - Los states se deduplican por (inicio, type, name, reason), igual que
 *    `sanearStates` de kpisMantencion.js, y se clasifican con `clasificaCausa`.
 *  - Un EVENTO es la unión de los tramos de una misma causa de Mantención en
 *    las máquinas del turno. Tramos con hueco ≤ 60 s forman un solo evento. Una
 *    detención simultánea en las 3 evisceradoras cuenta como un evento.
 *  - Minutos del evento = desde su inicio hasta el fin del último tramo unido.
 *
 * Forma de la salida (v1):
 *   eventos:           [[causa, inicioMs, min]]
 *   sinImputar:        [[maquina, inicioMs, min]]   (sin causa, sin micro)
 *   sinImputarLinea:   [[inicioMs, min]]            (las 3 máquinas juntas)
 *   comentarios:       [[causa, inicioMs, texto]]   (máx. 40 por turno)
 *   conCausaMin:       falla + externo, en minutos (cobertura)
 *   sinCausaMin:       sin-imputar + micro, en minutos (cobertura)
 *   uptimeMin:         producción, en minutos. Campo extra al spec: la PWA lo
 *                      usa para excluir turnos con uptime 0.
 */

'use strict'

const { clasificaCausa } = require('./kpisMantencion')
const { matchImputacion } = require('./imputacion')

const UNION_GAP_MS = 60_000
const DEDUPE_COMENTARIO_MS = 2 * 60_000
const MAX_COMENTARIOS = 40
const MAX_TEXTO = 140
const RE_SOLO_NUMERO = /^\s*\d+\s*$/

/** Milisegundos desde Date, Timestamp (admin/web) o string. NaN si no se puede. */
function toMs(x) {
  if (x === null || x === undefined || x === '') return NaN
  if (typeof x.toMillis === 'function') return x.toMillis()
  if (x instanceof Date) return x.getTime()
  return new Date(x).getTime()
}

const minutos = (desde, hasta) => (hasta - desde) / 60_000
const redondear1 = (n) => Math.round(n * 10) / 10

/**
 * Une tramos `{s, e}` (ms). Hueco ≤ 60 s = mismo evento.
 * @returns {Array<{s: number, e: number}>} eventos ordenados
 */
function unirTramos(tramos) {
  const orden = [...tramos].sort((a, b) => a.s - b.s)
  const out = []
  for (const t of orden) {
    const ult = out[out.length - 1]
    if (ult && t.s - ult.e <= UNION_GAP_MS) {
      ult.e = Math.max(ult.e, t.e)
    } else {
      out.push({ s: t.s, e: t.e })
    }
  }
  return out
}

/** Label de la hoja si la causa es de Mantención (incluye Riles y Túneles); si no, null. */
function hojaDeMantencion(raw) {
  const m = matchImputacion(raw)
  return m.bucket === 'mantencion' && m.leaf ? m.leaf.label : null
}

/**
 * @param {Array<{machineName: string, states: Array, comments: Array}>} machineDocs
 * @returns {object} resumen v1 (ver cabecera)
 */
function resumenJackKnifeTurno(machineDocs) {
  const docs = Array.isArray(machineDocs) ? machineDocs : []
  const tramosPorCausa = new Map()
  const tramosPorMaquina = new Map()
  const tramosLinea = []
  const comentariosCrudos = []
  let conCausaMin = 0
  let sinCausaMin = 0
  let uptimeMin = 0

  for (const doc of docs) {
    const maquina = String(doc.machineName || '').replace(/^YAL\s+/, '')
    const vistos = new Set()

    for (const st of doc.states || []) {
      const s = toMs(st.startAt)
      const e = toMs(st.endAt)
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue
      const clave = `${s}|${st.type}|${st.name || ''}|${st.reason || ''}`
      if (vistos.has(clave)) continue
      vistos.add(clave)

      const cl = clasificaCausa(st)
      const dur = minutos(s, e)
      if (cl === 'produccion') { uptimeMin += dur; continue }
      if (cl === 'falla' || cl === 'externo') conCausaMin += dur
      if (cl === 'sin-imputar' || cl === 'micro') sinCausaMin += dur

      if (cl === 'falla') {
        const causa = hojaDeMantencion(st.reason || st.name)
        if (causa) {
          if (!tramosPorCausa.has(causa)) tramosPorCausa.set(causa, [])
          tramosPorCausa.get(causa).push({ s, e })
        }
      } else if (cl === 'sin-imputar') {
        if (!tramosPorMaquina.has(maquina)) tramosPorMaquina.set(maquina, [])
        tramosPorMaquina.get(maquina).push({ s, e })
        tramosLinea.push({ s, e })
      }
    }

    for (const c of doc.comments || []) {
      const texto = typeof c?.text === 'string' ? c.text.trim() : ''
      if (!texto || RE_SOLO_NUMERO.test(texto)) continue
      const causa = hojaDeMantencion(c.reasonValue)
      if (!causa) continue
      const t = toMs(c.startAt)
      if (!Number.isFinite(t)) continue
      comentariosCrudos.push([causa, t, texto.slice(0, MAX_TEXTO)])
    }
  }

  const eventos = []
  for (const [causa, tramos] of tramosPorCausa) {
    for (const ev of unirTramos(tramos)) eventos.push([causa, ev.s, redondear1(minutos(ev.s, ev.e))])
  }
  eventos.sort((a, b) => a[1] - b[1])

  const sinImputar = []
  for (const [maquina, tramos] of tramosPorMaquina) {
    for (const ev of unirTramos(tramos)) sinImputar.push([maquina, ev.s, redondear1(minutos(ev.s, ev.e))])
  }
  sinImputar.sort((a, b) => a[1] - b[1])

  const sinImputarLinea = unirTramos(tramosLinea).map((ev) => [ev.s, redondear1(minutos(ev.s, ev.e))])

  // Mismo texto, misma causa, a ±2 min entre máquinas = un solo comentario.
  comentariosCrudos.sort((a, b) => a[1] - b[1])
  const comentarios = []
  for (const c of comentariosCrudos) {
    if (comentarios.length >= MAX_COMENTARIOS) break
    const repetido = comentarios.some(
      (k) => k[0] === c[0] && k[2] === c[2] && Math.abs(k[1] - c[1]) <= DEDUPE_COMENTARIO_MS,
    )
    if (!repetido) comentarios.push(c)
  }

  return {
    v: 1,
    eventos,
    sinImputar,
    sinImputarLinea,
    comentarios,
    conCausaMin: redondear1(conCausaMin),
    sinCausaMin: redondear1(sinCausaMin),
    uptimeMin: redondear1(uptimeMin),
  }
}

/**
 * Los bloques `Unscheduled` (fuera de turno) REPITEN states de los turnos
 * regulares. Medido en Chonchi 08-09 → 06-11: sumar por turno con ellos daba
 * 717 eventos; sin ellos, 354, igual que la unión global de la historia. Lo que
 * solo existe en Unscheduled son 9 eventos / 27 min en 90 días. Por eso el
 * resumen no se calcula para esos bloques.
 */
function debeResumirse(shiftId) {
  return String(shiftId || '') !== 'Unscheduled'
}

module.exports = {
  resumenJackKnifeTurno,
  debeResumirse,
  unirTramos,
  toMs,
  UNION_GAP_MS,
  MAX_COMENTARIOS,
  MAX_TEXTO,
}
