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
import type { UpstreamLineSnapshot, UpstreamMachineState } from '@/services/shoplogix/types'
import { resolveEffectiveTag } from '@/services/grader/graderPauseTags'

// ── Formato de hora ───────────────────────────────────────────────────────────

/**
 * Formatea ISO string a HH:MM en HORA LOCAL DE PLANTA.
 *
 * Los timestamps Marelec llevan sufijo 'Z' pero son hora local (sin conversión).
 * Usamos getUTCHours/getUTCMinutes para leer la hora "tal cual" del string.
 */
export function fmtTime(iso: string): string {
  const d = new Date(iso)
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
 * El rango arranca 10 min antes del primer bucket con datos y termina 10 min después.
 */
export function resolveAxisWindow(
  buckets: TimelineBucket[],
  shiftWindow: ShiftTimeWindow,
): AxisWindow {
  const firstBucket = buckets[0]
  const lastBucket = buckets[buckets.length - 1]
  const effectiveStartMs = firstBucket
    ? Date.parse(firstBucket.tsMin) - 10 * 60_000
    : Date.parse(shiftWindow.startAt)
  const effectiveEndMs = lastBucket
    ? Date.parse(lastBucket.tsMin) + 10 * 60_000
    : Date.parse(shiftWindow.endAt)

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
): MarkLinesResult {
  const shiftMarkLines = [
    {
      name: `Inicio turno\n${fmtTime(shiftWindow.startAt)}`,
      xAxis: fmtTime(shiftWindow.startAt),
      lineStyle: { color: '#10b981', type: 'solid' as const, width: 1 },
      label: { show: true, formatter: '▶ Inicio', color: '#10b981', fontSize: 9, position: 'insideStartTop' as const },
    },
    {
      name: `Fin turno\n${fmtTime(shiftWindow.endAt)}`,
      xAxis: fmtTime(shiftWindow.endAt),
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
    label: { show: true, formatter: '🔧', color: '#06b6d4', fontSize: 10 },
  }))

  const lotChangeLines: object[] = []
  for (let i = 1; i < activeBuckets.length; i++) {
    const prev = activeBuckets[i - 1]
    const curr = activeBuckets[i]
    if (prev?.lot && curr?.lot && prev.lot !== curr.lot) {
      lotChangeLines.push({
        name: `Lote ${curr.lot}`,
        xAxis: fmtTime(curr.tsMin),
        lineStyle: { color: '#8b5cf6', type: 'dotted' as const, width: 1.5 },
        label: { show: true, formatter: '📦', color: '#8b5cf6', fontSize: 9, position: 'insideEndBottom' as const },
      })
    }
  }

  return { shiftMarkLines, thresholdLines, uploadLines, actionLines, configChangeLines, lotChangeLines }
}

// ── Mark areas (bandas de pausas) ─────────────────────────────────────────────

/**
 * Construye el array de markArea data para ECharts a partir de las pausas del turno.
 * Solo incluye pausas que SOLAPAN con el productionWindow (si está definido).
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

    let areaColor: string
    let labelColor: string
    let labelText: string
    if (effectiveTag) {
      areaColor = effectiveTag.bandFill
      labelColor = effectiveTag.color
      labelText = `${effectiveTag.emoji} ${effectiveTag.label.split(' ')[0]} ${durMin}min${rangeAdjusted ? ' ✏' : ''}`
    } else {
      const opacityByTier = p.tier === 'parada' ? 0.12 : p.tier === 'larga' ? 0.09 : 0.06
      areaColor = `rgba(148,163,184,${opacityByTier})`
      labelColor = '#94a3b8'
      labelText = `⏸ ${durMin}min${rangeAdjusted ? ' ✏' : ''}`
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
