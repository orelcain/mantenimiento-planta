/**
 * Tamaño de letra de la bitácora (HIG «Typography» + «Accessibility», 19-09-2026).
 *
 * La escala tipográfica de la app está en px (tailwind.config.js) multiplicada por
 * `--escala-texto`: con 1 la app queda idéntica. La bitácora la cambia mientras
 * está abierta.
 *
 * - iPhone: «Como el iPhone» sigue el tamaño de letra de Ajustes (Dynamic Type
 *   para la web, `font: -apple-system-body`), que es lo que el HIG pide respetar.
 * - Android y PC: Chrome no le entrega ese ajuste a la web de forma confiable, así
 *   que hay un selector propio, guardado en cada teléfono.
 *
 * Tope 135 % (el máximo normal de iOS, «xxxLarge»): hasta ahí se revisó con capturas
 * reales que nada se corta. Los tamaños de accesibilidad de iOS (hasta ~310 %) quedan
 * en 135 %: para más, el zoom con dos dedos ya no está bloqueado.
 */

export type TamanoLetra = 'telefono' | 'normal' | 'grande' | 'muy-grande'

export const ESCALA_MAXIMA = 1.35
/** Body de iOS en el tamaño por defecto («Large»): 17 pt. */
const CUERPO_IOS = 17

export const ESCALA_TAMANO: Record<Exclude<TamanoLetra, 'telefono'>, number> = {
  normal: 1,
  grande: 1.18,
  'muy-grande': ESCALA_MAXIMA,
}

export const OPCIONES_TAMANO: { value: TamanoLetra; label: string }[] = [
  { value: 'telefono', label: 'Como el iPhone' },
  { value: 'normal', label: 'Normal' },
  { value: 'grande', label: 'Grande' },
  { value: 'muy-grande', label: 'Muy grande' },
]

const CLAVE = 'bitacora.tamanoLetra'

/**
 * Escala a partir del cuerpo de texto que reporta iOS (px). Nunca achica: bajo 17
 * la escala de la app caería bajo su piso de 11 px. Redondeada a centésimas.
 */
export function escalaDesdeCuerpoIos(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return 1
  const e = Math.min(ESCALA_MAXIMA, Math.max(1, px / CUERPO_IOS))
  return Math.round(e * 100) / 100
}

/** La escala a aplicar. «Como el iPhone» sin iPhone (o sin dato) = normal. */
export function escalaDe(tamano: TamanoLetra, escalaTelefono: number | null): number {
  if (tamano === 'telefono') return escalaTelefono ?? 1
  return ESCALA_TAMANO[tamano]
}

export function esTamanoLetra(v: unknown): v is TamanoLetra {
  return v === 'telefono' || v === 'normal' || v === 'grande' || v === 'muy-grande'
}

/** Lo guardado en este teléfono; si no hay nada: seguir al iPhone donde se puede, si no, normal. */
export function leerTamanoLetra(hayTelefono: boolean): TamanoLetra {
  let guardado: string | null = null
  try {
    guardado = localStorage.getItem(CLAVE)
  } catch {
    // Almacenamiento bloqueado (modo privado): se usa el valor por defecto.
  }
  if (esTamanoLetra(guardado) && (guardado !== 'telefono' || hayTelefono)) return guardado
  return hayTelefono ? 'telefono' : 'normal'
}

export function guardarTamanoLetra(tamano: TamanoLetra): void {
  try {
    localStorage.setItem(CLAVE, tamano)
  } catch {
    // Sin almacenamiento: el cambio vale mientras la página esté abierta.
  }
}
