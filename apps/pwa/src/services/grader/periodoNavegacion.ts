/**
 * Navegación del período único del Análisis de Turno (piel Apple).
 *
 * Una sola referencia de fecha manda la pantalla: el día elegido. Día, semana
 * y mes se leen desde ella. Mover el período mueve esa referencia (un día, siete
 * días o un mes); la matriz toma el mes de la referencia y el tablero de
 * indicadores toma el período. Así no hay dos fuentes de verdad.
 */
export type PeriodoAnalisis = 'day' | 'week' | 'month'

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** «2026-11-07» → Date a mediodía local (evita el corrimiento de día por huso). */
export function fechaDeClave(clave: string): Date {
  const [y, m, d] = clave.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12)
}

/** Date → «2026-11-07» en hora local. */
export function claveDeFecha(f: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}`
}

/** Mueve la referencia un período hacia atrás (-1) o adelante (+1). */
export function desplazarPeriodo(ref: Date, periodo: PeriodoAnalisis, dir: -1 | 1): Date {
  if (periodo === 'month') return new Date(ref.getFullYear(), ref.getMonth() + dir, 1, 12)
  const dias = periodo === 'week' ? 7 : 1
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + dir * dias, 12)
}

/**
 * Lo que se muestra entre las flechas: «7 nov», «1 al 7 nov» (o «26 oct al 1 nov»
 * si la semana cruza de mes) y «noviembre 2026».
 */
export function etiquetaPeriodo(ref: Date, periodo: PeriodoAnalisis): string {
  const mes = ref.getMonth()
  if (periodo === 'month') {
    const largo = MESES_LARGOS[mes]!
    return `${largo.charAt(0).toUpperCase()}${largo.slice(1)} ${ref.getFullYear()}`
  }
  if (periodo === 'day') return `${ref.getDate()} ${MESES_CORTOS[mes]}`
  const inicio = new Date(ref.getFullYear(), mes, ref.getDate() - 6, 12)
  if (inicio.getMonth() === mes) return `${inicio.getDate()} al ${ref.getDate()} ${MESES_CORTOS[mes]}`
  return `${inicio.getDate()} ${MESES_CORTOS[inicio.getMonth()]} al ${ref.getDate()} ${MESES_CORTOS[mes]}`
}
