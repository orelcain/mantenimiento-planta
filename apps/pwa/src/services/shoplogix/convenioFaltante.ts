/**
 * ¿Este turno se quedó sin convenio registrado?
 *
 * POR QUÉ EXISTE
 * --------------
 * Turno de noche del 25-08 en Eviscerado de Planta Principal. El desglose del
 * tiempo cerraba perfecto **sin una sola parada de convenio**:
 *
 *     ventana 450 = produciendo 382 + convenio 0 + recuperable 68
 *
 * Los seis turnos de noche comparables anteriores traen entre 46 y 65 minutos
 * de convenio. Una noche de siete horas y media sin colación no es lo que pasó:
 * lo que pasó es que no quedó registrada como tal.
 *
 * Dos consecuencias, las dos en contra de Mantención:
 *
 * 1. El bloque «Qué cambió contra ayer» acreditaba **+2.497 pz** al renglón
 *    «Menos convenio · 0 min contra 58», como si el turno hubiera ganado ese
 *    tiempo. No lo ganó: nadie lo anotó.
 * 2. Si la colación se registró con otra etiqueta, queda contada como **parada
 *    evitable**. Ese turno tiene una «Detencion» de 59,5 min de 01:34 a 02:33
 *    —una hora, a mitad de la noche— valorizada en más de 2.500 piezas
 *    perdidas.
 *
 * Esto NO afirma que esa parada sea la colación: eso no lo sabe la pantalla.
 * Afirma lo que sí se puede sostener —que el convenio no está registrado y que
 * los turnos iguales sí lo traen— para que nadie lea el «+2.497» como una
 * mejora y para que alguien pueda ir a corregir la imputación en Shoplogix.
 */

/** Lo mínimo que se necesita de un turno anterior del mismo nombre. */
export interface TurnoConConvenio {
  plannedMin?: number | null
}

export interface ConvenioFaltante {
  /** Mediana de convenio de los turnos comparables que sí lo traen, en min. */
  tipicoMin: number
  /** Cuántos de los comparables traen convenio. */
  turnosCon: number
  /** Cuántos turnos comparables se miraron. */
  turnosMirados: number
}

/** Menos de esto es "no hay convenio", no "hubo poco". */
const UMBRAL_MIN = 5
/** Con menos comparables no hay con qué sostener la sospecha. */
const COMPARABLES_MIN = 3
/** Y tiene que ser lo habitual, no la excepción. */
const FRACCION_MIN = 0.6

export function convenioFaltante(
  plannedMinHoy: number | null | undefined,
  historia: readonly TurnoConConvenio[] | null | undefined,
): ConvenioFaltante | null {
  const hoy = Number(plannedMinHoy ?? 0)
  if (!(hoy < UMBRAL_MIN)) return null

  /*
   * ⚠ `Number(null)` es 0: filtrar solo por `Number.isFinite` metía como
   * "turno SIN convenio" al turno que no trae el dato, y eso diluye la
   * fracción hasta apagar el aviso. Es la misma trampa que ya mordió en
   * `ritmoPorMaquina`.
   */
  const mirados = (historia ?? [])
    .filter((h) => h?.plannedMin != null)
    .map((h) => Number(h.plannedMin))
    .filter((n) => Number.isFinite(n) && n >= 0)
  if (mirados.length < COMPARABLES_MIN) return null

  const con = mirados.filter((n) => n >= UMBRAL_MIN).sort((a, b) => a - b)
  if (con.length / mirados.length < FRACCION_MIN) return null

  const mitad = Math.floor(con.length / 2)
  const tipico = con.length % 2 ? con[mitad]! : (con[mitad - 1]! + con[mitad]!) / 2
  return { tipicoMin: Math.round(tipico), turnosCon: con.length, turnosMirados: mirados.length }
}
