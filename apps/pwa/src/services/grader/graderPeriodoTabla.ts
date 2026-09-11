/**
 * Orden y nombre de archivo de la tabla «Turnos del período».
 *
 * Módulo aparte del componente para poder testearlo (mismo motivo que
 * `graderPurezaNivel`).
 */

/**
 * Lo mínimo que la tabla necesita de cada turno para ordenarlo.
 *
 * Sin index signature: `GraderDailySummary` no la tiene, y agregársela al tipo
 * del dominio solo para que encaje acá sería al revés. La clave se lee con un
 * acceso indexado explícito dentro del comparador.
 */
export interface FilaOrdenable {
  /** ISO del primer registro del turno. Es el instante real, no el nombre. */
  startAt?: string
}

/**
 * Compara dos filas por la columna elegida y **desempata por el instante real**.
 *
 * El desempate no es cosmético. En Chonchi los nombres de turno NO siguen el
 * orden del reloj: «Turno 1» es la NOCHE (arranca ~21:15) y «Turno 2» la mañana
 * (~07:15), con «Turno 1 Lunes» a las 00:00. Ordenando por fecha, los turnos de
 * un mismo día quedaban en el orden en que vinieran del array, y el 2026-08-17
 * —el único día del período con sus tres turnos— se leía así:
 *
 *     1 (21:19)  ·  1 Lunes (00:12)  ·  2 (10:17)       ← lo que mostraba
 *     1 Lunes (00:12)  ·  2 (10:17)  ·  1 (21:19)       ← el orden real
 *
 * Es la misma trampa que el CSV del turno (#942): **ordenar por la etiqueta del
 * reloj, o por el nombre, en vez de por el instante**.
 *
 * El desempate sigue la dirección elegida: con fechas descendentes, dentro del
 * día también se ve primero el turno más reciente.
 */
export function compararFilas<T extends FilaOrdenable>(
  a: T,
  b: T,
  clave: keyof T,
  dir: 'asc' | 'desc',
): number {
  const av = (a as Record<string, unknown>)[clave as string] as number | string | undefined
  const bv = (b as Record<string, unknown>)[clave as string] as number | string | undefined

  let cmp = 0
  if (av == null && bv == null) cmp = 0
  else if (av == null) return 1   // los vacíos al final, en las dos direcciones
  else if (bv == null) return -1
  else cmp = av < bv ? -1 : av > bv ? 1 : 0

  if (cmp !== 0) return dir === 'asc' ? cmp : -cmp

  const at = a.startAt ? Date.parse(a.startAt) : NaN
  const bt = b.startAt ? Date.parse(b.startAt) : NaN
  if (Number.isNaN(at) || Number.isNaN(bt)) return 0
  return dir === 'asc' ? at - bt : bt - at
}

/**
 * Nombre del CSV a partir de la etiqueta del rango.
 *
 * El slug era `rangeLabel.replace(/[^a-zA-Z0-9-]/g, '-')`, que convierte **cada**
 * carácter no ASCII en un guion: «Último mes» salía como `grader--ltimo-mes.csv`
 * — la «Ú» desaparecía y dejaba el guion doble. Ahora los acentos se pliegan a su
 * letra base antes de limpiar, y los guiones no se repiten.
 */
export function nombreArchivoCsv(rangeLabel: string): string {
  const slug = rangeLabel
    .normalize('NFD')
    .split('')
    // Sin regex de rango Unicode a proposito: escrito como un rango de marcas
    // archivo termina guardando las marcas combinantes LITERALES, invisibles en
    // el editor y faciles de romper al copiar. Filtrar por codigo es explicito.
    .filter((c) => { const n = c.charCodeAt(0); return n < 0x300 || n > 0x36f })
    .join('')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `grader-${slug || 'periodo'}.csv`
}
