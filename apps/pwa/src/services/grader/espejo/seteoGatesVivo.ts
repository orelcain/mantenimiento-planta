/**
 * Seteo real de las 12 gates en vivo (etapa E-F, diseño B aprobado por Orel el 21-11, mockup v5):
 *  - el programa de cada gate se lee de la etiqueta calibre · calidad de las piezas que salen por ella;
 *  - cambio de programa: aviso provisional a las 3 piezas seguidas con una etiqueta nueva, confirmado cuando la
 *    etiqueta nueva junta 100 piezas (el piso de `CAMBIO_MIN_PIEZAS` de Análisis de turno) y lo de antes queda
 *    bajo el 10 % desde el cambio;
 *  - pz/min por gate de la última hora y del turno, peso p1–p99 del programa vigente, franja de solape;
 *  - pesca por programa del turno y una sugerencia con su costo en P0 (nunca una acción).
 *
 * Lógica pura sobre `PiezaEspejo[]` del turno, en orden de hora (wall-clock-as-UTC). Las cubetas por minuto del
 * espejo no guardan la gate: todo sale de las piezas. Validada con los 3 turnos reales en `seteoGatesVivo.reales.test.ts`.
 */
import type { PiezaEspejo } from './espejoFilas'
import { CAMBIO_MIN_PIEZAS } from '../graderGateObservations'

export const NUM_GATES = 12
/** Piezas seguidas con una etiqueta nueva para el aviso provisional. */
export const CAMBIO_SEGUIDAS = 3
/** Lo de antes debe quedar bajo esta fracción de las piezas desde el cambio para confirmarlo. */
export const CAMBIO_RESTO_MAX = 0.1
/** Una etiqueta entra en el rótulo del programa si tiene al menos esta fracción de las piezas del tramo. */
export const ETIQUETA_MIN_FRAC = 0.1
/** Gate sin piezas hace este rato o más: gris, «programa sin confirmar». */
export const GATE_APAGADA_MIN = 30
/** Programa de poco flujo: menos que esto por gate en el turno. Se agrupa en la pesca. */
export const POCO_FLUJO_PZ_MIN = 1
/** Eje común del peso. */
export const EJE_PESO_KG: [number, number] = [1, 7]

const gramos = (p: PiezaEspejo): number => (p.pesoKg !== null && p.cantidad > 0 ? (p.pesoKg * 1000) / p.cantidad : 0)
const ms = (p: PiezaEspejo): number => Date.parse(p.ts)
const etiqueta = (p: PiezaEspejo): string => `${p.calibre} · ${p.calidad}`
const minutoDe = (p: PiezaEspejo): string => p.ts.slice(0, 16)
const ORDEN_CAL: Record<string, number> = { '0-2 lb': 0, '2-4 lb': 1, '4-6 lb': 2, '6-8 lb': 3, '8-10 lb': 4, '10-12 lb': 5, '12-UP lb': 6 }
const calibreDe = (et: string) => et.split(' · ')[0] ?? ''
const calidadDe = (et: string) => et.split(' · ')[1] ?? ''

/** Cuantil por rango sobre un arreglo ORDENADO. */
const cuantil = (s: number[], q: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]!

export interface CambioGate {
  gate: number
  /** Primera pieza con la etiqueta nueva. */
  desdeTs: string
  antes: string
  despues: string
  /** Piezas con la etiqueta nueva desde el cambio. */
  piezas: number
  estado: 'provisional' | 'confirmado'
}

/** Un tramo de una gate con un mismo programa confirmado. */
export interface TramoGate {
  gate: number
  /** Etiqueta con que arrancó el tramo (la del cambio). */
  etiqueta: string
  desdeTs: string
  /** Primera pieza del tramo siguiente; `null` si sigue vigente. */
  hastaTs: string | null
}

interface Candidato { et: string; desdeIdx: number; seguidas: number; n: number; nTotal: number; vistoResto: number }

/**
 * Recorre las piezas de UNA gate y devuelve sus tramos confirmados y el cambio provisional en curso (si hay).
 * Arranque: el programa inicial es la primera etiqueta con 3 seguidas (una pieza suelta no fija el programa).
 * Una etiqueta que ya salió en el tramo (dos calidades legítimas en una gate) no vuelve a avisar.
 */
export function tramosDeGate(gate: number, ps: readonly PiezaEspejo[]): { tramos: TramoGate[]; cambios: CambioGate[]; provisional: CambioGate | null } {
  const tramos: TramoGate[] = []
  const cambios: CambioGate[] = []
  let cur: string | null = null
  let conocidas = new Set<string>()
  let racha = { et: '', n: 0, desde: 0 }
  let cand: Candidato | null = null
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!
    const et = etiqueta(p)
    if (racha.et === et) racha.n++
    else racha = { et, n: 1, desde: i }
    if (cur === null) {
      if (racha.n >= CAMBIO_SEGUIDAS) {
        cur = et
        conocidas = new Set([et])
        // El tramo inicial parte con la primera pieza de la gate.
        tramos.push({ gate, etiqueta: et, desdeTs: ps[0]!.ts, hastaTs: null })
      }
      continue
    }
    if (cand) {
      cand.nTotal += p.cantidad
      if (et === cand.et) cand.n += p.cantidad
      else if (conocidas.has(et)) cand.vistoResto += p.cantidad
      // Lo de antes vuelve con 3 seguidas: era una mezcla o un barrido, no un cambio. La etiqueta queda conocida.
      if (conocidas.has(et) && racha.n >= CAMBIO_SEGUIDAS) {
        conocidas.add(cand.et)
        cand = null
        continue
      }
      // Otra etiqueta nueva con su racha: el candidato era un paso suelto y lo reemplaza la nueva. Sin esto la gate
      // quedaba con dos rótulos (21-11 T2, G10: «12-UP Premium» con 2 piezas desde las 12:13 y recibiendo «8-10
      // CALIDAD D» el resto del turno).
      if (et !== cand.et && !conocidas.has(et) && racha.n >= CAMBIO_SEGUIDAS) {
        let n = 0
        for (let j = racha.desde; j <= i; j++) n += ps[j]!.cantidad
        cand = { et, desdeIdx: racha.desde, seguidas: racha.n, n, nTotal: n, vistoResto: 0 }
        continue
      }
      if (cand.n >= CAMBIO_MIN_PIEZAS && cand.vistoResto <= CAMBIO_RESTO_MAX * cand.nTotal) {
        const desdeTs = ps[cand.desdeIdx]!.ts
        cambios.push({ gate, desdeTs, antes: cur, despues: cand.et, piezas: cand.n, estado: 'confirmado' })
        tramos[tramos.length - 1]!.hastaTs = desdeTs
        tramos.push({ gate, etiqueta: cand.et, desdeTs, hastaTs: null })
        cur = cand.et
        conocidas = new Set([cand.et])
        cand = null
      }
      continue
    }
    if (!conocidas.has(et) && racha.n >= CAMBIO_SEGUIDAS) {
      // Racha nueva: el candidato parte en la primera pieza de la racha.
      let n = 0
      for (let j = racha.desde; j <= i; j++) n += ps[j]!.cantidad
      cand = { et, desdeIdx: racha.desde, seguidas: racha.n, n, nTotal: n, vistoResto: 0 }
    }
  }
  const provisional: CambioGate | null = cand && cur
    ? { gate, desdeTs: ps[cand.desdeIdx]!.ts, antes: cur, despues: cand.et, piezas: cand.n, estado: 'provisional' }
    : null
  return { tramos, cambios, provisional }
}

export interface GateVivo {
  gate: number
  /** Programa vigente («8-10 lb · Premium», o dos calidades si la gate recibe ambas). `null` sin piezas. */
  programa: string | null
  /** Inicio del programa vigente si cambió en el turno (confirmado o provisional); `null` si es el del arranque. */
  desdeTs: string | null
  provisional: CambioGate | null
  piezasHora: number
  piezasTurno: number
  pzMinHora: number
  pzMinTurno: number
  /** % de todas las piezas de la última hora (Gate 0 incluida). */
  pctHora: number
  /** p1–p99 del peso (kg) del programa vigente en el turno; `null` con menos de 10 piezas con peso. */
  pesoKg: [number, number] | null
  ultimaTs: string | null
  /** Minutos sin piezas hasta la referencia; `null` si nunca tuvo piezas. */
  minSinPiezas: number | null
  apagada: boolean
}

export interface Gate0Vivo {
  piezasHora: number
  piezasTurno: number
  pzMinHora: number
  pzMinTurno: number
  pctHora: number
  pctTurno: number
  pesoKg: [number, number] | null
}

export interface ProgramaPesca {
  /** Etiqueta, o «Poco flujo» para el grupo. */
  programa: string
  piezas: number
  /** % de la salida del turno (gate > 0). */
  pct: number
  /** pz/min por gate mientras la gate tuvo ese programa. */
  pzMinGate: number
  /** «G5 · G6 hasta 10:44». */
  gates: Array<{ gate: number; desde: string | null; hasta: string | null }>
  grupo: boolean
}

export interface Sugerencia {
  gate: number
  deProg: string
  aProg: string
  /** Gates del programa que recibe ayuda, y su ritmo antes y después (pz/min por gate). */
  gatesDestino: number[]
  pzMinAntes: number
  pzMinDespues: number
  /** Costo obligatorio: piezas que quedarían sin gate y el P0 del turno antes y después si van a Gate 0. */
  costo: { piezas: number; p0Antes: number; p0Despues: number }
  /** Reparto que la justifica: cuántas gates y qué % llevan los dos extremos. */
  pocoFlujo: { gates: number; pct: number }
  mucho: { gates: number; pct: number }
}

export interface Solape {
  /** Calibre bajo y alto de la misma calidad. */
  bajo: string
  alto: string
  calidad: string
  desdeKg: number
  hastaKg: number
}

export interface SeteoVivo {
  /** Hasta dónde se mide (última pieza leída o lectura completa del lector), ISO. */
  referenciaTs: string
  hora: { desde: string; hasta: string }
  minutosActivosHora: number
  minutosActivosTurno: number
  gates: GateVivo[]
  gate0: Gate0Vivo
  cambios: CambioGate[]
  programas: ProgramaPesca[]
  sugerencia: Sugerencia | null
  solapes: Solape[]
}

function pesoP1P99(ps: readonly PiezaEspejo[]): [number, number] | null {
  const w = ps.map(gramos).filter((g) => g > 10).sort((a, b) => a - b)
  if (w.length < 10) return null
  return [cuantil(w, 0.01) / 1000, cuantil(w, 0.99) / 1000]
}

/** Etiquetas del tramo con al menos el 10 % de sus piezas, en orden de piezas: «8-10 lb · Premium + D». */
function rotuloPrograma(ps: readonly PiezaEspejo[]): string | null {
  const c = new Map<string, number>()
  let tot = 0
  for (const p of ps) { c.set(etiqueta(p), (c.get(etiqueta(p)) ?? 0) + p.cantidad); tot += p.cantidad }
  const top = [...c.entries()].filter(([, n]) => n >= ETIQUETA_MIN_FRAC * tot).sort((a, b) => b[1] - a[1]).map(([k]) => k)
  if (top.length === 0) return null
  const cal = calibreDe(top[0]!)
  if (top.every((k) => calibreDe(k) === cal)) return `${cal} · ${top.map(calidadDe).join(' + ')}`
  return top.join(' + ')
}

/**
 * Seteo de las 12 gates hasta `referenciaMs` (por defecto, la última pieza). `piezas` = las del turno, en orden.
 * Los pz/min se miden por minuto con producción (minutos con alguna pieza en el grader), como el pz/h del cierre:
 * una colación no hunde el ritmo de la gate.
 */
export function seteoGatesVivo(piezas: readonly PiezaEspejo[], referenciaMs?: number): SeteoVivo | null {
  if (piezas.length === 0) return null
  const ultMs = ms(piezas[piezas.length - 1]!)
  const ref = Math.max(ultMs, referenciaMs ?? ultMs)
  const refTs = new Date(ref).toISOString()
  const iniHoraTs = new Date(ref - 60 * 60_000).toISOString()
  const minTurno = new Set<string>()
  const minHora = new Set<string>()
  const porGate = new Map<number, PiezaEspejo[]>()
  let totHora = 0
  let totTurno = 0
  for (const p of piezas) {
    minTurno.add(minutoDe(p))
    totTurno += p.cantidad
    if (p.ts >= iniHoraTs) { minHora.add(minutoDe(p)); totHora += p.cantidad }
    const l = porGate.get(p.gate) ?? []
    l.push(p)
    porGate.set(p.gate, l)
  }
  const mT = Math.max(1, minTurno.size)
  const mH = Math.max(1, minHora.size)
  const enHora = (ps: readonly PiezaEspejo[]) => ps.filter((p) => p.ts >= iniHoraTs).reduce((s, p) => s + p.cantidad, 0)
  const suma = (ps: readonly PiezaEspejo[]) => ps.reduce((s, p) => s + p.cantidad, 0)

  const gates: GateVivo[] = []
  const cambios: CambioGate[] = []
  const tramos: TramoGate[] = []
  for (let g = 1; g <= NUM_GATES; g++) {
    const ps = porGate.get(g) ?? []
    const t = tramosDeGate(g, ps)
    cambios.push(...t.cambios)
    // Lo que la gate recibe AHORA: un cambio provisional ya manda en la fila y en la pesca (con su marca).
    const vista = t.tramos.map((x) => ({ ...x }))
    if (t.provisional) {
      cambios.push(t.provisional)
      vista[vista.length - 1]!.hastaTs = t.provisional.desdeTs
      vista.push({ gate: g, etiqueta: t.provisional.despues, desdeTs: t.provisional.desdeTs, hastaTs: null })
    }
    tramos.push(...vista)
    const vig = vista[vista.length - 1] ?? null
    const delTramo = vig ? ps.filter((p) => p.ts >= vig.desdeTs) : ps
    const ph = enHora(ps)
    const pt = suma(ps)
    const ultimaTs = ps.length > 0 ? ps[ps.length - 1]!.ts : null
    const minSin = ultimaTs ? Math.floor((ref - Date.parse(ultimaTs)) / 60_000) : null
    gates.push({
      gate: g,
      programa: rotuloPrograma(delTramo),
      desdeTs: vig && vista.length > 1 ? vig.desdeTs : null,
      provisional: t.provisional,
      piezasHora: ph,
      piezasTurno: pt,
      pzMinHora: ph / mH,
      pzMinTurno: pt / mT,
      pctHora: totHora > 0 ? (ph / totHora) * 100 : 0,
      pesoKg: pesoP1P99(delTramo),
      ultimaTs,
      minSinPiezas: minSin,
      apagada: minSin === null || minSin >= GATE_APAGADA_MIN,
    })
  }
  cambios.sort((a, b) => a.desdeTs.localeCompare(b.desdeTs))

  const g0 = porGate.get(0) ?? []
  const g0h = enHora(g0)
  const g0t = suma(g0)
  const gate0: Gate0Vivo = {
    piezasHora: g0h,
    piezasTurno: g0t,
    pzMinHora: g0h / mH,
    pzMinTurno: g0t / mT,
    pctHora: totHora > 0 ? (g0h / totHora) * 100 : 0,
    pctTurno: totTurno > 0 ? (g0t / totTurno) * 100 : 0,
    pesoKg: pesoP1P99(g0),
  }

  const programas = pescaPorProgramas(piezas, tramos, porGate)
  return {
    referenciaTs: refTs,
    hora: { desde: iniHoraTs.slice(11, 16), hasta: refTs.slice(11, 16) },
    minutosActivosHora: minHora.size,
    minutosActivosTurno: minTurno.size,
    gates,
    gate0,
    cambios,
    programas,
    sugerencia: sugerir(programas, gates, g0t, totTurno, porGate),
    solapes: solapesDeRango(gates),
  }
}

/** Minutos con producción del grader dentro de [desde, hasta). */
function minutosEntre(minutos: readonly string[], desde: string, hasta: string | null): number {
  const a = desde.slice(0, 16)
  const b = hasta ? hasta.slice(0, 16) : '9999'
  let n = 0
  for (const m of minutos) if (m >= a && m < b) n++
  return n
}

/** Pesca del turno por programa (etiqueta de la pieza), con las gates que lo tuvieron y el ritmo por gate. */
export function pescaPorProgramas(piezas: readonly PiezaEspejo[], tramos: readonly TramoGate[], porGate: ReadonlyMap<number, PiezaEspejo[]>): ProgramaPesca[] {
  const minutos = [...new Set(piezas.map(minutoDe))].sort()
  let salida = 0
  const n = new Map<string, number>()
  const gatesDe = new Map<string, Map<number, { desde: string | null; hasta: string | null; minutos: number }>>()
  for (const [g, ps] of porGate) {
    if (g <= 0) continue
    const delGate = tramos.filter((t) => t.gate === g)
    for (const p of ps) {
      salida += p.cantidad
      const et = etiqueta(p)
      n.set(et, (n.get(et) ?? 0) + p.cantidad)
    }
    // Cada tramo de la gate cuenta para la etiqueta con que arrancó (y la gate sin tramo, para su etiqueta mayor).
    const lista = delGate.length > 0 ? delGate : ps.length > 0 ? [{ gate: g, etiqueta: etiqueta(ps[0]!), desdeTs: ps[0]!.ts, hastaTs: null }] : []
    lista.forEach((t, i) => {
      const m = gatesDe.get(t.etiqueta) ?? new Map()
      m.set(g, {
        desde: i > 0 ? t.desdeTs : null,
        hasta: t.hastaTs,
        minutos: minutosEntre(minutos, i > 0 ? t.desdeTs : '0000', t.hastaTs),
      })
      gatesDe.set(t.etiqueta, m)
    })
  }
  const filas: ProgramaPesca[] = [...n.entries()].map(([et, piezasProg]) => {
    const gs = gatesDe.get(et) ?? new Map()
    const minGate = [...gs.values()].reduce((s, x) => s + x.minutos, 0)
    return {
      programa: et,
      piezas: piezasProg,
      pct: salida > 0 ? (piezasProg / salida) * 100 : 0,
      pzMinGate: minGate > 0 ? piezasProg / minGate : 0,
      gates: [...gs.entries()].sort((a, b) => a[0] - b[0]).map(([gate, x]) => ({ gate, desde: x.desde, hasta: x.hasta })),
      grupo: false,
    }
  })
  // Etiquetas sueltas sin gate propia (barridos, piezas cruzadas) quedan fuera de la tabla: < 0,5 % de la salida.
  const conGate = filas.filter((f) => f.gates.length > 0 || f.pct >= 0.5)
  const grandes = conGate.filter((f) => f.pzMinGate >= POCO_FLUJO_PZ_MIN || f.gates.some((x) => x.desde || x.hasta))
  const chicos = conGate.filter((f) => !grandes.includes(f))
  grandes.sort((a, b) => b.piezas - a.piezas)
  if (chicos.length >= 2) {
    const p = chicos.reduce((s, f) => s + f.piezas, 0)
    const gatesChicos = [...new Map(chicos.flatMap((f) => f.gates).map((x) => [x.gate, x])).values()].sort((a, b) => a.gate - b.gate)
    grandes.push({
      programa: 'Poco flujo',
      piezas: p,
      pct: salida > 0 ? (p / salida) * 100 : 0,
      pzMinGate: Math.max(...chicos.map((f) => f.pzMinGate)),
      gates: gatesChicos,
      grupo: true,
    })
  } else grandes.push(...chicos)
  return grandes
}

/**
 * Sugerencia, no acción: cuando un programa lleva ≥ 40 % de la salida en 2 o más gates y hay 2 o más gates de poco
 * flujo, pasar una de ellas a ese programa. Solo una de poco flujo con el mismo calibre (la más barata en P0); si no
 * hay, no se sugiere nada. El costo va siempre: las piezas que perderían su gate si es la única de
 * su programa, y el P0 del turno si todas van a Gate 0.
 */
function sugerir(programas: readonly ProgramaPesca[], gates: readonly GateVivo[], g0: number, total: number, porGate: ReadonlyMap<number, PiezaEspejo[]>): Sugerencia | null {
  const reales = programas.filter((p) => !p.grupo)
  const vigentes = (et: string) => gates.filter((g) => g.programa === et).map((g) => g.gate)
  const mucho = reales
    .map((p) => ({ p, gs: vigentes(p.programa) }))
    .filter((x) => x.gs.length >= 2 && x.p.pct >= 40)
    .sort((a, b) => b.p.pct - a.p.pct)[0]
  if (!mucho || total === 0) return null
  const chicas = gates.filter((g) => g.programa && g.pzMinTurno < POCO_FLUJO_PZ_MIN && !mucho.gs.includes(g.gate))
  if (chicas.length < 2) return null
  const costoDe = (g: GateVivo) => {
    const otras = gates.filter((x) => x.gate !== g.gate && x.programa === g.programa).length
    if (otras > 0) return 0
    // Todas las piezas del turno con ese programa salieron por esta gate (o por gates que ya no lo tienen).
    return (porGate.get(g.gate) ?? []).filter((p) => g.programa?.startsWith(p.calibre) && g.programa.includes(p.calidad)).reduce((s, p) => s + p.cantidad, 0)
  }
  // Solo una gate del MISMO calibre: su tramo de peso ya es ese y solo cambia la calidad (19-11: G7 8-10 Industrial).
  const cal = calibreDe(mucho.p.programa)
  const candidatas = chicas.filter((g) => calibreDe(g.programa!) === cal && !g.programa!.includes(' + ')).map((g) => ({ g, costo: costoDe(g) }))
  candidatas.sort((a, b) => a.costo - b.costo || a.g.pzMinTurno - b.g.pzMinTurno)
  const elegida = candidatas[0]
  if (!elegida) return null
  const n = mucho.gs.length
  const pocos = gates.filter((g) => g.programa && g.pzMinTurno < POCO_FLUJO_PZ_MIN)
  const salida = total - g0
  const pctPocos = salida > 0 ? (pocos.reduce((s, g) => s + g.piezasTurno, 0) / salida) * 100 : 0
  return {
    gate: elegida.g.gate,
    deProg: elegida.g.programa!,
    aProg: mucho.p.programa,
    gatesDestino: mucho.gs,
    pzMinAntes: mucho.p.pzMinGate,
    pzMinDespues: (mucho.p.pzMinGate * n) / (n + 1),
    costo: { piezas: elegida.costo, p0Antes: (g0 / total) * 100, p0Despues: ((g0 + elegida.costo) / total) * 100 },
    pocoFlujo: { gates: pocos.length, pct: pctPocos },
    mucho: { gates: n, pct: mucho.p.pct },
  }
}

/**
 * Solape observado entre calibres vecinos de la misma calidad: el p99 más alto del calibre bajo contra el p1 más
 * bajo del alto (19-11: 8-10 Premium llega a 4,92 kg y 10-12 Premium parte en 4,59). Los límites del Z2 no llegan.
 */
export function solapesDeRango(gates: readonly GateVivo[]): Solape[] {
  const por = new Map<string, { lo: number; hi: number }>()
  for (const g of gates) {
    if (!g.programa || !g.pesoKg || g.programa.includes(' + ')) continue
    const k = g.programa
    const v = por.get(k) ?? { lo: Infinity, hi: -Infinity }
    v.lo = Math.min(v.lo, g.pesoKg[0])
    v.hi = Math.max(v.hi, g.pesoKg[1])
    por.set(k, v)
  }
  const out: Solape[] = []
  for (const [k, v] of por) {
    const cal = calibreDe(k)
    const q = calidadDe(k)
    const sig = Object.entries(ORDEN_CAL).find(([, o]) => o === (ORDEN_CAL[cal] ?? -9) + 1)?.[0]
    const alto = sig ? por.get(`${sig} · ${q}`) : undefined
    if (alto && alto.lo < v.hi) out.push({ bajo: cal, alto: sig!, calidad: q, desdeKg: alto.lo, hastaKg: v.hi })
  }
  return out
}
