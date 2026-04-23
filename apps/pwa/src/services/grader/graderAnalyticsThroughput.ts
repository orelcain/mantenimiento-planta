/**
 * Constantes físicas y funciones de throughput para la clasificadora Marelec MS4/12.
 *
 * Extraído de graderAnalytics.ts (M14 — 2026-04-22) para reducir su tamaño
 * y permitir imports individuales sin cargar el motor de analítica completo.
 *
 * Exports:
 *  - CALIBRE_WEIGHT_RANGES   → rangos de peso por calibre (g)
 *  - MARELEC_MS4_12_SPECS    → especificaciones técnicas del equipo
 *  - DEFAULT_PHYSICAL_CONFIG → configuración física por defecto (cintas, flippers)
 *  - computeBeltSpeedFromVfd → velocidad cinta desde RPM variador
 *  - computeZetaBeltSpeedMps → velocidad Z-Belt desde datos de motor/reductor
 *  - estimateZetaThroughput  → caudal estimado de la cinta elevadora
 */

import type { CalibreWeightRange } from './types'

// ============================================================================
// CONSTANTES — RANGOS DE CALIBRE POR PESO
// ============================================================================

/** Rangos de peso en gramos para cada calibre (datos de la tabla de calibración) */
export const CALIBRE_WEIGHT_RANGES: CalibreWeightRange[] = [
  { calibre: '0-2 lb',   label: '0-2 lb (0–916 g)',       minGrams: 0,    maxGrams: 916  },
  { calibre: '2-4 lb',   label: '2-4 lb (916–1833 g)',    minGrams: 916,  maxGrams: 1833 },
  { calibre: '4-6 lb',   label: '4-6 lb (1833–2749 g)',   minGrams: 1833, maxGrams: 2749 },
  { calibre: '6-8 lb',   label: '6-8 lb (2749–3665 g)',   minGrams: 2749, maxGrams: 3665 },
  { calibre: '8-10 lb',  label: '8-10 lb (3665–4581 g)',  minGrams: 3665, maxGrams: 4581 },
  { calibre: '10-12 lb', label: '10+ lb (4581–9163 g)',   minGrams: 4581, maxGrams: 9163 },
]

/**
 * Especificaciones técnicas reales de la Marelec MS4/12 (S/N 3943)
 * Fuente: Instruction Manual MS4_12 (Marelec / MFT, Bélgica)
 *
 * Usadas para validación y contexto IA — NO editables por el operador.
 */
export const MARELEC_MS4_12_SPECS = {
  model: 'MS4/12',
  serialNumber: '3943',
  controller: 'Marelec Z2',
  // Anchos de cintas (sección 2.3.2)
  beltWidths: {
    zConveyor:       1200, // mm
    accelerationBelt: 300, // mm (ambas cintas de aceleración)
    gradingBelt:      300, // mm
  },
  // Dimensiones máximas de producto aceptadas (sección 2.3.2)
  maxProductDimensions: {
    lengthMm: 1100, // mm — peces > 110cm → "too long"
    widthMm:   290, // mm — casi el ancho total de la cinta (300mm)
  },
  // Velocidad máxima de cintas (sección 2.3.2)
  maxBeltSpeedMps: 1.4,
  // Rango y precisión del sistema de pesaje (sección 2.3.2)
  weighingRangeKg: { min: 0, max: 15 },
  weighingPrecision: [
    { rangeKg: { min: 0,  max: 5  }, stdevGrams: 20 },
    { rangeKg: { min: 5,  max: 15 }, stdevGrams: 50 },
  ],
  // Salidas (sección 2.3.2)
  outputs: 12,
  outputsSide: 'right' as const,
  // Layout del Grading Belt — combinación de plano del manual + mediciones en terreno
  //   Largo total: 17179mm (manual sección 2.3.3 — confirmado en planta)
  //   Sensor (Detection Eye, final Accel Belt 2) → Gate 1 pivot: 1300mm (medición 2026-04-11)
  //   Pitch entre pivots consecutivos: 1370mm uniforme (medición 2026-04-11)
  //   Largo paleta flipper: 475mm (medición 2026-04-11)
  gradingBeltLayout: {
    totalLengthMm:           17179,  // confirmado en planta
    sensorToGate1Mm:          1300,  // medición real (vs 1370mm estimado del plano)
    gatePitchMm:              1370,  // medición real pivot-a-pivot (vs 800mm estimado del plano)
    flipperPaddleLengthMm:     475,  // medición real 2026-04-11
  },
  // Parámetros dis1-dis12 del controlador Z2 (valores reales, foto 2026-04-11)
  // dis1=1250 → físico=1300mm → -50mm anticipo (gate 1)
  // Los offsets Z2 vs físico NO son uniformes — calibración individual por flipper:
  //   offsets (mm): [-50,-470,-240,-210,-230,-300,-370,-490,-560,-455,-200,-520]
  // Ver valores completos en DEFAULT_PHYSICAL_CONFIG.z2ProgrammedDistancesMm
  z2Calibration: {
    sensorToGate1Mm:      1250,   // dis1 real del Z2
    gate1OffsetFromPhysical: -50, // Z2 dispara 50mm antes del pivot físico (gate 1)
  },
  // Escala de velocidades de cintas según pantalla Z2 "Velocidad cintas"
  // Derivada de: Sorting belt max 1s = 1781 unidades = 1.4 m/s (spec manual)
  // Factor k = 1.4/1781 = 0.000786 m/s por unidad — mismo para las 4 cintas
  // (verificado: ratio max100ms/max1s ≈ 1.787 uniforme en todas las cintas)
  z2BeltSpeedScale: {
    conversionFactorMpsPerUnit: 0.000786,
    maxUnits1s: { zBelt: 554, accel1: 1432, accel2: 1702, sorting: 1781 },
    // Lectura de referencia operativa (26/12/2025, turno normal):
    referenceReadings: { zBelt: 494, accel1: 1313, accel2: 1560, sorting: 1631 },
    // Velocidades calculadas de la referencia (en m/s):
    referenceMps:      { zBelt: 0.39, accel1: 1.03, accel2: 1.23, sorting: 1.28 },
  },
} as const

/**
 * Configuración física por defecto de la clasificadora.
 *
 * Máquina: Marelec MS4/12 (S/N 3943, controlador Z2)
 *   ❶ Static Weighing System (pockets 1-4, donde se pesa el salmón)
 *   ❷ Z-Conveyor (cinta elevadora, sube el salmón hacia las cintas de aceleración)
 *   ❸ Acceleration Belt 1 + Acceleration Belt 2 [fotocélula al final de la 2]
 *   ❹ Grading Belt (~17.2 m, 12 compuertas/flippers)
 *
 * Valores de flippers basados en el plano exterior del manual:
 *   Gate 1 a 1370mm del sensor, pitch 800mm entre compuertas.
 * Velocidades: defaults operativos (máx. del fabricante = 1.4 m/s).
 */
export const DEFAULT_PHYSICAL_CONFIG = {
  avgSalmonLengthCm: 55,      // promedio conservador (máx. admitido: 110cm)
  avgSalmonWidthCm:  20,      // promedio (máx. admitido: 29cm = casi el ancho de la cinta)
  pocketCount: 4,
  // Velocidades calibradas desde la pantalla Z2 "Velocidad cintas" (26/12/2025)
  // Factor de conversión k = 1.4 m/s / 1781 unidades (max sorting) = 0.000786 m/s/unit
  // calibrationStatus: 'estimated' = derivado de spec fabricante, pendiente verificar con tachómetro
  belts: [
    {
      beltId:             'zeta'   as const,
      label:              'Z-Conveyor ❷ (cinta elevadora)',
      lengthMeters:       3.0,
      widthMeters:        1.20,    // 1200mm — especificación del fabricante
      speedMps:           0.42,    // Operativo típico — ajustable via TachModal (SKF). Z2 calc = 0.39 (494u × 0.000786)
      z2Units:            494,
      calibrationStatus:  'estimated' as const,
      // VFD: VLT AutomationDrive, label "CintaZ" (foto 2026-04-11)
      // Motor: 1.5 kW, 1488 RPM nom., motoreductor i=24 → ver zetaDrive para cálculo preciso
      vfd: {
        label:             'CintaZ',
        vfdMinRpm:         1400,
        vfdMaxRpm:         1600,
        // vfdCurrentRpm: leer del display Danfoss al inicio turno
        // effectiveMpsPerRpm: 0.39 / 1470 ≈ 0.000265 (ESTIMADO — mucho menor por reductor i=24)
        effectiveMpsPerRpm: 0.000265,
        effectiveStatus:   'estimated' as const,
      },
    },
    {
      beltId:             'accel1' as const,
      label:              'Acceleration Belt 1 ❸',
      lengthMeters:       3.65,    // 365 cm — medición en terreno 2026-04-11
      widthMeters:        0.30,    // 300mm — especificación del fabricante
      speedMps:           1.03,    // Z2: 1313u × 0.000786
      z2Units:            1313,
      calibrationStatus:  'estimated' as const,
      // VFD: VLT Midi Drive (foto 2026-04-11), mostrando 43.5 Hz ≈ 1305 RPM
      vfd: {
        label:             'Midi Drive',
        vfdCurrentHz:      43.5,
        vfdCurrentRpm:     1305,   // 43.5 Hz × 30 (4-pole motor: 1500rpm/50Hz × 43.5Hz)
        // effectiveMpsPerRpm: 1.03 / 1305 ≈ 0.000789 (ESTIMADO — verificar con tachómetro)
        effectiveMpsPerRpm: 0.000789,
        effectiveStatus:   'estimated' as const,
      },
    },
    {
      beltId:             'accel2' as const,
      label:              'Acceleration Belt 2 ❸ (fotocélula al final)',
      lengthMeters:       1.70,    // 170 cm — medición en terreno 2026-04-11
      widthMeters:        0.30,    // 300mm — especificación del fabricante
      speedMps:           1.23,    // Z2: 1560u × 0.000786
      z2Units:            1560,
      calibrationStatus:  'estimated' as const,
      // VFD: VLT AutomationDrive, label "IF 2." (foto 2026-04-11)
      // Mostrando: 1470 RPM, 49.1 Hz, rango 1400-1600 RPM
      vfd: {
        label:             'IF 2.',
        vfdCurrentRpm:     1470,
        vfdCurrentHz:      49.1,
        vfdMinRpm:         1400,
        vfdMaxRpm:         1600,
        // effectiveMpsPerRpm: 1.23 / 1470 ≈ 0.000837 (ESTIMADO)
        effectiveMpsPerRpm: 0.000837,
        effectiveStatus:   'estimated' as const,
      },
    },
    {
      beltId:             'main'   as const,
      label:              'Grading Belt ❹ (17.2 m, 12 compuertas)',
      lengthMeters:       17.179,  // 17179mm — plano exterior manual MS4_12
      widthMeters:        0.30,    // 300mm — especificación del fabricante
      speedMps:           0.70,    // Operativo típico — ajustable via TachModal (SKF). Z2 calc típico = 1.28 (1631u × 0.000786); planta opera más lento
      z2Units:            1631,
      calibrationStatus:  'estimated' as const,
      // VFD: VLT AutomationDrive, label "Grader" (foto 2026-04-11)
      // Mostrando: 1500 RPM, rango 1400-1500 RPM, 0.61 kW
      vfd: {
        label:             'Grader',
        vfdCurrentRpm:     1500,
        vfdCurrentKw:      0.61,
        vfdMinRpm:         1400,
        vfdMaxRpm:         1500,
        // effectiveMpsPerRpm: 1.28 / 1500 ≈ 0.000853 (ESTIMADO)
        effectiveMpsPerRpm: 0.000853,
        effectiveStatus:   'estimated' as const,
      },
    },
  ],
  // Mediciones en terreno (2026-04-11, cinta métrica):
  //   - Detection Eye (fotocélula accel2) → Gate 1 pivot: 1300 mm
  //   - Pitch entre pivots: 1370 mm uniforme (gates 1-12)
  //   → Gate N = 1300 + (N-1) × 1370 mm
  flipperPositions: [
    { gateNumber:  1, distanceFromSensorMeters:  1.300 },  //  1300 mm
    { gateNumber:  2, distanceFromSensorMeters:  2.670 },  //  2670 mm
    { gateNumber:  3, distanceFromSensorMeters:  4.040 },  //  4040 mm
    { gateNumber:  4, distanceFromSensorMeters:  5.410 },  //  5410 mm
    { gateNumber:  5, distanceFromSensorMeters:  6.780 },  //  6780 mm
    { gateNumber:  6, distanceFromSensorMeters:  8.150 },  //  8150 mm
    { gateNumber:  7, distanceFromSensorMeters:  9.520 },  //  9520 mm
    { gateNumber:  8, distanceFromSensorMeters: 10.890 },  // 10890 mm
    { gateNumber:  9, distanceFromSensorMeters: 12.260 },  // 12260 mm
    { gateNumber: 10, distanceFromSensorMeters: 13.630 },  // 13630 mm
    { gateNumber: 11, distanceFromSensorMeters: 15.000 },  // 15000 mm
    { gateNumber: 12, distanceFromSensorMeters: 16.370 },  // 16370 mm (belt end: 17179mm)
  ],
  // Paleta del flipper: medición en terreno 2026-04-11 = 475 mm
  flipperPaddleLengthMm: 475,
  // Valores dis1-dis12 programados en el controlador Marelec Z2
  // (leídos desde "Cambiar Parámetros" → 2026-04-11)
  // Nota: dis1=1250 vs físico=1300 → 50mm menos = anticipo de actuación neumática
  // Verificar: capturar pantalla completa del Z2 con los 12 valores dis
  // Valores reales leídos de la pantalla Z2 (foto 2026-04-11).
  // NOTA: NO son uniformes — cada flipper está calibrado individualmente
  // según su respuesta neumática real (distancias Z2 < físico = anticipo variable).
  // Pitches reales entre gates: 950, 1600, 1400, 1350, 1300, 1300, 1250, 1300, 1475, 1625, 1050 mm
  z2ProgrammedDistancesMm: [1250, 2200, 3800, 5200, 6550, 7850, 9150, 10400, 11700, 13175, 14800, 15850],
  // Variador y motoreductor de la cinta elevadora (datos placa motor 2026-04-11)
  zetaDrive: {
    motorNominalRpm: 1488,   // placa motor
    motorKw:         1.5,    // placa motor
    gearRatio:       24,     // relación de reducción i = 24:1
    // sprocketDiameterMm: FALTA MEDIR con pie de metro en polea motriz
    // Valor derivado teórico: 120 mm (calculado de 0.39 m/s @ 1488 RPM, i=24)
    vfdMinRpm:       1400,   // setpoint mínimo observado en turno
    vfdMaxRpm:       1600,   // setpoint máximo observado en turno
    // vfdCurrentRpm: operador ingresa al inicio de cada turno
  },
  // Tiempo de reset neumático del flipper (ESTIMADO — cronometrar en planta)
  // Usado en insight #18: t_disponible debe superar t_salmon_pasa + flipperResetTimeSec
  flipperResetTimeSec: 0.45,

  // Timing flipper software Z2 (extraídos de 418 imágenes HMI, 2026-04-17)
  flipperDelayOpenMs:    150,   // Z2: delayFlipperOpen
  flipperMinOpenTimeMs:  350,   // Z2: minFlipperOpenTime
  flipperDelayCloseMs:   150,   // Z2: delayFlipperClose
  // Reset mecánico: sin default — debe medirse con slow-mo en terreno
  flipperHeightAboveBeltMm: 0.5,

  // Gate/batch timing Z2
  delayBeforeGateCloseMs: 400,  // Z2: delayBeforeGateClose
  delayGateCloseMs:       500,  // Z2: delayGateClose
  minGateOpenMs:            0,  // Z2: minGateOpen
  maxBinWeightG:        25000,  // Z2: maxBinWeight (25 kg)
}

// ============================================================================
// FUNCIONES DE VELOCIDAD / THROUGHPUT DE CINTAS
// ============================================================================

/**
 * Calcula la velocidad de una cinta desde el RPM del variador y el factor efectivo.
 * El factor effectiveMpsPerRpm = belt_speed_mps / motor_rpm (absorbe reducción + polea).
 *
 * Para Z-Belt con datos de motor/gearbox: usar computeZetaBeltSpeedMps().
 * Para otras cintas: usar este helper con el factor calibrado.
 *
 * Retorna null si falta el factor o el RPM actual.
 */
export function computeBeltSpeedFromVfd(vfd: {
  vfdCurrentRpm?: number
  effectiveMpsPerRpm?: number
}): number | null {
  if (!vfd.vfdCurrentRpm || !vfd.effectiveMpsPerRpm) return null
  return vfd.vfdCurrentRpm * vfd.effectiveMpsPerRpm
}

/**
 * Calcula la velocidad de la cinta elevadora (Z-Belt) desde el setpoint RPM del variador.
 * Retorna null si faltan datos (sprocketDiameterMm no medido aún).
 *
 * Fórmula: v = (vfdRpm / gearRatio / 60) × π × (sprocketDiameterMm / 1000)
 */
export function computeZetaBeltSpeedMps(
  drive: { motorNominalRpm: number; gearRatio: number; sprocketDiameterMm?: number; vfdCurrentRpm?: number },
): number | null {
  if (!drive.sprocketDiameterMm) return null
  const rpm = drive.vfdCurrentRpm ?? drive.motorNominalRpm
  return (rpm / drive.gearRatio / 60) * Math.PI * (drive.sprocketDiameterMm / 1000)
}

/**
 * Estima el caudal de la cinta elevadora en peces/minuto.
 * Retorna null si falta el espaciado entre peces.
 */
export function estimateZetaThroughput(
  zetaSpeedMps: number,
  avgFishSpacingM: number | undefined,
): number | null {
  if (!avgFishSpacingM || avgFishSpacingM <= 0) return null
  return (zetaSpeedMps * 60) / avgFishSpacingM
}
