/**
 * Qué mide el color de la matriz de turnos.
 *
 * Vive fuera del componente para que el archivo de la Matriz exporte solo
 * componentes (regla `react-refresh/only-export-components`: mezclar
 * constantes y componentes rompe el fast refresh).
 */
import type { PeriodShift } from '@/services/grader/graderShiftPeriod'

export type MatrixKpi = 'cycles' | 'uptime' | 'pieces' | 'p0'

export interface MatrixKpiMeta {
  id: MatrixKpi
  label: string
  scaleLo: string
  scaleHi: string
  /** Acumulable: solo estos admiten una fila Σ 24 h con sentido. */
  additive: boolean
}

/**
 * `cycles` va primero — es el default de la vista.
 *
 * No es una preferencia estética: al validar contra Firestore había 3
 * `graderDailySummaries` en toda la base desde mayo 2026, así que arrancar en
 * "Pzs OK" mostraría una matriz vacía y parecería que la vista está rota. Los
 * ciclos de Shoplogix sí tienen datos densos en las tres plantas.
 */
export const MATRIX_KPIS: readonly MatrixKpiMeta[] = [
  { id: 'cycles', label: 'Ciclos', scaleLo: 'menos',     scaleHi: 'más',        additive: true  },
  { id: 'uptime', label: 'UPT',    scaleLo: 'menor UPT', scaleHi: 'mayor UPT',  additive: false },
  { id: 'pieces', label: 'Pzs OK', scaleLo: 'menos',     scaleHi: 'más',        additive: true  },
  { id: 'p0',     label: 'P0 %',   scaleLo: 'menor P0',  scaleHi: 'mayor P0',   additive: false },
]

export const DEFAULT_MATRIX_KPI: MatrixKpi = 'cycles'

export function matrixKpiMeta(kpi: MatrixKpi): MatrixKpiMeta {
  return MATRIX_KPIS.find(k => k.id === kpi) ?? MATRIX_KPIS[0]!
}

/** Valor del KPI en un turno, o null si ese turno no tiene ese dato. */
export function matrixKpiValue(s: PeriodShift, kpi: MatrixKpi): number | null {
  switch (kpi) {
    case 'cycles': return s.cycles > 0 ? s.cycles : null
    case 'uptime': return s.uptimePct
    case 'pieces': return s.pieces
    case 'p0':     return s.p0Pct
  }
}

export function formatMatrixKpi(v: number, kpi: MatrixKpi): string {
  if (kpi === 'uptime') return `${Math.round(v)} %`
  if (kpi === 'p0') return `${v.toFixed(1).replace('.', ',')} %`
  return v.toLocaleString('es-CL')
}

/**
 * ¿Necesita atención? Único uso de "estado" en la vista, y se dibuja en FORMA
 * (esquina), nunca como color de fondo — el fondo ya está ocupado por magnitud.
 */
export function isBelowMatrixTarget(s: PeriodShift, kpi: MatrixKpi): boolean {
  if (kpi === 'uptime') return s.uptimePct != null && s.uptimePct < 55
  if (kpi === 'p0') return s.p0Pct != null && s.p0Pct > 7
  return s.lowActivity
}
