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
  PneumaticConfig,
} from './types'
import { getGradingBelt } from './graderBeltHelpers'
import { TIMING_THRESHOLDS } from './graderThresholds'

// ── Tipos públicos ──────────────────────────────────────────────────────────

export type GateTimingStatus = 'ok' | 'warn' | 'critical' | 'unknown'

/** Desglose del tiempo de respuesta neumático por gate */
export interface PneumaticBreakdown {
  /** Tiempo conmutación solenoide (s) */
  valveSwitchSec: number
  /** Tiempo carga línea neumática (s) — depende de longitud */
  lineChargeSec: number
  /** Tiempo carrera cilindro (s) — depende de presión efectiva */
  cylinderStrokeSec: number
  /** Suma de los 3 componentes (s) */
  totalResponseSec: number
  /** Presión disponible en el cilindro después de pérdidas (bar) */
  effectivePressureBar: number
  /** Caída de presión en la línea (bar) */
  pressureDropBar: number
  /** Largo de línea neumática usado (m) */
  lineLengthM: number
}

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
  /** Desglose neumático per-gate (null si no hay pneumaticConfig) */
  pneumaticBreakdown?: PneumaticBreakdown
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

// ── Constantes / umbrales por defecto ───────────────────────────────────────

/**
 * Umbrales de margen para el semáforo. Ahora configurables vía errorThresholds,
 * estos son solo los defaults.
 *  - Gate 1 @ 1.30 m → tAvailable 1.02 s, tRequired ~0.95 s, margin ~0.07 s
 *  - Gate 6 @ 8.15 m → tAvailable 6.37 s, margin ~5.4 s (holgado)
 */
const DEFAULT_MARGIN_OK_SEC = TIMING_THRESHOLDS.marginOkSec
const DEFAULT_MARGIN_WARN_SEC = TIMING_THRESHOLDS.marginWarnSec

/** Fallback plano cuando no hay pneumaticConfig (backward compatible) */
const DEFAULT_FLIPPER_RESET_SEC = 0.45

/** Defaults neumáticos para la MS4/12 (S/N 3943) */
export const DEFAULT_PNEUMATIC_CONFIG: PneumaticConfig = {
  supplyPressureBar: 6.0,
  valveSwitchTimeSec: 0.035,
  tubeInnerDiameterMm: 4,       // 6mm OD = 4mm ID (PU estándar)
  cylinderBoreMm: 32,
  cylinderStrokeMm: 50,
  valveCv: 0.7,
  cylinderEfficiency: 0.85,
  gateLineLengthsM: {
    1: 2.0, 2: 3.5, 3: 5.0, 4: 6.5, 5: 8.0, 6: 9.5,
    7: 11.0, 8: 12.5, 9: 14.0, 10: 15.5, 11: 17.0, 12: 18.5,
  },
}

/** Opciones para parametrizar umbrales del semáforo */
export interface TimingThresholdOverrides {
  marginOkSec?: number
  marginWarnSec?: number
}

// ── Funciones puras de física neumática ────────────────────────────────────

/**
 * Volumen interno de un tubo neumático.
 * @param lengthM — largo del tubo en metros
 * @param innerDiamMm — diámetro INTERNO en mm
 * @returns volumen en m³
 */
export function computeTubeVolume(lengthM: number, innerDiamMm: number): number {
  const radiusM = innerDiamMm / 2 / 1000
  return Math.PI * radiusM * radiusM * lengthM
}

/**
 * Caída de presión en una línea neumática (Hagen-Poiseuille simplificado).
 *
 * Para aire comprimido en tubos lisos (PU/PE) con flujo laminar/transicional.
 * Fórmula empírica calibrada para tuberías de planta (<20m, 4-8mm ID, 4-8 bar):
 *
 *   ΔP = k × L / d⁴
 *
 * Donde k incluye viscosidad del aire, densidad y caudal estimado típico
 * para un cilindro de flipper de grader (~0.5 L/ciclo a 6 bar).
 *
 * @returns caída de presión en bar
 */
export function computeLinePressureDrop(
  lengthM: number,
  innerDiamMm: number,
  supplyPressureBar: number,
): number {
  // Viscosidad dinámica del aire a 20°C: 1.81e-5 Pa·s
  // Caudal típico estimado para cilindro 32mm bore, 50mm stroke: ~0.04 L/ciclo ≈ 0.7 L/min (ANR)
  // Flujo promedio durante la carga: Q_avg ≈ Cv * sqrt(P) * factores
  const mu = 1.81e-5  // Pa·s
  const rhoAir = 1.225 * (supplyPressureBar / 1.013)  // kg/m³ a presión de trabajo
  const dM = innerDiamMm / 1000  // m
  const areaM2 = Math.PI * (dM / 2) * (dM / 2)

  // Estimación de velocidad media del aire en el tubo durante la carga
  // Cilindro 32mm bore, 50mm stroke = ~40cm³ = 0.00004 m³
  // A presión de suministro, volumen ANR ≈ vol * P/P_atm
  const cylVolM3 = Math.PI * (0.032 / 2) ** 2 * 0.05  // default 32mm bore, 50mm stroke
  const chargeTimeEst = 0.1  // estimación gruesa: 100ms para la carga
  const qM3s = cylVolM3 / chargeTimeEst  // caudal medio m³/s

  const velocity = qM3s / areaM2  // m/s en el tubo

  // Reynolds para verificar régimen (informativo)
  const Re = rhoAir * velocity * dM / mu

  // Darcy-Weisbach: ΔP = f × (L/d) × (ρv²/2)
  // Factor de fricción para tubo liso: f ≈ 64/Re (laminar) o ≈ 0.316/Re^0.25 (turbulento)
  const f = Re < 2300
    ? 64 / Math.max(Re, 1)
    : 0.316 / Math.pow(Math.max(Re, 1), 0.25)

  const deltaPaPascal = f * (lengthM / dM) * (rhoAir * velocity * velocity / 2)
  const deltaBar = deltaPaPascal / 1e5  // Pa → bar

  // Clamp: no puede ser mayor que la presión de suministro
  return Math.min(deltaBar, supplyPressureBar * 0.8)
}

/**
 * Tiempo para cargar la línea neumática desde manifold hasta el cilindro.
 *
 * Modelo: t = V_tubo / Q_efectivo
 * Q_efectivo se deriva del Cv de la válvula y la presión disponible.
 *
 * @returns tiempo en segundos
 */
export function computeLineChargeTime(
  lengthM: number,
  innerDiamMm: number,
  supplyPressureBar: number,
  valveCv: number,
): number {
  const tubeVolM3 = computeTubeVolume(lengthM, innerDiamMm)

  // Caudal efectivo de la válvula (simplificado):
  // Q (m³/s) = Cv × Kv_factor × √(ΔP)
  // Kv_factor ≈ 2.4e-5 m³/s por Cv unitario a 1 bar ΔP (derivado de norma ANSI/ISA)
  const KV_FACTOR = 2.4e-5
  const deltaP = Math.max(supplyPressureBar - 1.013, 0.5)  // presión diferencial vs atmósfera
  const qEffective = valveCv * KV_FACTOR * Math.sqrt(deltaP)

  if (qEffective <= 0) return 1.0  // fallback conservador

  // Volumen del tubo a presión atmosférica (expandido)
  const tubeVolAtPressure = tubeVolM3 * (supplyPressureBar / 1.013)

  return tubeVolAtPressure / qEffective
}

/**
 * Tiempo de carrera del cilindro neumático.
 *
 * Modelo simplificado: el cilindro es limitado por flujo, no por inercia
 * (masa del flipper es baja). La velocidad del pistón depende del caudal
 * disponible y el área del pistón.
 *
 * t_stroke = stroke / v_piston
 * v_piston = Q_available / A_piston
 *
 * @returns tiempo en segundos
 */
export function computeCylinderStrokeTime(
  boreMm: number,
  strokeMm: number,
  effectivePressureBar: number,
  valveCv: number,
  efficiency: number = 0.85,
): number {
  const boreM = boreMm / 1000
  const strokeM = strokeMm / 1000
  const aPiston = Math.PI * (boreM / 2) * (boreM / 2)

  // Caudal disponible al cilindro
  const KV_FACTOR = 2.4e-5
  const deltaP = Math.max(effectivePressureBar - 1.013, 0.1)
  const qAvailable = valveCv * KV_FACTOR * Math.sqrt(deltaP) * efficiency

  if (qAvailable <= 0) return 0.5  // fallback

  const vPiston = qAvailable / aPiston

  return Math.max(strokeM / vPiston, 0.005)  // mínimo 5ms
}

/**
 * Calcula el tiempo de respuesta neumático completo para un gate específico.
 * Combina: t_válvula + t_carga_línea + t_carrera_cilindro
 */
export function computePerGateResponseTime(
  gateNumber: number,
  pneumConfig: PneumaticConfig,
): PneumaticBreakdown {
  const lineLengthM = pneumConfig.gateLineLengthsM[gateNumber]
    ?? (1.5 + gateNumber * 1.5)  // estimación lineal si no hay dato

  const pressureDrop = computeLinePressureDrop(
    lineLengthM,
    pneumConfig.tubeInnerDiameterMm,
    pneumConfig.supplyPressureBar,
  )
  const effectivePressure = Math.max(pneumConfig.supplyPressureBar - pressureDrop, 1.0)

  const lineCharge = computeLineChargeTime(
    lineLengthM,
    pneumConfig.tubeInnerDiameterMm,
    pneumConfig.supplyPressureBar,
    pneumConfig.valveCv,
  )

  const cylinderStroke = computeCylinderStrokeTime(
    pneumConfig.cylinderBoreMm,
    pneumConfig.cylinderStrokeMm,
    effectivePressure,
    pneumConfig.valveCv,
    pneumConfig.cylinderEfficiency ?? 0.85,
  )

  const total = pneumConfig.valveSwitchTimeSec + lineCharge + cylinderStroke

  return {
    valveSwitchSec: round2(pneumConfig.valveSwitchTimeSec),
    lineChargeSec: round2(lineCharge),
    cylinderStrokeSec: round2(cylinderStroke),
    totalResponseSec: round2(total),
    effectivePressureBar: round2(effectivePressure),
    pressureDropBar: round2(pressureDrop),
    lineLengthM: round2(lineLengthM),
  }
}

// ── 1. Semáforo de timing por gate ──────────────────────────────────────────

/**
 * Calcula el semáforo de tiempo de reacción para cada gate física.
 *
 * Si `pneumaticConfig` está presente, usa el modelo neumático per-gate
 * (distinta presión/tiempo por cada gate). Si no, usa el flat
 * `flipperResetTimeSec` como fallback (backward compatible).
 *
 * Umbrales del semáforo son configurables vía `thresholdOverrides`.
 */
export function computeGateTimingSignals(
  physicalConfig: GraderPhysicalConfig | undefined,
  gates: GateAssignment[],
  thresholdOverrides?: TimingThresholdOverrides,
): GateTimingSignal[] {
  if (!physicalConfig || !physicalConfig.flipperPositions || physicalConfig.flipperPositions.length === 0) {
    return []
  }
  const mainBelt = getGradingBelt(physicalConfig)
  const beltSpeedMps = mainBelt?.speedMps ?? 0.70
  if (beltSpeedMps <= 0) return []

  const marginOk = thresholdOverrides?.marginOkSec ?? DEFAULT_MARGIN_OK_SEC
  const marginWarn = thresholdOverrides?.marginWarnSec ?? DEFAULT_MARGIN_WARN_SEC

  const salmonLenM = physicalConfig.avgSalmonLengthCm / 100
  const tSalmonPass = salmonLenM / beltSpeedMps
  const hasPneumatic = !!physicalConfig.pneumaticConfig
  const flatReset = physicalConfig.flipperResetTimeSec ?? DEFAULT_FLIPPER_RESET_SEC

  const gateMap = new Map<number, GateAssignment>()
  for (const g of gates) gateMap.set(g.gateNumber, g)

  return physicalConfig.flipperPositions
    .slice()
    .sort((a, b) => a.gateNumber - b.gateNumber)
    .map((fp) => {
      const tAvailable = fp.distanceFromSensorMeters / beltSpeedMps

      // Per-gate response time: neumático si disponible, flat si no
      let tRequired: number
      let breakdown: PneumaticBreakdown | undefined
      if (hasPneumatic) {
        breakdown = computePerGateResponseTime(fp.gateNumber, physicalConfig.pneumaticConfig!)
        tRequired = tSalmonPass + breakdown.totalResponseSec
      } else {
        tRequired = tSalmonPass + flatReset
      }

      const margin = tAvailable - tRequired
      const status: GateTimingStatus =
        margin >= marginOk ? 'ok' :
        margin >= marginWarn ? 'warn' :
        'critical'

      const assignedGate = gateMap.get(fp.gateNumber)
      const active = assignedGate?.active ?? true

      const hintParts = [
        `${fp.distanceFromSensorMeters.toFixed(2)} m @ ${beltSpeedMps.toFixed(2)} m/s`,
        `${tAvailable.toFixed(2)}s disponibles − ${tRequired.toFixed(2)}s requeridos`,
        `margen ${margin >= 0 ? '+' : ''}${margin.toFixed(2)}s`,
      ]
      if (breakdown) {
        hintParts.push(
          `neumático: válvula ${(breakdown.valveSwitchSec * 1000).toFixed(0)}ms + `
          + `línea ${(breakdown.lineChargeSec * 1000).toFixed(0)}ms + `
          + `cilindro ${(breakdown.cylinderStrokeSec * 1000).toFixed(0)}ms`
          + ` (P_eff ${breakdown.effectivePressureBar.toFixed(1)} bar)`,
        )
      }
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
        pneumaticBreakdown: breakdown,
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
