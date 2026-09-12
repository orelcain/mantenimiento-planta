/**
 * Aviso cuando parte de los turnos detectados en el Excel no tiene ni una pieza.
 *
 * **El contexto, medido sobre los archivos reales de julio 2025:** el pieza a
 * pieza cubre `2025-07-01 → 07-14` y el Puerta 0 `07-01 → 07-30`. Cargar los dos
 * —que es el uso normal— produce **54 turnos, de los cuales 37 no tienen ni una
 * pieza**: son los días que solo alcanza el Puerta 0. El 69 %.
 *
 * La barra del Wizard decía «Archivo multi-día detectado · 54 turnos» y ofrecía
 * «Guardar en Calendario» sin distinguirlos. `isP0Only` no cubre el caso: mira
 * `parsedData.pieceRecords.length === 0`, o sea el archivo entero, y con un
 * pieza a pieza cargado siempre es `false`.
 *
 * Guardarlos no es inocuo: un turno sin piezas se escribe con `merge` y termina
 * con causas de Puerta 0 y los KPIs de piezas que hubiera de antes —o ninguno—.
 */

/**
 * @param conPiezas turnos detectados con al menos una pieza
 * @param soloP0 turnos detectados sin ninguna pieza (solo rechazos de Puerta 0)
 * @returns el aviso, o null si no hay nada que advertir
 */
export function avisoDeTurnosSinPiezas(conPiezas: number, soloP0: number): string | null {
  if (soloP0 <= 0) return null
  if (conPiezas <= 0) return null // archivo de P0 suelto: el Wizard ya lo dice
  const t = soloP0 === 1 ? 'turno' : 'turnos'
  return `${soloP0} de los ${conPiezas + soloP0} ${t} no tienen ninguna pieza: solo rechazos de Puerta 0. El Puerta 0 cubre más días que el pieza a pieza — revisá que sean los dos archivos del mismo rango antes de guardar.`
}
