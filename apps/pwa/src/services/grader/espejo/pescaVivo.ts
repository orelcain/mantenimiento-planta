/**
 * Agregados del Grader en vivo que necesitan las piezas una a una (aprobados por Orel el 21-11):
 *  - etapa 2: por qué va a P0, con el seteo inferido de las piezas (`causasP0Vivo`);
 *  - etapa 5: lote en curso, cambio de lote y distribución de peso (`loteVivo`, `histogramaPeso`, `ultimosTurnos`);
 *  - etapa 1: zona compartida 4,59–4,99 kg, borde por gate y escalón en el límite (`zonaCompartida`).
 *
 * Lógica pura sobre `PiezaEspejo[]` del turno, en orden de hora (wall-clock-as-UTC). Validada con los 3 turnos
 * reales en `pescaVivo.reales.test.ts`.
 */
import type { PiezaEspejo } from './espejoFilas'

const gramos = (p: PiezaEspejo): number => (p.pesoKg !== null && p.cantidad > 0 ? (p.pesoKg * 1000) / p.cantidad : 0)
const ms = (p: PiezaEspejo): number => Date.parse(p.ts)

// ── Etapa 2: causas P0 ──────────────────────────────────────────────────────

/**
 * Rango de peso (g) de cada calibre para decidir si una pieza de Gate 0 tenía gate. 8-10 y 10-12 se solapan en
 * 4.585–4.995 g: ese tramo lo decide el producto (la etiqueta lb no alcanza). Los mismos del cálculo del mockup.
 */
export const RANGO_CALIBRE_G: Record<string, [number, number]> = {
  '2-4 lb': [900, 1835],
  '4-6 lb': [1835, 2745],
  '6-8 lb': [2745, 3665],
  '8-10 lb': [3665, 4995],
  '10-12 lb': [4585, 5495],
  '12-UP lb': [5495, Infinity],
}

/** Ventana para tomar la etiqueta de una gate como su programa vigente. */
export const PROGRAMA_VIGENCIA_MS = 90 * 60_000

export type CausaP0 = 'sin-gate-peso' | 'calidad-sin-gate' | 'calidad-d' | 'tenia-gate'

export interface CausasP0 {
  total: number
  sinPeso: number
  causas: Record<CausaP0, number>
  /** Sin gate para su peso: bajo el menor calibre y por calibre sin gate. */
  pesoBajo: number
  pesoSinGate: Record<string, number>
  /** Calidad sin gate, por «calibre calidad». */
  calidadSinGate: Record<string, number>
}

interface Etiqueta { t: number; calibre: string; calidad: string }

/** El programa (calibre · calidad) de cada gate, leído de las piezas que salieron por ella. */
export class SeteoInferido {
  private porGate = new Map<number, Etiqueta[]>()

  constructor(piezas: readonly PiezaEspejo[]) {
    for (const p of piezas) {
      if (p.gate <= 0) continue
      const l = this.porGate.get(p.gate) ?? []
      l.push({ t: ms(p), calibre: p.calibre, calidad: p.calidad })
      this.porGate.set(p.gate, l)
    }
    for (const l of this.porGate.values()) l.sort((a, b) => a.t - b.t)
  }

  /** Programa de la gate en `t`: la última pieza a ≤ 90 min antes; si no, la siguiente a ≤ 90 min; si no, la más cercana. */
  programa(gate: number, t: number): Etiqueta | null {
    const a = this.porGate.get(gate)
    if (!a || a.length === 0) return null
    let lo = 0
    let hi = a.length - 1
    let i = -1
    while (lo <= hi) {
      const m = (lo + hi) >> 1
      if (a[m]!.t <= t) { i = m; lo = m + 1 } else hi = m - 1
    }
    const p = i >= 0 ? a[i]! : null
    const n = a[i + 1] ?? null
    if (p && t - p.t < PROGRAMA_VIGENCIA_MS) return p
    if (n && n.t - t < PROGRAMA_VIGENCIA_MS) return n
    return p ?? n
  }

  gates(): number[] {
    return [...this.porGate.keys()].sort((a, b) => a - b)
  }
}

/** Lo que se deriva de una pieza de Gate 0 con el seteo inferido (lo usan las causas, el árbol y las acciones). */
export interface DerivadoP0 {
  causa: CausaP0
  /** Calibres en que cabe por peso (dos en la zona 4.585–4.995 g; ninguno bajo 900 g). */
  calibres: string[]
  /** Gates que en ese momento tenían alguno de esos calibres (cualquier calidad), por calibre. */
  gatesCalibre: Record<string, number[]>
}

/**
 * Causa derivada de una pieza de Gate 0, por su peso y su calidad. En orden: sin gate para su peso → calidad D →
 * calidad sin gate → tenía gate (la causa física llega con Puerta 0). `null` sin peso.
 */
export function derivarP0(z: PiezaEspejo, seteo: SeteoInferido, gates = seteo.gates()): DerivadoP0 | null {
  const w = gramos(z)
  if (!(w > 10)) return null
  const t = ms(z)
  const cals = Object.entries(RANGO_CALIBRE_G).filter(([, [a, b]]) => w >= a && w < b).map(([c]) => c)
  const conCal: Array<{ gate: number; p: Etiqueta }> = []
  for (const g of gates) {
    const p = seteo.programa(g, t)
    if (p && cals.includes(p.calibre)) conCal.push({ gate: g, p })
  }
  const gatesCalibre: Record<string, number[]> = {}
  for (const x of conCal) (gatesCalibre[x.p.calibre] ??= []).push(x.gate)
  const causa: CausaP0 = conCal.length === 0
    ? 'sin-gate-peso'
    : conCal.some((x) => x.p.calidad === z.calidad)
      ? 'tenia-gate'
      : z.calidad === 'D' ? 'calidad-d' : 'calidad-sin-gate'
  return { causa, calibres: cals, gatesCalibre }
}

/**
 * Causas derivadas de las piezas de Gate 0 con el seteo inferido (Gate 0 trae siempre CONGELADO · DESTINO FILETE:
 * conservación y producto no se pueden derivar). Ver `derivarP0`.
 */
export function causasP0Vivo(piezas: readonly PiezaEspejo[], seteo = new SeteoInferido(piezas)): CausasP0 {
  const out: CausasP0 = {
    total: 0,
    sinPeso: 0,
    causas: { 'sin-gate-peso': 0, 'calidad-sin-gate': 0, 'calidad-d': 0, 'tenia-gate': 0 },
    pesoBajo: 0,
    pesoSinGate: {},
    calidadSinGate: {},
  }
  const gates = seteo.gates()
  for (const z of piezas) {
    if (z.gate !== 0) continue
    out.total += z.cantidad
    const d = derivarP0(z, seteo, gates)
    if (!d) { out.sinPeso += z.cantidad; continue }
    out.causas[d.causa] += z.cantidad
    if (d.causa === 'sin-gate-peso') {
      if (d.calibres.length === 0) out.pesoBajo += z.cantidad
      else { const k = d.calibres.join(' / '); out.pesoSinGate[k] = (out.pesoSinGate[k] ?? 0) + z.cantidad }
    } else if (d.causa === 'calidad-sin-gate') {
      const k = `${d.calibres.join(' / ')} ${z.calidad}`
      out.calidadSinGate[k] = (out.calidadSinGate[k] ?? 0) + z.cantidad
    }
  }
  return out
}

// ── Etapa 5: lote en curso ──────────────────────────────────────────────────

export interface PerfilPesca {
  piezas: number
  calibreDominante: { calibre: string; pct: number } | null
  /** % por calibre de la salida (sin Gate 0, con peso), según la etiqueta de Matrix (el programa de la gate). */
  calibrePct: Record<string, number>
  /** % por calibre según el PESO de cada pieza (cada 2 lb): lo que trae el pescado, sin importar el seteo. */
  calibrePesoPct: Record<string, number>
  /** El calibre por peso con más piezas. */
  dominantePeso: { calibre: string; pct: number } | null
  /** % por calidad de la salida. */
  calidadPct: Record<string, number>
  premiumPct: number | null
  pesoMedioKg: number | null
  /** kg de la salida (sin Gate 0). */
  kg: number
}

/**
 * Calibres nominales por peso, cada 2 lb (los rótulos de Matrix). Distinto de `RANGO_CALIBRE_G`, que son los rangos
 * PROGRAMADOS de las gates (se solapan en 4.585–4.995 g y sirven para saber si una pieza tenía gate): aquí se
 * describe el pescado del lote, sin solape, como el mockup v4.
 */
export const CALIBRES_LB = ['0-2 lb', '2-4 lb', '4-6 lb', '6-8 lb', '8-10 lb', '10-12 lb', '12-UP lb'] as const
const G_POR_LB = 453.592

/** Calibre nominal por el peso de UNA pieza (g): 2 lb por tramo; 12 lb o más → «12-UP lb». */
export function calibrePorPeso(g: number): string {
  const i = Math.min(CALIBRES_LB.length - 1, Math.max(0, Math.floor(g / G_POR_LB / 2)))
  return CALIBRES_LB[i]!
}

/** Perfil de la salida (gate > 0, con peso) de un grupo de piezas. */
export function perfil(piezas: readonly PiezaEspejo[]): PerfilPesca {
  let n = 0
  let prem = 0
  let kg = 0
  const cal: Record<string, number> = {}
  const calPeso: Record<string, number> = {}
  const cali: Record<string, number> = {}
  for (const p of piezas) {
    const g = gramos(p)
    if (p.gate <= 0 || !(g > 10)) continue
    n += p.cantidad
    kg += (p.pesoKg ?? 0)
    if (p.calidad === 'Premium') prem += p.cantidad
    cal[p.calibre] = (cal[p.calibre] ?? 0) + p.cantidad
    const cp = calibrePorPeso(g)
    calPeso[cp] = (calPeso[cp] ?? 0) + p.cantidad
    cali[p.calidad] = (cali[p.calidad] ?? 0) + p.cantidad
  }
  const pcts = (o: Record<string, number>): Record<string, number> => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, (v / n) * 100]))
  const calibrePct = pcts(cal)
  let dom: PerfilPesca['calibreDominante'] = null
  for (const [k, v] of Object.entries(calibrePct)) if (!dom || v > dom.pct) dom = { calibre: k, pct: v }
  const calibrePesoPct = pcts(calPeso)
  let domPeso: PerfilPesca['dominantePeso'] = null
  for (const [k, v] of Object.entries(calibrePesoPct)) if (!domPeso || v > domPeso.pct) domPeso = { calibre: k, pct: v }
  return {
    piezas: n,
    calibreDominante: dom,
    calibrePct,
    calibrePesoPct,
    dominantePeso: domPeso,
    calidadPct: pcts(cali),
    premiumPct: n > 0 ? (prem / n) * 100 : null,
    pesoMedioKg: n > 0 ? kg / n : null,
    kg,
  }
}

export interface LoteVivo {
  lote: string
  /** Hora ISO de la primera pieza del lote (sin interrupción hasta ahora). */
  desdeTs: string
  piezas: number
  perfil: PerfilPesca
  /** El lote anterior del turno (si hubo cambio). */
  anterior: { lote: string; perfil: PerfilPesca } | null
}

/** Piezas por lote mínimas para dar por empezado un lote (una pieza suelta de otro lote no es un cambio). */
export const LOTE_MIN_PIEZAS = 30

/** Un lote del turno: tramo seguido del mismo lote (los tramos de < 30 piezas se unen al vecino). */
export interface LoteTramo {
  lote: string
  /** Hora ISO de la primera y de la última pieza del lote. */
  desdeTs: string
  hastaTs: string
  /** Todas las piezas del lote, Gate 0 incluido. */
  piezas: number
  perfil: PerfilPesca
}

/** Los lotes del turno, en orden. Un lote empieza de verdad con ≥ 30 piezas seguidas. */
export function lotesDelTurno(piezas: readonly PiezaEspejo[]): LoteTramo[] {
  const tramos: Array<{ lote: string; desde: number; hasta: number; n: number }> = []
  for (let i = 0; i < piezas.length; i++) {
    const p = piezas[i]!
    const u = tramos[tramos.length - 1]
    if (u && u.lote === p.lote) { u.hasta = i; u.n += p.cantidad } else tramos.push({ lote: p.lote, desde: i, hasta: i, n: p.cantidad })
  }
  // Une los tramos chicos al vecino.
  const firmes: typeof tramos = []
  for (const t of tramos) {
    const u = firmes[firmes.length - 1]
    if (u && (t.n < LOTE_MIN_PIEZAS || t.lote === u.lote)) { u.hasta = t.hasta; if (t.lote === u.lote) u.n += t.n; continue }
    firmes.push({ ...t })
  }
  return firmes.map((t) => {
    const del = piezas.slice(t.desde, t.hasta + 1).filter((p) => p.lote === t.lote)
    return { lote: t.lote, desdeTs: piezas[t.desde]!.ts, hastaTs: piezas[t.hasta]!.ts, piezas: del.reduce((s, p) => s + p.cantidad, 0), perfil: perfil(del) }
  })
}

/**
 * Lote en curso: el de la última pieza, desde que corre sin otro lote con ≥ 30 piezas en medio, y el anterior.
 */
export function loteVivo(piezas: readonly PiezaEspejo[]): LoteVivo | null {
  if (piezas.length === 0) return null
  const l = lotesDelTurno(piezas)
  const actual = l[l.length - 1]!
  const ant = l.length > 1 ? l[l.length - 2]! : null
  return { lote: actual.lote, desdeTs: actual.desdeTs, piezas: actual.piezas, perfil: actual.perfil, anterior: ant ? { lote: ant.lote, perfil: ant.perfil } : null }
}

/** Distribución de peso de la salida en tramos de 250 g desde 1 kg (% de las piezas), y su media. */
export function histogramaPeso(piezas: readonly PiezaEspejo[], desdeG = 1000, pasoG = 250, n = 24): { pct: number[]; mediaKg: number | null; piezas: number } {
  const h = new Array<number>(n).fill(0)
  let tot = 0
  let kg = 0
  let nn = 0
  for (const p of piezas) {
    const w = gramos(p)
    if (p.gate <= 0 || !(w > 10)) continue
    kg += p.pesoKg ?? 0
    nn += p.cantidad
    const i = Math.floor((w - desdeG) / pasoG)
    if (i >= 0 && i < n) { h[i]! += p.cantidad; tot += p.cantidad }
  }
  return { pct: h.map((v) => (tot > 0 ? (v / tot) * 100 : 0)), mediaKg: nn > 0 ? kg / nn : null, piezas: nn }
}

/** Fila de la comparación con los turnos anteriores (de los resúmenes del cierre). */
export interface FilaTurno {
  rotulo: string
  pzH: number | null
  p0Pct: number | null
  pesoMedioKg: number | null
  c68: number | null
  c810: number | null
  c1012: number | null
}

interface ResumenTurno {
  dateKey: string
  shiftId: string
  productionRatePerHour?: number
  pointZeroPct: number
  avgWeightGrams?: number
  calibreDistribution?: Array<{ calibre: string; pct: number }>
}

/** «2026-11-18» + «Turno 1» → «18-11 T1». */
export function rotuloTurno(dateKey: string, shiftId: string): string {
  const t = shiftId.match(/(\d+)\s*$/)
  return `${dateKey.slice(8, 10)}-${dateKey.slice(5, 7)} ${t ? `T${t[1]}` : shiftId}`
}

/** Los últimos `n` turnos cerrados ANTES del actual (orden por fecha y luego por hora de inicio), más recientes primero. */
export function ultimosTurnos<R extends ResumenTurno & { startAt?: string }>(resumenes: readonly R[], actualId: string, n = 6): FilaTurno[] {
  const id = (r: R) => `${r.dateKey}__${r.shiftId}`
  const orden = [...resumenes].sort((a, b) => (a.startAt ?? a.dateKey).localeCompare(b.startAt ?? b.dateKey))
  const i = orden.findIndex((r) => id(r) === actualId)
  const previos = (i >= 0 ? orden.slice(0, i) : orden.filter((r) => id(r) < actualId)).slice(-n).reverse()
  return previos.map((r) => {
    const c = (k: string) => r.calibreDistribution?.find((d) => d.calibre === k)?.pct ?? null
    return {
      rotulo: rotuloTurno(r.dateKey, r.shiftId),
      pzH: r.productionRatePerHour ?? null,
      p0Pct: Number.isFinite(r.pointZeroPct) ? r.pointZeroPct : null,
      pesoMedioKg: r.avgWeightGrams ? r.avgWeightGrams / 1000 : null,
      c68: c('6-8 lb'),
      c810: c('8-10 lb'),
      c1012: c('10-12 lb'),
    }
  })
}

/** La misma fila para el turno en curso, de las piezas leídas hasta ahora. */
export function filaDelTurno(piezas: readonly PiezaEspejo[], rotulo: string): FilaTurno {
  const pf = perfil(piezas)
  let total = 0
  let g0 = 0
  const minutos = new Set<string>()
  for (const p of piezas) { total += p.cantidad; if (p.gate === 0) g0 += p.cantidad; minutos.add(p.ts.slice(0, 16)) }
  return {
    rotulo,
    // pz/h sobre minutos con piezas, como el cierre.
    pzH: minutos.size > 0 ? total / (minutos.size / 60) : null,
    p0Pct: total > 0 ? (g0 / total) * 100 : null,
    pesoMedioKg: pf.pesoMedioKg,
    c68: pf.calibrePct['6-8 lb'] ?? null,
    c810: pf.calibrePct['8-10 lb'] ?? null,
    c1012: pf.calibrePct['10-12 lb'] ?? null,
  }
}

// ── Etapa 1: zona compartida ────────────────────────────────────────────────

export const ZONA_DESDE_G = 4590
export const ZONA_HASTA_G = 4990

export interface LadoZona {
  calibre: string
  piezas: number
  gates: number[]
  /** «FRESCO · DESTINO FILETE» del programa que más recibe. */
  destino: string
}

export interface ZonaCompartida {
  piezas: number
  lados: LadoZona[]
  /** % que fue a 8-10 (el resto, a 10-12). */
  pct810: number | null
}

/** Reparto de la salida Premium entre 4,59 y 4,99 kg por calibre (8-10 contra 10-12). */
export function zonaCompartida(piezas: readonly PiezaEspejo[]): ZonaCompartida {
  const por = new Map<string, { n: number; gates: Set<number>; destino: Record<string, number> }>()
  let tot = 0
  for (const p of piezas) {
    if (p.gate <= 0 || p.calidad !== 'Premium') continue
    const w = gramos(p)
    if (w < ZONA_DESDE_G || w > ZONA_HASTA_G) continue
    tot += p.cantidad
    const l = por.get(p.calibre) ?? { n: 0, gates: new Set<number>(), destino: {} }
    l.n += p.cantidad
    l.gates.add(p.gate)
    const d = `${p.conservacion} · ${p.producto}`
    l.destino[d] = (l.destino[d] ?? 0) + p.cantidad
    por.set(p.calibre, l)
  }
  const lados = [...por.entries()]
    .map(([calibre, l]) => ({
      calibre,
      piezas: l.n,
      gates: [...l.gates].sort((a, b) => a - b),
      destino: Object.entries(l.destino).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
    }))
    .sort((a, b) => (RANGO_CALIBRE_G[a.calibre]?.[0] ?? 0) - (RANGO_CALIBRE_G[b.calibre]?.[0] ?? 0))
  const n810 = por.get('8-10 lb')?.n ?? 0
  return { piezas: tot, lados, pct810: tot > 0 ? (n810 / tot) * 100 : null }
}

export interface BordeGate {
  gate: number
  programa: string
  destino: string
  piezas: number
  /** % de las piezas en el 10 % bajo y alto del rango observado (p1-p99) del programa; `null` con < 30 piezas. */
  bajo: number | null
  alto: number | null
  minKg: number | null
  maxKg: number | null
}

export const BORDE_MIN_PIEZAS = 30

const cuantil = (s: number[], q: number) => s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]!

/**
 * Dónde cae el peso dentro del rango de cada gate (dato, sin aviso). El rango es el observado del programa de la
 * gate (p1-p99 de todas las gates con ese programa y destino), porque los límites del Z2 no llegan.
 */
export function bordesPorGate(piezas: readonly PiezaEspejo[]): BordeGate[] {
  const prog = (p: PiezaEspejo) => `${p.calibre}|${p.calidad}|${p.conservacion}|${p.producto}`
  const pesosProg = new Map<string, number[]>()
  const porGate = new Map<number, PiezaEspejo[]>()
  for (const p of piezas) {
    if (p.gate <= 0 || !(gramos(p) > 10)) continue
    const k = prog(p)
    const l = pesosProg.get(k) ?? []
    l.push(gramos(p))
    pesosProg.set(k, l)
    const g = porGate.get(p.gate) ?? []
    g.push(p)
    porGate.set(p.gate, g)
  }
  const rango = new Map<string, [number, number]>()
  for (const [k, l] of pesosProg) { l.sort((a, b) => a - b); rango.set(k, [cuantil(l, 0.01), cuantil(l, 0.99)]) }
  const out: BordeGate[] = []
  for (const [gate, ps] of [...porGate.entries()].sort((a, b) => a[0] - b[0])) {
    const ult = ps[ps.length - 1]!
    const k = prog(ult)
    const delProg = ps.filter((p) => prog(p) === k)
    const n = delProg.reduce((s, p) => s + p.cantidad, 0)
    const [lo, hi] = rango.get(k)!
    const span = hi - lo
    let b = 0
    let a = 0
    let mn = Infinity
    let mx = -Infinity
    for (const p of delProg) {
      const w = gramos(p)
      if (w < lo + span * 0.1) b += p.cantidad
      if (w >= hi - span * 0.1) a += p.cantidad
      mn = Math.min(mn, w)
      mx = Math.max(mx, w)
    }
    const lee = n >= BORDE_MIN_PIEZAS && span > 0
    out.push({
      gate,
      programa: `${ult.calibre} · ${ult.calidad}`,
      destino: `${ult.conservacion} · ${ult.producto}`,
      piezas: n,
      bajo: lee ? (b / n) * 100 : null,
      alto: lee ? (a / n) * 100 : null,
      minKg: Number.isFinite(mn) ? mn / 1000 : null,
      maxKg: Number.isFinite(mx) ? mx / 1000 : null,
    })
  }
  return out
}

export interface Escalon {
  /** Límite entre los calibres, en g. */
  limiteG: number
  bajo: { calibre: string; piezas: number }
  alto: { calibre: string; piezas: number }
}

/**
 * Piezas mínimas en los 200 g alrededor del límite para juzgar un escalón. Con menos, el azar da un 2:1 (19-11,
 * 14:00-15:00: 32 contra 67 con 99 piezas, en una pesca continua el resto del turno).
 */
export const ESCALON_MIN_PIEZAS = 100

/**
 * Escalón real en un límite de calibre de la misma calidad (Premium): en los 100 g a cada lado, uno tiene el doble o
 * más de piezas que el otro. Una pesca continua no lo hace; un escalón dice que la balanza o el seteo cortan mal.
 * La zona 4,59–4,99 (8-10 contra 10-12) no es un límite sino un solape y se ve en su propia tarjeta.
 */
export function escalones(piezas: readonly PiezaEspejo[]): Escalon[] {
  const lim: Array<[string, string]> = [['2-4 lb', '4-6 lb'], ['4-6 lb', '6-8 lb'], ['6-8 lb', '8-10 lb']]
  const out: Escalon[] = []
  for (const [cb, ca] of lim) {
    const limiteG = RANGO_CALIBRE_G[cb]![1]
    let nb = 0
    let na = 0
    for (const p of piezas) {
      if (p.gate <= 0 || p.calidad !== 'Premium') continue
      const w = gramos(p)
      if (p.calibre === cb && w >= limiteG - 100 && w < limiteG) nb += p.cantidad
      else if (p.calibre === ca && w >= limiteG && w < limiteG + 100) na += p.cantidad
    }
    if (nb + na < ESCALON_MIN_PIEZAS) continue
    if (nb >= 2 * na || na >= 2 * nb) out.push({ limiteG, bajo: { calibre: cb, piezas: nb }, alto: { calibre: ca, piezas: na } })
  }
  return out
}

/** Las piezas de los últimos `min` minutos hasta la última pieza (o hasta `hastaMs`). */
export function ultimosMinutos(piezas: readonly PiezaEspejo[], min: number, hastaMs?: number): PiezaEspejo[] {
  if (piezas.length === 0) return []
  const fin = hastaMs ?? ms(piezas[piezas.length - 1]!) + 1000
  const ini = new Date(fin - min * 60_000).toISOString()
  const finIso = new Date(fin).toISOString()
  return piezas.filter((p) => p.ts >= ini && p.ts < finIso)
}
