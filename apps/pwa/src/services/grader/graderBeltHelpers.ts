/**
 * Helpers tipados para acceder a las 4 cintas del modelo Marelec MS4/12.
 *
 * La estructura de datos canónica es `GraderPhysicalConfig.belts[]` (array en Firestore),
 * pero semánticamente hay exactamente 4 cintas con responsabilidades distintas:
 *
 *   ❶ graderBelt (beltId='main')   → cinta clasificadora principal (12 flippers)
 *   ❷ zBelt      (beltId='zeta')   → cinta elevadora desde pockets
 *   ❸ accel1Belt (beltId='accel1') → 1ª cinta de aceleración post Z-belt
 *   ❸ accel2Belt (beltId='accel2') → 2ª cinta de aceleración (Detection Eye al final)
 *
 * Estos helpers abstraen el find() y retornan defaults consistentes para evitar
 * que cada call-site repita `?? 0.7` con valores distintos.
 *
 * Los defaults de velocidad fallback (GRADING_BELT_DEFAULT_MPS, Z_BELT_DEFAULT_MPS)
 * son velocidades operativas típicas de planta, ajustables via tachómetro SKF
 * desde el TachModal (FASE 5).
 */

import type { GraderBeltConfig, GraderPhysicalConfig } from './types'

/** BeltId canónico para cada una de las 4 cintas del Marelec MS4/12 */
export type GraderBeltId = 'main' | 'zeta' | 'accel1' | 'accel2'

/**
 * Velocidad default operativa de la grading belt (cinta clasificadora principal).
 * Valor típico de planta validado con operadores — más bajo que el máximo del
 * fabricante (1.4 m/s) porque en operación real se corre a este régimen para
 * mantener separación útil entre piezas. Ajustable con tachómetro SKF.
 */
export const GRADING_BELT_DEFAULT_MPS = 0.70

/**
 * Velocidad default operativa de la Z-belt (cinta elevadora).
 * Validada empíricamente a ~0.42 m/s en operación normal. Ajustable con
 * tachómetro SKF. Difiere del cálculo Z2 (0.39) por drift del reductor.
 */
export const Z_BELT_DEFAULT_MPS = 0.42

/** Default accel1 desde lecturas Z2 (factor k). Ajustable con tach. */
export const ACCEL1_BELT_DEFAULT_MPS = 1.03
/** Default accel2 desde lecturas Z2 (factor k). Ajustable con tach. */
export const ACCEL2_BELT_DEFAULT_MPS = 1.23

/**
 * Retorna la cinta con el beltId indicado desde un GraderPhysicalConfig.
 * Devuelve undefined si la config no tiene esa cinta (no debería pasar con
 * DEFAULT_PHYSICAL_CONFIG pero es posible si Firestore tiene data antigua).
 */
export function findBelt(
  pc: Pick<GraderPhysicalConfig, 'belts'> | undefined,
  beltId: GraderBeltId,
): GraderBeltConfig | undefined {
  return pc?.belts?.find((b) => b.beltId === beltId)
}

/** Cinta clasificadora principal (12 flippers). */
export function getGradingBelt(pc: Pick<GraderPhysicalConfig, 'belts'> | undefined): GraderBeltConfig | undefined {
  return findBelt(pc, 'main')
}

/** Cinta elevadora Z-Conveyor. */
export function getZBelt(pc: Pick<GraderPhysicalConfig, 'belts'> | undefined): GraderBeltConfig | undefined {
  return findBelt(pc, 'zeta')
}

/** Cinta de aceleración 1. */
export function getAccel1Belt(pc: Pick<GraderPhysicalConfig, 'belts'> | undefined): GraderBeltConfig | undefined {
  return findBelt(pc, 'accel1')
}

/** Cinta de aceleración 2 (Detection Eye al final). */
export function getAccel2Belt(pc: Pick<GraderPhysicalConfig, 'belts'> | undefined): GraderBeltConfig | undefined {
  return findBelt(pc, 'accel2')
}

/**
 * Velocidad de la grading belt con fallback al default operativo.
 * Úsese en cálculos de timing de flippers, separación mínima, etc.
 */
export function getGradingBeltSpeedMps(pc: Pick<GraderPhysicalConfig, 'belts'> | undefined): number {
  return getGradingBelt(pc)?.speedMps ?? GRADING_BELT_DEFAULT_MPS
}

/**
 * Velocidad de la Z-belt con fallback al default operativo.
 * Úsese en caudal elevadora, tiempo de tránsito pockets→accel.
 */
export function getZBeltSpeedMps(pc: Pick<GraderPhysicalConfig, 'belts'> | undefined): number {
  return getZBelt(pc)?.speedMps ?? Z_BELT_DEFAULT_MPS
}

/** Velocidad accel1 con fallback. */
export function getAccel1SpeedMps(pc: Pick<GraderPhysicalConfig, 'belts'> | undefined): number {
  return getAccel1Belt(pc)?.speedMps ?? ACCEL1_BELT_DEFAULT_MPS
}

/** Velocidad accel2 con fallback. */
export function getAccel2SpeedMps(pc: Pick<GraderPhysicalConfig, 'belts'> | undefined): number {
  return getAccel2Belt(pc)?.speedMps ?? ACCEL2_BELT_DEFAULT_MPS
}

/**
 * Ratios de velocidad útiles para insights y validaciones:
 *   - accel1/zBelt: cuánto se separan las piezas al entrar a aceleración (debe ser >1, idealmente >2)
 *   - accel2/accel1: progresión de aceleración (típicamente ~1.2)
 *   - main/accel2: transición final al grading (típicamente similar, ~1.0)
 */
export function computeBeltRatios(pc: Pick<GraderPhysicalConfig, 'belts'> | undefined): {
  accel1OverZ: number
  accel2OverAccel1: number
  mainOverAccel2: number
} {
  const zMps = getZBeltSpeedMps(pc)
  const a1Mps = getAccel1SpeedMps(pc)
  const a2Mps = getAccel2SpeedMps(pc)
  const mainMps = getGradingBeltSpeedMps(pc)
  return {
    accel1OverZ: zMps > 0 ? a1Mps / zMps : 0,
    accel2OverAccel1: a1Mps > 0 ? a2Mps / a1Mps : 0,
    mainOverAccel2: a2Mps > 0 ? mainMps / a2Mps : 0,
  }
}

/**
 * Nombre amigable de cada cinta para UI.
 */
export function getBeltLabel(beltId: GraderBeltId): string {
  switch (beltId) {
    case 'main':   return 'Grading Belt'
    case 'zeta':   return 'Z-Belt (elevadora)'
    case 'accel1': return 'Aceleración 1'
    case 'accel2': return 'Aceleración 2'
  }
}

/**
 * Orden canónico de visualización (siguiendo el flujo del producto):
 * zBelt → accel1 → accel2 → grading
 */
export const BELT_FLOW_ORDER: GraderBeltId[] = ['zeta', 'accel1', 'accel2', 'main']
