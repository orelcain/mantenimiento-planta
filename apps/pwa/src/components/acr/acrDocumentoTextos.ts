/** Frases de la página del ACR (`AcrDocumento`, `CausaRaizDetallePage`). */

export function fraseDetencion(minutos: number | null): string {
  if (minutos == null) return 'Sin detención.'
  return `Detuvo la máquina ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`
}

export function totalFuertes(fuertes: number, total: number): string {
  return `${fuertes} de ${total} ${total === 1 ? 'acción' : 'acciones'} ${fuertes === 1 ? 'es fuerte' : 'son fuertes'}`
}

/** «2026-09-24_dia» → «Bitácora, turno día 24-09-2026». Sin evento, solo «Bitácora». */
export function rotuloVolver(turnoId: string | undefined): string {
  const [fecha, turno] = (turnoId ?? '').split('_')
  const partes = fecha?.split('-') ?? []
  if (partes.length !== 3 || !turno) return 'Bitácora'
  return `Bitácora, turno ${turno === 'dia' ? 'día' : turno} ${partes[2]}-${partes[1]}-${partes[0]}`
}
