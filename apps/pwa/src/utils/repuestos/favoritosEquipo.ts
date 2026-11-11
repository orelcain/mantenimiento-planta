/**
 * Favoritos POR EQUIPO — lógica pura (sin React ni Firestore), para poder probarla.
 *
 * Conviven con los favoritos globales (`repuestoFavs`, estrella de cada fila): esos siguen
 * igual. Estos son los de UN equipo y viven en `user_preferences/{uid}.repuestoFavLists[equipKey]`
 * como listas con nombre (la misma forma que ya tenía el módulo desde 2540bad2).
 *
 *   «Favoritos de este equipo» = la UNIÓN de todas las listas de ese equipo.
 *   Marcar la estrella del equipo = agregar a la lista general `LISTA_GENERAL`.
 *
 * CLAVE DE EQUIPO: la que el hub usa al seleccionar un equipo (`selectedEquipMachineId` =
 * id del nodo de la jerarquía = `r.equipos[].machineId`).
 * CLAVE DE REPUESTO: `rowKeyDeRepuesto` (SAP · `fab:<código>` · `id:<docId>`).
 *
 * LISTAS VIEJAS (commit 2540bad2): guardaban ids de otra época. Se traducen AL LEER, sin
 * tocar lo guardado (no se borra nada); al primer cambio del usuario se guarda ya traducido:
 *   `inv-3300126381`                           → `3300126381`   (id de inventario = SAP)
 *   `baader-142-resorte-38010604`              → `fab:38010604` (id de catálogo estático, termina en el
 *                                                código de fabricante; puede calzar con más de un SAP)
 *   cualquier otro (docId de subcolección ya borrado) → se conserva tal cual, sin calzar con nada.
 */
import { rowKeyDeRepuesto, type RepuestoIdentificable } from '@/hooks/repuestos/identidadDeRepuesto'

export interface ListaFavoritos {
  name: string
  repuestoIds: string[]
}

/** Lista donde cae la estrella «favorito de este equipo». */
export const LISTA_GENERAL = 'Favoritos'

/** Traduce un id guardado en la época vieja a la clave estable de hoy. */
export function traducirIdLegacy(id: string): string {
  const s = (id || '').trim()
  if (!s) return s
  const inv = /^inv-(\d{6,})$/.exec(s)
  if (inv?.[1]) return inv[1]
  // Id de catálogo estático: «<maquina>-…-<código de fabricante numérico>» (≥7 dígitos al final).
  const cat = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-(\d{7,})$/.exec(s)
  if (cat?.[1]) return `fab:${cat[1]}`
  return s
}

/** Listas de un equipo con los ids traducidos y sin repetidos. No muta la entrada. */
export function migrarListas(listas: readonly ListaFavoritos[] | null | undefined): ListaFavoritos[] {
  return (listas ?? [])
    .filter((l) => l && typeof l.name === 'string' && l.name.trim())
    .map((l) => ({
      name: l.name.trim(),
      repuestoIds: [...new Set((Array.isArray(l.repuestoIds) ? l.repuestoIds : []).map(traducirIdLegacy).filter(Boolean))],
    }))
}

/** Todas las claves con las que un repuesto puede estar guardado: la estable y la de fabricante. */
export function clavesDe(rep: RepuestoIdentificable | string): string[] {
  if (typeof rep === 'string') return [rep]
  const claves = [rowKeyDeRepuesto(rep)]
  const sap = (rep.codigoSAP || '').trim()
  if (sap && !claves.includes(sap)) claves.push(sap)
  const fab = (rep.codigoFabricante || '').trim()
  if (fab) claves.push(`fab:${fab}`)
  return claves
}

/** La clave con la que se GUARDA un repuesto nuevo. */
export function clavePrincipal(rep: RepuestoIdentificable | string): string {
  return typeof rep === 'string' ? rep : rowKeyDeRepuesto(rep)
}

export function estaEnLista(lista: ListaFavoritos, rep: RepuestoIdentificable | string): boolean {
  const ids = new Set(lista.repuestoIds)
  return clavesDe(rep).some((c) => ids.has(c))
}

/** ¿Está en alguna lista del equipo? (= «favorito de este equipo»). */
export function esFavoritoDelEquipo(listas: readonly ListaFavoritos[], rep: RepuestoIdentificable | string): boolean {
  return listas.some((l) => estaEnLista(l, rep))
}

/** Cuántas filas son favoritas del equipo — el número del chip sale de acá y de nada más. */
export function contarFavoritos<T extends RepuestoIdentificable>(listas: readonly ListaFavoritos[], filas: readonly T[]): number {
  return filas.reduce((n, f) => (esFavoritoDelEquipo(listas, f) ? n + 1 : n), 0)
}

/** Cuántas filas están en una lista concreta. */
export function contarEnLista<T extends RepuestoIdentificable>(lista: ListaFavoritos, filas: readonly T[]): number {
  return filas.reduce((n, f) => (estaEnLista(lista, f) ? n + 1 : n), 0)
}

const sinTocar = (listas: readonly ListaFavoritos[]): ListaFavoritos[] => listas.map((l) => ({ name: l.name, repuestoIds: [...l.repuestoIds] }))

/** Agrega o quita el repuesto de una lista (la crea si no existe y se está agregando). */
export function alternarEnLista(listas: readonly ListaFavoritos[], nombre: string, rep: RepuestoIdentificable | string): ListaFavoritos[] {
  const clean = nombre.trim()
  if (!clean) return sinTocar(listas)
  const clave = clavePrincipal(rep)
  const existe = listas.some((l) => l.name === clean)
  if (!existe) return [...sinTocar(listas), { name: clean, repuestoIds: [clave] }]
  return listas.map((l) => {
    if (l.name !== clean) return { name: l.name, repuestoIds: [...l.repuestoIds] }
    if (estaEnLista(l, rep)) {
      const quitar = new Set(clavesDe(rep))
      return { name: l.name, repuestoIds: l.repuestoIds.filter((id) => !quitar.has(id)) }
    }
    return { name: l.name, repuestoIds: [...l.repuestoIds, clave] }
  })
}

/** Estrella del equipo: si ya es favorito lo quita de TODAS las listas; si no, lo suma a la general. */
export function alternarFavorito(listas: readonly ListaFavoritos[], rep: RepuestoIdentificable | string): ListaFavoritos[] {
  if (!esFavoritoDelEquipo(listas, rep)) return alternarEnLista(listas, LISTA_GENERAL, rep)
  const quitar = new Set(clavesDe(rep))
  return listas.map((l) => ({ name: l.name, repuestoIds: l.repuestoIds.filter((id) => !quitar.has(id)) }))
}

/** Crea una lista vacía (o con el repuesto). No repite nombres. */
export function crearLista(listas: readonly ListaFavoritos[], nombre: string, rep?: RepuestoIdentificable | string): ListaFavoritos[] {
  const clean = nombre.trim()
  if (!clean || listas.some((l) => l.name === clean)) return sinTocar(listas)
  return [...sinTocar(listas), { name: clean, repuestoIds: rep ? [clavePrincipal(rep)] : [] }]
}

export function eliminarLista(listas: readonly ListaFavoritos[], nombre: string): ListaFavoritos[] {
  return sinTocar(listas.filter((l) => l.name !== nombre))
}
