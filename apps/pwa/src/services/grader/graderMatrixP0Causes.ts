/**
 * Mapeo de causas P0 del Grader Marelec.
 *
 * 4 causas OFICIALES que reporta el HMI Matrix:
 *  - fuera_de_limites · no_leido_fotocelula · too_close_too_long · puerta_no_preparada
 *
 * 5 causas DERIVADAS — nuestro análisis descompone "fuera de límites" usando
 * la config de gates + datos por pieza (calidad/conservación/producto):
 *  - fuera_de_calibre · fuera_de_calidad · fuera_de_conservacion · fuera_de_producto · otro
 *
 * Esta metadata enriquecida alimenta los tooltips de `P0CausesPanel`.
 */

import type { MatrixP0Cause, MatrixP0Level, PointZeroCause } from './types'
import type { MatrixP0Cause as MatrixP0CauseTimeline } from './graderShiftTimeline'

// Re-export del tipo compartido con el timeline (aliased en shiftTimeline)
export type { MatrixP0CauseTimeline }

export interface MatrixCauseMeta {
  /** Label visible en UI (español) */
  label: string
  /** Traducción técnica al inglés (la que Matrix/Marelec muestran en HMI) */
  translation: string
  /** Oficial Matrix vs derivada de nuestro análisis */
  level: MatrixP0Level
  /** Ícono lucide-react identificador */
  icon: string
  /** Color semántico — usado en P0CausesPanel + BenchmarkComparisonCard */
  color: 'red' | 'orange' | 'purple' | 'cyan' | 'emerald' | 'amber' | 'brown' | 'blue' | 'zinc'
  /** Sub-causas internas (PointZeroCause) que se mapean a esta causa Matrix */
  subCauses: PointZeroCause[]
  /** Frase corta para el header del card (1 línea) */
  description: string
  /** Explicación en simple para el tooltip */
  shortDescription: string
  /** Cómo se detecta (info técnica para operarios avanzados) */
  howDetected: string
  /** Acción sugerida genérica cuando aparece esta causa */
  actionHint: string
  /** Ejemplo concreto que desencadena esta causa */
  exampleTrigger: string
}

export const MATRIX_P0_CAUSES: Record<MatrixP0Cause, MatrixCauseMeta> = {
  // ═══════ OFICIALES MATRIX ═══════════════════════════════════════════════
  fuera_de_limites: {
    label: 'Fuera de límites',
    translation: 'Out of limits',
    level: 'official',
    icon: 'ScaleOff',
    color: 'red',
    subCauses: ['fuera_de_limites'],
    description: 'Peso fuera de los límites físicos del sistema Marelec',
    shortDescription: 'El peso de la pieza está fuera del rango que el hardware Marelec puede medir con precisión (aprox. 0–15 kg).',
    howDetected: 'El sensor de peso detecta un valor fuera del rango físico del sistema (MS4/12). La pieza no puede ser clasificada a ningún calibre.',
    actionHint: 'Verificar contrastación de balanza, calibración del sensor de peso y que no haya objetos extraños en la línea.',
    exampleTrigger: 'Pieza de 18 kg (fuera del máximo) o fragmento de 30 g (fuera del mínimo detectable).',
  },
  no_leido_fotocelula: {
    label: 'No leído por fotocélula',
    translation: 'Not read by photocell',
    level: 'official',
    icon: 'EyeOff',
    color: 'amber',
    subCauses: ['no_leido_fotocelula'],
    description: 'El sensor óptico (Detection Eye) no detectó la pieza',
    shortDescription: 'La fotocélula al final del Accel Belt 2 no detectó correctamente que una pieza estaba pasando.',
    howDetected: 'El Detection Eye espera una señal óptica al paso de cada pieza. Si no la recibe, la pieza va a Gate 0 y se contabiliza como "no leído".',
    actionHint: 'Limpiar lente de la fotocélula, verificar alineación del emisor/receptor, ajustar sensibilidad (eye sync).',
    exampleTrigger: 'Lente con grasa o suciedad, pieza desalineada, emisor infrarrojo con menor potencia.',
  },
  too_close_too_long: {
    label: 'Too close or too long',
    translation: 'Too close or too long',
    level: 'official',
    icon: 'Scan',
    color: 'brown',
    subCauses: ['too_close_too_long'],
    description: 'Piezas demasiado cerca entre sí o pieza demasiado larga',
    shortDescription: 'El sistema no pudo separar/individualizar las piezas: venían pegadas o una era más larga que el umbral permitido.',
    howDetected: 'Matrix mide el intervalo temporal entre detecciones consecutivas de la fotocélula. Si es menor al mínimo o una señal dura más que el umbral, marca "too close or too long".',
    actionHint: 'Bajar cadencia de la línea de entrada, mejorar distribución de peces en el elevador, revisar velocidad de las cintas de aceleración.',
    exampleTrigger: 'Dos salmones que entran pegados al elevador o un salmón particularmente largo (>80 cm).',
  },
  puerta_no_preparada: {
    label: 'Puerta no preparada',
    translation: 'Door not ready',
    level: 'official',
    icon: 'Clock',
    color: 'blue',
    subCauses: ['puerta_no_preparada'],
    description: 'El flipper estaba ocupado cuando llegó la pieza',
    shortDescription: 'La compuerta asignada a esta pieza no estaba lista (todavía procesando la pieza anterior) cuando esta llegó.',
    howDetected: 'El sistema sincroniza tiempo de vuelo de la pieza con la posición del flipper. Si el flipper no está en posición "ready" cuando la pieza llega, registra "puerta no preparada".',
    actionHint: 'Bajar cadencia de la línea, revisar timing del gate crítico, verificar presión neumática de los flippers.',
    exampleTrigger: 'Cadencia demasiado alta para la mecánica, presión neumática baja, gate particular con retraso mecánico.',
  },
  // ═══════ DERIVADAS (descomposición nuestra de "fuera de límites") ═══════
  fuera_de_calibre: {
    label: 'Fuera de calibre',
    translation: 'Caliber not configured',
    level: 'derived',
    icon: 'SlidersHorizontal',
    color: 'orange',
    subCauses: ['fuera_de_rango'],
    description: 'No hay calibre configurado que cubra ese peso',
    shortDescription: 'La pieza tiene un peso que no encaja en ningún rango de calibre configurado en tus gates activas.',
    howDetected: 'Tu config tiene calibres como "4-6 lb", "6-8 lb", etc. Si el peso de la pieza cae fuera de todos esos rangos, la marcamos "fuera de calibre".',
    actionHint: 'Activar una gate para el rango de peso faltante o ajustar rangos de calibres existentes para cubrir el peso.',
    exampleTrigger: 'Llegó pieza de 800 g pero tu gate más chica es "2-4 lb" (~900 g mínimo).',
  },
  fuera_de_calidad: {
    label: 'Fuera de calidad',
    translation: 'Quality not configured',
    level: 'derived',
    icon: 'Award',
    color: 'purple',
    subCauses: [],
    description: 'Calibre existe pero no hay gate activa para esa calidad',
    shortDescription: 'El peso de la pieza sí encaja en un calibre configurado, pero ninguna gate activa para ese calibre coincide con la calidad de la pieza.',
    howDetected: 'Cruzamos (calibre × calidad) de la pieza con las gates activas. Si el calibre existe pero la calidad no, es "fuera de calidad".',
    actionHint: 'Activar una gate para la calidad faltante en ese calibre específico.',
    exampleTrigger: 'Pieza 3 kg Industrial, pero tus gates de 6-8 lb solo están asignadas a calidad Premium.',
  },
  fuera_de_conservacion: {
    label: 'Fuera de conservación',
    translation: 'Preservation not configured',
    level: 'derived',
    icon: 'Snowflake',
    color: 'cyan',
    subCauses: [],
    description: 'Calidad existe pero no hay gate para esa conservación',
    shortDescription: 'La combinación (calibre + calidad) tiene gate activa, pero la conservación de la pieza (FRESCO/CONGELADO) no coincide.',
    howDetected: 'Cruzamos (calibre × calidad × conservación) con las gates activas. Si todo calza menos la conservación, es "fuera de conservación".',
    actionHint: 'Activar gate para la conservación faltante o revisar ruteo físico si se procesan ambas.',
    exampleTrigger: 'Llega pieza FRESCO en un turno donde todas las gates activas están configuradas para CONGELADO.',
  },
  fuera_de_producto: {
    label: 'Fuera de producto',
    translation: 'Product destination not configured',
    level: 'derived',
    icon: 'Target',
    color: 'emerald',
    subCauses: [],
    description: 'Conservación OK pero no hay gate para ese producto',
    shortDescription: 'Calibre, calidad y conservación encajan, pero el producto/destino (HG, DESTINO FILETE) de la pieza no tiene gate asignada.',
    howDetected: 'Último nivel de cruce: (calibre × calidad × conservación × producto). Si los 3 primeros calzan y el producto no, es "fuera de producto".',
    actionHint: 'Reasignar una gate para soportar ese producto o desviar el lote al destino correcto.',
    exampleTrigger: 'Pieza DESTINO FILETE pero las gates activas solo están configuradas para HG.',
  },
  // ═══════ RESIDUAL ═══════════════════════════════════════════════════════
  otro: {
    label: 'Otra causa',
    translation: 'Other',
    level: 'derived',
    icon: 'HelpCircle',
    color: 'zinc',
    subCauses: ['otro'],
    description: 'Causa no clasificada o registro ambiguo',
    shortDescription: 'La pieza se registró como P0 pero no pudimos determinar la causa específica con los datos disponibles.',
    howDetected: 'Ninguna de las reglas anteriores aplica o el registro está incompleto.',
    actionHint: 'Revisar registros individuales en el drill-down para identificar patrones.',
    exampleTrigger: 'Registro sin calibre/calidad detectables o causa nueva no mapeada.',
  },
}

/** Orden canónico para renderizar: primero las 4 oficiales, después las 5 derivadas */
export const MATRIX_CAUSE_ORDER_OFFICIAL: MatrixP0Cause[] = [
  'fuera_de_limites',
  'no_leido_fotocelula',
  'too_close_too_long',
  'puerta_no_preparada',
]

export const MATRIX_CAUSE_ORDER_DERIVED: MatrixP0Cause[] = [
  'fuera_de_calibre',
  'fuera_de_calidad',
  'fuera_de_conservacion',
  'fuera_de_producto',
  'otro',
]

export const MATRIX_CAUSE_ORDER_ALL: MatrixP0Cause[] = [
  ...MATRIX_CAUSE_ORDER_OFFICIAL,
  ...MATRIX_CAUSE_ORDER_DERIVED,
]

/**
 * Mapea una sub-causa interna (PointZeroCause) a causa Matrix canónica.
 * Para las causas derivadas (fuera_de_calibre, fuera_de_calidad, etc.), la
 * clasificación fina se hace en `graderAnalytics.ts` usando config de gates.
 */
export function toMatrixCause(subCause: PointZeroCause): MatrixP0Cause {
  for (const [matrixCause, def] of Object.entries(MATRIX_P0_CAUSES) as Array<[MatrixP0Cause, MatrixCauseMeta]>) {
    if ((def.subCauses as PointZeroCause[]).includes(subCause)) return matrixCause
  }
  return 'otro'
}

/**
 * Parsea el string de error del Excel P0 de Matrix a causa Matrix.
 *
 * Los strings "fuera de rango"/"fuera de límites" son ambiguos — pueden
 * provenir tanto de límites físicos como de la lógica de calibres. Este
 * parser les da un default conservador (fuera_de_limites); la clasificación
 * DERIVADA fina (calibre/calidad/conservación/producto) se hace en
 * `graderAnalytics.ts` cuando hay datos suficientes por pieza.
 */
/**
 * Label de causa para display. Cuando la causa es 'otro' (no clasificable),
 * devuelve el string crudo para que el usuario vea el nombre real del error
 * en lugar del genérico "Otra causa".
 * @param classifiedAs — Pasar si ya clasificaste con classifyRecordToMatrix / parseMatrixErrorString.
 */
export function getCauseLabel(rawError: string, classifiedAs?: MatrixP0Cause): string {
  const cause = classifiedAs ?? parseMatrixErrorString(rawError)
  if (cause === 'otro') return rawError || MATRIX_P0_CAUSES.otro.label
  return MATRIX_P0_CAUSES[cause].label
}

export function parseMatrixErrorString(raw: string): MatrixP0Cause {
  const s = (raw ?? '').toLowerCase().trim()
  const isFuera = s.includes('fuera de') || s.includes('fuera del') || s.includes('out of')
  // Prioridad 1: puerta (antes de "not read" porque "not ready" contiene "not read")
  if ((s.includes('puerta') || s.includes('door')) && (s.includes('prepar') || s.includes('ready'))) {
    return 'puerta_no_preparada'
  }
  // Prioridad 2: too_close_too_long (puede contener "long" o "close")
  if (s.includes('too close') || s.includes('too long') || s.includes('demasiado cerca') || s.includes('demasiado largo')) {
    return 'too_close_too_long'
  }
  // Prioridad 3: fotocélula — usar "not read by" específico para evitar match con "not ready"
  if (s.includes('fotoc') || s.includes('fotocelula') || s.includes('photocell') || s.includes('no leid') || s.includes('not read by')) {
    return 'no_leido_fotocelula'
  }
  // "fuera de rango"/"fuera de límites" → quedan como fuera_de_limites (oficial Matrix).
  // La descomposición derivada (calibre/calidad/conservación/producto) se hace
  // cuando hay pieceRecords con calidad/conservación/producto en graderAnalytics.
  if (isFuera && (s.includes('rango') || s.includes('range') || s.includes('límit') || s.includes('limit'))) {
    return 'fuera_de_limites'
  }
  return 'otro'
}
