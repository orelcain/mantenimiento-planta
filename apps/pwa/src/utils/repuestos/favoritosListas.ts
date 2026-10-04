import type { FavList } from '@/services/userPreferences'

/**
 * Lógica pura de las listas de favoritos de equipos para poder DESHACER un «quitar».
 * Hoy, quitar el último equipo de una lista borra la lista entera; para deshacerlo hay
 * que recordar dónde estaba el equipo y dónde estaba la lista.
 */

export interface FavoritoQuitado {
  listName: string
  machineId: string
  /** Nombre guardado en `machineNames`, si existía. */
  machineName?: string
  /** Posición del equipo dentro de su lista antes de quitarlo. */
  index: number
  /** Posición de la lista dentro del arreglo antes de quitarla (si quedó vacía). */
  listIndex: number
}

/**
 * Quita el equipo de la lista. Si la lista queda vacía se BORRA (como hace la app hoy).
 * Si la lista o el equipo no existen, devuelve las mismas listas y `quitado: null`.
 */
export function quitarEquipoDeLista(
  lists: FavList[],
  listName: string,
  machineId: string,
): { lists: FavList[]; quitado: FavoritoQuitado | null } {
  const listIndex = lists.findIndex((l) => l.name === listName)
  if (listIndex < 0) return { lists, quitado: null }
  const lista = lists[listIndex]!
  const index = lista.machineIds.indexOf(machineId)
  if (index < 0) return { lists, quitado: null }

  const quitado: FavoritoQuitado = {
    listName,
    machineId,
    machineName: lista.machineNames?.[machineId],
    index,
    listIndex,
  }
  const machineIds = lista.machineIds.filter((id) => id !== machineId)
  if (machineIds.length === 0) {
    return { lists: lists.filter((_, i) => i !== listIndex), quitado }
  }
  let machineNames = lista.machineNames
  if (machineNames && machineId in machineNames) {
    const { [machineId]: _omit, ...resto } = machineNames
    machineNames = resto
  }
  const nueva: FavList = { ...lista, machineIds, ...(machineNames ? { machineNames } : {}) }
  return { lists: lists.map((l, i) => (i === listIndex ? nueva : l)), quitado }
}

/**
 * Devuelve el equipo a su posición original. Si la lista ya no existe (quedó vacía y se
 * borró) la recrea en su posición. Si el equipo ya está en la lista no hace nada
 * (misma referencia). No muta la entrada.
 */
export function restoreEquipToList(lists: FavList[], q: FavoritoQuitado): FavList[] {
  const clamp = (n: number, max: number) => Math.min(Math.max(Number.isFinite(n) ? n : 0, 0), max)
  const listIndex = lists.findIndex((l) => l.name === q.listName)

  if (listIndex < 0) {
    const nueva: FavList = {
      name: q.listName,
      machineIds: [q.machineId],
      ...(q.machineName !== undefined ? { machineNames: { [q.machineId]: q.machineName } } : {}),
    }
    const pos = clamp(q.listIndex, lists.length)
    return [...lists.slice(0, pos), nueva, ...lists.slice(pos)]
  }

  const lista = lists[listIndex]!
  if (lista.machineIds.includes(q.machineId)) return lists
  const pos = clamp(q.index, lista.machineIds.length)
  const machineIds = [...lista.machineIds.slice(0, pos), q.machineId, ...lista.machineIds.slice(pos)]
  const machineNames = q.machineName !== undefined
    ? { ...lista.machineNames, [q.machineId]: q.machineName }
    : lista.machineNames
  const restaurada: FavList = { ...lista, machineIds, ...(machineNames ? { machineNames } : {}) }
  return lists.map((l, i) => (i === listIndex ? restaurada : l))
}
