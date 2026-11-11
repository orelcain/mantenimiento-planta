/**
 * Modo lectura global (opción A, 10-11-2026): una preferencia por dispositivo que
 * aplana las tarjetas del contenido en secciones con filete y sube la letra base.
 *
 * - Se guarda en `app-lectura` ('1' = activo). Sin valor guardado vale
 *   `LECTURA_PREDETERMINADA`.
 * - Se aplica como `data-modo-lectura="on"` en <html>. El script inline de
 *   index.html lo pone antes del primer pintado (misma regla que aquí) y la capa
 *   CSS vive en index.css, acotada a `#main-content` y a la piel Apple.
 * - Las pantallas hechas a mano en lectura (Informe de turno, Jack-Knife, Período,
 *   Causa raíz) no dependen de esto: bajo la piel Apple ya son su forma de lectura.
 */
import { escribirAlmacen, leerAlmacen } from '@/lib/intensidad'

export const CLAVE_LECTURA = 'app-lectura'
export const ATRIBUTO_LECTURA = 'data-modo-lectura'
export const EVENTO_LECTURA = 'app-lectura-cambio'
/** Sin elección guardada: apagado (la persona lo activa desde el menú o el encabezado). */
export const LECTURA_PREDETERMINADA = false

/** Regla pura: valor guardado → activo. */
export function lecturaDe(guardada: string | null): boolean {
  if (guardada === '1') return true
  if (guardada === '0') return false
  return LECTURA_PREDETERMINADA
}

export function lecturaActual(): boolean {
  return lecturaDe(leerAlmacen(CLAVE_LECTURA))
}

export function aplicarLectura(activo: boolean): void {
  const root = document.documentElement
  if (activo) root.setAttribute(ATRIBUTO_LECTURA, 'on')
  else root.removeAttribute(ATRIBUTO_LECTURA)
}

/** Elige, aplica, recuerda y avisa a los demás controles montados. */
export function elegirLectura(activo: boolean): void {
  aplicarLectura(activo)
  escribirAlmacen(CLAVE_LECTURA, activo ? '1' : '0')
  window.dispatchEvent(new CustomEvent(EVENTO_LECTURA, { detail: activo }))
}
