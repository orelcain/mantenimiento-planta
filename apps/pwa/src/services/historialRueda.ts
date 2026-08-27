import type { MaquinaRueda } from './ruedaVentanas'

/**
 * Historial de deshacer de la rueda.
 *
 * Guarda la MÁQUINA COMPLETA, no el día que se está mirando. Antes guardaba solo
 * ese día, y había dos acciones que cambian varios de golpe: «copiar el día a
 * Lun-Vie» toca cuatro, y «copiar la semana de otra máquina» reemplaza los siete.
 * Deshacer restauraba uno y dejaba el resto pisado — trabajo perdido en silencio,
 * con el botón que debería salvarte diciendo que ya lo hizo.
 *
 * Una máquina son 7 días × 2 capas × 288 caracteres ≈ 4 KB, así que cuarenta
 * pasos son unos 160 KB en memoria: barato al lado de perder una semana cargada
 * a mano.
 */

export interface PasoHistorial {
  /** Máquina afectada, tal como estaba ANTES del cambio. */
  maquina: MaquinaRueda
  /** Día que se estaba mirando, para volver a él al deshacer. */
  dia: number
}

export const LIMITE_HISTORIAL = 40

/** Apila el estado previo. Devuelve un arreglo nuevo: no muta el que recibe. */
export function apilar(
  historial: PasoHistorial[],
  maquina: MaquinaRueda,
  dia: number,
  limite = LIMITE_HISTORIAL,
): PasoHistorial[] {
  const siguiente = [...historial, { maquina, dia }]
  return siguiente.length > limite ? siguiente.slice(siguiente.length - limite) : siguiente
}

export interface Deshecho {
  historial: PasoHistorial[]
  paso: PasoHistorial | null
}

export function desapilar(historial: PasoHistorial[]): Deshecho {
  if (!historial.length) return { historial, paso: null }
  return { historial: historial.slice(0, -1), paso: historial[historial.length - 1]! }
}

/**
 * Repone la máquina guardada. Si ya no existe —la borraron desde el editor— se
 * devuelve la lista intacta: reinsertarla resucitaría un equipo que alguien
 * eliminó a propósito, que es peor que no poder deshacer.
 */
export function restaurar(maquinas: MaquinaRueda[], paso: PasoHistorial): MaquinaRueda[] {
  if (!maquinas.some((m) => m.id === paso.maquina.id)) return maquinas
  return maquinas.map((m) => (m.id === paso.maquina.id ? paso.maquina : m))
}
