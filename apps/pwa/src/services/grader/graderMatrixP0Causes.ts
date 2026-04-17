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
  color: 'red' | 'amber' | 'blue' | 'zinc'
  subCauses: PointZeroCause[]
  defaultActionHint: string
}> = {
  fuera_de_limites: {
    label: 'Fuera de límites',
    description: 'Peso fuera del rango de los calibres configurados',
    icon: 'ScaleOff',
    color: 'red',
    subCauses: ['fuera_de_rango', 'fuera_de_limites'],
    defaultActionHint: 'Revisar rangos de calibres configurados y verificar contrastación de balanza',
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
 */
export function parseMatrixErrorString(raw: string): MatrixP0Cause {
  const s = (raw ?? '').toLowerCase().trim()
  if ((s.includes('fuera de') || s.includes('fuera del')) &&
      (s.includes('límit') || s.includes('limit'))) return 'fuera_de_limites'
  if (s.includes('fotoc') || s.includes('no le') || s.includes('fotocelula')) return 'no_leido_fotocelula'
  if (s.includes('puerta') && s.includes('prepar')) return 'puerta_no_preparada'
  return 'otro'
}
