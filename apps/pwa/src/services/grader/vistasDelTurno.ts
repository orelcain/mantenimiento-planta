/**
 * Qué pestañas ofrece el detalle de un turno, según la línea.
 *
 * Módulo aparte de la página para poder testearlo (mismo motivo que
 * `graderPurezaNivel`).
 *
 * - **Gates** solo tiene sentido en la planta que CLASIFICA (Chonchi, Marelec
 *   MS4/12 por calibre + calidad). En Yal las gates físicas no tienen calibre ni
 *   calidad y la pestaña eran tarjetas vacías.
 * - **Calidad** sale entera del Excel del Grader: causas de Puerta 0, cuándo
 *   ocurrieron y los lotes. Filete **no pasa por Grader** (`hasGraderData:
 *   false`), así que la pestaña nunca iba a tener nada: se abría en blanco.
 *
 * Medido desde el 1 de agosto, en turnos sin Excel del Grader la pestaña Calidad
 * quedaba **completamente en blanco** —ni una línea que dijera por qué—: Chonchi
 * 51 de 77 turnos, Yal 109 de 109, Filete 65 de 65.
 */

export const TODAS_LAS_VISTAS = ['resumen', 'calidad', 'gates', 'linea', 'mantencion', 'accion'] as const
export type VistaTurno = (typeof TODAS_LAS_VISTAS)[number]

export function vistasDelTurno(linea: { clasifica: boolean; tieneGrader: boolean }): VistaTurno[] {
  return TODAS_LAS_VISTAS.filter((v) => {
    if (v === 'gates') return linea.clasifica
    if (v === 'calidad') return linea.tieneGrader
    return true
  })
}
