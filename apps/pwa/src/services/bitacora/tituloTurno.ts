import type { ResumenBitacora } from './resumenBitacora'
import { formatoMinutos } from './turnoMantencion'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * Título del turno: dice lo que pasó, no el nombre del módulo (criterio limpio, 08-11-2026).
 * Primero lo que costó a la línea. Vive en services para que el expediente de PC y el correo
 * digan lo mismo.
 */
export function tituloTurno(r: ResumenBitacora, fotos: number): string {
  if (r.eventos === 0) return 'Sin trabajos registrados en este turno'
  const trabajos = plural(r.eventos, 'trabajo', 'trabajos')
  if (r.conParada > 0) {
    const min = r.minutosParada > 0 ? ` ${formatoMinutos(r.minutosParada)}` : ''
    return `${trabajos}; ${plural(r.conParada, 'detuvo', 'detuvieron')} la máquina${min}`
  }
  if (r.afectados > 0) return `${trabajos}; ${r.afectados} ${r.afectados === 1 ? 'siguió' : 'siguieron'} gracias a Mantención`
  const conFotos = fotos > 0 ? ` y ${plural(fotos, 'foto', 'fotos')}` : ''
  return `${trabajos}${conFotos}; ninguno anotó detención`
}
