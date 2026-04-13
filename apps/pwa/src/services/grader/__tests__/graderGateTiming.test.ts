/**
 * Tests para graderGateTiming.ts — modelo neumático per-gate (iter 19 / P0.5)
 *
 * Cubre funciones puras de física neumática y el semáforo de timing.
 * No toca Firestore ni React.
 */
import { describe, it, expect } from 'vitest'
import {
  computeTubeVolume,
  computeLinePressureDrop,
  computeLineChargeTime,
  computeCylinderStrokeTime,
  computePerGateResponseTime,
  computeGateTimingSignals,
  DEFAULT_PNEUMATIC_CONFIG,
} from '../graderGateTiming'
import type { GraderPhysicalConfig, GateAssignment } from '../types'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Configuración física mínima válida para pruebas */
function makePhysicalConfig(overrides?: Partial<GraderPhysicalConfig>): GraderPhysicalConfig {
  return {
    avgSalmonLengthCm: 55,
    flipperResetTimeSec: 0.45,
    belts: [{ beltId: 'main', speedMps: 1.28, widthCm: 30 }],
    flipperPositions: [
      { gateNumber: 1, distanceFromSensorMeters: 1.30 },
      { gateNumber: 2, distanceFromSensorMeters: 2.45 },
      { gateNumber: 6, distanceFromSensorMeters: 8.15 },
      { gateNumber: 12, distanceFromSensorMeters: 15.80 },
    ],
    z2DistancesM: {},
    ...overrides,
  }
}

const MOCK_GATES: GateAssignment[] = [
  { gateNumber: 1, assignedCalibre: '6-8lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 2, assignedCalibre: '8-10lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 6, assignedCalibre: '10-12lb', assignedQuality: 'A', active: true },
  { gateNumber: 12, assignedCalibre: '4-6lb', assignedQuality: 'B', active: false },
]

// ── computeTubeVolume ──────────────────────────────────────────────────────

describe('computeTubeVolume', () => {
  it('calcula el volumen correcto de un tubo de 1m x 4mm ID', () => {
    // V = π × (0.002)² × 1 = π × 4e-6 ≈ 1.2566e-5 m³
    const vol = computeTubeVolume(1, 4)
    expect(vol).toBeCloseTo(Math.PI * (0.002) ** 2 * 1, 10)
    expect(vol).toBeGreaterThan(0)
  })

  it('escala linealmente con la longitud', () => {
    const v1 = computeTubeVolume(1, 4)
    const v5 = computeTubeVolume(5, 4)
    expect(v5).toBeCloseTo(v1 * 5, 10)
  })

  it('escala con d² (cuadrático en diámetro)', () => {
    const v4 = computeTubeVolume(1, 4)
    const v8 = computeTubeVolume(1, 8)
    // d²: (8/4)² = 4
    expect(v8 / v4).toBeCloseTo(4, 1)
  })
})

// ── computeLinePressureDrop ────────────────────────────────────────────────

describe('computeLinePressureDrop', () => {
  it('retorna un valor positivo', () => {
    const dp = computeLinePressureDrop(5, 4, 6)
    expect(dp).toBeGreaterThan(0)
  })

  it('líneas más largas tienen mayor caída de presión', () => {
    const dp2 = computeLinePressureDrop(2, 4, 6)
    const dp18 = computeLinePressureDrop(18, 4, 6)
    expect(dp18).toBeGreaterThan(dp2)
  })

  it('nunca supera el 80% de la presión de suministro (clamp)', () => {
    const dp = computeLinePressureDrop(1000, 1, 6)  // extremo
    expect(dp).toBeLessThanOrEqual(6 * 0.8)
  })

  it('tubos más anchos tienen menos caída de presión', () => {
    const dp4 = computeLinePressureDrop(10, 4, 6)
    const dp8 = computeLinePressureDrop(10, 8, 6)
    expect(dp8).toBeLessThan(dp4)
  })
})

// ── computeLineChargeTime ──────────────────────────────────────────────────

describe('computeLineChargeTime', () => {
  it('retorna un tiempo positivo', () => {
    const t = computeLineChargeTime(5, 4, 6, 0.7)
    expect(t).toBeGreaterThan(0)
  })

  it('líneas más largas toman más tiempo de carga', () => {
    const t2 = computeLineChargeTime(2, 4, 6, 0.7)
    const t10 = computeLineChargeTime(10, 4, 6, 0.7)
    expect(t10).toBeGreaterThan(t2)
  })

  it('mayor Cv de válvula reduce el tiempo de carga', () => {
    const tLowCv = computeLineChargeTime(5, 4, 6, 0.3)
    const tHighCv = computeLineChargeTime(5, 4, 6, 1.5)
    expect(tHighCv).toBeLessThan(tLowCv)
  })
})

// ── computeCylinderStrokeTime ──────────────────────────────────────────────

describe('computeCylinderStrokeTime', () => {
  it('retorna tiempo positivo', () => {
    const t = computeCylinderStrokeTime(32, 50, 5.5, 0.7)
    expect(t).toBeGreaterThan(0)
  })

  it('carrera más larga requiere más tiempo', () => {
    const t30 = computeCylinderStrokeTime(32, 30, 5.5, 0.7)
    const t80 = computeCylinderStrokeTime(32, 80, 5.5, 0.7)
    expect(t80).toBeGreaterThan(t30)
  })

  it('menor presión efectiva implica más tiempo', () => {
    const tHigh = computeCylinderStrokeTime(32, 50, 6.0, 0.7)
    const tLow = computeCylinderStrokeTime(32, 50, 3.0, 0.7)
    expect(tLow).toBeGreaterThan(tHigh)
  })

  it('mínimo de 5ms (no puede ser instantáneo)', () => {
    const t = computeCylinderStrokeTime(10, 1, 10, 5.0)  // muy pequeño y rápido
    expect(t).toBeGreaterThanOrEqual(0.005)
  })
})

// ── computePerGateResponseTime ─────────────────────────────────────────────

describe('computePerGateResponseTime', () => {
  it('gate 1 (línea corta) tiene menor tiempo total que gate 12 (línea larga)', () => {
    const bd1 = computePerGateResponseTime(1, DEFAULT_PNEUMATIC_CONFIG)
    const bd12 = computePerGateResponseTime(12, DEFAULT_PNEUMATIC_CONFIG)
    expect(bd12.totalResponseSec).toBeGreaterThan(bd1.totalResponseSec)
  })

  it('los tres componentes suman el total', () => {
    const bd = computePerGateResponseTime(6, DEFAULT_PNEUMATIC_CONFIG)
    const suma = bd.valveSwitchSec + bd.lineChargeSec + bd.cylinderStrokeSec
    expect(bd.totalResponseSec).toBeCloseTo(suma, 1)
  })

  it('presión efectiva < presión suministro', () => {
    const bd = computePerGateResponseTime(12, DEFAULT_PNEUMATIC_CONFIG)
    expect(bd.effectivePressureBar).toBeLessThan(DEFAULT_PNEUMATIC_CONFIG.supplyPressureBar)
    expect(bd.effectivePressureBar).toBeGreaterThan(0)
  })

  it('caída de presión gate lejana > gate cercana', () => {
    const bd1 = computePerGateResponseTime(1, DEFAULT_PNEUMATIC_CONFIG)
    const bd12 = computePerGateResponseTime(12, DEFAULT_PNEUMATIC_CONFIG)
    expect(bd12.pressureDropBar).toBeGreaterThan(bd1.pressureDropBar)
  })

  it('devuelve la longitud de línea correcta para gate 1', () => {
    const bd = computePerGateResponseTime(1, DEFAULT_PNEUMATIC_CONFIG)
    expect(bd.lineLengthM).toBeCloseTo(DEFAULT_PNEUMATIC_CONFIG.gateLineLengthsM[1]!, 1)
  })

  it('usa estimación lineal para gates sin dato de longitud', () => {
    const configSinLongitud = { ...DEFAULT_PNEUMATIC_CONFIG, gateLineLengthsM: {} }
    const bd5 = computePerGateResponseTime(5, configSinLongitud)
    // estimación: 1.5 + gate * 1.5 = 1.5 + 5*1.5 = 9m
    expect(bd5.lineLengthM).toBeCloseTo(9.0, 1)
  })
})

// ── computeGateTimingSignals ───────────────────────────────────────────────

describe('computeGateTimingSignals', () => {
  it('retorna array vacío si no hay physicalConfig', () => {
    const result = computeGateTimingSignals(undefined, MOCK_GATES)
    expect(result).toEqual([])
  })

  it('retorna array vacío si no hay flipperPositions', () => {
    const cfg = makePhysicalConfig({ flipperPositions: [] })
    expect(computeGateTimingSignals(cfg, MOCK_GATES)).toEqual([])
  })

  it('calcula un signal por cada flipperPosition', () => {
    const cfg = makePhysicalConfig()
    const signals = computeGateTimingSignals(cfg, MOCK_GATES)
    expect(signals).toHaveLength(4)
  })

  it('ordena los resultados por gateNumber', () => {
    const cfg = makePhysicalConfig()
    const signals = computeGateTimingSignals(cfg, MOCK_GATES)
    const nums = signals.map((s) => s.gateNumber)
    expect(nums).toEqual([...nums].sort((a, b) => a - b))
  })

  it('gate 1 tiene menor tAvailableSec que gate 12', () => {
    const cfg = makePhysicalConfig()
    const signals = computeGateTimingSignals(cfg, MOCK_GATES)
    const g1 = signals.find((s) => s.gateNumber === 1)!
    const g12 = signals.find((s) => s.gateNumber === 12)!
    expect(g12.tAvailableSec).toBeGreaterThan(g1.tAvailableSec)
  })

  it('gate inactiva devuelve status unknown', () => {
    const cfg = makePhysicalConfig()
    const signals = computeGateTimingSignals(cfg, MOCK_GATES)
    const g12 = signals.find((s) => s.gateNumber === 12)!
    expect(g12.status).toBe('unknown')
  })

  it('gate 6 con margen holgado es ok', () => {
    const cfg = makePhysicalConfig()
    const signals = computeGateTimingSignals(cfg, MOCK_GATES)
    const g6 = signals.find((s) => s.gateNumber === 6)!
    // gate 6 @ 8.15m → ~6.4s disponibles → margen muy grande → ok
    expect(g6.status).toBe('ok')
  })

  it('usa fallback flat cuando no hay pneumaticConfig', () => {
    const cfg = makePhysicalConfig({ pneumaticConfig: undefined })
    const signals = computeGateTimingSignals(cfg, MOCK_GATES)
    // debe tener señales (no vacío) y NO tener pneumaticBreakdown
    expect(signals.length).toBeGreaterThan(0)
    signals.forEach((s) => expect(s.pneumaticBreakdown).toBeUndefined())
  })

  it('incluye pneumaticBreakdown cuando hay pneumaticConfig', () => {
    const cfg = makePhysicalConfig({ pneumaticConfig: DEFAULT_PNEUMATIC_CONFIG })
    const signals = computeGateTimingSignals(cfg, MOCK_GATES)
    signals.forEach((s) => expect(s.pneumaticBreakdown).toBeDefined())
  })

  it('respeta thresholdOverrides para semáforo', () => {
    const cfg = makePhysicalConfig()
    // Con umbral ok muy bajo (0.01s), gate 1 no debería ser critical
    const signalsLow = computeGateTimingSignals(cfg, MOCK_GATES, { marginOkSec: 0.01, marginWarnSec: 0.001 })
    const g1Low = signalsLow.find((s) => s.gateNumber === 1)!
    // Con umbral muy alto (5s), gate 1 con 1.02s disponibles debería ser critical
    const signalsHigh = computeGateTimingSignals(cfg, MOCK_GATES, { marginOkSec: 5.0, marginWarnSec: 3.0 })
    const g1High = signalsHigh.find((s) => s.gateNumber === 1)!
    // Con umbral bajo, gate 1 mejora; con umbral alto empeora
    expect(['ok', 'warn']).toContain(g1Low.status)
    expect(g1High.status).toBe('critical')
  })

  it('marginSec = tAvailableSec - tRequiredSec', () => {
    const cfg = makePhysicalConfig()
    const signals = computeGateTimingSignals(cfg, MOCK_GATES)
    for (const s of signals) {
      expect(s.marginSec).toBeCloseTo(s.tAvailableSec - s.tRequiredSec, 1)
    }
  })

  it('beltSpeedMps en el signal coincide con la cinta main', () => {
    const cfg = makePhysicalConfig()
    const signals = computeGateTimingSignals(cfg, MOCK_GATES)
    signals.forEach((s) => expect(s.beltSpeedMps).toBe(1.28))
  })
})
