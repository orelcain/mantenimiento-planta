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
import type { GateAssignment, PieceRecord, CalibreWeightRange } from './types'
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

/**
 * Bin de peso. La clave es el límite inferior en gramos ("4500" = 4.500–4.599 g).
 * 100 g desde la ronda 3 (07-09): con 250 g, el bin 4.500–4.750 cruzaba el techo
 * 4.581 del 8-10 y dejaba un 22 % "al límite" que era resolución, no máquina.
 * Cada doc guarda su ancho (`weightBinGrams`); los escritos con 250 g siguen valiendo.
 */
export const GATE_OBS_WEIGHT_BIN_G = 100
/** Ancho de bin de los docs anteriores a `weightBinGrams`. */
const LEGACY_WEIGHT_BIN_G = 250
export type WeightBins = Record<string, number>

export interface GateObservationsEntry {
  gate: number
  /** Piezas de la puerta dentro de los bloques guardados. */
  pieces: number
  /** Un elemento por bloque; null = sin piezas en ese bloque. */
  byBucket: Array<ComboCounts | null>
  /**
   * Histograma de peso por bloque (bins de 250 g), sin depender de ningún
   * rango: la mezcla FÍSICA se juzga después contra los rangos configurados.
   * Medido 07-09: la etiqueta Calibre del Excel es la decisión de la máquina y
   * coincide siempre con su seteo; el peso es lo único que dice si la pieza
   * pertenecía a ese calibre. Ausente en turnos guardados antes de este campo.
   */
  weightByBucket?: Array<WeightBins | null>
}

export interface GateObservations {
  schema: typeof GATE_OBS_SCHEMA
  /** Inicio del primer bloque, wall-clock marcado como Z. */
  bucketsFrom: string
  bucketMinutes: number
  bucketCount: number
  /** Ancho del bin de peso en gramos. Ausente = 250 (docs anteriores). */
  weightBinGrams?: number
  gates: GateObservationsEntry[]
}

/** La conservación solo entra a la clave cuando el Excel la trae: no cambia las claves viejas. */
export const comboKey = (calibre: string | undefined, quality: string | undefined, conservation?: string): string =>
  `${calibre || SIN_DATO}|${quality || SIN_DATO}${conservation ? `|${conservation}` : ''}`

export interface Combo { calibre: string; quality: string; conservation?: string }

/**
 * Etiquetas de calibre de Excel viejos guardadas crudas ("2 - 4 LB", "HG 6-8"): se
 * normalizan al leer, no al escribir, para que los docs ya guardados también
 * calcen con los calibres de la app (rangos, distancia, programa).
 */
export function normalizarCalibre(s: string): string {
  if (s === OTROS || s === SIN_DATO || s === ANY_CALIBRE) return s
  const t = s.toLowerCase().replace(/\s+/g, '').replace(/^hg/, '')
  if (t.includes('fuera') || t.includes('out')) return ANY_CALIBRE
  if (/\d+-?(up|mas|\+)/.test(t) || /^10-12/.test(t)) return '10-12 lb'
  const m = t.match(/^(\d+)-(\d+)(lb)?$/)
  if (!m) return s
  const lb = `${m[1]}-${m[2]} lb`
  return ['0-2 lb', '2-4 lb', '4-6 lb', '6-8 lb', '8-10 lb', '10-12 lb'].includes(lb) ? lb : s
}

export function splitCombo(key: string): Combo {
  if (key === OTROS) return { calibre: OTROS, quality: OTROS }
  const [calibre = SIN_DATO, quality = SIN_DATO, conservation] = key.split('|')
  const c = normalizarCalibre(calibre)
  return conservation ? { calibre: c, quality, conservation } : { calibre: c, quality }
}

/** Un ts ISO sin sufijo se parsea como UTC (ver graderGateMix.parseWallClock). */
export function parseWallClock(ts: string): number {
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

/**
 * Inversa de `realIsoToWallClockMs`: un instante en el marco wall-clock del
 * módulo → ISO real UTC, según el huso de la planta. Necesario para registrar
 * un cambio de config "a las 23:30 hora de planta" en `GateConfigSnapshot.at`.
 */
export function wallClockMsToRealIso(wallMs: number, timeZone: string = PLANT_TZ): string {
  // El desfase real→pared en ese momento (constante salvo en el cambio de hora).
  let real = wallMs
  for (let i = 0; i < 2; i++) {
    const offset = realIsoToWallClockMs(new Date(real).toISOString(), timeZone) - real
    real = wallMs - offset
  }
  return new Date(real).toISOString()
}

/** Huella de los rangos de calibre: si cambia, las causas P0 "fuera de calibre" hay que recalcularlas. */
export function rangesFingerprint(ranges: readonly CalibreWeightRange[]): string {
  return [...ranges].map((r) => `${r.calibre}:${r.minGrams}-${r.maxGrams}`).sort().join('|')
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
  const accW = new Map<number, Array<Map<string, number>>>()
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

    const grams = rec.weightPerPieceGrams ?? (rec.weightKg && rec.pieces > 0 ? (rec.weightKg * 1000) / rec.pieces : undefined)
    if (grams != null && grams > 0 && Number.isFinite(grams)) {
      let wb = accW.get(rec.gate)
      if (!wb) {
        wb = Array.from({ length: bucketCount }, () => new Map<string, number>())
        accW.set(rec.gate, wb)
      }
      const bin = String(Math.floor(grams / GATE_OBS_WEIGHT_BIN_G) * GATE_OBS_WEIGHT_BIN_G)
      wb[bi]!.set(bin, (wb[bi]!.get(bin) ?? 0) + rec.pieces)
    }
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
    const wb = accW.get(gate)
    const weightByBucket = wb ? wb.map((m) => (m.size ? Object.fromEntries(m) : null)) : undefined
    gates.push({ gate, pieces, byBucket, ...(weightByBucket ? { weightByBucket } : {}) })
  }
  gates.sort((a, b) => a.gate - b.gate)

  return {
    schema: GATE_OBS_SCHEMA,
    bucketsFrom: new Date(from).toISOString(),
    bucketMinutes: GATE_OBS_BUCKET_MINUTES,
    bucketCount,
    weightBinGrams: GATE_OBS_WEIGHT_BIN_G,
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
  // Antes del primer snapshot: si ese primero es el INICIAL (sin cambios, el
  // que se guarda al cargar el Excel), rige él y no `fallback` (gatesUsed), que
  // la página mantiene como la config MÁS RECIENTE y por eso contamina el
  // tramo previo. Medido 08-09: registrar G4→6-8 a las 03:30 hacía que G4
  // fuera 6-8 también a las 21:15.
  const primero = [...snapshots].sort((a, b) => a.at.localeCompare(b.at))[0]
  const inicial = primero && !primero.synthetic && primero.changes.length === 0 ? primero.gates : fallback
  const configAt: ConfigAt = (ms) => {
    let cur: readonly GateAssignment[] | undefined = inicial
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

/** Lo que la máquina manda a una puerta (etiqueta dominante del Excel) cuando no coincide con el seteo de la app. */
export interface SeteoMaquina {
  calibre: string
  quality: string
  /** % de las piezas juzgadas de la puerta con esa combinación. */
  pct: number
  /**
   * La etiqueta dominante es "Other": un calibre que la app no conoce (12+ lb)
   * o "fuera de rango". No es seteo distinto ni mezcla: falta en los rangos.
   */
  noReconocido?: boolean
}

/** Umbral de dominancia: con ≥ 90 % una sola combinación, la puerta no está mezclada, está seteada distinto. */
export const SETEO_DOMINANCIA_PCT = 90

export interface DerivedGateMix extends GateMix {
  /** Índices de bloque que contienen un cambio de config: se leen con cautela. */
  changeBuckets: number[]
  /**
   * Puertas cuyo seteo en la app no coincide con lo que la máquina manda. La
   * columna Calibre/Calidad del Excel es la DECISIÓN de la máquina: si ≥ 90 %
   * de las piezas llevan una misma combinación distinta a la asignada, no hay
   * mezcla física, hay un seteo desactualizado (medido 07-09: 5 de 11 puertas).
   */
  seteoDistinto: Record<number, SeteoMaquina>
}

/** Combinación dominante (calibre|calidad de la etiqueta) sobre las piezas juzgadas de la puerta. */
function seteoMaquinaDe(entry: GateObservationsEntry, timeline: ConfigTimeline, from: number, size: number): SeteoMaquina | null {
  const tally = new Map<string, number>()
  let judged = 0
  let lastCfg: GateAssignment | undefined
  entry.byBucket.forEach((b, i) => {
    if (!b) return
    const cfg = timeline.configAt(from + i * size)?.find((g) => g.gateNumber === entry.gate && g.active)
    if (!cfg) return
    lastCfg = cfg
    for (const [key, n] of Object.entries(b)) {
      const c = splitCombo(key)
      if (c.calibre === OTROS) continue
      judged += n
      const k = `${c.calibre}|${c.quality}`
      tally.set(k, (tally.get(k) ?? 0) + n)
    }
  })
  if (!lastCfg || judged === 0) return null
  const [top, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  const pct = r1((n / judged) * 100)
  if (pct < SETEO_DOMINANCIA_PCT) return null
  const [calibre, quality] = top.split('|') as [string, string]
  if (calibre === SIN_DATO || quality === SIN_DATO) return null
  const coincide = (lastCfg.assignedCalibre === ANY_CALIBRE || calibre === lastCfg.assignedCalibre) && quality === lastCfg.assignedQuality
  if (coincide) return null
  return calibre === ANY_CALIBRE ? { calibre, quality, pct, noReconocido: true } : { calibre, quality, pct }
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

  const seteoDistinto: Record<number, SeteoMaquina> = {}
  for (const e of obs.gates) {
    const s = seteoMaquinaDe(e, timeline, from, size)
    if (s) seteoDistinto[e.gate] = s
  }

  return {
    bucketsFrom: obs.bucketsFrom,
    bucketMinutes: obs.bucketMinutes,
    bucketCount: obs.bucketCount,
    gates,
    changeBuckets,
    seteoDistinto,
  }
}

// ── Mezcla física: peso contra el rango del seteo ───────────────────────────

export interface PesoPorPuerta {
  gate: number
  /** Piezas con peso conocido en bloques con asignación. */
  conPeso: number
  dentro: number
  /** Bins de 250 g que cruzan un límite del rango: no se puede decir de qué lado caen. */
  alLimite: number
  fueraArriba: number
  fueraAbajo: number
  /** % fuera (arriba + abajo) sobre las piezas con peso. */
  pctFuera: number
  /** Rango del calibre asignado en el último bloque con piezas, en gramos. */
  rango: { calibre: string; minGrams: number; maxGrams: number } | null
  /** Pesos observados fuera, en gramos [min, max]. */
  gramosArriba: [number, number] | null
  gramosAbajo: [number, number] | null
  /** Ancho del bin con el que se guardó la observación (100 g; 250 en docs viejos). */
  binGrams: number
}

/**
 * Juzga el histograma de peso de cada puerta contra el rango del calibre que
 * tenía asignado en cada bloque (`ranges`: los configurados en la app, no la
 * etiqueta del Excel). Una puerta con "Other" asignado recibe de todo → sin juicio.
 * Devuelve solo las puertas con peso guardado y asignación con rango conocido.
 */
export function derivePesoPorPuerta(
  obs: GateObservations,
  timeline: ConfigTimeline,
  ranges: readonly CalibreWeightRange[],
): Record<number, PesoPorPuerta> {
  const size = obs.bucketMinutes * 60_000
  const from = Date.parse(obs.bucketsFrom)
  const rangeOf = (calibre: string) => ranges.find((r) => r.calibre === calibre)
  const binG = obs.weightBinGrams ?? LEGACY_WEIGHT_BIN_G
  const out: Record<number, PesoPorPuerta> = {}
  for (const e of obs.gates) {
    if (!e.weightByBucket) continue
    const p: PesoPorPuerta = { gate: e.gate, conPeso: 0, dentro: 0, alLimite: 0, fueraArriba: 0, fueraAbajo: 0, pctFuera: 0, rango: null, gramosArriba: null, gramosAbajo: null, binGrams: binG }
    let juzgado = false
    e.weightByBucket.forEach((bins, i) => {
      if (!bins) return
      const cfg = timeline.configAt(from + i * size)?.find((g) => g.gateNumber === e.gate && g.active)
      if (!cfg || cfg.assignedCalibre === ANY_CALIBRE) return
      const r = rangeOf(cfg.assignedCalibre)
      if (!r) return
      juzgado = true
      p.rango = { calibre: r.calibre, minGrams: r.minGrams, maxGrams: r.maxGrams }
      for (const [k, n] of Object.entries(bins)) {
        const lo = Number(k)
        const hi = lo + binG
        p.conPeso += n
        if (lo >= r.maxGrams) {
          p.fueraArriba += n
          p.gramosArriba = p.gramosArriba ? [Math.min(p.gramosArriba[0], lo), Math.max(p.gramosArriba[1], hi)] : [lo, hi]
        } else if (hi <= r.minGrams) {
          p.fueraAbajo += n
          p.gramosAbajo = p.gramosAbajo ? [Math.min(p.gramosAbajo[0], lo), Math.max(p.gramosAbajo[1], hi)] : [lo, hi]
        } else if (lo >= r.minGrams && hi <= r.maxGrams) {
          p.dentro += n
        } else {
          p.alLimite += n
        }
      }
    })
    if (!juzgado || p.conPeso === 0) continue
    p.pctFuera = r1(((p.fueraArriba + p.fueraAbajo) / p.conPeso) * 100)
    out[e.gate] = p
  }
  return out
}

// ── Programa dominante de una puerta (lo que el Z2 etiqueta) ────────────────

/**
 * Combinación calibre|calidad dominante de la puerta en TODO el turno, sin
 * mirar ninguna config. Es lo que el Z2 tiene seteado para esa puerta.
 * null si no hay dominante (≥ 90 %), es "Other" o "Sin dato".
 */
export function programaDominante(entry: GateObservationsEntry): SeteoMaquina | null {
  const tally = new Map<string, number>()
  let total = 0
  for (const b of entry.byBucket) {
    if (!b) continue
    for (const [key, n] of Object.entries(b)) {
      const c = splitCombo(key)
      if (c.calibre === OTROS) continue
      total += n
      const k = `${c.calibre}|${c.quality}`
      tally.set(k, (tally.get(k) ?? 0) + n)
    }
  }
  if (total === 0) return null
  const [top, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  const pct = r1((n / total) * 100)
  if (pct < SETEO_DOMINANCIA_PCT) return null
  const [calibre, quality] = top.split('|') as [string, string]
  if (calibre === SIN_DATO || quality === SIN_DATO || calibre === ANY_CALIBRE) return null
  return { calibre, quality, pct }
}

/** Combinación dominante (≥ 90 %) de UN bloque; null si el bloque está mezclado o vacío. */
export function programaDeBloque(bins: ComboCounts | null): SeteoMaquina | null {
  if (!bins) return null
  const tally = new Map<string, number>()
  let total = 0
  for (const [key, n] of Object.entries(bins)) {
    const c = splitCombo(key)
    if (c.calibre === OTROS) continue
    total += n
    const k = `${c.calibre}|${c.quality}`
    tally.set(k, (tally.get(k) ?? 0) + n)
  }
  if (total === 0) return null
  const [top, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  const pct = r1((n / total) * 100)
  if (pct < SETEO_DOMINANCIA_PCT) return null
  const [calibre, quality] = top.split('|') as [string, string]
  if (calibre === SIN_DATO || quality === SIN_DATO || calibre === ANY_CALIBRE) return null
  return { calibre, quality, pct }
}

/**
 * Cambio de programa del Z2 dentro del turno que nadie registró en la app:
 * la puerta venía recibiendo lo asignado y desde cierto bloque recibe otra
 * combinación (≥ 90 % del bloque) que se mantiene en la mayoría de los
 * bloques siguientes. Medido 08-09 (2026-09-07 Turno 1): la G10 recibió 10-12
 * hasta las 23:30 y 8-10 desde entonces (85 % de sus piezas); sin el cambio
 * registrado salía "mezclada 15 %" y contaminaba el aviso de solape.
 */
export interface CambioDePrograma {
  gate: number
  /** Índice del bloque desde el que rige el programa nuevo, y su inicio (wall-clock ms). */
  desde: number
  desdeMs: number
  asignado: { calibre: string; quality: string }
  nuevo: SeteoMaquina
  /** Piezas de la puerta desde el cambio, y cuántas de ellas son del programa nuevo. */
  piezasDesde: number
  piezasNuevo: number
}

export function detectCambiosDePrograma(obs: GateObservations, timeline: ConfigTimeline): CambioDePrograma[] {
  const size = obs.bucketMinutes * 60_000
  const from = Date.parse(obs.bucketsFrom)
  const out: CambioDePrograma[] = []
  for (const e of obs.gates) {
    // Bloque a bloque: ¿el programa del bloque coincide con lo asignado?
    const estados = e.byBucket.map((b, i) => {
      if (!b) return null
      const cfg = timeline.configAt(from + i * size)?.find((g) => g.gateNumber === e.gate && g.active)
      if (!cfg) return null
      const p = programaDeBloque(b)
      const coincide = p != null && (cfg.assignedCalibre === ANY_CALIBRE || p.calibre === cfg.assignedCalibre) && p.quality === cfg.assignedQuality
      return { cfg, p, coincide }
    })
    const conDato = estados.map((s, i) => (s ? i : -1)).filter((i) => i >= 0)
    if (conDato.length < 3) continue
    // Debe haber bloques que coinciden ANTES del cambio: si nunca coincidió, es seteo ≠ máquina (otro aviso).
    const primerOk = conDato.find((i) => estados[i]!.coincide)
    if (primerOk == null) continue
    for (const i of conDato) {
      if (i <= primerOk) continue
      const s = estados[i]!
      if (s.coincide || !s.p) continue
      // ¿El programa nuevo se mantiene en la mayoría de los bloques siguientes con dato?
      const siguientes = conDato.filter((j) => j >= i)
      const iguales = siguientes.filter((j) => { const q = estados[j]!.p; return q && q.calibre === s.p!.calibre && q.quality === s.p!.quality })
      if (iguales.length * 2 < siguientes.length) continue
      let piezasDesde = 0
      let piezasNuevo = 0
      for (const j of siguientes) {
        for (const [key, n] of Object.entries(e.byBucket[j]!)) {
          piezasDesde += n
          const c = splitCombo(key)
          if (c.calibre === s.p.calibre && c.quality === s.p.quality) piezasNuevo += n
        }
      }
      out.push({
        gate: e.gate, desde: i, desdeMs: from + i * size,
        asignado: { calibre: s.cfg.assignedCalibre, quality: s.cfg.assignedQuality },
        nuevo: { calibre: s.p.calibre, quality: s.p.quality, pct: r1((piezasNuevo / Math.max(1, piezasDesde)) * 100) },
        piezasDesde, piezasNuevo,
      })
      break
    }
  }
  return out
}

/**
 * Turnos sin seteo guardado (los 23 de la temporada pasada): la puerta que no
 * tiene asignación en NINGÚN bloque toma como asignación lo que el Z2 le
 * etiqueta (programa dominante ≥ 90 %). Así la pureza y el peso se juzgan
 * igual, y la tarjeta lo marca como "inferido" hasta que alguien lo guarde.
 * Sin esto la tarjeta decía "Todas puras" con las 12 puertas "sin asignación".
 */
export function inferirSeteoFaltante(
  obs: GateObservations,
  timeline: ConfigTimeline,
): { timeline: ConfigTimeline; inferidas: Record<number, SeteoMaquina> } {
  const size = obs.bucketMinutes * 60_000
  const from = Date.parse(obs.bucketsFrom)
  const inferidas: Record<number, SeteoMaquina> = {}
  for (const e of obs.gates) {
    let tieneCfg = false
    for (let i = 0; i < obs.bucketCount; i++) {
      if (timeline.configAt(from + i * size)?.some((g) => g.gateNumber === e.gate && g.active)) { tieneCfg = true; break }
    }
    if (tieneCfg) continue
    const p = programaDominante(e)
    if (p) inferidas[e.gate] = p
  }
  if (Object.keys(inferidas).length === 0) return { timeline, inferidas }
  const extra: GateAssignment[] = Object.entries(inferidas).map(([g, p]) => ({
    gateNumber: Number(g), assignedCalibre: p.calibre, assignedQuality: p.quality as GateAssignment['assignedQuality'], active: true,
  }))
  const configAt: ConfigAt = (ms) => {
    const base = timeline.configAt(ms) ?? []
    return [...base, ...extra.filter((x) => !base.some((g) => g.gateNumber === x.gateNumber && g.active))]
  }
  return { timeline: { configAt, changeTimesMs: timeline.changeTimesMs }, inferidas }
}

// ── Programas de calibre solapados en el Z2 ─────────────────────────────────

export interface SolapeDeRango {
  /** Calibre de abajo (p. ej. 8-10 lb) y hasta qué peso recibió de verdad. */
  calibreA: string
  hastaA: number
  /** Calibre de arriba (p. ej. 10-12 lb) y desde qué peso recibió de verdad. */
  calibreB: string
  desdeB: number
  /** Ancho del tramo en común, en gramos. */
  gramos: number
  /** Piezas del calibre de abajo que pesan dentro del tramo en común. */
  piezasA: number
  /** Piezas del calibre de arriba que pesan dentro del tramo en común. */
  piezasB: number
}

/** Mínimo de piezas con peso por calibre para opinar, y mínimo de tramo en común. */
const SOLAPE_MIN_PIEZAS = 30
const SOLAPE_MIN_GRAMOS = 200

/**
 * Detecta programas de calibre solapados en el Z2 mirando SOLO el peso de lo que
 * cayó en las puertas de cada PROGRAMA (la etiqueta dominante de la puerta, que
 * es lo que el Z2 tiene seteado; no el seteo de la app, que puede estar mal —
 * ronda 5: con el seteo del borrador decía que 6-8 y 4-6 compartían 1.800 g).
 * Percentiles 2–98 del histograma para no dejarse llevar por una pieza suelta.
 * Medido 07-09: las puertas 8-10 recibían hasta 4,98 kg y las 10-12 desde
 * 4,59 kg: 400 g en común, y el pescado de ese tramo cae en cualquiera.
 */
// `_timeline` ya no decide la atribución (va por el programa de cada bloque); se conserva la firma.
export function detectSolapesDeRango(obs: GateObservations, _timeline: ConfigTimeline): SolapeDeRango[] {
  const binG = obs.weightBinGrams ?? LEGACY_WEIGHT_BIN_G
  const hist = new Map<string, Map<number, number>>()
  for (const e of obs.gates) {
    if (!e.weightByBucket) continue
    e.weightByBucket.forEach((bins, i) => {
      if (!bins) return
      // El programa del BLOQUE (la G10 fue 10-12 hasta las 23:30 y 8-10 después):
      // sin dominante en el bloque, no se atribuye a nadie — jamás al seteo de
      // la app, que puede estar mal.
      const calibre = programaDeBloque(e.byBucket[i] ?? null)?.calibre
      if (!calibre) return
      let h = hist.get(calibre)
      if (!h) { h = new Map(); hist.set(calibre, h) }
      for (const [k, n] of Object.entries(bins)) h.set(Number(k), (h.get(Number(k)) ?? 0) + n)
    })
  }
  const spans: Array<{ calibre: string; lo: number; hi: number; total: number; h: Map<number, number> }> = []
  for (const [calibre, h] of hist) {
    const total = [...h.values()].reduce((a, b) => a + b, 0)
    if (total < SOLAPE_MIN_PIEZAS) continue
    const sorted = [...h.entries()].sort((a, b) => a[0] - b[0])
    let acc = 0
    let lo: number | null = null
    let hi: number | null = null
    for (const [bin, n] of sorted) {
      acc += n
      if (lo == null && acc > total * 0.02) lo = bin
      if (acc >= total * 0.98) { hi = bin + binG; break }
    }
    if (lo == null || hi == null) continue
    spans.push({ calibre, lo, hi, total, h })
  }
  spans.sort((a, b) => a.lo - b.lo)
  const out: SolapeDeRango[] = []
  for (let i = 0; i + 1 < spans.length; i++) {
    const a = spans[i]!
    const b = spans[i + 1]!
    const gramos = a.hi - b.lo
    if (gramos < SOLAPE_MIN_GRAMOS) continue
    const piezasA = [...a.h.entries()].filter(([bin]) => bin >= b.lo && bin < a.hi).reduce((s, [, n]) => s + n, 0)
    const piezasB = [...b.h.entries()].filter(([bin]) => bin >= b.lo && bin < a.hi).reduce((s, [, n]) => s + n, 0)
    out.push({ calibreA: a.calibre, hastaA: a.hi, calibreB: b.calibre, desdeB: b.lo, gramos, piezasA, piezasB })
  }
  return out
}

// ── ¿Por qué cayó acá? ──────────────────────────────────────────────────────

export type CausaTipo =
  | 'seteo_distinto' | 'calibre_no_reconocido'
  | 'calibre_vecino' | 'calibre_lejano' | 'calidad' | 'conservacion' | 'sin_dato' | 'otros'

export const CAUSA_ORDER: CausaTipo[] = ['seteo_distinto', 'calibre_lejano', 'calibre_vecino', 'calidad', 'conservacion', 'calibre_no_reconocido', 'sin_dato', 'otros']

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

function tipoDeCausa(c: Combo, cfg: GateAssignment, seteo: SeteoMaquina | null): { tipo: CausaTipo; value: string } {
  if (c.calibre === OTROS) return { tipo: 'otros', value: OTROS }
  if (c.calibre === SIN_DATO || c.quality === SIN_DATO) return { tipo: 'sin_dato', value: SIN_DATO }
  if (seteo && !seteo.noReconocido && c.calibre === seteo.calibre && c.quality === seteo.quality) {
    return { tipo: 'seteo_distinto', value: `${seteo.calibre} · ${seteo.quality}` }
  }
  // La etiqueta "Other" del Excel es un calibre que la app no conoce (p. ej.
  // 12+ lb) o "Fuera de rango": no es un vecino ni un lejano, es un hueco del seteo.
  if (c.calibre === ANY_CALIBRE) return { tipo: 'calibre_no_reconocido', value: 'sin calibre reconocido' }
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
    if (tipo === 'calibre_vecino' || tipo === 'calibre_lejano' || tipo === 'seteo_distinto') {
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

  const seteo = seteoMaquinaDe(entry, timeline, from, size)
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
      const { tipo, value } = tipoDeCausa(c, cfg, seteo)
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
