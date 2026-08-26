/**
 * Mínimo y máximo de un array grande, sin desbordar el call stack.
 *
 * `Math.min(...arr)` pasa CADA elemento como argumento de función: con los
 * ~278.000 registros de un Excel pieza-a-pieza de 15 días, el navegador tira
 * `RangeError: Maximum call stack size exceeded` y la app entera se cae al
 * error boundary ("Algo salió mal"). Con un turno suelto (~9.000 piezas) nunca
 * pasaba, por eso el tope estaba escondido.
 *
 * Mismo criterio que `pushAll` en `graderExcelParser.ts`: recorrer en un loop.
 * Devuelven `null` con array vacío para obligar a decidir qué mostrar.
 */

export function minDe(valores: readonly number[]): number | null {
  let min: number | null = null
  for (let i = 0, len = valores.length; i < len; i++) {
    const v = valores[i]!
    if (min === null || v < min) min = v
  }
  return min
}

export function maxDe(valores: readonly number[]): number | null {
  let max: number | null = null
  for (let i = 0, len = valores.length; i < len; i++) {
    const v = valores[i]!
    if (max === null || v > max) max = v
  }
  return max
}
