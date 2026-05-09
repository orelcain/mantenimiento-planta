/**
 * Helpers puros para ShiftTimelineView.
 *
 * Extraídos del componente para reducir su tamaño (~1268 → ~950 LOC)
 * y permitir tests unitarios sin React.
 *
 * M11 — Refactor ShiftTimelineView (2026-04-22).
 */

import type { TimelineBucket, MatrixP0Cause, Pause } from '@/services/grader/types'
import type { GraderShiftDoc } from '@/services/grader/graderShifts.service'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import type { SegmentVerdict, VerdictStatus } from '@/services/grader/graderP0Segmentation'
import type { UpstreamLineSnapshot, UpstreamMachineState } from '@/services/shoplogix/types'
import { resolveEffectiveTag } from '@/services/grader/graderPauseTags'

// ── Formato de hora ───────────────────────────────────────────────────────────

/**
 * Formatea un timestamp a HH:MM en HORA LOCAL DE PLANTA.
 *
 * Acepta tres formas de entrada porque el módulo recibe timestamps de
 * orígenes diversos:
 *   - `string` ISO con sufijo 'Z' (Marelec/Shoplogix; no aplicar TZ)
 *   - `Date` ya parseado (resultado de `new Date(iso)` en otro punto)
 *   - `number` epoch ms (clicks de ECharts, agregaciones, etc.)
 *
 * En todos los casos usa `getUTCHours/Minutes` para leer la hora "tal cual"
 * sin convertir TZ — la convención del módulo es Z-as-wall-clock-local.
 */
export function fmtTime(input: string | Date | number): string {
  const d = input instanceof Date ? input : new Date(input)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// ── Colores por causa P0 ──────────────────────────────────────────────────────

/** Mapeo Tailwind → hex aproximado para ECharts (tailwind se resuelve server-side). */
export const CAUSE_HEX: Record<MatrixP0Cause, string> = {
  fuera_de_limites:      '#ef4444', // red-500
  no_leido_fotocelula:   '#f97316', // orange-500
  too_close_too_long:    '#a855f7', // purple-500
  puerta_no_preparada:   '#06b6d4', // cyan-500
  fuera_de_calibre:      '#6366f1', // indigo-500
  fuera_de_calidad:      '#10b981', // emerald-500
  fuera_de_conservacion: '#f59e0b', // amber-500
  fuera_de_producto:     '#92400e', // amber-800
  otro:                  '#71717a', // zinc-500
}

// ── Ventana de producción real ────────────────────────────────────────────────

export interface ProductionWindow {
  startTs: string
  endTs: string
  startMs: number
  endMs: number
  dummyLots: Set<string>
  excludedPieces: number
}

/**
 * Detecta el rango de producción REAL del turno descartando:
 *   1. Lotes dummy (< 1% del total Y ≥ 95% en gate=0)
 *   2. Piezas de calibración/aseo pre y post turno (baja densidad)
 *
 * Returns null cuando no hay buckets con actividad.
 */
export function computeProductionWindow(timelineBuckets: TimelineBucket[]): ProductionWindow | null {
  if (timelineBuckets.length === 0) return null

  // Paso 1 — detectar lotes dummy
  const byLot = new Map<string, { pieces: number; p0: number }>()
  let total = 0
  for (const b of timelineBuckets) {
    if (!b.lot) continue
    const entry = byLot.get(b.lot) ?? { pieces: 0, p0: 0 }
    entry.pieces += b.pieces
    entry.p0 += b.p0Pieces ?? 0
    byLot.set(b.lot, entry)
    total += b.pieces
  }
  if (total === 0) return null
  const dummyLots = new Set<string>()
  for (const [lot, entry] of byLot) {
    const pct = (entry.pieces / total) * 100
    const p0Ratio = entry.pieces > 0 ? entry.p0 / entry.pieces : 0
    if (pct < 1 && p0Ratio >= 0.95) dummyLots.add(lot)
  }
  const cleanBuckets = timelineBuckets.filter((b) => {
    if (!b.lot) return b.pieces > 0
    return !dummyLots.has(b.lot) && b.pieces > 0
  })
  if (cleanBuckets.length === 0) return null

  // Paso 2 — búsqueda de densidad (ventana móvil 5 min)
  const WINDOW_MIN = 5
  const MIN_ACTIVE = 3
  const MIN_PIECES = 20
  const bucketByMs = new Map<number, { pieces: number }>()
  for (const b of cleanBuckets) bucketByMs.set(Date.parse(b.tsMin), { pieces: b.pieces })

  const windowMeetsCriteria = (anchorMs: number, direction: 1 | -1): boolean => {
    let active = 0
    let pieces = 0
    for (let i = 0; i < WINDOW_MIN; i++) {
      const b = bucketByMs.get(anchorMs + direction * i * 60_000)
      if (b && b.pieces > 0) { active++; pieces += b.pieces }
    }
    return active >= MIN_ACTIVE && pieces >= MIN_PIECES
  }

  let startBucket = cleanBuckets[0]!
  for (const b of cleanBuckets) {
    if (windowMeetsCriteria(Date.parse(b.tsMin), 1)) { startBucket = b; break }
  }
  let endBucket = cleanBuckets[cleanBuckets.length - 1]!
  for (let i = cleanBuckets.length - 1; i >= 0; i--) {
    const b = cleanBuckets[i]!
    if (windowMeetsCriteria(Date.parse(b.tsMin), -1)) { endBucket = b; break }
  }

  const startTs = startBucket.tsMin
  const endTs = endBucket.tsMin
  const startMs = Date.parse(startTs)
  const endMs = Date.parse(endTs)
  const excludedPieces = timelineBuckets
    .filter((b) => {
      const ts = Date.parse(b.tsMin)
      return ts < startMs || ts > endMs
    })
    .reduce((s, b) => s + b.pieces, 0)
  return { startTs, endTs, startMs, endMs, dummyLots, excludedPieces }
}

// ── Eje X dinámico ────────────────────────────────────────────────────────────

export interface AxisWindow {
  effectiveStartMs: number
  effectiveEndMs: number
  /** Un label por minuto del rango (HH:MM). */
  lineTimes: string[]
  /** label → índice en lineTimes (para alinear data de buckets). */
  axisIndexByLabel: Map<string, number>
}

/**
 * Computa el rango y la serie de labels minuto a minuto para el eje X del chart.
 * El rango arranca `paddingMin` minutos antes del primer bucket y termina
 * `paddingMin` después del último.
 *
 * Padding por defecto: 2 min (antes era 10). Para turnos cortos como Yal
 * (~90 min con colación de 51) un padding de 10 min representaba ~22% del
 * eje vacío en cada extremo. Con 2 min queda visualmente pegado al rango
 * productivo real, sin perder marca para mark-lines de inicio/fin.
 */
export function resolveAxisWindow(
  buckets: TimelineBucket[],
  shiftWindow: ShiftTimeWindow,
  paddingMin: number = 2,
  outerBounds?: { startMs: number; endMs: number } | null,
): AxisWindow {
  const firstBucket = buckets[0]
  const lastBucket = buckets[buckets.length - 1]
  const padMs = paddingMin * 60_000
  let effectiveStartMs = firstBucket
    ? Date.parse(firstBucket.tsMin) - padMs
    : Date.parse(shiftWindow.startAt)
  let effectiveEndMs = lastBucket
    ? Date.parse(lastBucket.tsMin) + padMs
    : Date.parse(shiftWindow.endAt)

  // outerBounds (típicamente rango SLX completo) extiende el eje para que el
  // Grader se vea como una "isla" dentro del turno upstream. El supervisor
  // identifica visualmente la cobertura Grader vs el turno real → señal para
  // subir más Excel parciales.
  if (outerBounds) {
    if (Number.isFinite(outerBounds.startMs)) effectiveStartMs = Math.min(effectiveStartMs, outerBounds.startMs)
    if (Number.isFinite(outerBounds.endMs))   effectiveEndMs   = Math.max(effectiveEndMs, outerBounds.endMs)
  }

  const maxSlots = 24 * 60
  const totalMinutes = Math.min(maxSlots, Math.max(1, Math.round((effectiveEndMs - effectiveStartMs) / 60_000)))
  const lineTimes: string[] = new Array(totalMinutes + 1)
  const axisIndexByLabel = new Map<string, number>()
  for (let i = 0; i <= totalMinutes; i++) {
    const label = fmtTime(new Date(effectiveStartMs + i * 60_000).toISOString())
    lineTimes[i] = label
    axisIndexByLabel.set(label, i)
  }
  return { effectiveStartMs, effectiveEndMs, lineTimes, axisIndexByLabel }
}

// ── Mark lines del chart ──────────────────────────────────────────────────────

export interface MarkLinesResult {
  shiftMarkLines: object[]
  thresholdLines: object[]
  uploadLines: object[]
  actionLines: object[]
  configChangeLines: object[]
  lotChangeLines: object[]
}

/**
 * Construye todos los arrays de markLine para el chart de ECharts.
 * Ninguna dependencia de React — pura transformación de datos.
 */
export function buildMarkLines(
  shiftDoc: GraderShiftDoc | null,
  shiftWindow: ShiftTimeWindow,
  configSnapshots: GateConfigSnapshot[] | undefined,
  activeBuckets: TimelineBucket[],
  alertThreshold: number,
  criticalThreshold: number,
  productionWindow?: ProductionWindow | null,
): MarkLinesResult {
  // Inicio: usa productionWindow.startTs (primer minuto con producción real)
  // en lugar de shiftWindow.startAt (horario oficial del schedule). Los
  // timestamps Marelec son wall-clock-as-UTC mientras que shiftWindow
  // convierte hora local Chile a ISO UTC — un gap de 3-4h. Marcar la flecha
  // sobre el primer bucket productivo evita ese desfase y refleja cuándo
  // REALMENTE arrancó la línea.
  const startLabelTs = productionWindow?.startTs ?? shiftWindow.startAt
  const endLabelTs = productionWindow?.endTs ?? shiftWindow.endAt
  const shiftMarkLines = [
    {
      name: `Inicio turno\n${fmtTime(startLabelTs)}`,
      xAxis: fmtTime(startLabelTs),
      lineStyle: { color: '#10b981', type: 'solid' as const, width: 1 },
      label: { show: true, formatter: '▶ Inicio', color: '#10b981', fontSize: 9, position: 'insideStartTop' as const },
    },
    {
      name: `Fin turno\n${fmtTime(endLabelTs)}`,
      xAxis: fmtTime(endLabelTs),
      lineStyle: { color: '#6b7280', type: 'solid' as const, width: 1 },
      label: { show: true, formatter: '◀ Fin', color: '#6b7280', fontSize: 9, position: 'insideEndTop' as const },
    },
  ]

  const thresholdLines = [
    {
      yAxis: alertThreshold,
      lineStyle: { color: '#f59e0b', type: 'dashed' as const, width: 1, opacity: 0.5 },
      label: { show: true, formatter: `${alertThreshold}%`, color: '#f59e0b', fontSize: 10, position: 'insideStartTop' as const },
    },
    {
      yAxis: criticalThreshold,
      lineStyle: { color: '#ef4444', type: 'dashed' as const, width: 1, opacity: 0.5 },
      label: { show: true, formatter: `${criticalThreshold}%`, color: '#ef4444', fontSize: 10, position: 'insideStartTop' as const },
    },
  ]

  const uploadLines = (shiftDoc?.uploads ?? []).map(u => ({
    name: `Upload\n${fmtTime(u.at)}`,
    xAxis: fmtTime(u.at),
    lineStyle: { color: '#3b82f6', type: 'dashed' as const, width: 1.5 },
    label: { show: true, formatter: '↑', color: '#3b82f6', fontSize: 10 },
  }))

  const actionLines = (shiftDoc?.actions ?? []).map(a => ({
    name: `Acción\n${fmtTime(a.at)}`,
    xAxis: fmtTime(a.at),
    lineStyle: { color: '#f59e0b', type: 'dashed' as const, width: 1.5 },
    label: { show: true, formatter: '⚙', color: '#f59e0b', fontSize: 10 },
  }))

  const configChangeLines = (configSnapshots ?? []).slice(1).map(s => ({
    name: `Config gates\n${fmtTime(s.at)}`,
    xAxis: fmtTime(s.at),
    lineStyle: { color: '#06b6d4', type: 'dashed' as const, width: 1.5 },
    label: { show: true, formatter: 'Cfg', color: '#06b6d4', fontSize: 9 },
  }))

  const lotChangeLines: object[] = []
  for (let i = 1; i < activeBuckets.length; i++) {
    const prev = activeBuckets[i - 1]
    const curr = activeBuckets[i]
    if (prev?.lot && curr?.lot && prev.lot !== curr.lot) {
      lotChangeLines.push({
        name: `Cambio a Lote ${curr.lot}`,
        xAxis: fmtTime(curr.tsMin),
        lineStyle: { color: '#8b5cf6', type: 'dotted' as const, width: 1.5 },
        label: {
          show: true,
          formatter: curr.lot,
          color: '#a78bfa',
          fontSize: 9,
          fontWeight: 600 as const,
          position: 'insideEndTop' as const,
          backgroundColor: 'rgba(139,92,246,0.15)',
          borderColor: 'rgba(139,92,246,0.4)',
          borderWidth: 1,
          borderRadius: 3,
          padding: [2, 4, 2, 4] as [number, number, number, number],
          distance: 2,
        },
      })
    }
  }

  return { shiftMarkLines, thresholdLines, uploadLines, actionLines, configChangeLines, lotChangeLines }
}

// ── Mark areas (bandas de pausas) ─────────────────────────────────────────────

/**
 * Umbral en minutos a partir del cual una pausa se considera "dominante":
 * su markArea cubre suficiente fracción del timeline como para tapar barras
 * y línea P0% si se renderiza con la opacity normal del tag. A partir de
 * este umbral aplicamos opacity reducida y bordes verticales (markLines)
 * para conservar la indicación temporal sin oclusión visual.
 */
const PAUSE_DOMINANT_THRESHOLD_MIN = 25

/** Reduce la opacity de un color rgba(r,g,b,a) por un factor. */
function dimRgba(rgba: string, factor: number): string {
  const m = rgba.match(/^rgba?\(([^,]+),([^,]+),([^,]+)(?:,([^,]+))?\)$/)
  if (!m) return rgba
  const r = m[1]?.trim()
  const g = m[2]?.trim()
  const b = m[3]?.trim()
  const a = parseFloat(m[4]?.trim() ?? '1')
  return `rgba(${r},${g},${b},${(a * factor).toFixed(3)})`
}

/**
 * Construye el array de markArea data para ECharts a partir de las pausas del turno.
 * Solo incluye pausas que SOLAPAN con el productionWindow (si está definido).
 *
 * Para pausas dominantes (>= 25 min con tag), atenúa la banda al ~30% de su
 * opacity normal — el ojo conserva la pista de "aquí hubo pausa" sin que la
 * banda tape barras y línea P0%. Los bordes nítidos los aporta
 * `buildPauseBoundaryMarkLines` (markLines verticales).
 */
export function buildMarkAreas(
  pauses: Pause[],
  productionWindow: ProductionWindow | null,
): Array<[object, object]> {
  const pausesInWindow = pauses.filter((p) => {
    if (!productionWindow) return true
    const pStart = Date.parse(p.startAt)
    const pEnd = Date.parse(p.endAt)
    return pEnd >= productionWindow.startMs && pStart <= productionWindow.endMs
  })
  return pausesInWindow.map((p) => {
    const tA = fmtTime(p.startAt)
    const tB = fmtTime(p.endAt)
    const durMin = Math.round(p.durationSec / 60)
    const effectiveTag = resolveEffectiveTag(p)
    const rangeAdjusted = !!p.adjustedBy
    const isDominant = durMin >= PAUSE_DOMINANT_THRESHOLD_MIN

    let areaColor: string
    let labelColor: string
    let labelText: string
    if (effectiveTag) {
      // Pausas dominantes: atenuar al 35% para que no tapen el chart.
      // Los markLines verticales aportan bordes nítidos en su lugar.
      areaColor = isDominant ? dimRgba(effectiveTag.bandFill, 0.35) : effectiveTag.bandFill
      labelColor = effectiveTag.color
      labelText = `${effectiveTag.label.split(' ')[0]} ${durMin}min${rangeAdjusted ? ' *' : ''}`
    } else {
      const baseOpacity = p.tier === 'parada' ? 0.12 : p.tier === 'larga' ? 0.09 : 0.06
      const opacity = isDominant ? baseOpacity * 0.4 : baseOpacity
      areaColor = `rgba(148,163,184,${opacity.toFixed(3)})`
      labelColor = '#94a3b8'
      labelText = `${durMin}min${rangeAdjusted ? ' *' : ''}`
    }
    const showLabel = durMin >= 10 || !!effectiveTag || rangeAdjusted
    return [
      {
        name: p.id,
        xAxis: tA,
        itemStyle: { color: areaColor },
        label: { show: showLabel, formatter: labelText, color: labelColor, fontSize: 10, position: 'insideTopRight' as const },
      },
      { xAxis: tB },
    ]
  })
}

/**
 * MarkLines verticales en los bordes de pausas dominantes (>= 25 min con
 * tag o cualquier tier 'parada'). Compensa la atenuación de la banda en
 * `buildMarkAreas`: el ojo identifica el inicio/fin del paro nítidamente
 * sin que la banda tape el chart.
 *
 * Genera 2 markLines por pausa dominante (inicio + fin), con color del tag
 * efectivo y opacity moderada.
 */
export function buildPauseBoundaryMarkLines(
  pauses: Pause[],
  productionWindow: ProductionWindow | null,
): object[] {
  const pausesInWindow = pauses.filter((p) => {
    if (!productionWindow) return true
    const pStart = Date.parse(p.startAt)
    const pEnd = Date.parse(p.endAt)
    return pEnd >= productionWindow.startMs && pStart <= productionWindow.endMs
  })
  const lines: object[] = []
  for (const p of pausesInWindow) {
    const durMin = Math.round(p.durationSec / 60)
    const effectiveTag = resolveEffectiveTag(p)
    const isDominant = durMin >= PAUSE_DOMINANT_THRESHOLD_MIN
    if (!isDominant) continue
    const color = effectiveTag?.color ?? (p.tier === 'parada' ? '#94a3b8' : '#cbd5e1')
    lines.push(
      {
        name: `pause-start-${p.id}`,
        xAxis: fmtTime(p.startAt),
        lineStyle: { color, type: 'dashed' as const, width: 1, opacity: 0.5 },
        symbol: 'none' as const,
      },
      {
        name: `pause-end-${p.id}`,
        xAxis: fmtTime(p.endAt),
        lineStyle: { color, type: 'dashed' as const, width: 1, opacity: 0.5 },
        symbol: 'none' as const,
      },
    )
  }
  return lines
}

// ── Bandas de segmentos por cambio de config ─────────────────────────────────

/**
 * Color de fondo (rgba) de la banda de un segmento, según el verdict del
 * cambio de config que abrió ese segmento.
 *
 * Tintes muy tenues (4-7%) — el objetivo es que el ojo perciba "esto es un
 * segmento distinto" sin tapar barras y línea P0%. Para `insufficient-data`
 * retornamos null → la banda no se pinta (no hay verdict que comunicar).
 *
 * Las opacidades alinean con `verdictColor()` de `graderP0Segmentation`:
 *  - improved → emerald (verde)
 *  - worsened → rose (rojo)
 *  - neutral → slate (gris)
 */
export function verdictBandColor(status: VerdictStatus): string | null {
  switch (status) {
    case 'improved':          return 'rgba(16, 185, 129, 0.07)'  // emerald-500 7%
    case 'worsened':          return 'rgba(244, 63, 94, 0.07)'   // rose-500 7%
    case 'neutral':           return 'rgba(148, 163, 184, 0.04)' // slate-400 4%
    case 'insufficient-data': return null
  }
}

/**
 * Construye los markArea para resaltar los SEGMENTOS del turno entre cambios
 * manuales de config de gates. Cada banda cubre el rango `[snap.at, nextSnap.at)`
 * (o hasta el fin del turno) y se tinta según el verdict del segmento (si lo hay).
 *
 * Útil para que el ojo perciba a qué segmento del timeline corresponde cada
 * P0% antes/después que muestra `GateChangeImpactCard`.
 *
 * Reglas:
 *  - Snapshots `synthetic` se ignoran (representan config inicial inferida).
 *  - Si no hay verdict para el snapshot → no se tinta (puede haberse perdido
 *    timelineBuckets en el Map, mejor no mentir).
 *  - Si el segmento queda fuera de `productionWindow` → se descarta.
 *  - Si `tA === tB` (segmento de duración 0) → se descarta para evitar bandas
 *    invisibles que el tooltip pueda activar accidentalmente.
 *  - Para `insufficient-data` → no se pinta (verdictBandColor retorna null).
 */
export function buildConfigSegmentMarkAreas(
  configSnapshots: GateConfigSnapshot[] | undefined,
  verdicts: Map<string, SegmentVerdict>,
  productionWindow: ProductionWindow | null,
): Array<[object, object]> {
  if (!configSnapshots || configSnapshots.length === 0) return []
  if (!productionWindow) return []

  const manualSnaps = configSnapshots
    .filter((s) => !s.synthetic)
    .sort((a, b) => a.at.localeCompare(b.at))

  if (manualSnaps.length === 0) return []

  const productionEndIso = new Date(productionWindow.endMs).toISOString()
  const result: Array<[object, object]> = []

  for (let i = 0; i < manualSnaps.length; i++) {
    const snap = manualSnaps[i]!
    const verdict = verdicts.get(snap.id)
    if (!verdict) continue

    const color = verdictBandColor(verdict.status)
    if (!color) continue

    const startIso = snap.at
    const endIso = manualSnaps[i + 1]?.at ?? productionEndIso

    const startMs = Date.parse(startIso)
    const endMs = Date.parse(endIso)
    if (endMs < productionWindow.startMs || startMs > productionWindow.endMs) continue

    const tA = fmtTime(startIso)
    const tB = fmtTime(endIso)
    if (tA === tB) continue

    result.push([
      { xAxis: tA, itemStyle: { color, borderWidth: 0 } },
      { xAxis: tB },
    ])
  }

  return result
}

// ── Bandas Baader sobre el sub-grid del timeline Grader ────────────────────────

export interface BaaderLane {
  /** Nombre canónico de la máquina (key del yAxis category, ej: "Evisceradora 1") */
  machineName: string
}

export interface BaaderMarkerBand {
  /** name único para tooltip/click (ej: "E1__1700000000000") */
  name: string
  machineName: string
  /** Etiqueta tA en HH:MM, alineada al lineTimes del axis principal */
  tA: string
  /** Etiqueta tB en HH:MM */
  tB: string
  /** Color de relleno de la banda (con transparencia) */
  fill: string
  /** Color del borde (más sólido) */
  stroke: string
  /** Tipo de estado: downtime/break/setup (uptime se omite — es el fondo) */
  stateType: Exclude<UpstreamMachineState['type'], 'uptime'>
  /** Texto de la razón Shoplogix ("COLACION", "Limpieza ducto", etc.) */
  reason: string
  /** Duración en minutos enteros para tooltip */
  durationMin: number
}

export interface BaaderTimelineMarkers {
  /** Lista ordenada de lanes (orden = orden visual de yAxis: machine[0] arriba) */
  lanes: BaaderLane[]
  /** Bandas a pintar como markArea — la lane se resuelve por machineName */
  bands: BaaderMarkerBand[]
}

/**
 * Construye los marcadores de paros Baader para pintar sobre el timeline del
 * Grader (sub-grid debajo del chart principal).
 *
 * Filtra:
 *   - Estados type === 'uptime' (es el "fondo" — solo importan los paros)
 *   - Bandas fuera de productionWindow (se descartan completas si no solapan)
 *
 * Recorta tA/tB al rango del axis (lineTimes[0] / lineTimes[N-1]) para que
 * markArea no intente pintar fuera del eje category.
 */
export function buildBaaderTimelineMarkers(
  snapshot: UpstreamLineSnapshot | null | undefined,
  lineTimes: string[],
  productionWindow: ProductionWindow | null,
): BaaderTimelineMarkers {
  if (!snapshot || lineTimes.length === 0) {
    return { lanes: [], bands: [] }
  }
  const axisStartLabel = lineTimes[0]!
  const axisEndLabel = lineTimes[lineTimes.length - 1]!
  // Construye Set para O(1) lookup de labels válidos en el axis
  const validLabels = new Set(lineTimes)

  const lanes: BaaderLane[] = snapshot.machines.map((m) => ({
    machineName: m.machineName,
  }))

  const bands: BaaderMarkerBand[] = []
  for (const machine of snapshot.machines) {
    for (const state of machine.states) {
      if (state.type === 'uptime') continue
      const startMs = state.startAt.getTime()
      const endMs = state.endAt.getTime()
      // Filtrar fuera de la production window
      if (productionWindow) {
        if (endMs < productionWindow.startMs) continue
        if (startMs > productionWindow.endMs) continue
      }
      // Recortar a la ventana del axis si la banda excede sus extremos
      const tStartIso = state.startAt.toISOString()
      const tEndIso = state.endAt.toISOString()
      let tA = fmtTime(tStartIso)
      let tB = fmtTime(tEndIso)
      if (!validLabels.has(tA)) tA = axisStartLabel
      if (!validLabels.has(tB)) tB = axisEndLabel
      // Si tA === tB tras recorte (banda colapsada), skip
      if (tA === tB) continue

      // Color: usa el de Shoplogix como base, agrega transparencia para fill
      const baseColor = state.color || '#94a3b8'
      const fill = colorWithAlpha(baseColor, 0.55)
      const stroke = colorWithAlpha(baseColor, 0.9)
      const durationMin = Math.max(1, Math.round(state.durationSec / 60))

      bands.push({
        name: `${machine.machineid}__${startMs}`,
        machineName: machine.machineName,
        tA,
        tB,
        fill,
        stroke,
        stateType: state.type,
        reason: state.reason || state.name || '—',
        durationMin,
      })
    }
  }

  return { lanes, bands }
}

// ── Scatter: correlación Baader ritmo vs Grader P0% ──────────────────────────

/**
 * Punto del scatter de correlación upstream.
 * Un punto = un intervalo de 5 min donde hay datos de AMBOS sistemas.
 */
export interface ScatterPoint {
  /** Timestamp inicio del intervalo (ms UTC — wall-clock Chile) */
  tsMs: number;
  /** Ciclos Baader en el intervalo (0..∞) */
  baaderCycles: number;
  /** Ratio Baader (cycles / expectedCycles, 0..1+) — usado como tamaño del punto */
  baaderRatio: number;
  /** P0% del Grader en el mismo intervalo (0..1) */
  graderP0Pct: number;
  /** Piezas totales del Grader en el intervalo (para ponderar confianza del punto) */
  graderPieces: number;
  /** Color del intervalo Baader ("green"|"yellow"|"red"|"gray") */
  baaderColor: string;
}

export interface ScatterSeriesData {
  machineid: string;
  machineName: string;
  points: ScatterPoint[];
  /** Regresión lineal simple: y = slope * x + intercept (si hay ≥ 3 puntos con datos) */
  regression: { slope: number; intercept: number; r2: number } | null;
}

/**
 * Construye los datos del scatter de correlación entre el ritmo de cada Baader
 * y el P0% del Grader, alineados temporalmente en ventanas de 5 minutos.
 *
 * Convención de timestamps: ambos sistemas usan UTC-as-wall-clock (hora Chile
 * almacenada sin conversión de TZ). La comparación numérica de getTime() es
 * válida porque ambos usan la misma convención.
 *
 * @param snapshot   UpstreamLineSnapshot (las 3 Evisceradoras)
 * @param buckets    TimelineBucket[] por minuto del turno Grader
 */
export function buildScatterData(
  snapshot: UpstreamLineSnapshot,
  buckets: TimelineBucket[],
): ScatterSeriesData[] {
  if (buckets.length === 0 || snapshot.machines.length === 0) return []

  // Pre-index: bucket por timestamp de inicio de minuto (ms) para O(1) lookup
  const bucketByTs = new Map<number, TimelineBucket>()
  for (const b of buckets) {
    const ms = new Date(b.tsMin).getTime()
    bucketByTs.set(ms, b)
  }

  const result: ScatterSeriesData[] = []

  for (const machine of snapshot.machines) {
    const points: ScatterPoint[] = []

    for (const interval of machine.intervals) {
      const startMs = interval.startAt.getTime()
      const endMs   = interval.endAt.getTime()
      const spanMs  = endMs - startMs  // normalmente 300_000 (5 min)

      // Agregar los buckets del Grader que caen dentro del intervalo Baader
      let totalPieces = 0
      let totalP0     = 0

      // Recorre minutos dentro del span del intervalo
      for (let tMs = startMs; tMs < endMs; tMs += 60_000) {
        const b = bucketByTs.get(tMs)
        if (!b) continue
        totalPieces += b.pieces
        totalP0     += b.p0Pieces
      }

      // Solo incluir puntos con ambos sistemas activos
      if (totalPieces < 1) continue

      const graderP0Pct = totalP0 / totalPieces

      points.push({
        tsMs:         startMs,
        baaderCycles: interval.cycles,
        baaderRatio:  interval.ratio,
        graderP0Pct,
        graderPieces: totalPieces,
        baaderColor:  interval.color,
        // Nota: también guardamos spanMs implícitamente via endAt-startAt
        // para normalizar ciclos/min si fuera necesario en el futuro.
      })

      void spanMs  // suprimir warning TS de variable no usada
    }

    // Regresión lineal simple (Ordinary Least Squares)
    // y = graderP0Pct * 100, x = baaderCycles
    const usable = points.filter(p => p.baaderCycles > 0 && p.graderPieces >= 5)
    const regression = usable.length >= 3
      ? (() => {
          const n  = usable.length
          const sx = usable.reduce((a, p) => a + p.baaderCycles, 0)
          const sy = usable.reduce((a, p) => a + p.graderP0Pct * 100, 0)
          const sx2 = usable.reduce((a, p) => a + p.baaderCycles ** 2, 0)
          const sxy = usable.reduce((a, p) => a + p.baaderCycles * p.graderP0Pct * 100, 0)
          const denom = n * sx2 - sx ** 2
          if (denom === 0) return null
          const slope     = (n * sxy - sx * sy) / denom
          const intercept = (sy - slope * sx) / n
          // R² — proporción de varianza explicada
          const yMean = sy / n
          const ssTot  = usable.reduce((a, p) => a + (p.graderP0Pct * 100 - yMean) ** 2, 0)
          const ssRes  = usable.reduce((a, p) => a + (p.graderP0Pct * 100 - (slope * p.baaderCycles + intercept)) ** 2, 0)
          const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0
          return { slope, intercept, r2 }
        })()
      : null

    result.push({ machineid: machine.machineid, machineName: machine.machineName, points, regression })
  }

  return result
}

// ── Scatter analytics: zona crítica + mediana + magnitud de pendiente ─────────

/**
 * Filtra puntos "usables" de una serie de scatter — puntos con datos
 * significativos en ambos sistemas. Usado por la regresión y los KPIs.
 */
export function usableScatterPoints(points: ScatterPoint[]): ScatterPoint[] {
  return points.filter(p => p.baaderCycles > 0 && p.graderPieces >= 5)
}

/** Mediana clásica de un array numérico. Vacío → 0. */
export function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

/**
 * Calcula la mediana del ritmo Baader (ciclos/5min) sobre todos los puntos
 * usables de TODAS las máquinas — ritmo "típico" de la línea, no de una máquina aislada.
 */
export function scatterBaaderMedian(seriesData: ScatterSeriesData[]): number {
  const allCycles = seriesData.flatMap(s => usableScatterPoints(s.points).map(p => p.baaderCycles))
  return median(allCycles)
}

/**
 * Cuenta puntos en zona crítica del scatter:
 *   P0% > criticalP0Pct  Y  baaderCycles < baaderMedian
 *
 * Cuadrante inferior-derecho semánticamente: alto P0 + baja producción upstream.
 *
 * @returns { critical, total, pct } — total y % sobre puntos usables
 */
export function scatterCriticalZone(
  seriesData: ScatterSeriesData[],
  criticalP0Pct: number,
  baaderMedian: number,
): { critical: number; total: number; pct: number } {
  let critical = 0
  let total = 0
  seriesData.forEach((s) => {
    usableScatterPoints(s.points).forEach((p) => {
      total++
      if (p.graderP0Pct * 100 > criticalP0Pct && p.baaderCycles < baaderMedian) {
        critical++
      }
    })
  })
  return { critical, total, pct: total > 0 ? (critical / total) * 100 : 0 }
}

/**
 * Pendiente promedio (ponderada por nº puntos) de las regresiones de las series.
 * Convierte la magnitud a "puntos P0% por -10 ciclos/5min" — operacional para
 * el operador en lugar de un slope académico.
 */
export function scatterSlopeMagnitude(
  seriesData: ScatterSeriesData[],
): {
  avgSlope: number
  /** Cambio de P0% (en puntos %) cuando el ritmo Baader cae 10 ciclos/5min. Signo positivo = sube P0%. */
  deltaP0_per_minus10cycles: number
  direction: 'neg' | 'pos' | 'flat'
} | null {
  const withSlope = seriesData
    .map(s => ({
      slope: s.regression?.slope ?? null,
      pts: usableScatterPoints(s.points).length,
    }))
    .filter(x => x.slope != null && x.pts >= 3) as { slope: number; pts: number }[]

  if (withSlope.length === 0) return null
  const totalPts = withSlope.reduce((a, x) => a + x.pts, 0)
  if (totalPts === 0) return null
  const wSum = withSlope.reduce((a, x) => a + x.slope * x.pts, 0)
  const avgSlope = wSum / totalPts
  const deltaP0_per_minus10cycles = -avgSlope * 10
  return {
    avgSlope,
    deltaP0_per_minus10cycles,
    direction: avgSlope < -0.005 ? 'neg' : avgSlope > 0.005 ? 'pos' : 'flat',
  }
}

/** Convierte "#rrggbb" o "rgba(...)" a rgba con alpha custom (best-effort). */
function colorWithAlpha(color: string, alpha: number): string {
  const c = color.trim()
  if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
    let r = 0, g = 0, b = 0
    if (c.length === 7) {
      r = parseInt(c.slice(1, 3), 16)
      g = parseInt(c.slice(3, 5), 16)
      b = parseInt(c.slice(5, 7), 16)
    } else {
      r = parseInt(c[1]! + c[1]!, 16)
      g = parseInt(c[2]! + c[2]!, 16)
      b = parseInt(c[3]! + c[3]!, 16)
    }
    return `rgba(${r},${g},${b},${alpha})`
  }
  // rgba(...) o rgb(...) — devuelve tal cual; el caller absorbe el alpha del original
  return c
}
