/**
 * Avisos de detención por Telegram/push con umbral APRENDIDO de la historia.
 *
 * ── Por qué ─────────────────────────────────────────────────────────────────
 * Hasta el 30-09-2026 cada paro ≥ 3 min de CADA máquina mandaba un mensaje:
 * medido en 30 días, 6,1 avisos por turno en Eviscerado Chonchi y 5,8 en
 * Filete. La mayoría eran paros normales para su causa (una «ACUMULACION
 * RECHAZO» dura típicamente 4,3 min en Chonchi y pasa ~2 veces por turno). Un
 * aviso que llega siempre deja de leerse, y el grave se pierde en el montón.
 *
 * ── Regla ───────────────────────────────────────────────────────────────────
 *   · Un paro avisa cuando dura MÁS que el percentil 90 de su propia causa en
 *     los últimos 30 días (mínimo 5 min). Causas con pocos casos: 10 min.
 *   · La misma causa arrancando en varias máquinas dentro de 3 min es UN
 *     evento de línea: un solo mensaje.
 *   · No se avisa desde los docs `Unscheduled` (repiten los estados del turno
 *     con nombre: el mismo paro salía dos veces) ni desde turnos de días
 *     anteriores a ayer, ni por paros de hace más de 12 h (un re-sync o
 *     backfill de días viejos disparaba avisos de agosto).
 *
 * Colación, ejercicio compensatorio, reunión, etc. llegan de Shoplogix como
 * `type: 'break'` y nunca entraron a esta regla (solo `downtime`).
 *
 * Todo lo de este archivo es PURO salvo `calcularUmbralesPlanta` (IO acotado,
 * lo usa el cron semanal).
 */

const PERCENTIL = 0.9
const MIN_AVISO_MIN = 5
const FALLBACK_MIN = 10
const MIN_MUESTRAS = 8
const MIN_PARO_HISTORIA_MIN = 3
const VENTANA_LINEA_MS = 3 * 60_000
const MAX_EDAD_PARO_MS = 12 * 3600_000
const DIAS_HISTORIA = 30
const MIN_PIEZAS_TURNO = 200

/** «Equipo Auxiliar / GEA» y «Equipo Auxiliar/GEA» son la misma causa. */
function normCausa(reason) {
  const s = String(reason || '').replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').trim().toUpperCase()
  return s || '(SIN CAUSA)'
}

function percentil(valores, p) {
  if (!valores.length) return null
  const s = [...valores].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]
}

const esMicro = (s) => String(s?.name || '').toLowerCase().includes('micro')

/** Paros de historia de una máquina: downtime (no micro) de al menos 3 min. */
function parosDeEstados(states) {
  return (states || [])
    .filter((s) => s && s.type === 'downtime' && !esMicro(s) && (s.durationSec || 0) >= MIN_PARO_HISTORIA_MIN * 60)
    .map((s) => ({ causa: normCausa(s.reason), min: (s.durationSec || 0) / 60 }))
}

/**
 * @param {Array<{causa:string,min:number}>} paros
 * @returns {Array<{causa,n,p50,p90,umbralMin}>} ordenado por frecuencia
 */
function calcularUmbrales(paros) {
  const por = new Map()
  for (const p of paros) {
    const c = normCausa(p.causa)
    if (!por.has(c)) por.set(c, [])
    por.get(c).push(p.min)
  }
  return [...por.entries()]
    .map(([causa, mins]) => {
      const p90 = percentil(mins, PERCENTIL)
      const aprendido = mins.length >= MIN_MUESTRAS
      return {
        causa,
        n: mins.length,
        p50: +percentil(mins, 0.5).toFixed(1),
        p90: +p90.toFixed(1),
        umbralMin: +(aprendido ? Math.max(MIN_AVISO_MIN, p90) : FALLBACK_MIN).toFixed(1),
      }
    })
    .sort((a, b) => b.n - a.n)
}

/**
 * Umbral en minutos para un paro de esta causa.
 * @param {Array|null} tabla  `causas` del doc `shoplogixUmbralesParos/{planta}`
 */
function umbralPara(tabla, reason) {
  const c = normCausa(reason)
  const fila = Array.isArray(tabla) ? tabla.find((f) => f.causa === c) : null
  if (fila) return { umbralMin: fila.umbralMin, p50: fila.p50, n: fila.n, aprendido: fila.n >= MIN_MUESTRAS }
  return { umbralMin: FALLBACK_MIN, p50: null, n: 0, aprendido: false }
}

/**
 * ¿Se avisa desde este doc de turno? Nunca desde `Unscheduled` (ni el turno
 * del sensor `…_Unscheduled@HH:MM`), ni desde días anteriores a ayer.
 * @param {string} shiftDoc  `${dateKey}_${turno}`
 * @param {number} nowWallMs reloj de planta (wall-clock-as-UTC)
 */
function esTurnoAvisable(shiftDoc, nowWallMs) {
  const id = String(shiftDoc || '')
  if (/_Unscheduled/i.test(id)) return false
  const dateKey = id.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false
  const ayer = new Date(nowWallMs - 24 * 3600_000).toISOString().slice(0, 10)
  return dateKey >= ayer
}

const msDe = (v) => {
  if (v == null) return null
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (v instanceof Date) return v.getTime()
  const n = Date.parse(v)
  return Number.isFinite(n) ? n : null
}

/** Clave estable del paro (misma que usaba el trigger antes: startAt o nombre+pos). */
function claveParo(stop, idx) {
  const ts = msDe(stop.startAt)
  return ts != null ? `t${ts}` : `${stop.name || 's'}|${stop.reason || ''}|${idx}`
}

/**
 * Qué paros de una máquina avisar ahora.
 *
 * @param {object} a
 *   @param {Array}   a.states
 *   @param {Array|null} a.tabla          umbrales aprendidos (o null)
 *   @param {boolean} a.usarAprendido     false → umbral fijo `minFijoMin` (regla vieja)
 *   @param {number}  a.minFijoMin        `events.stoppageMinMinutes`
 *   @param {number}  a.nowWallMs
 *   @param {Set<string>} a.yaNotificadas
 * @returns {{ relevantes: Array<{key,stop,umbral}>, nuevas: Array<{key,stop,umbral}> }}
 *   `relevantes` = todos los que ya pasaron su umbral (para el baseline);
 *   `nuevas` = de esos, los recientes que todavía no se avisaron.
 */
function parosParaAvisar({ states, tabla, usarAprendido, minFijoMin, nowWallMs, yaNotificadas }) {
  const relevantes = []
  ;(states || []).forEach((stop, idx) => {
    if (!stop || stop.type !== 'downtime' || esMicro(stop)) return
    const umbral = usarAprendido
      ? umbralPara(tabla, stop.reason)
      : { umbralMin: Math.max(0, minFijoMin ?? 3), p50: null, n: 0, aprendido: false }
    const min = (stop.durationSec || 0) / 60
    if (usarAprendido ? min > umbral.umbralMin : min >= umbral.umbralMin) {
      relevantes.push({ key: claveParo(stop, idx), stop, umbral })
    }
  })
  const nuevas = relevantes.filter(({ key, stop }) => {
    if (yaNotificadas.has(key)) return false
    const ini = msDe(stop.startAt)
    return ini == null || nowWallMs - ini <= MAX_EDAD_PARO_MS
  })
  return { relevantes, nuevas }
}

/**
 * Evento de línea: ¿otra máquina ya avisó esta misma causa arrancando a ±3 min?
 * @param {Array<{causa:string,iniMs:number}>} recientes  (estado de la línea)
 * @param {{causa:string,iniMs:number|null}} evento
 * @returns {{ repetido: boolean, recientes: Array }}  recientes actualizados (máx 40)
 */
function agruparEnLinea(recientes, evento) {
  const lista = Array.isArray(recientes) ? recientes : []
  const causa = normCausa(evento.causa)
  const repetido = evento.iniMs != null && lista.some(
    (r) => r.causa === causa && Math.abs(r.iniMs - evento.iniMs) <= VENTANA_LINEA_MS,
  )
  const nueva = repetido ? lista : [...lista, { causa, iniMs: evento.iniMs ?? 0 }].slice(-40)
  return { repetido, recientes: nueva }
}

const fmt1 = (x) => (Math.round(x * 10) / 10).toLocaleString('es-CL')

/** Texto del aviso: dice cuánto es lo normal, para que el que lo lee sepa por qué llegó. */
function textoAvisoParo({ dMin, reason, machineName, plantLabel, umbral }) {
  const causa = reason || 'Detención'
  let contexto = ''
  if (umbral?.aprendido && umbral.p50 != null) {
    contexto = `\nLo normal para esta causa: ~${fmt1(umbral.p50)} min (avisa sobre ${fmt1(umbral.umbralMin)}).`
  } else if (umbral && umbral.umbralMin != null) {
    contexto = `\nCausa con poca historia: avisa sobre ${fmt1(umbral.umbralMin)} min.`
  }
  return {
    title: `⛔ Detención ${dMin} min · ${machineName}`,
    body: `${causa} · ${plantLabel}`,
    tg: `⛔ <b>Detención de ${dMin} min</b> — ${plantLabel}\n${machineName} · ${causa}${contexto}`,
  }
}

/**
 * Cron semanal: umbrales por causa con los últimos 30 días de turnos con
 * nombre y producción real. Lee por RANGO de documentId (nunca la colección
 * entera) y la subcolección `machines` solo de los turnos que califican.
 * Costo por planta y corrida: ~30-120 padres + ~30-150 máquinas ≈ 300 lecturas.
 */
async function calcularUmbralesPlanta({ db, plantSlug, hoyDateKey, FieldPath }) {
  const hasta = hoyDateKey
  const desdeD = new Date(`${hoyDateKey}T00:00:00Z`)
  desdeD.setUTCDate(desdeD.getUTCDate() - DIAS_HISTORIA)
  const desde = desdeD.toISOString().slice(0, 10)
  const col = db.collection(`shoplogix/${plantSlug}/shifts`)
  const snap = await col
    .where(FieldPath.documentId(), '>=', desde)
    .where(FieldPath.documentId(), '<', hasta)
    .get()
  const paros = []
  let turnos = 0
  for (const doc of snap.docs) {
    if (/_Unscheduled/i.test(doc.id)) continue
    const piezas = (doc.data()?.machines || []).reduce((a, m) => a + (m.totalCycles || 0), 0)
    if (piezas < MIN_PIEZAS_TURNO) continue
    const ms = await doc.ref.collection('machines').get()
    turnos++
    for (const m of ms.docs) paros.push(...parosDeEstados(m.data()?.states))
  }
  return { desde, hasta, turnos, paros: paros.length, causas: calcularUmbrales(paros) }
}

module.exports = {
  PERCENTIL, MIN_AVISO_MIN, FALLBACK_MIN, MIN_MUESTRAS, VENTANA_LINEA_MS, MAX_EDAD_PARO_MS, DIAS_HISTORIA,
  normCausa, percentil, parosDeEstados, calcularUmbrales, umbralPara, esTurnoAvisable,
  claveParo, parosParaAvisar, agruparEnLinea, textoAvisoParo, calcularUmbralesPlanta,
}
