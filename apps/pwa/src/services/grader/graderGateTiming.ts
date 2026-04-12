/**
 * Cálculos físicos de timing por compuerta (iter 19 / P0.5):
 *
 *  1. `computeGateTimingSignals` — semáforo de tiempo de reacción por gate
 *     basado en la distancia física desde el Detection Eye + velocidad del
 *     Sorting Belt. Devuelve por cada gate: tiempo disponible, tiempo
 *     requerido para apertura+reset del flipper, margen, y severidad
 *     (ok / warn / critical) que se renderiza como columna semáforo.
 *
 *  2. `computeOptimalGateAssignment` — heurística para sugerir qué calibre
 *     va a qué gate específica según demanda (gateBalance) y tiempo de
 *     reacción físico (gates más cercanas tienen más tolerancia → reciben
 *     calibres de alta demanda). NO reemplaza `gateSwapSuggestions` del
 *     analytics; es una vista complementaria "asignación ideal desde cero".
 *
 * Ambas funciones son puras: reciben datos y devuelven resultados. No
 * tocan Firestore ni mutan inputs.
 */

import type {
  CalibreRange,
  GateAdvancedStats,
  GateAssignment,
  GateBalanceInsight,
  GraderPhysicalConfig,
  GraderQuality,
} from './types'

// ── Tipos públicos ──────────────────────────────────────────────────────────

export type GateTimingStatus = 'ok' | 'warn' | 'critical' | 'unknown'

export interface GateTimingSignal {
  gateNumber: number
  /** Distancia sensor → flipper (metros) */
  distanceMeters: number
  /** Velocidad de cinta usada para el cálculo (m/s) */
  beltSpeedMps: number
  /**
   * Tiempo disponible entre que el sensor detecta el pez y el flipper
   * debe estar accionado: `distanceMeters / beltSpeedMps` en segundos.
   */
  tAvailableSec: number
  /**
   * Tiempo requerido estimado: largo del pez dividido por velocidad de
   * cinta (duración del cruce sobre el flipper) más el tiempo de reset
   * del cilindro neumático del flipper.
   */
  tRequiredSec: number
  /** Margen = tAvailableSec - tRequiredSec. Positivo = bueno. */
  marginSec: number
  status: GateTimingStatus
  /** Texto breve para tooltip/tabla */
  hint: string
}

export interface OptimalGateAssignment {
  gateNumber: number
  /** Asignación actual (del `gates` state) */
  currentCalibre: CalibreRange | null
  currentQuality: GraderQuality | null
  /** Sugerencia óptima (puede coincidir con la actual) */
  suggestedCalibre: CalibreRange | null
  suggestedQuality: GraderQuality | null
  /** True si coinciden current y suggested */
  isMatch: boolean
  /** Razón corta que explica la sugerencia */
  reason: string
  /** Score físico (más alto = mejor timing) del gate — 0..100 */
  timingScore: number
  /** Demanda % del calibre sugerido (0..100). null si no aplica */
  demandPct: number | null
}

// ── Constantes / umbrales ───────────────────────────────────────────────────

/**
 * Umbrales de margen para el semáforo. Los valores están calibrados sobre
 * los datos de la MS4/12 con Sorting Belt @ 1.28 m/s:
 *  - Gate 1 @ 1.30 m → tAvailable 1.02 s, tRequired ~0.95 s, margin ~0.07 s
 *  - Gate 6 @ 8.15 m → tAvailable 6.37 s, margin ~5.4 s (holgado)
 * Los gates cercanos al sensor son los que quedan en warn/critical a vel. alta.
 */
const MARGIN_OK_SEC = 0.5
const MARGIN_WARN_SEC = 0.15

/** Reset del cilindro neumático — mismo valor que insight #18 */
const DEFAULT_FLIPPER_RESET_SEC = 0.45

// ── 1. Semáforo de timing por gate ──────────────────────────────────────────

/**
 * Calcula el semáforo de tiempo de reacción para cada gate física.
 *
 * Devuelve una entrada por cada `flipperPositions` en `physicalConfig`. Si
 * no hay `physicalConfig` o no hay flippers definidos, devuelve array vacío
 * (el tab debe ocultar la card).
 */
export function computeGateTimingSignals(
  physicalConfig: GraderPhysicalConfig | undefined,
  gates: GateAssignment[],
): GateTimingSignal[] {
  if (!physicalConfig || !physicalConfig.flipperPositions || physicalConfig.flipperPositions.length === 0) {
    return []
  }
  const mainBelt = physicalConfig.belts.find((b) => b.beltId === 'main')
  const beltSpeedMps = mainBelt?.speedMps ?? 1.28
  if (beltSpeedMps <= 0) return []

  const salmonLenM = physicalConfig.avgSalmonLengthCm / 100
  const tSalmonPass = salmonLenM / beltSpeedMps
  const tReset = physicalConfig.flipperResetTimeSec ?? DEFAULT_FLIPPER_RESET_SEC
  const tRequired = tSalmonPass + tReset

  const gateMap = new Map<number, GateAssignment>()
  for (const g of gates) gateMap.set(g.gateNumber, g)

  return physicalConfig.flipperPositions
    .slice()
    .sort((a, b) => a.gateNumber - b.gateNumber)
    .map((fp) => {
      const tAvailable = fp.distanceFromSensorMeters / beltSpeedMps
      const margin = tAvailable - tRequired
      const status: GateTimingStatus =
        margin >= MARGIN_OK_SEC ? 'ok' :
        margin >= MARGIN_WARN_SEC ? 'warn' :
        'critical'
      const assignedGate = gateMap.get(fp.gateNumber)
      const active = assignedGate?.active ?? true
      const hintParts = [
        `${fp.distanceFromSensorMeters.toFixed(2)} m @ ${beltSpeedMps.toFixed(2)} m/s`,
        `${tAvailable.toFixed(2)}s disponibles − ${tRequired.toFixed(2)}s requeridos`,
        `margen ${margin >= 0 ? '+' : ''}${margin.toFixed(2)}s`,
      ]
      if (!active) hintParts.push('gate inactiva')
      return {
        gateNumber: fp.gateNumber,
        distanceMeters: fp.distanceFromSensorMeters,
        beltSpeedMps,
        tAvailableSec: round2(tAvailable),
        tRequiredSec: round2(tRequired),
        marginSec: round2(margin),
        status: active ? status : 'unknown',
        hint: hintParts.join(' · '),
      }
    })
}

// ── 2. Asignación óptima ─────────────────────────────────────────────────────

/**
 * Sugiere una asignación óptima de calibres a gates físicos combinando:
 *  - demanda real de cada calibre (`gateBalance.demandPct` e `idealGates`)
 *  - score físico de cada gate (tiempo de reacción disponible)
 *  - asignación actual desde `gates` (para marcar match / mismatch)
 *
 * Heurística:
 *  1. Ordenar gates por timing score descendente (mejor timing primero).
 *  2. Ordenar calibres por demanda descendente.
 *  3. Asignar greedy: cada calibre toma `idealGates` entradas empezando por
 *     los gates con mejor timing.
 *  4. Los gates sobrantes quedan sin sugerencia (null → "desactivar").
 *
 * No es la solución óptima global (ignora que el flujo es unidireccional),
 * pero es una baseline útil para comparar con la asignación actual.
 */
export function computeOptimalGateAssignment(
  gateBalance: GateBalanceInsight[],
  gateAdvancedStats: GateAdvancedStats[],
  timingSignals: GateTimingSignal[],
  gates: GateAssignment[],
): OptimalGateAssignment[] {
  if (gateBalance.length === 0 || timingSignals.length === 0) return []

  // Current assignment por gate
  const currentByGate = new Map<number, GateAssignment>()
  for (const g of gates) currentByGate.set(g.gateNumber, g)

  // Score físico 0..100 (mejor = más margen)
  const marginMin = Math.min(...timingSignals.map((t) => t.marginSec))
  const marginMax = Math.max(...timingSignals.map((t) => t.marginSec))
  const marginRange = Math.max(0.01, marginMax - marginMin)

  const scoredGates = timingSignals
    .map((t) => ({
      gateNumber: t.gateNumber,
      timingScore: Math.round(((t.marginSec - marginMin) / marginRange) * 100),
      marginSec: t.marginSec,
    }))
    .sort((a, b) => b.timingScore - a.timingScore)

  // Calibres ordenados por demanda descendente
  const sortedCalibres = gateBalance
    .slice()
    .filter((b) => b.demandPct > 0 && b.idealGates > 0)
    .sort((a, b) => b.demandPct - a.demandPct)

  // Quality dominante por calibre (desde gateAdvancedStats)
  const qualityByCalibre = new Map<string, GraderQuality>()
  for (const stat of gateAdvancedStats) {
    if (!qualityByCalibre.has(stat.assignedCalibre)) {
      qualityByCalibre.set(stat.assignedCalibre, stat.assignedQuality)
    }
  }

  // Asignación greedy
  const suggestion = new Map<number, { calibre: CalibreRange; quality: GraderQuality | null; demandPct: number }>()
  let gateIdx = 0
  for (const cal of sortedCalibres) {
    const take = Math.min(cal.idealGates, scoredGates.length - gateIdx)
    for (let i = 0; i < take; i++) {
      const sg = scoredGates[gateIdx++]
      if (!sg) break
      suggestion.set(sg.gateNumber, {
        calibre: cal.calibre,
        quality: qualityByCalibre.get(cal.calibre) ?? null,
        demandPct: cal.demandPct,
      })
    }
    if (gateIdx >= scoredGates.length) break
  }

  // Output ordenado por gateNumber para UI
  return scoredGates
    .slice()
    .sort((a, b) => a.gateNumber - b.gateNumber)
    .map((sg) => {
      const current = currentByGate.get(sg.gateNumber)
      const sug = suggestion.get(sg.gateNumber)
      const currentCalibre = current?.assignedCalibre ?? null
      const currentQuality = current?.assignedQuality ?? null
      const suggestedCalibre = sug?.calibre ?? null
      const suggestedQuality = sug?.quality ?? currentQuality
      const isMatch =
        suggestedCalibre != null &&
        currentCalibre === suggestedCalibre
      let reason: string
      if (suggestedCalibre === null) {
        reason = `sin demanda suficiente — considerar desactivar esta gate`
      } else if (isMatch) {
        reason = `coincide con asignación actual (${sg.timingScore}/100 timing)`
      } else {
        reason = `alto timing (${sg.timingScore}/100) → reasignar a ${suggestedCalibre}${sug?.demandPct ? ` (${sug.demandPct.toFixed(1)}% demanda)` : ''}`
      }
      return {
        gateNumber: sg.gateNumber,
        currentCalibre,
        currentQuality,
        suggestedCalibre,
        suggestedQuality,
        isMatch,
        reason,
        timingScore: sg.timingScore,
        demandPct: sug?.demandPct ?? null,
      }
    })
}

// ── Helper ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
