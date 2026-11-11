import type { FavList } from '@/services/userPreferences'

/**
 * Lógica pura de la hoja «Editar favoritos de equipos».
 *
 * Se edita un BORRADOR en memoria; nada toca Firestore hasta «Guardar». Quitar equipos o
 * eliminar listas es lo único que pide la clave del usuario (`requiereClave`): agregar,
 * renombrar y reordenar no destruyen nada.
 *
 * Cada lista del borrador lleva una `key` estable y, si venía guardada, su `origen` (el nombre
 * original). Así renombrar una lista no se confunde con eliminarla y crear otra.
 */

export interface ItemBorrador {
  id: string
  nombre: string
  /** Agregado en esta tanda (aún no guardado). Quitarlo antes de guardar no cuenta como quita. */
  nuevo: boolean
  /** Marcado para quitar al guardar (solo equipos que ya estaban guardados). */
  quitar: boolean
}

export interface ListaBorrador {
  key: string
  /** Nombre con el que estaba guardada; `undefined` si la lista es nueva. */
  origen?: string
  nombre: string
  items: ItemBorrador[]
  /** Marcada para eliminar al guardar. */
  eliminada: boolean
}

export interface EquipoQuitado { lista: string; machineId: string; nombre: string }
export interface EquipoAgregado { lista: string; machineId: string }

export interface DiffFavoritos {
  quitados: EquipoQuitado[]
  listasEliminadas: string[]
  agregados: EquipoAgregado[]
  renombres: { de: string; a: string }[]
  hayCambios: boolean
  requiereClave: boolean
}

let contadorKey = 0
const nuevaKey = () => `lista-${++contadorKey}`

/** Borrador inicial: una copia editable de lo guardado. `nombreDe` completa los nombres que falten. */
export function crearBorrador(listas: FavList[], nombreDe: (id: string) => string = (id) => id): ListaBorrador[] {
  return listas.map((l) => ({
    key: nuevaKey(),
    origen: l.name,
    nombre: l.name,
    eliminada: false,
    items: l.machineIds.map((id) => ({ id, nombre: l.machineNames?.[id] || nombreDe(id), nuevo: false, quitar: false })),
  }))
}

const mapLista = (b: ListaBorrador[], key: string, f: (l: ListaBorrador) => ListaBorrador) =>
  b.map((l) => (l.key === key ? f(l) : l))

/** Agrega varios equipos a una lista sin duplicar (un equipo marcado para quitar se des-marca). */
export function agregarEquipos(
  b: ListaBorrador[],
  key: string,
  equipos: { id: string; nombre: string }[],
): ListaBorrador[] {
  return mapLista(b, key, (l) => {
    const items = [...l.items]
    for (const e of equipos) {
      const i = items.findIndex((x) => x.id === e.id)
      if (i >= 0) {
        if (items[i]!.quitar) items[i] = { ...items[i]!, quitar: false }
        continue
      }
      items.push({ id: e.id, nombre: e.nombre, nuevo: true, quitar: false })
    }
    return { ...l, items }
  })
}

/** Crea una lista nueva al final. Devuelve `null` en `key` si el nombre está vacío o repetido. */
export function crearLista(b: ListaBorrador[], nombre: string): { borrador: ListaBorrador[]; key: string | null } {
  const limpio = nombre.trim()
  if (!limpio || nombreEnUso(b, limpio)) return { borrador: b, key: null }
  const key = nuevaKey()
  return { borrador: [...b, { key, nombre: limpio, items: [], eliminada: false }], key }
}

function nombreEnUso(b: ListaBorrador[], nombre: string, exceptoKey?: string): boolean {
  const n = nombre.trim().toLowerCase()
  return b.some((l) => !l.eliminada && l.key !== exceptoKey && l.nombre.trim().toLowerCase() === n)
}

/** Renombra sin permitir vacío ni repetido (ignora mayúsculas). Si no es válido, devuelve el mismo borrador. */
export function renombrarLista(b: ListaBorrador[], key: string, nombre: string): ListaBorrador[] {
  const limpio = nombre.trim()
  if (!limpio || nombreEnUso(b, limpio, key)) return b
  return mapLista(b, key, (l) => ({ ...l, nombre: limpio }))
}

/**
 * Marca o des-marca un equipo para quitar. Un equipo nuevo (de esta tanda) se retira del
 * borrador directamente: no existía antes, así que no cuenta como quita.
 */
export function alternarQuitar(b: ListaBorrador[], key: string, id: string): ListaBorrador[] {
  return mapLista(b, key, (l) => {
    const it = l.items.find((x) => x.id === id)
    if (!it) return l
    if (it.nuevo) return { ...l, items: l.items.filter((x) => x.id !== id) }
    return { ...l, items: l.items.map((x) => (x.id === id ? { ...x, quitar: !x.quitar } : x)) }
  })
}

/** Marca o des-marca la lista entera para eliminar. Una lista nueva (sin guardar) se retira sin más. */
export function alternarEliminarLista(b: ListaBorrador[], key: string): ListaBorrador[] {
  const l = b.find((x) => x.key === key)
  if (!l) return b
  if (l.origen === undefined) return b.filter((x) => x.key !== key)
  return mapLista(b, key, (x) => ({ ...x, eliminada: !x.eliminada }))
}

/** Mueve un equipo dentro de su lista (índices sobre `items`, incluidos los marcados). */
export function reordenar(b: ListaBorrador[], key: string, desde: number, hacia: number): ListaBorrador[] {
  return mapLista(b, key, (l) => {
    if (desde === hacia || desde < 0 || hacia < 0 || desde >= l.items.length || hacia >= l.items.length) return l
    const items = [...l.items]
    const [mov] = items.splice(desde, 1)
    items.splice(hacia, 0, mov!)
    return { ...l, items }
  })
}

/** Lista final a guardar: sin marcados, sin listas eliminadas ni vacías, con `machineNames`. */
export function aplicarBorrador(b: ListaBorrador[]): FavList[] {
  const out: FavList[] = []
  for (const l of b) {
    if (l.eliminada) continue
    const items = l.items.filter((i) => !i.quitar)
    if (items.length === 0) continue
    out.push({
      name: l.nombre.trim(),
      machineIds: items.map((i) => i.id),
      machineNames: Object.fromEntries(items.map((i) => [i.id, i.nombre])),
    })
  }
  return out
}

/** Qué cambia entre lo guardado y el borrador. Renombrar, agregar y reordenar no piden clave. */
export function diffFavoritos(original: FavList[], borrador: ListaBorrador[]): DiffFavoritos {
  const quitados: EquipoQuitado[] = []
  const listasEliminadas: string[] = []
  const agregados: EquipoAgregado[] = []
  const renombres: { de: string; a: string }[] = []

  for (const orig of original) {
    const b = borrador.find((l) => l.origen === orig.name)
    const nombreDe = (id: string) => b?.items.find((i) => i.id === id)?.nombre || orig.machineNames?.[id] || id
    if (!b || b.eliminada) {
      listasEliminadas.push(orig.name)
      for (const id of orig.machineIds) quitados.push({ lista: orig.name, machineId: id, nombre: nombreDe(id) })
      continue
    }
    for (const id of orig.machineIds) {
      const it = b.items.find((i) => i.id === id)
      if (!it || it.quitar) quitados.push({ lista: orig.name, machineId: id, nombre: nombreDe(id) })
    }
    // Queda vacía al guardar → se guarda sin ella (cuenta como eliminada).
    if (b.items.every((i) => i.quitar)) listasEliminadas.push(orig.name)
    else if (b.nombre.trim() !== orig.name) renombres.push({ de: orig.name, a: b.nombre.trim() })
  }

  for (const b of borrador) {
    if (b.eliminada) continue
    for (const it of b.items) {
      if (it.nuevo && !it.quitar) agregados.push({ lista: b.nombre.trim(), machineId: it.id })
    }
  }

  const final = aplicarBorrador(borrador)
  const mismaEstructura =
    final.length === original.length &&
    final.every((l, i) => l.name === original[i]!.name && l.machineIds.join('\u0000') === original[i]!.machineIds.join('\u0000'))

  const requiereClave = quitados.length > 0 || listasEliminadas.length > 0
  return {
    quitados,
    listasEliminadas,
    agregados,
    renombres,
    hayCambios: requiereClave || agregados.length > 0 || renombres.length > 0 || !mismaEstructura,
    requiereClave,
  }
}
