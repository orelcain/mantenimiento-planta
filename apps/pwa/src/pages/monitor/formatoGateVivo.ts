/** Formato de las cifras del Grader en vivo (tanda 2): kg con coma, horas y rótulos de programa. */

/** Kilos con dos decimales y coma: 4,23. */
export const kg2 = (v: number) => v.toFixed(2).replace('.', ',') // decimal-tecnico: ya pasa a coma

/** `2026-11-19T03:21:38.000Z` → `03:21`. */
export const hhmm = (ts: string) => ts.slice(11, 16)

/** «8-10 lb · Premium» → «8-10 lb Premium» (para títulos y frases). */
export const programaTxt = (p: string) => p.replace(/ · /g, ' ')

/** «8-10 lb · Industrial» → «8-10 Industrial». */
export const sinLb = (p: string) => p.replace(/ lb · /g, ' ').replace(/ lb/g, '')

/** Tinte translúcido del acento sobre el fondo de la tarjeta: `--v2-acento` al `pct` %. */
export const acentoAl = (pct: number) => `color-mix(in srgb, var(--v2-acento) ${pct}%, transparent)`

/** Acento al `pct` % pero opaco sobre la tarjeta (las capas anidadas de la campana no se mezclan entre sí). */
export const acentoOpaco = (pct: number) => `color-mix(in srgb, var(--v2-acento) ${pct}%, rgb(var(--card)))`

/** Fondo de las tiras y de las bandas: el gris de `v2-subtarjeta`, que no existe fuera del monitor (en una hoja). */
export const FONDO_SUB = 'rgb(142 142 147 / 0.08)'

/** Porcentaje con dos decimales y coma: 0,75. */
export const coma2 = (v: number) => v.toFixed(2).replace('.', ',') // decimal-tecnico: ya pasa a coma
