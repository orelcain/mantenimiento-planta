/**
 * Con qué semana abre el Calendario de Mantención.
 *
 * POR QUÉ EXISTE
 * --------------
 * La planilla cargada llega hasta el **08/06/2026**. Como hoy (25/08) no está
 * ahí, el calendario caía en `Object.keys(weeks)[0]` — **la primera semana del
 * archivo**, la del 01/03, seis meses atrás. Para llegar a lo último cargado
 * había que apretar "›" catorce veces.
 *
 * Lo útil cuando la planilla no llega a hoy es lo **último** que sí tiene: es
 * lo más cercano a la realidad y desde ahí se navega hacia atrás si hace falta.
 * El aviso "la planilla llega al …" ya existe y sigue apareciendo.
 *
 * Las claves son ISO (`2026-W09`), así que ordenan bien como texto.
 */

export function semanaDeApertura(
  semanasDisponibles: readonly string[],
  semanaDeHoy: string,
): string | null {
  if (semanasDisponibles.length === 0) return null
  if (semanasDisponibles.includes(semanaDeHoy)) return semanaDeHoy

  const ordenadas = [...semanasDisponibles].sort()

  // Si la planilla se quedó atrás, la última cargada. Si empieza en el futuro
  // —planilla nueva todavía sin llegar—, la primera: en los dos casos, la que
  // más cerca queda de hoy.
  const anteriores = ordenadas.filter((s) => s < semanaDeHoy)
  if (anteriores.length > 0) return anteriores[anteriores.length - 1]!
  return ordenadas[0]!
}
