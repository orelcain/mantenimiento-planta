/**
 * Fecha y hora de un instante de planta del Jack-Knife, «7-nov 14:05».
 * HORA: `inicioMs` es hora de planta guardada como UTC → getters UTC, nunca la hora local del navegador.
 */
export const MESES_ABR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'] as const

export function fechaHoraJK(ms: number): string {
  const d = new Date(ms)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${d.getUTCDate()}-${MESES_ABR[d.getUTCMonth()]} ${hh}:${mm}`
}
