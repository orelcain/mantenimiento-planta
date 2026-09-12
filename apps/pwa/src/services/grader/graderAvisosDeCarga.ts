/**
 * Avisos sobre el Excel del Grader que se acaba de cargar.
 *
 * Módulo aparte del componente para poder testearlo (mismo motivo que
 * `graderPurezaNivel`).
 *
 * **El contexto:** `parseFile` ya devuelve `fileMeta.warnings` con avisos reales
 * del archivo —medido sobre los Excel de la temporada 2025-26:
 *
 *   «1075 registros sin pieza ("No aplicable"): el Matrix los cuenta como
 *    registros, la app no como piezas.»
 *   «Se encontraron 7586 registros Gate 0 en archivo pieza-pieza.»
 *
 * El primero explica por qué la app y el Matrix nunca dan el mismo número, que
 * es una pregunta recurrente. Ninguno se mostraba: la lista de archivos cargados
 * pinta un tilde verde, el tipo, el nombre y los registros, y nada más.
 */

/** Rango temporal que cubre un archivo, inferido por el parser. */
export interface RangoInferido {
  startAt?: string
  endAt?: string
}

const diaDe = (iso: string | undefined): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/**
 * Aviso cuando el turno de la sesión **no está dentro del rango del archivo**.
 *
 * Los Excel del Grader cubren un rango largo —los de la temporada van de medio
 * mes a un mes entero— y el usuario elige un turno dentro de ese rango. Si carga
 * el archivo equivocado (otro mes), el turno elegido no está en el archivo:
 * medido, el de julio cubre 2025-07-01 → 2025-07-14 y el de agosto 2025-08-25 →
 * 2025-08-30, 55 días de distancia.
 *
 * Eso no era solo un resumen vacío: al aceptar un PIEZA_PIEZA o PUERTA_0 el flujo
 * **borra el resumen que ya existía** para ese turno antes de saber si el archivo
 * lo contiene. Sin aviso, el turno bueno se pierde en silencio.
 *
 * @returns el aviso, o null si el turno cae dentro del rango (o no hay con qué
 *   juzgar: sin fechas no se inventa una alarma).
 */
export function avisoDeRango(sessionDate: string | null | undefined, rango: RangoInferido): string | null {
  if (!sessionDate) return null
  const desde = diaDe(rango.startAt)
  const hasta = diaDe(rango.endAt) ?? desde
  if (!desde || !hasta) return null
  if (sessionDate >= desde && sessionDate <= hasta) return null
  return `El archivo cubre del ${desde} al ${hasta}, y el turno que estás cargando es del ${sessionDate}: no está adentro. Revisá que sea el Excel correcto.`
}

/**
 * Todos los avisos de un archivo: los del parser más el de rango.
 *
 * Se devuelven juntos porque en pantalla son lo mismo — cosas que mirar antes de
 * dar el turno por cargado.
 */
export function avisosDelArchivo(
  warningsDelParser: readonly string[] | undefined,
  sessionDate: string | null | undefined,
  rango: RangoInferido,
): string[] {
  const rangoAviso = avisoDeRango(sessionDate, rango)
  return [...(warningsDelParser ?? []), ...(rangoAviso ? [rangoAviso] : [])]
}
