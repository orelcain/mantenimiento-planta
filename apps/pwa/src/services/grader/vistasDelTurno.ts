/**
 * Qué pestañas ofrece el detalle de un turno, según la línea y el Excel.
 *
 * Módulo aparte de la página para poder testearlo (mismo motivo que
 * `graderPurezaNivel`).
 *
 * - **Gates** solo tiene sentido en la planta que CLASIFICA (Chonchi, Marelec
 *   MS4/12 por calibre + calidad). En Yal las gates físicas no tienen calibre ni
 *   calidad y la pestaña eran tarjetas vacías.
 * - **Calidad** sale entera del Excel del Grader: causas de Puerta 0, cuándo
 *   ocurrieron y los lotes. Filete **no pasa por Grader** (`hasGraderData:
 *   false`), así que nunca tiene nada. Y en una línea que sí pasa por Grader,
 *   un turno sin Excel dejaba la pestaña en blanco (Chonchi 51 de 77 turnos,
 *   Yal 109 de 109 desde el 1 de agosto): ahora no se ofrece.
 * - **Línea** ya no existe como pestaña: su contenido (máquinas upstream) va
 *   debajo del Resumen. Los links viejos `?vista=linea` se mapean a Resumen.
 */

export const TODAS_LAS_VISTAS = ['resumen', 'calidad', 'gates', 'mantencion', 'accion'] as const
export type VistaTurno = (typeof TODAS_LAS_VISTAS)[number]

/** Vistas que se retiraron y a dónde llevan los links viejos. */
export const VISTAS_RETIRADAS: Readonly<Record<string, VistaTurno>> = { linea: 'resumen' }

/** Vista inicial a partir del `?vista=` de la URL. Desconocida → Resumen. */
export function vistaDesdeUrl(param: string | null | undefined): VistaTurno {
  const v = param ?? ''
  if ((TODAS_LAS_VISTAS as readonly string[]).includes(v)) return v as VistaTurno
  return VISTAS_RETIRADAS[v] ?? 'resumen'
}

export function vistasDelTurno(linea: {
  clasifica: boolean
  tieneGrader: boolean
  /**
   * ¿El turno tiene Excel del Grader? Mientras el turno carga hay que pasar
   * `true` (decidir al terminar de cargar), para que un link directo a Calidad
   * no salte a Resumen antes de saber.
   */
  tieneExcel: boolean
}): VistaTurno[] {
  return TODAS_LAS_VISTAS.filter((v) => {
    if (v === 'gates') return linea.clasifica
    if (v === 'calidad') return linea.tieneGrader && linea.tieneExcel
    return true
  })
}
