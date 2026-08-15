/**
 * Orden físico de los calibres.
 *
 * El calibre es una escala ORDINAL ("2-4 lb" < "10-12 lb") y el `.sort()`
 * lexicográfico la rompe: "10-12 lb" quedaba antes que "2-4 lb" en todos los
 * ejes que los usaban. Regla de las guías de visualización: un eje ordinal
 * respeta la escala, nunca el alfabeto (_GUIAS/_DESTILADO_VISUALIZACION.md).
 *
 * Se compara por el primer número del rango; sin número o empatados, cae al
 * alfabeto para que el orden sea estable.
 */
export function compararCalibres(a: string, b: string): number {
  const numA = parseFloat(a.match(/\d+(\.\d+)?/)?.[0] ?? '')
  const numB = parseFloat(b.match(/\d+(\.\d+)?/)?.[0] ?? '')
  if (Number.isNaN(numA) && Number.isNaN(numB)) return a.localeCompare(b)
  if (Number.isNaN(numA)) return 1
  if (Number.isNaN(numB)) return -1
  if (numA === numB) return a.localeCompare(b)
  return numA - numB
}
