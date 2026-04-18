/**
 * Mapeo de causas oficiales Matrix (3 + otra) a sub-causas internas (6)
 * y helpers de clasificación de strings de error del Excel P0.
 */

import type { MatrixP0Cause } from './graderShiftTimeline'
import type { PointZeroCause } from './types'

export const MATRIX_P0_CAUSES: Record<MatrixP0Cause, {
  label: string
  description: string
  icon: string
  color: 'red' | 'orange' | 'amber' | 'blue' | 'zinc'
  subCauses: PointZeroCause[]
  defaultActionHint: string
}> = {
  fuera_de_rangos: {
    label: 'Fuera de rangos',
    description: 'Peso de la pieza no encaja en ningún calibre configurado en gates',
    icon: 'SlidersHorizontal',
    color: 'orange',
    subCauses: ['fuera_de_rango'],
    defaultActionHint: 'Ajustar rangos de calibres en configuración de gates para cubrir la distribución real de peso',
  },
  fuera_de_limites: {
    label: 'Fuera de límites',
    description: 'Peso fuera de los límites físicos del sistema Marelec (hardware)',
    icon: 'ScaleOff',
    color: 'red',
    subCauses: ['fuera_de_limites'],
    defaultActionHint: 'Verificar contrastación de balanza y calibración del sensor de peso',
  },
  no_leido_fotocelula: {
    label: 'No leído por fotocélula',
    description: 'Sensor no detectó la pieza: peces muy juntos, fotocélula sucia o eye sync desajustado',
    icon: 'EyeOff',
    color: 'amber',
    subCauses: ['no_leido_fotocelula', 'too_close_too_long'],
    defaultActionHint: 'Limpiar fotocélula, revisar gap entre peces, verificar eye sync',
  },
  puerta_no_preparada: {
    label: 'Puerta no preparada',
    description: 'Flipper estaba ocupado cuando llegó la pieza: timing o cadencia mal ajustados',
    icon: 'Clock',
    color: 'blue',
    subCauses: ['puerta_no_preparada'],
    defaultActionHint: 'Bajar cadencia, revisar timing de gate crítico, verificar presión neumática',
  },
  otro: {
    label: 'Otra causa',
    description: 'Causa no clasificada o registro ambiguo',
    icon: 'HelpCircle',
    color: 'zinc',
    subCauses: ['otro'],
    defaultActionHint: 'Revisar registros individuales en drill-down',
  },
}

/**
 * Mapea una sub-causa interna (6) a la causa oficial Matrix (3 + otra).
 */
export function toMatrixCause(subCause: PointZeroCause): MatrixP0Cause {
  for (const [matrixCause, def] of Object.entries(MATRIX_P0_CAUSES) as Array<[MatrixP0Cause, typeof MATRIX_P0_CAUSES['otro']]>) {
    if ((def.subCauses as PointZeroCause[]).includes(subCause)) return matrixCause
  }
  return 'otro'
}

/**
 * Parsea el string de error de la columna "Error" del Excel P0 de Matrix
 * a una causa oficial.
 *
 * Distingue:
 *  - "fuera de rango/rangos" → `fuera_de_rangos` (config de calibres en gates)
 *  - "fuera de límites" → `fuera_de_limites` (hardware físico)
 * Si el string menciona ambos o es ambiguo, prioriza "rangos" (config) porque
 * es la causa más común que el operador puede corregir directamente.
 */
export function parseMatrixErrorString(raw: string): MatrixP0Cause {
  const s = (raw ?? '').toLowerCase().trim()
  const isFuera = s.includes('fuera de') || s.includes('fuera del')
  if (isFuera && (s.includes('rango'))) return 'fuera_de_rangos'
  if (isFuera && (s.includes('límit') || s.includes('limit'))) return 'fuera_de_limites'
  if (s.includes('fotoc') || s.includes('no le') || s.includes('fotocelula')) return 'no_leido_fotocelula'
  if (s.includes('puerta') && s.includes('prepar')) return 'puerta_no_preparada'
  return 'otro'
}
