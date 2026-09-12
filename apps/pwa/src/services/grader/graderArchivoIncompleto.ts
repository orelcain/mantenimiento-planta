/**
 * Diagnóstico del Excel que se lee vacío porque **está truncado**.
 *
 * **Medido sobre la temporada 2025-26:** de los 40 Excel del Grader en disco,
 * dos pieza a pieza de ~8,6 MB se leen **sin un solo registro**:
 *
 *   Pieza pieza Grader STATICGRADER1 (20251110_000000 - 20251120_000000).xlsx
 *   Pieza pieza Grader STATICGRADER1 (20251120_000000 - 20251130_000000).xlsx
 *
 * Su `xl/worksheets/sheet1.xml` **corta a media celda** alrededor de la fila
 * 204.100 de las 308.539 que declara el `<dimension>`, sin cerrar `</sheetData>`
 * ni `</worksheet>`: la exportación desde Matrix se cortó. SheetJS no lanza
 * error — devuelve la hoja con el rango declarado y **cero celdas**.
 *
 * No es el tamaño: el pieza a pieza del 15→31 de julio tiene un `sheet1.xml` de
 * **135 MB** (contra los 93 MB de los truncados) y parsea sus 277.841 registros
 * sin problema.
 *
 * Lo que el usuario veía era «No se encontró fila de cabecera válida», que manda
 * a revisar las columnas de un archivo cuyas columnas están perfectas. El
 * camino real —el que siguió Orel— es volver a exportar en rangos más chicos:
 * los mismos días salen bien en dos archivos de 5 días.
 */

/** Cuántas filas declara el `!ref` de la hoja (`A1:K308539` → 308539). */
function filasDeclaradas(ref: string | undefined): number {
  if (!ref) return 0
  const fin = ref.split(':')[1]
  const n = fin?.match(/\d+$/)?.[0]
  return n ? Number(n) : 0
}

/**
 * @param ref el `!ref` de la hoja, tal como lo deja SheetJS
 * @param celdasLeidas cuántas celdas reales trajo la hoja
 * @returns el aviso, o null si no corresponde (hoja con datos, o genuinamente vacía)
 */
export function avisoDeArchivoIncompleto(ref: string | undefined, celdasLeidas: number): string | null {
  if (celdasLeidas > 0) return null
  const filas = filasDeclaradas(ref)
  if (filas <= 1) return null // hoja vacía de verdad: no hay nada que diagnosticar
  return `El archivo está incompleto: la hoja declara ${filas.toLocaleString('es-CL')} filas y no se pudo leer ninguna. La exportación desde Matrix se cortó a mitad — volvé a exportarlo, en un rango de días más chico.`
}
