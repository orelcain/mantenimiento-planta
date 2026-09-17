/**
 * Vibración corta al guardar, cerrar un pendiente, soltar un evento arrastrado
 * o borrar (mockup iOS 27, 17-09-2026): con guantes y ruido de planta, el
 * técnico no siempre mira la pantalla al tocar. Solo Android la tiene; Safari
 * en iPhone no permite vibrar desde una página y ahí no pasa nada.
 */
export const VIBRA_OK = 15
export const VIBRA_ERROR = [20, 80, 20]

export function vibrar(patron: number | number[] = VIBRA_OK): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(patron)
  } catch {
    /* sin permiso o sin motor: se ignora */
  }
}
