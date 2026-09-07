/**
 * gateMix v2 — lo OBSERVADO por puerta y por bloque, sin juicio.
 *
 * v1 (graderGateMix.ts) guardaba la pureza calculada con UNA config al momento
 * de guardar el Excel: si después alguien cambiaba una gate desde el detalle,
 * el juicio quedaba viejo y corregirlo exigía releer las ~12.000 piezas.
 *
 * v2 separa las dos cosas:
 *  - `computeGateObservations` produce, por puerta y por bloque de 30 min,
 *    cuántas piezas cayeron de cada combinación `calibre|calidad|conservación`.
 *    Es un hecho de la máquina: no depende de ninguna config. Se guarda una
 *    vez, en la subcolección `meta/gateMix` del turno (~12 KB medidos; NO en
 *    el doc del summary, que se lee por mes).
 *  - `deriveGateMix` produce, en pantalla, el mismo `GateMix` que consume la
 *    tarjeta de pureza, pero juzgando cada bloque con la config vigente en ese
 *    momento (los snapshots del turno). Cambiar una gate no escribe nada y se
 *    refleja al instante, también hacia atrás.
 *  - `classifyGateCauses` responde «¿por qué cayó acá?»: agrupa las piezas que
 *    no coinciden por causal (calibre vecino, calibre lejano, calidad,
 *    conservación, sin dato), dice a qué gate debían ir según el seteo y en
 *    qué bloques se concentran.
 *
 * Topes (decisión 07-09): 40 bloques (20 h) y 8 combinaciones por bloque (el
 * resto se suma en `Otros`), para que un Excel con timestamps basura no pueda
 * inflar el doc.
 *
 * ⚠ Husos: los ts de las piezas van en hora de pared marcada como Z (convención
 * del parser); los snapshots guardan hora real UTC. Antes de comparar hay que
 * pasar el snapshot por `realIsoToWallClockMs` con el huso de la planta.
 */
import type { GateAssignment, PieceRecord } from './types'
import type { GateConfigSnapshot } from './graderConfigSnapshot.service'
import { ANY_CALIBRE, SIN_DATO, type GateMix, type GateMixEntry, type GateMixIntruder } from './graderGateMix'
import { CALIBRE_WEIGHT_RANGES } from './graderAnalyticsThroughput'

export const GATE_OBS_SCHEMA = 2
export const GATE_OBS_BUCKET_MINUTES = 30
export const GATE_OBS_MAX_BUCKETS = 40
export const GATE_OBS_MAX_COMBOS = 8
/** Combinaciones fuera del top 8 del bloque. */
export const OTROS = 'Otros'
/** Huso de las plantas (Chonchi y Yal). */
export const PLANT_TZ = 'America/Santiago'

/** `calibre|calidad[|conservación]` → piezas. `Otros` agrupa lo que quedó fuera del top 8. */
export type ComboCounts = Record<string, number>

export interface GateObservationsEntry {
  gate: number
  /** Piezas de la puerta dentro de los bloques guardados. */
  pieces: number
  /** Un elemento por bloque; null = sin piezas en ese bloque. */
  byBucket: Array<ComboCounts | null>
}

export interface GateObservations {
  schema: typeof GATE_OBS_SCHEMA
  /** Inicio del primer bloque, wall-clock marcado como Z. */
  bucketsFrom: string
  bucketMinutes: number
  bucketCount: number
  gates: GateObservationsEntry[]
}

/** La conservación solo entra a la clave cuando el Excel la trae: no cambia las claves viejas. */
export const comboKey = (calibre: string | undefined, quality: string | undefined, conservation?: string): string =>
  `${calibre || SIN_DATO}|${quality || SIN_DATO}${conservation ? `|${conservation}` : ''}`

export interface Combo { calibre: string; quality: string; conservation?: string }

export function splitCombo(key: string): Combo {
  if (key === OTROS) return { calibre: OTROS, quality: OTROS }
  const [calibre = SIN_DATO, quality = SIN_DATO, conservation] = key.split('|')
  return conservation ? { calibre, quality, conservation } : { calibre, quality }
}

/** Un ts ISO sin sufijo se parsea como UTC (ver graderGateMix.parseWallClock). */
function parseWallClock(ts: string): number {
  const naive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(ts)
  return Date.parse(naive ? `${ts}Z` : ts)
}

/**
 * Instante real (ISO UTC, como `GateConfigSnapshot.at`) → ms en el marco
 * wall-clock-as-UTC del módulo, según el huso de la planta.
 * Ej.: `2026-09-07T13:18:00.000Z` en Chile (UTC-3 en septiembre) → 10:18 → ms de `2026-09-07T10:18:00Z`.
 */
export function realIsoToWallClockMs(iso: string, timeZone: string = PLANT_TZ): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return NaN
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
}

// ── Observación ──────────────────────────────────────────────────────────────

export function computeGateObservations(records: readonly PieceRecord[]): GateObservations | null {
  const prod = records.filter((rec) => rec.gate > 0 && rec.pieces > 0 && rec.ts)
  if (prod.length === 0) return null

  let minMs = Infinity
  let maxMs = -Infinity
  for (const rec of prod) {
    const ms = parseWallClock(rec.ts)
    if (Number.isNaN(ms)) continue
    if (ms < minMs) minMs = ms
    if (ms > maxMs) maxMs = ms
  }
  if (!Number.isFinite(minMs)) return null

  const size = GATE_OBS_BUCKET_MINUTES * 60_000
  const from = Math.floor(minMs / size) * size
  const bucketCount = Math.min(GATE_OBS_MAX_BUCKETS, Math.floor((maxMs - from) / size) + 1)

  const acc = new Map<number, Array<Map<string, number>>>()
  for (const rec of prod) {
    const ms = parseWallClock(rec.ts)
    if (Number.isNaN(ms)) continue
    const bi = Math.floor((ms - from) / size)
    if (bi < 0 || bi >= bucketCount) continue
    let buckets = acc.get(rec.gate)
    if (!buckets) {
      buckets = Array.from({ length: bucketCount }, () => new Map<string, number>())
      acc.set(rec.gate, buckets)
    }
    const key = comboKey(rec.calibre, rec.quality, rec.conservation)
    const b = buckets[bi]!
    b.set(key, (b.get(key) ?? 0) + rec.pieces)
  }

  const gates: GateObservationsEntry[] = []
  for (const [gate, buckets] of acc) {
    let pieces = 0
    const byBucket = buckets.map((b) => {
      if (b.size === 0) return null
      const sorted = [...b.entries()].sort((x, y) => y[1] - x[1])
      const kept = sorted.slice(0, GATE_OBS_MAX_COMBOS)
      const rest = sorted.slice(GATE_OBS_MAX_COMBOS).reduce((s, [, n]) => s + n, 0)
      const out: ComboCounts = Object.fromEntries(kept)
      if (rest > 0) out[OTROS] = (out[OTROS] ?? 0) + rest
      for (const n of Object.values(out)) pieces += n
      return out
    })
    gates.push({ gate, pieces, byBucket })
  }
  gates.sort((a, b) => a.gate - b.gate)

  return {
    schema: GATE_OBS_SCHEMA,
    bucketsFrom: new Date(from).toISOString(),
    bucketMinutes: GATE_OBS_BUCKET_MINUTES,
    bucketCount,
    gates,
  }
}

// ── Config vigente por bloque ───────────────────────────────────────────────

export type ConfigAt = (wallClockMs: number) => readonly GateAssignment[] | undefined

export interface ConfigTimeline {
  configAt: ConfigAt
  /** Instantes (wall-clock ms) en que la config cambió, para marcar el bloque. */
  changeTimesMs: number[]
}

/**
 * Arma `configAt` desde los snapshots del turno (hora real → hora de pared).
 * Antes del primer snapshot rige `fallback` (normalmente `summary.gatesUsed`);
 * sin snapshots, `fallback` para todo el turno. Los snapshots sintéticos y el
 * inicial (sin `changes`) no cuentan como "cambio" para el marcador.
 */
export function configTimelineFromSnapshots(
  snapshots: readonly GateConfigSnapshot[],
  fallback: readonly GateAssignment[] | undefined,
  timeZone: string = PLANT_TZ,
): ConfigTimeline {
  const points = snapshots
    .map((s) => ({ ms: realIsoToWallClockMs(s.at, timeZone), gates: s.gates, isChange: !s.synthetic && s.changes.length > 0 }))
    .filter((p) => Number.isFinite(p.ms))
    .sort((a, b) => a.ms - b.ms)
  const configAt: ConfigAt = (ms) => {
    let cur: readonly GateAssignment[] | undefined = fallback
    for (const p of points) {
      if (p.ms <= ms) cur = p.gates
      else break
    }
    return cur
  }
  return { configAt, changeTimesMs: points.filter((p) => p.isChange).map((p) => p.ms) }
}

// ── Derivación ──────────────────────────────────────────────────────────────

const MIN_INTRUDER_PCT = 1
const r1 = (v: number) => Math.round(v * 10) / 10

export interface DerivedGateMix extends GateMix {
  /** Índices de bloque que contienen un cambio de config: se leen con cautela. */
  changeBuckets: number[]
}

/** ¿La combinación observada es lo que la gate tenía asignado? */
function matches(c: Combo, g: GateAssignment): boolean {
  if (c.calibre === OTROS) return false
  if (g.assignedCalibre !== ANY_CALIBRE && c.calibre !== g.assignedCalibre) return false
  if (c.quality !== g.assignedQuality) return false
  if (g.assignedConservation && c.conservation && c.conservation !== g.assignedConservation) return false
  return true
}

/**
 * Juzga las observaciones con la config vigente en cada bloque y devuelve el
 * `GateMix` que consume la tarjeta. Por puerta:
 *  - `assignedCalibre/Quality`: la config vigente en el ÚLTIMO bloque con piezas.
 *  - `purityPct`: coincidentes ÷ piezas, contando solo bloques donde la puerta
 *    tenía asignación; null si nunca la tuvo.
 *  - `topIntruder`: el desvío mayor, acumulado bloque a bloque contra la config
 *    de cada bloque (un intruso antes del cambio y otro después se suman por valor).
 */
export function deriveGateMix(obs: GateObservations, timeline: ConfigTimeline): DerivedGateMix {
  const size = obs.bucketMinutes * 60_000
  const from = Date.parse(obs.bucketsFrom)
  const bucketStart = (i: number) => from + i * size

  const changeBuckets: number[] = []
  for (const t of timeline.changeTimesMs) {
    const i = Math.floor((t - from) / size)
    if (i >= 0 && i < obs.bucketCount && !changeBuckets.includes(i)) changeBuckets.push(i)
  }
  changeBuckets.sort((a, b) => a - b)

  const gates: GateMixEntry[] = obs.gates.map((e) => {
    let lastCfg: GateAssignment | undefined
    let match = 0
    let judged = 0
    const byCalibre: Record<string, number> = {}
    const byQuality: Record<string, number> = {}
    const intruCal = new Map<string, number>()
    const intruQ = new Map<string, number>()
    const purityByBucket: Array<number | null> = []

    e.byBucket.forEach((b, i) => {
      if (!b) { purityByBucket.push(null); return }
      const cfg = timeline.configAt(bucketStart(i))?.find((g) => g.gateNumber === e.gate && g.active)
      let bTot = 0
      let bOk = 0
      for (const [key, n] of Object.entries(b)) {
        const c = splitCombo(key)
        byCalibre[c.calibre] = (byCalibre[c.calibre] ?? 0) + n
        byQuality[c.quality] = (byQuality[c.quality] ?? 0) + n
        bTot += n
        if (!cfg) continue
        if (matches(c, cfg)) { bOk += n; continue }
        if (cfg.assignedCalibre !== ANY_CALIBRE && c.calibre !== cfg.assignedCalibre) intruCal.set(c.calibre, (intruCal.get(c.calibre) ?? 0) + n)
        if (c.quality !== cfg.assignedQuality) intruQ.set(c.quality, (intruQ.get(c.quality) ?? 0) + n)
      }
      if (cfg) { lastCfg = cfg; match += bOk; judged += bTot }
      purityByBucket.push(cfg && bTot > 0 ? r1((bOk / bTot) * 100) : null)
    })

    let topIntruder: GateMixIntruder | undefined
    if (judged > 0) {
      const cands: GateMixIntruder[] = [
        ...[...intruCal].map(([value, n]) => ({ kind: 'calibre' as const, value, pct: r1((n / judged) * 100) })),
        ...[...intruQ].map(([value, n]) => ({ kind: 'quality' as const, value, pct: r1((n / judged) * 100) })),
      ].sort((x, y) => y.pct - x.pct)
      if (cands[0] && cands[0].pct >= MIN_INTRUDER_PCT) topIntruder = cands[0]
    }

    return {
      gate: e.gate,
      pieces: e.pieces,
      ...(lastCfg ? { assignedCalibre: lastCfg.assignedCalibre, assignedQuality: lastCfg.assignedQuality } : {}),
      matchPieces: match,
      purityPct: judged > 0 ? r1((match / judged) * 100) : null,
      byCalibre,
      byQuality,
      ...(topIntruder ? { topIntruder } : {}),
      purityByBucket,
    }
  })

  return {
    bucketsFrom: obs.bucketsFrom,
    bucketMinutes: obs.bucketMinutes,
    bucketCount: obs.bucketCount,
    gates,
    changeBuckets,
  }
}

// ── ¿Por qué cayó acá? ──────────────────────────────────────────────────────

export type CausaTipo = 'calibre_vecino' | 'calibre_lejano' | 'calidad' | 'conservacion' | 'sin_dato' | 'otros'

export const CAUSA_ORDER: CausaTipo[] = ['calibre_lejano', 'calibre_vecino', 'calidad', 'conservacion', 'sin_dato', 'otros']

/** De dónde vinieron las piezas respecto a esta puerta, según el seteo. */
export type OrigenCausa = 'atras' | 'adelante' | 'mixto' | 'ninguna'

export interface GateCauseGroup {
  tipo: CausaTipo
  /** El valor intruso: el calibre, la calidad o la conservación que cayó. */
  value: string
  pieces: number
  /** % de las piezas juzgadas de la puerta. */
  pct: number
  /** Gates que tenían asignado ese valor (con la calidad de la pieza) en la config del bloque. */
  debiaIr: number[]
  origen: OrigenCausa
  /** Piezas de esta causal por bloque (misma longitud que los bloques). */
  byBucket: number[]
  /** Primer y último bloque con piezas de la causal. null si no hay. */
  desde: number | null
  hasta: number | null
  /** true si aparece en ≥ 70 % de los bloques con piezas: no es un episodio, es constante. */
  parejo: boolean
}

export interface GateCauses {
  gate: number
  /** Piezas juzgadas (bloques con asignación). */
  judged: number
  okByBucket: number[]
  /** Piezas fuera de asignación por bloque y por tipo (para el gráfico apilado). */
  byTipoByBucket: Record<CausaTipo, number[]>
  groups: GateCauseGroup[]
}

const CALIBRE_ORDER: string[] = CALIBRE_WEIGHT_RANGES.map((r) => r.calibre)

function calibreDistance(a: string, b: string): number | null {
  const ia = CALIBRE_ORDER.indexOf(a)
  const ib = CALIBRE_ORDER.indexOf(b)
  if (ia < 0 || ib < 0) return null
  return Math.abs(ia - ib)
}

function tipoDeCausa(c: Combo, cfg: GateAssignment): { tipo: CausaTipo; value: string } {
  if (c.calibre === OTROS) return { tipo: 'otros', value: OTROS }
  if (c.calibre === SIN_DATO || c.quality === SIN_DATO) return { tipo: 'sin_dato', value: SIN_DATO }
  if (cfg.assignedCalibre !== ANY_CALIBRE && c.calibre !== cfg.assignedCalibre) {
    const d = calibreDistance(c.calibre, cfg.assignedCalibre)
    return { tipo: d === 1 ? 'calibre_vecino' : 'calibre_lejano', value: c.calibre }
  }
  if (c.quality !== cfg.assignedQuality) return { tipo: 'calidad', value: c.quality }
  return { tipo: 'conservacion', value: c.conservation ?? SIN_DATO }
}

/** Gates (activas, distintas de `self`) que en `all` tenían asignada la combinación. */
function gatesQueDebian(all: readonly GateAssignment[] | undefined, self: number, tipo: CausaTipo, c: Combo): number[] {
  if (!all) return []
  const ok = (g: GateAssignment) => {
    if (!g.active || g.gateNumber === self) return false
    if (tipo === 'calibre_vecino' || tipo === 'calibre_lejano') {
      return (g.assignedCalibre === c.calibre || g.assignedCalibre === ANY_CALIBRE) && g.assignedQuality === c.quality
    }
    if (tipo === 'calidad') {
      return g.assignedQuality === c.quality && (g.assignedCalibre === ANY_CALIBRE || g.assignedCalibre === c.calibre)
    }
    if (tipo === 'conservacion') return g.assignedConservation === c.conservation && g.assignedQuality === c.quality
    return false
  }
  return all.filter(ok).map((g) => g.gateNumber).sort((a, b) => a - b)
}

/**
 * Agrupa lo que cayó fuera de asignación en una puerta por causal y valor,
 * usando la config vigente en cada bloque. Ordena por piezas.
 */
export function classifyGateCauses(obs: GateObservations, gate: number, timeline: ConfigTimeline): GateCauses | null {
  const entry = obs.gates.find((e) => e.gate === gate)
  if (!entry) return null
  const size = obs.bucketMinutes * 60_000
  const from = Date.parse(obs.bucketsFrom)
  const n = obs.bucketCount

  const okByBucket = Array.from({ length: n }, () => 0)
  const byTipoByBucket = Object.fromEntries(CAUSA_ORDER.map((t) => [t, Array.from({ length: n }, () => 0)])) as Record<CausaTipo, number[]>
  const groups = new Map<string, GateCauseGroup>()
  let judged = 0
  let bucketsConPiezas = 0

  entry.byBucket.forEach((b, i) => {
    if (!b) return
    const all = timeline.configAt(from + i * size)
    const cfg = all?.find((g) => g.gateNumber === gate && g.active)
    if (!cfg) return
    bucketsConPiezas++
    for (const [key, pieces] of Object.entries(b)) {
      judged += pieces
      const c = splitCombo(key)
      if (matches(c, cfg)) { okByBucket[i]! += pieces; continue }
      const { tipo, value } = tipoDeCausa(c, cfg)
      byTipoByBucket[tipo][i]! += pieces
      const gk = `${tipo}|${value}`
      let g = groups.get(gk)
      if (!g) {
        g = { tipo, value, pieces: 0, pct: 0, debiaIr: [], origen: 'ninguna', byBucket: Array.from({ length: n }, () => 0), desde: null, hasta: null, parejo: false }
        groups.set(gk, g)
      }
      g.pieces += pieces
      g.byBucket[i]! += pieces
      for (const d of gatesQueDebian(all, gate, tipo, c)) if (!g.debiaIr.includes(d)) g.debiaIr.push(d)
    }
  })

  const out = [...groups.values()].map((g) => {
    g.debiaIr.sort((a, b) => a - b)
    g.pct = judged > 0 ? r1((g.pieces / judged) * 100) : 0
    const conPiezas = g.byBucket.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0)
    g.desde = conPiezas[0] ?? null
    g.hasta = conPiezas[conPiezas.length - 1] ?? null
    g.parejo = bucketsConPiezas > 0 && conPiezas.length / bucketsConPiezas >= 0.7
    const atras = g.debiaIr.some((d) => d < gate)
    const adelante = g.debiaIr.some((d) => d > gate)
    g.origen = atras && adelante ? 'mixto' : atras ? 'atras' : adelante ? 'adelante' : 'ninguna'
    return g
  }).sort((a, b) => b.pieces - a.pieces)

  return { gate, judged, okByBucket, byTipoByBucket, groups: out }
}
