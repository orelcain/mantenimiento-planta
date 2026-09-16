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
export function dec1(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
