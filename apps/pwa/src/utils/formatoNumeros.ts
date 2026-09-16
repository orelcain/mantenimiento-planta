/**
 * Números decimales en español de Chile.
 *
 * `toFixed(1)` escribe el separador con PUNTO («87.3% del turno», «10.7 pz/min»)
 * mientras el resto de la app usa coma (`toLocaleString('es-CL')`). En la misma
 * pantalla convivían «5,0 min» y «87.3%»: en una planta donde el punto es el
 * separador de miles, eso se lee mal además de verse desprolijo.
 *
 * `dec1` es para mostrar. Para calcular, seguir usando el número.
 */
export function dec1(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/**
 * Dos decimales, para porcentajes finos (P0%) y montos.
 *
 * Acepta null/undefined y devuelve «—» porque medio módulo llama con datos que
 * pueden faltar (`m.targetCpm?.toFixed(2)`): así el que formatea no tiene que
 * repetir el guard en cada llamada.
 */
export function dec2(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Decimales variables, para los helpers que ya reciben cuántos quieren
 * (`pct(v, 0)`), donde `dec1`/`dec2` no sirven.
 */
export function dec(n: number | null | undefined, decimales: number): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('es-CL', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}
