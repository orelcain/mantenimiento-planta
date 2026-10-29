/**
 * Falla repetida — paros de Mantención cuya MISMA causa vuelve en la MISMA
 * máquina antes de 8 h de operación.
 *
 * ── Por qué ─────────────────────────────────────────────────────────────────
 * Estudio de factibilidad del 28-10-2026 (Chonchi + Yal feb→oct, Filete jul→oct;
 * plan en OneDrive `ARIA_MANTENIMIENTO_PLANTA/docs/PLAN_PREDICTIVA_MICRODETENCIONES.md`):
 * las microdetenciones NO avisan con horas de anticipación, pero tras un paro de
 * Mantención la misma causa vuelve ×4 a ×15 más seguido que en un momento al
 * azar (Motores 63 % vs 6 %, Lógica 61 % vs 7 %). Orel (28-10): cuando vuelve es
 * la misma falla mal resuelta → mide la calidad de la reparación.
 *
 * ── Definiciones (espejo de `apps/pwa/src/services/shoplogix/fallaRepetida.ts`) ──
 *   · Paro: `downtime` «Detencion» (no micro), ≥ 2 min, causal del bucket
 *     Mantención salvo «Ajuste mantenimiento» y «Trabajos contratistas».
 *   · Episodio: paros de la misma causa a < 12 min se cuentan como uno.
 *   · Vuelve: el siguiente episodio de la causa en la máquina empieza ≤ 8 h DE
 *     OPERACIÓN (`uptime`) después de que terminó este.
 *   · Azar: fracción del tiempo de operación de la máquina desde la que la causa
 *     aparece dentro de las 8 h siguientes. Es la tasa que tendría un momento
 *     cualquiera; sin ella, un 30 % no dice si es mucho.
 *   · Las cuchillerías de la Baader 200 se juntan en «Cuchillería».
 *
 * Todo es PURO salvo `calcularReincidenciaPlanta` (IO acotado, lo usa el cron).
 */

const { matchImputacion } = require('./imputacion')

const VENTANA_OP_H = 8
const ENCADENAR_MS = 12 * 60_000
const MIN_DUR_SEC = 120
/** Por debajo de esto una tasa mensual es ruido (Lógica sep-26: 14 % de 7). */
const MIN_EPISODIOS_MES = 30
/** El aviso del Monitor salta con causas que vuelven al menos así de seguido (decisión de Orel, 28-10). */
const UMBRAL_AVISO = 0.3
/** …y con historia suficiente para que la tasa signifique algo. */
const MIN_EPISODIOS_AVISO = 10
const DIAS_HISTORIA = 300

const EXCLUIDAS = new Set(['Ajuste mantenimiento', 'Trabajos contratistas / propios'])

/** Causa de falla de un reason, o null si no es un paro de Mantención que cuente. */
function causaDeFalla(reason) {
  const { leaf } = matchImputacion(reason)
  if (!leaf || leaf.bucket !== 'mantencion' || EXCLUIDAS.has(leaf.label)) return null
  if (leaf.equipo === 'baader200' && leaf.label.startsWith('Cuchillería')) return 'Cuchillería'
  return leaf.label
}

const ms = (v) => {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  if (typeof v.toDate === 'function') return v.toDate().getTime()
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/** States normalizados, sin duplicados (el doc `Unscheduled` repite los del turno). */
function normalizarStates(states) {
  const vistos = new Map()
  for (const s of states || []) {
    const ini = ms(s?.startAt)
    if (ini == null) continue
    const k = `${ini}|${s.type}|${s.name}|${s.reason}`
    const dur = Number(s.durationSec) || 0
    const prev = vistos.get(k)
    if (!prev || dur > prev.dur) vistos.set(k, { ini, dur, type: s.type, name: String(s.name || ''), reason: String(s.reason || '') })
  }
  return [...vistos.values()].sort((a, b) => a.ini - b.ini)
}

/**
 * Reloj de operación de una máquina: convierte un instante en horas de
 * `uptime` acumuladas hasta él.
 */
function relojOperacion(states) {
  const up = states.filter((s) => s.type === 'uptime' && s.dur > 0)
  const acum = []
  let h = 0
  for (const u of up) { acum.push(h); h += u.dur / 3600 }
  const total = h
  return {
    total,
    en(t) {
      let lo = 0, hi = up.length - 1, i = -1
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (up[mid].ini <= t) { i = mid; lo = mid + 1 } else hi = mid - 1 }
      if (i < 0) return 0
      const u = up[i]
      return acum[i] + Math.min(u.dur, Math.max(0, (t - u.ini) / 1000)) / 3600
    },
  }
}

/**
 * Episodios de falla de una máquina, por causa y en orden, con
 * `vuelve` (true/false/null = no hay 8 h de operación después para saberlo) y
 * `esRepeticion` (llegó ≤ 8 h de operación tras el anterior).
 */
function episodiosMaquina(rawStates) {
  const states = normalizarStates(rawStates)
  const reloj = relojOperacion(states)
  const porCausa = new Map()
  for (const s of states) {
    if (s.type !== 'downtime' || s.name.toLowerCase().includes('micro') || s.dur < MIN_DUR_SEC) continue
    const causa = causaDeFalla(s.reason)
    if (!causa) continue
    const fin = s.ini + s.dur * 1000
    const lista = porCausa.get(causa) || []
    const ult = lista[lista.length - 1]
    if (ult && s.ini - ult.fin < ENCADENAR_MS) { ult.fin = Math.max(ult.fin, fin); ult.paros++ } else lista.push({ ini: s.ini, fin, paros: 1 })
    porCausa.set(causa, lista)
  }
  const out = []
  const azarOpH = new Map()
  for (const [causa, lista] of porCausa) {
    const us = lista.map((e) => reloj.en(e.ini))
    const ue = lista.map((e) => reloj.en(e.fin))
    lista.forEach((e, i) => {
      const sig = i + 1 < lista.length ? us[i + 1] - ue[i] : null
      const vuelve = sig != null ? sig <= VENTANA_OP_H : (reloj.total - ue[i] >= VENTANA_OP_H ? false : null)
      out.push({
        causa, ini: e.ini, fin: e.fin, paros: e.paros, vuelve,
        esRepeticion: i > 0 && us[i] - ue[i - 1] <= VENTANA_OP_H,
        opHDesdeAnterior: i > 0 ? us[i] - ue[i - 1] : null,
      })
    })
    // Azar: largo de la unión de [inicio − 8 h, inicio] sobre el reloj de operación.
    let cubierto = 0, hasta = -Infinity
    for (const u of us) {
      const a = Math.max(0, u - VENTANA_OP_H, hasta)
      if (u > a) cubierto += u - a
      hasta = Math.max(hasta, u)
    }
    azarOpH.set(causa, cubierto)
  }
  out.sort((a, b) => a.ini - b.ini)
  return { episodios: out, opH: reloj.total, azarOpH }
}

const mesDe = (t) => new Date(t).toISOString().slice(0, 7) // wall-clock-as-UTC

/**
 * Resumen de una planta a partir de sus máquinas (cada una con TODOS sus
 * states del período, ya juntados entre turnos).
 * @param {Array<{machineid:string, name:string, states:Array}>} maquinas
 */
function resumirReincidencia(maquinas) {
  const meses = new Map()
  const causas = new Map()
  const porMaquinaCausa = []
  for (const m of maquinas) {
    const { episodios, opH, azarOpH } = episodiosMaquina(m.states)
    const vistas = new Set()
    for (const e of episodios) {
      vistas.add(e.causa)
      if (e.vuelve == null) continue // sin 8 h de operación por delante: todavía no se sabe
      const k = mesDe(e.ini)
      const mm = meses.get(k) || { mes: k, episodios: 0, vuelven: 0 }
      mm.episodios++; if (e.vuelve) mm.vuelven++
      meses.set(k, mm)
      const c = causas.get(e.causa) || { causa: e.causa, episodios: 0, vuelven: 0, azarOpH: 0, opH: 0 }
      c.episodios++; if (e.vuelve) c.vuelven++
      causas.set(e.causa, c)
    }
    for (const causa of vistas) {
      const c = causas.get(causa)
      if (!c) continue
      c.azarOpH += azarOpH.get(causa) || 0
      c.opH += opH
    }
    porMaquinaCausa.push({ machineid: m.machineid, name: m.name, episodios })
  }
  const listaCausas = [...causas.values()]
    .map((c) => ({
      causa: c.causa,
      episodios: c.episodios,
      vuelven: c.vuelven,
      tasa: c.episodios ? c.vuelven / c.episodios : 0,
      azar: c.opH > 0 ? c.azarOpH / c.opH : 0,
    }))
    .sort((a, b) => b.episodios - a.episodios)
  const listaMeses = [...meses.values()]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((x) => ({ ...x, tasa: x.episodios ? x.vuelven / x.episodios : 0, pocosDatos: x.episodios < MIN_EPISODIOS_MES }))
  return { meses: listaMeses, causas: listaCausas, porMaquinaCausa }
}

/**
 * Aviso del Monitor: el último episodio de una causa con tasa alta que
 * TERMINÓ hace poco. «Ev3 · Lógica: 6 de cada 10 veces vuelve en ≤ 8 h.»
 * @param {Array<{id:string,name:string,states:Array}>} maquinasTurno
 * @param {Array<{causa,episodios,vuelven,tasa}>} causas  del resumen guardado
 * @param {number} nowWallMs
 * @param {number} [ventanaMs]  cuánto dura el aviso tras cerrar el paro
 */
function avisosFallaRepetida(maquinasTurno, causas, nowWallMs, ventanaMs = 30 * 60_000) {
  const porCausa = new Map((causas || []).map((c) => [c.causa, c]))
  const avisos = []
  for (const m of maquinasTurno || []) {
    const { episodios } = episodiosMaquina(m.states)
    const ult = episodios[episodios.length - 1]
    if (!ult) continue
    // Paro todavía abierto (el último state es este paro): el aviso es al soltar la máquina.
    const ultState = normalizarStates(m.states).at(-1)
    if (ultState && ultState.type === 'downtime' && ultState.ini + ultState.dur * 1000 >= ult.fin) continue
    if (nowWallMs - ult.fin > ventanaMs || nowWallMs < ult.fin) continue
    const c = porCausa.get(ult.causa)
    if (!c || c.episodios < MIN_EPISODIOS_AVISO || c.tasa < UMBRAL_AVISO) continue
    avisos.push({
      machineId: m.id,
      machineName: m.name,
      causa: ult.causa,
      finAt: new Date(ult.fin).toISOString(),
      vuelven: c.vuelven,
      episodios: c.episodios,
      deCada10: Math.round(c.tasa * 10),
      esRepeticion: ult.esRepeticion,
    })
  }
  return avisos
}

/**
 * Cron: reincidencia de una planta con los últimos DIAS_HISTORIA días. Lee por
 * RANGO de documentId y la subcolección `machines` de cada turno (incluye
 * `Unscheduled`: ahí cae producción fuera de horario; sus states repetidos se
 * deduplican). Costo por planta y corrida: ≈ turnos × máquinas lecturas.
 */
async function calcularReincidenciaPlanta({ db, plantSlug, hoyDateKey, FieldPath }) {
  const desdeD = new Date(`${hoyDateKey}T00:00:00Z`)
  desdeD.setUTCDate(desdeD.getUTCDate() - DIAS_HISTORIA)
  const desde = desdeD.toISOString().slice(0, 10)
  const snap = await db.collection(`shoplogix/${plantSlug}/shifts`)
    .where(FieldPath.documentId(), '>=', desde)
    .where(FieldPath.documentId(), '<=', `${hoyDateKey}_`)
    .get()
  const porMaquina = new Map()
  let turnos = 0
  for (const doc of snap.docs) {
    const ms_ = await doc.ref.collection('machines').get()
    turnos++
    for (const m of ms_.docs) {
      const d = m.data() || {}
      const cur = porMaquina.get(m.id) || { machineid: m.id, name: String(d.machineName || d.name || m.id), states: [] }
      for (const s of d.states || []) cur.states.push(s)
      porMaquina.set(m.id, cur)
    }
  }
  const { meses, causas } = resumirReincidencia([...porMaquina.values()])
  return {
    desde, hasta: hoyDateKey, turnos,
    definicion: { ventanaOpH: VENTANA_OP_H, encadenarMin: ENCADENAR_MS / 60_000, minDurSec: MIN_DUR_SEC, minEpisodiosMes: MIN_EPISODIOS_MES },
    meses, causas,
  }
}

module.exports = {
  VENTANA_OP_H, ENCADENAR_MS, MIN_DUR_SEC, MIN_EPISODIOS_MES, UMBRAL_AVISO, MIN_EPISODIOS_AVISO, DIAS_HISTORIA,
  causaDeFalla, normalizarStates, relojOperacion, episodiosMaquina, resumirReincidencia, avisosFallaRepetida,
  calcularReincidenciaPlanta,
}
